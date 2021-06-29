const Brick = require('./Brick');
const stream = require('stream');
const BrickStorageService = require('./BrickStorageService').Service;
const BrickMapController = require('./BrickMapController');
const Manifest = require("./Manifest");

/**
 * @param {ArchiveConfigurator} archiveConfigurator
 */
function Archive(archiveConfigurator) {
    const swarmutils = require("swarmutils");
    const TaskCounter = swarmutils.TaskCounter;
    const pskPth = swarmutils.path;
    const openDSU = require("opendsu");
    const anchoring = openDSU.loadAPI("anchoring");
    const notifications = openDSU.loadAPI("notifications");

    const mountedArchivesForBatchOperations = [];

    let brickMapController;
    let brickStorageService;
    let manifestHandler;
    let batchOperationsInProgress = false;
    let prevAnchoringDecisionFn;
    let prevConflictResolutionFunction;

    let publishAnchoringNotifications = false;
    let publishOptions = null;

    let autoSyncStatus = false;
    let autoSyncOptions = null;
    let dsuObsHandler = null;

    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////
    const initialize = (callback) => {
        archiveConfigurator.getKeySSI((err, keySSI) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to retrieve keySSI", err));
            }

            brickStorageService = buildBrickStorageServiceInstance(keySSI);
            brickMapController = new BrickMapController({
                config: archiveConfigurator,
                brickStorageService,
                keySSI
            });

            callback();
        });
    }

    /**
     * Create and configure the BrickStorageService
     *
     * @param {object} storageProvider
     * @return {BrickStorageService}
     */
    function buildBrickStorageServiceInstance(keySSI) {
        const instance = new BrickStorageService({
            cache: archiveConfigurator.getCache(),
            bufferSize: archiveConfigurator.getBufferSize(),
            keySSI,

            brickFactoryFunction: (encrypt) => {
                encrypt = (typeof encrypt === 'undefined') ? true : !!encrypt;
                // Strip the encryption key from the SeedSSI
                return new Brick({templateKeySSI: keySSI, encrypt});
            },

            brickDataExtractorCallback: (brickMeta, brick, callback) => {
                brick.setTemplateKeySSI(keySSI);
                const brickEncryptionKeySSI = brickMapController.getBrickEncryptionKeySSI(brickMeta);
                brick.setKeySSI(brickEncryptionKeySSI);
                brick.getRawData(callback);
            },

            fsAdapter: archiveConfigurator.getFsAdapter()
        });

        return instance;
    }

    const cancelBatchesInMountedArchives = (callback) => {
        const cancelBatch = (dossierContext) => {
            if (!dossierContext) {
                return callback();
            }

            dossierContext.archive.cancelBatch((err) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to cancel batch operation", err));
                }

                cancelBatch(mountedArchivesForBatchOperations.pop());
            })
        }

        cancelBatch(mountedArchivesForBatchOperations.pop());
    }

    const commitBatchesInMountedArchives = (onConflict, callback) => {
        const results = [];

        const commitBatch = (dossierContext) => {
            if (!dossierContext) {
                return callback(undefined, results);
            }

            dossierContext.archive.commitBatch(onConflict, (err, result) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to commit batch", err));
                }

                results.push(result);
                commitBatch(mountedArchivesForBatchOperations.pop());
            });
        }

        commitBatch(mountedArchivesForBatchOperations.pop());
    }

    const getArchiveForBatchOperations = (manifestHandler, path, callback) => {
        manifestHandler.getArchiveForPath(path, (err, result) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${path}`, err));
            }

            if (result.archive === this) {
                return callback(undefined, result);
            }

            result.archive.getKeySSIAsString((err, keySSI) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to retrieve keySSI", err));
                }

                const cachedArchive = mountedArchivesForBatchOperations.find((archive) => {
                    return archive.identifier === keySSI;
                });

                if (cachedArchive) {
                    cachedArchive.relativePath = result.relativePath;
                    return callback(undefined, cachedArchive);
                }

                result.identifier = keySSI;
                result.archive.beginBatch();
                mountedArchivesForBatchOperations.push(result);

                if (!publishAnchoringNotifications || publishOptions.ignoreMounts) {
                    return callback(undefined, result);
                }

                result.archive.enableAnchoringNotifications(publishAnchoringNotifications, publishOptions, (err) => {
                    if (err) {
                        return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to toggle anchoring notification publishing for mount point: ${mountPoint}`, err));
                    }

                    callback(undefined, result);
                })
            });
        });
    };

    ////////////////////////////////////////////////////////////
    // Public methods
    ////////////////////////////////////////////////////////////
    /**
     * @param {callback} callback
     */
    this.init = (callback) => {
        initialize((err) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to initialize DSU", err));
            }

            brickMapController.init(callback);
        });
    }

    /**
     * @param {callback} callback
     */
    this.load = (callback) => {
        initialize((err) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to load DSU", err));
            }

            brickMapController.load(callback);
        });
    };

    /**
     * @param {callback} callback
     */
    this.refresh = (callback) => {
        this.load((err) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to load DSU", err));
            }

            // Restore auto sync settings if the archive was refreshed
            this.enableAnchoringNotifications(publishAnchoringNotifications, publishOptions, (err) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to toggle anchoring notification publishing for mount point: ${mountPoint}`, err));
                }
                this.enableAutoSync(autoSyncStatus, autoSyncOptions, (err) => {
                    if (err) {
                        return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to enable auto sync for DSU", err));
                    }
                    callback();
                });
            });
        });
    }

    /**
     * @param {callback} function
     *
     * @return {HashLinkSSI}
     */
    this.getLastHashLinkSSI = (callback) => {
        archiveConfigurator.getKeySSI((err, keySSI) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to get KeySSI", err));
            }
            anchoring.getAllVersions(keySSI, (err, hashlinksArray) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to get the list of hashlinks", err));
                }

                return callback(undefined, hashlinksArray[hashlinksArray.length - 1])
            })
        })

    };

    /**
     * @return {string}
     */
    this.getKeySSI = (keySSIType, callback) => {
        console.trace("Obsolete function: use getKeySSIAsString or getKeySSIAsObject Instead");
        if (typeof keySSIType === "function") {
            callback = keySSIType;
            keySSIType = undefined;
        }
        archiveConfigurator.getKeySSI(keySSIType, ((err, keySSI) => callback(err, keySSI.getIdentifier())));
    }

    /**
     * @return {string}
     */
    this.getKeySSIAsObject = (keySSIType, callback) => {
        if (typeof keySSIType === "function") {
            callback = keySSIType;
            keySSIType = undefined;
        }
        archiveConfigurator.getKeySSI(keySSIType, callback);
    }

    /**
     * @return {string}
     */
    this.getKeySSIAsString = (keySSIType, callback) => {
        if (typeof keySSIType === "function") {
            callback = keySSIType;
            keySSIType = undefined;
        }
        archiveConfigurator.getKeySSI(keySSIType, ((err, keySSI) => callback(err, keySSI.getIdentifier())));
    }

    /**
     * @return {string}
     */
    this.getCreationSSI = (plain) => {
        return archiveConfigurator.getCreationSSI(plain);
    }

    /**
     * @param {string} barPath
     * @param {string|$$.Buffer|stream.ReadableStream} data
     * @param {object} options
     * @param {callback} callback
     */
    const _writeFile = (barPath, data, options, callback) => {
        if (typeof data === "function") {
            callback = data;
            data = undefined;
            options = undefined;
        }
        if (typeof options === "function") {
            callback = options;
            options = {
                encrypt: true
            };
        }
        if (typeof options === "undefined") {
            options = {
                encrypt: true
            };
        }

        barPath = pskPth.normalize(barPath);

        if (typeof data === "undefined") {
            return _createFile(barPath, callback);
        }

        brickStorageService.ingestData(data, options, (err, result) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to ingest data into brick storage service", err));
            }

            brickMapController.addFile(barPath, result, callback);
        });
    };

    /**
     * @param {string} barPath
     * @param {callback} callback
     */
    const _readFile = (barPath, callback) => {
        barPath = pskPth.normalize(barPath);

        let bricksMeta;

        try {
            bricksMeta = brickMapController.getBricksMeta(barPath);
        } catch (err) {
            return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to find any info for path " + barPath + " in brickmap", err));
        }

        brickStorageService.createBufferFromBricks(bricksMeta, (err, buffer) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to create buffer from bricks", err));
            }

            callback(undefined, buffer);
        });
    };

    /**
     * @param {string} barPath
     * @param {callback} callback
     */
    const _createReadStream = (barPath, callback) => {
        barPath = pskPth.normalize(barPath);

        let bricksMeta;
        try {
            bricksMeta = brickMapController.getBricksMeta(barPath);
        } catch (err) {
            return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to find any info for path " + barPath, err));
        }

        brickStorageService.createStreamFromBricks(bricksMeta, (err, stream) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to create stream from bricks", err));
            }

            callback(undefined, stream);
        });
    };

    /**
     * @param {string} fsFilePath
     * @param {string} barPath
     * @param {object} options
     * @param {callback} callback
     */
    const _addFile = (fsFilePath, barPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {
                encrypt: true
            }
        }

        barPath = pskPth.normalize(barPath);

        brickStorageService.ingestFile(fsFilePath, options, (err, result) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to ingest data into bricks storage", err));
            }

            brickMapController.addFile(barPath, result, callback);
        })
    };

    /**
     * @param {string} files
     * @param {string} barPath
     * @param {object} options
     * @param {callback} callback
     */
    const _addFiles = (files, barPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {
                encrypt: true,
                embedded: false
            };
        }

        barPath = pskPth.normalize(barPath);

        const filesArray = files.slice();

        const ingestionMethod = (!options.embedded) ? 'ingestFiles' : 'createBrickFromFiles';

        brickStorageService[ingestionMethod](filesArray, options, (err, result) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to add files at path " + barPath, err));
            }

            brickMapController.addFiles(barPath, result, callback);
        });
    };

    this.addFiles = (files, barPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {
                encrypt: true,
                ignoreMounts: false,
                embedded: false
            };
        }

        if (options.ignoreMounts === true) {
            _addFiles(files, barPath, options, callback);
        } else {
            this.getArchiveForPath(barPath, (err, dossierContext) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${barPath}`, err));
                }

                options.ignoreMounts = true;
                dossierContext.archive.addFiles(files, dossierContext.relativePath, options, callback);
            });
        }
    }

    /**
     * @param {string} fsFilePath
     * @param {string} barPath
     * @param {callback} callback
     */
    const _extractFile = (fsFilePath, barPath, callback) => {
        if (typeof barPath === "function") {
            callback = barPath;
            barPath = pskPth.normalize(fsFilePath);
        }

        let bricksMeta;

        try {
            bricksMeta = brickMapController.getBricksMeta(barPath);
        } catch (err) {
            return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to any information for path " + barPath, err));
        }


        brickStorageService.createFileFromBricks(fsFilePath, bricksMeta, callback);
    };

    /**
     * @param {string} barPath
     * @param {string|$$.Buffer|stream.ReadableStream} data
     * @param {callback} callback
     */
    this.appendToFile = (barPath, data, options, callback) => {
        const defaultOpts = {encrypt: true, ignoreMounts: false};
        if (typeof options === "function") {
            callback = options;
            options = {};
        }

        Object.assign(defaultOpts, options);
        options = defaultOpts;

        if (options.ignoreMounts) {
            barPath = pskPth.normalize(barPath);
            brickStorageService.ingestData(data, options, (err, result) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to append data to file " + barPath, err));
                }

                brickMapController.appendToFile(barPath, result, callback);
            });
        } else {
            this.getArchiveForPath(barPath, (err, dossierContext) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${barPath}`, err));
                }
                if (dossierContext.readonly === true) {
                    return callback(Error("Tried to write in a readonly mounted RawDossier"));
                }

                options.ignoreMounts = true;
                dossierContext.archive.appendToFile(dossierContext.relativePath, data, options, callback);
            });
        }
    };


    this.dsuLog = (message, callback) => {
        this.appendToFile("/dsu-metadata-log", message + "\n", {ignoreMissing: true}, callback);
    }
    /**
     * @param {string} fsFolderPath
     * @param {string} barPath
     * @param {object} options
     * @param {callback} callback
     */
    const _addFolder = (fsFolderPath, barPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {
                encrypt: true,
                embedded: false
            };
        }
        barPath = pskPth.normalize(barPath);

        const ingestionMethod = (!options.embedded) ? 'ingestFolder' : 'createBrickFromFolder';

        brickStorageService[ingestionMethod](fsFolderPath, options, (err, result) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to add folder ${fsFolderPath} to  ${barPath}`, err));
            }

            brickMapController.addFiles(barPath, result, callback);
        });
    };

    /**
     * @param {string} fsFolderPath
     * @param {string} barPath
     * @param {callback} callback
     */
    const _extractFolder = (fsFolderPath, barPath, callback) => {
        if (typeof barPath === "function") {
            callback = barPath;
            barPath = pskPth.normalize(fsFolderPath);
        }

        const filePaths = brickMapController.getFileList(barPath);
        const taskCounter = new TaskCounter(() => {
            callback();
        });
        taskCounter.increment(filePaths.length);
        filePaths.forEach(filePath => {
            let actualPath;
            if (fsFolderPath) {
                if (fsFolderPath.includes(filePath)) {
                    actualPath = fsFolderPath;
                } else {
                    actualPath = require("path").join(fsFolderPath, filePath);
                }
            } else {
                actualPath = filePath;
            }

            this.extractFile(actualPath, filePath, (err) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to extract file ${actualPath} to ${filePath}`, err));
                }

                taskCounter.decrement();
            });
        });
    };

    /**
     * @param {string} barPath
     * @param {callback} callback
     */
    const _delete = (barPath, callback) => {
        brickMapController.deleteFile(barPath, callback);
        //this resets the state in case a folder gets removed and under the same path are other dsu mounted.
        manifestHandler = undefined;
    };

    /**
     * @param {string} srcPath
     * @param {dstPath} dstPath
     */

    const _rename = (srcPath, dstPath, callback) => {
        srcPath = pskPth.normalize(srcPath);
        dstPath = pskPth.normalize(dstPath);

        brickMapController.renameFile(srcPath, dstPath, callback);
    }

    /**
     * @param {string} folderBarPath
     * @param {object} options
     * @param {callback} callback
     */
    const _listFiles = (folderBarPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {recursive: true};
        } else if (typeof folderBarPath === "function") {
            callback = folderBarPath;
            options = {recursive: true};
            folderBarPath = "/";
        }

        let fileList;
        let error;
        try {
            fileList = brickMapController.getFileList(folderBarPath, options.recursive);
        } catch (e) {
            error = e;
        }

        setTimeout(() => {
            callback(error, fileList);
        }, 0)
    };

    const _listMountedFiles = (mountPoints, result, callback) => {
        if (typeof result === 'function') {
            callback = result;
            result = [];
        }
        let mountPoint = mountPoints.shift();

        if (!mountPoint) {
            return callback(undefined, result)
        }

        mountPoint = pskPth.normalize(mountPoint);

        this.listFiles(mountPoint, {
            recursive: true,
            ignoreMounts: false
        }, (err, files) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to list files at path ${mountPoint}`, err));
            }

            result.push(files.map((file) => {
                let prefix = mountPoint;
                if (prefix[0] === '/') {
                    prefix = prefix.substring(1);
                }

                return pskPth.normalize(`${prefix}/${file}`);
            }));

            _listMountedFiles(mountPoints, result, callback);
        });
    };

    /**
     * @param {string} folderBarPath
     * @param {object} options
     * @param {boolean} options.recursive
     * @param {callback} callback
     */
    const _listFolders = (folderBarPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {recursive: true};
        }

        callback(undefined, brickMapController.getFolderList(folderBarPath, options.recursive));
    };

    const _listMountedFolders = (mountPoints, result, callback) => {
        if (typeof result === 'function') {
            callback = result;
            result = [];
        }

        let mountPoint = mountPoints.shift();
        if (!mountPoint) {
            return callback(undefined, result);
        }

        mountPoint = pskPth.normalize(mountPoint);

        this.listFolders(mountPoint, {
            recursive: true,
            ignoreMounts: false
        }, (err, folders) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to list mounted folders at path ${mountPoint}`, err));
            }

            result.push((folders.map((folder) => {
                let prefix = mountPoint;
                if (prefix[0] === '/') {
                    prefix = prefix.substring(1);
                }

                return pskPth.normalize(`${prefix}/${folder}`);
            })));

            _listMountedFolders(mountPoints, result, callback);
        })
    };

    /**
     * @param {string} barPath
     * @param {callback} callback
     */
    const _createFolder = (barPath, callback) => {
        brickMapController.createDirectory(barPath, callback);
    };

    const _createFile = (barPath, callback) => {
        brickMapController.createEmptyFile(barPath, callback);
    };

    /**
     * @param {object} rules
     * @param {object} rules.preWrite
     * @param {object} rules.afterLoad
     */
    this.setValidationRules = (rules) => {
        brickMapController.setValidationRules(rules);
    }

    /**
     * @param {callback} listener
     */
    this.setAnchoringEventListener = (listener) => {
        this.getAnchoringStrategy().setAnchoringEventListener(listener);
    }

    /**
     * @param {callback} callback
     */
    this.setDecisionCallback = (callback) => {
        this.getAnchoringStrategy().setDecisionCallback(callback);
    }

    /**
     * @return {AnchoringStrategy}
     */
    this.getAnchoringStrategy = () => {
        return archiveConfigurator.getBrickMapStrategy();
    }

    /**
     * Manually anchor any changes
     */
    this.doAnchoring = (callback) => {
        const strategy = this.getAnchoringStrategy();
        const anchoringEventListener = strategy.getAnchoringEventListener() || callback;
        if (typeof anchoringEventListener !== 'function') {
            throw new Error('An anchoring event listener is required');
        }

        brickMapController.anchorChanges(anchoringEventListener);
    }

    const getManifest = (callback) => {
        if (typeof manifestHandler === "undefined") {
            Manifest.getManifest(this, (err, handler) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get manifest handler`, err));
                }

                manifestHandler = handler;
                return callback(undefined, manifestHandler);
            });
        } else {
            return callback(undefined, manifestHandler);
        }
    }

    this.getSSIForMount = (mountPoint, callback) => {
        getManifest((err, manifestHandler) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to load manifest for " + mountPoint, err));
            }
            manifestHandler.getArchiveIdentifier(mountPoint, callback);
        });
    }

    this.addFolder = (fsFolderPath, barPath, options, callback) => {
        const defaultOpts = {encrypt: true, ignoreMounts: false, embedded: false};
        if (typeof options === "function") {
            callback = options;
            options = {};
        }
        callback = $$.makeSaneCallback(callback);
        Object.assign(defaultOpts, options);
        options = defaultOpts;


        if (options.ignoreMounts === true) {
            _addFolder(fsFolderPath, barPath, options, callback);
        } else {
            this.getArchiveForPath(barPath, (err, result) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${barPath}`, err));
                }

                options.ignoreMounts = true;
                result.archive.addFolder(fsFolderPath, result.relativePath, options, callback);
            });
        }
    };

    this.addFile = (fsFilePath, barPath, options, callback) => {
        const defaultOpts = {encrypt: true, ignoreMounts: false};
        if (typeof options === "function") {
            callback = options;
            options = {};
        }

        callback = $$.makeSaneCallback(callback);
        Object.assign(defaultOpts, options);
        options = defaultOpts;

        if (options.ignoreMounts === true) {
            _addFile(fsFilePath, barPath, options, callback);
        } else {
            this.getArchiveForPath(barPath, (err, result) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${barPath}`, err));
                }

                options.ignoreMounts = true;
                result.archive.addFile(fsFilePath, result.relativePath, options, callback);
            });
        }
    };

    this.readFile = (fileBarPath, options, callback) => {
        const defaultOpts = {ignoreMounts: false};
        if (typeof options === "function") {
            callback = options;
            options = {};
        }

        callback = $$.makeSaneCallback(callback);
        Object.assign(defaultOpts, options);
        options = defaultOpts;
        if (options.ignoreMounts === true) {
            _readFile(fileBarPath, callback);
        } else {
            this.getArchiveForPath(fileBarPath, (err, result) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${fileBarPath}`, err));
                }

                options.ignoreMounts = true
                result.archive.readFile(result.relativePath, options, callback);
            });
        }
    };

    this.createReadStream = (fileBarPath, options, callback) => {
        const defaultOpts = {encrypt: true, ignoreMounts: false};
        if (typeof options === "function") {
            callback = options;
            options = {};
        }

        callback = $$.makeSaneCallback(callback);
        Object.assign(defaultOpts, options);
        options = defaultOpts;
        if (options.ignoreMounts === true) {
            _createReadStream(fileBarPath, callback);
        } else {
            this.getArchiveForPath(fileBarPath, (err, result) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${fileBarPath}`, err));
                }

                options.ignoreMounts = true;
                result.archive.createReadStream(result.relativePath, options, callback);
            });
        }
    };

    this.extractFolder = (fsFolderPath, barPath, options, callback) => {
        const defaultOpts = {ignoreMounts: false};
        if (typeof options === "function") {
            callback = options;
            options = {};
        }

        callback = $$.makeSaneCallback(callback);
        Object.assign(defaultOpts, options);
        options = defaultOpts;
        if (options.ignoreMounts === true) {
            _extractFolder(fsFolderPath, barPath, callback);
        } else {
            this.getArchiveForPath(barPath, (err, result) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${barPath}`, err));
                }

                options.ignoreMounts = true;
                result.archive.extractFolder(fsFolderPath, result.relativePath, options, callback);
            });
        }
    };

    this.extractFile = (fsFilePath, barPath, options, callback) => {
        const defaultOpts = {ignoreMounts: false};
        if (typeof options === "function") {
            callback = options;
            options = {};
        }

        callback = $$.makeSaneCallback(callback);
        Object.assign(defaultOpts, options);
        options = defaultOpts;

        if (options.ignoreMounts === true) {
            _extractFile(fsFilePath, barPath, callback);
        } else {
            this.getArchiveForPath(barPath, (err, result) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${barPath}`, err));
                }

                options.ignoreMounts = true;
                result.archive.extractFile(fsFilePath, result.relativePath, options, callback);
            });
        }
    };

    this.writeFile = (path, data, options, callback) => {
        const defaultOpts = {encrypt: true, ignoreMounts: false};
        if (typeof options === "function") {
            callback = options;
            options = {};
        }

        callback = $$.makeSaneCallback(callback);

        Object.assign(defaultOpts, options);
        options = defaultOpts;

        if (options.ignoreMounts === true) {
            _writeFile(path, data, options, callback);
        } else {
            this.getArchiveForPath(path, (err, dossierContext) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${path}`, err));
                }
                if (dossierContext.readonly === true) {
                    return callback(Error("Tried to write in a readonly mounted RawDossier"));
                }

                options.ignoreMounts = true;
                dossierContext.archive.writeFile(dossierContext.relativePath, data, options, callback);
            });
        }
    };


    this.delete = (path, options, callback) => {
        const defaultOpts = {ignoreMounts: false, ignoreError: false};
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        callback = $$.makeSaneCallback(callback);

        Object.assign(defaultOpts, options);
        options = defaultOpts;

        if (options.ignoreMounts) {
            return _delete(path, err => {
                if (!err || (err && options.ignoreError)) {
                    return callback();
                }

                callback(err);
            });
        }

        this.getArchiveForPath(path, (err, dossierContext) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${path}`, err));
            }

            if (dossierContext.readonly === true) {
                return callback(Error("Tried to delete in a readonly mounted RawDossier"));
            }

            options.ignoreMounts = true;
            dossierContext.archive.delete(dossierContext.relativePath, options, callback);
        });
    };

    this.rename = (srcPath, dstPath, options, callback) => {
        const defaultOpts = {ignoreMounts: false};
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        callback = $$.makeSaneCallback(callback);
        Object.assign(defaultOpts, options);
        options = defaultOpts;

        if (options.ignoreMounts) {
            _rename(srcPath, dstPath, callback);
            return;
        }

        this.getArchiveForPath(srcPath, (err, dossierContext) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${srcPath}`, err));
            }
            if (dossierContext.readonly === true) {
                return callback(Error("Tried to rename in a readonly mounted RawDossier"));
            }

            const relativeSrcPath = dossierContext.relativePath;
            this.getArchiveForPath(dstPath, (err, dstDossierContext) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${dstPath}`, err));
                }

                if (dstDossierContext.prefixPath !== dossierContext.prefixPath) {
                    return callback(Error('Destination is invalid. Renaming must be done in the scope of the same dossier'));
                }

                options.ignoreMounts = true;
                dossierContext.archive.rename(relativeSrcPath, dstDossierContext.relativePath, options, callback);
            })
        });
    };

    this.listFiles = (path, options, callback) => {
        const defaultOpts = {ignoreMounts: false, recursive: true};
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        callback = $$.makeSaneCallback(callback);
        Object.assign(defaultOpts, options);
        options = defaultOpts;
        if (options.ignoreMounts === true) {
            if (!options.recursive) {
                return _listFiles(path, options, callback);
            }

            return _listFiles(path, options, (err, files) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to list files at path ${path}`, err));
                }

                getManifest((err, manifest) => {
                    if (err) {
                        return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get manifest`, err));
                    }

                    const mountPoints = manifest.getMountPoints();
                    if (!mountPoints.length) {
                        return callback(undefined, files);
                    }

                    _listMountedFiles(mountPoints, (err, mountedFiles) => {
                        if (err) {
                            return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to list mounted files at mountPoints ${mountPoints}`, err));
                        }

                        files = files.concat(...mountedFiles);
                        return callback(undefined, files);
                    });
                })
            })
        }

        this.getArchiveForPath(path, (err, result) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${path}`, err));
            }

            options.ignoreMounts = true;
            result.archive.listFiles(result.relativePath, options, callback);
        });
    };

    this.listFolders = (path, options, callback) => {
        const defaultOpts = {ignoreMounts: false, recursive: false};
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        callback = $$.makeSaneCallback(callback);
        Object.assign(defaultOpts, options);
        options = defaultOpts;

        if (options.ignoreMounts === true) {
            if (!options.recursive) {
                return _listFolders(path, options, callback);
            }

            return _listFolders(path, options, (err, folders) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to list folders at path ${path}`, err));
                }

                getManifest((err, manifest) => {
                    if (err) {
                        return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get manifest`, err));
                    }

                    const mountPoints = manifest.getMountPoints();
                    if (!mountPoints.length) {
                        return callback(undefined, folders);
                    }

                    _listMountedFolders(mountPoints, (err, mountedFolders) => {
                        if (err) {
                            return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to list mounted folders at mountPoints ${mountPoints}`, err));
                        }

                        folders = folders.concat(...mountedFolders);
                        return callback(undefined, folders);
                    });
                })
            })
        }

        this.getArchiveForPath(path, (err, result) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${path}`, err));
            }

            options.ignoreMounts = true;
            result.archive.listFolders(result.relativePath, options, callback);
        });
    };

    this.createFolder = (barPath, options, callback) => {
        const defaultOpts = {ignoreMounts: false, encrypt: true};
        if (typeof options === "function") {
            callback = options;
            options = {};
        }

        callback = $$.makeSaneCallback(callback);
        Object.assign(defaultOpts, options);
        options = defaultOpts;

        if (options.ignoreMounts === true) {
            _createFolder(barPath, callback);
        } else {
            this.getArchiveForPath(barPath, (err, dossierContext) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${barPath}`, err));
                }
                if (dossierContext.readonly === true) {
                    return callback(Error("Tried to write in a readonly mounted RawDossier"));
                }

                options.ignoreMounts = true;
                dossierContext.archive.createFolder(dossierContext.relativePath, options, callback);
            });
        }
    };

    this.readDir = (folderPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {
                withFileTypes: false
            };
        }

        callback = $$.makeSaneCallback(callback);
        const entries = {};
        this.getArchiveForPath(folderPath, (err, result) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${folderPath}`, err));
            }

            result.archive.listFiles(result.relativePath, {recursive: false, ignoreMounts: true}, (err, files) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to list files at path ${result.relativePath}`, err));
                }

                entries.files = files;

                result.archive.listFolders(result.relativePath, {
                    recursive: false,
                    ignoreMounts: true
                }, (err, folders) => {
                    if (err) {
                        return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to list folders at path ${result.relativePath}`, err));
                    }

                    if (options.withFileTypes) {
                        entries.folders = folders;
                    } else {
                        entries.files = [...entries.files, ...folders];
                    }
                    if (result.archive === this) {
                        getManifest(listMounts);
                    } else {
                        Manifest.getManifest(result.archive, listMounts);
                    }

                    function listMounts(err, handler) {
                        if (err) {
                            return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to list mounts`, err));
                        }

                        handler.getMountedDossiers(result.relativePath, (err, mounts) => {
                            if (err) {
                                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get mounted DSUs at path ${result.relativePath}`, err));
                            }
                            let mountPaths = mounts.map(mount => mount.path);
                            let folders = mountPaths.filter(mountPath => mountPath.split('/').length >= 2);
                            folders = folders.map(mountPath => mountPath.split('/').shift());
                            let mountedDossiers = mountPaths.filter(mountPath => mountPath.split('/').length === 1);
                            mountedDossiers = mountedDossiers.map(mountPath => mountPath.split('/').shift());
                            if (options.withFileTypes) {
                                entries.mounts = mountedDossiers;
                                entries.folders = Array.from(new Set([...entries.folders, ...folders]));
                                entries.mounts = entries.mounts.filter(mount => entries.folders.indexOf(mount) === -1);
                                return callback(undefined, entries);
                            }
                            entries.files = Array.from(new Set([...entries.files, ...mounts, ...folders]));
                            return callback(undefined, entries.files);
                        });
                    }
                });
            });
        });
    };

    this.cloneFolder = (srcPath, destPath, options, callback) => {
        const defaultOpts = {ignoreMounts: false};
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        callback = $$.makeSaneCallback(callback);
        Object.assign(defaultOpts, options);
        options = defaultOpts;

        if (options.ignoreMounts) {
            brickMapController.cloneFolder(srcPath, destPath, callback);
            return;
        }

        this.getArchiveForPath(srcPath, (err, dossierContext) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${srcPath}`, err));
            }
            if (dossierContext.readonly === true) {
                return callback(Error("Tried to rename in a readonly mounted RawDossier"));
            }

            this.getArchiveForPath(destPath, (err, dstDossierContext) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${dstPath}`, err));
                }

                if (dstDossierContext.prefixPath !== dossierContext.prefixPath) {
                    return callback(Error('Destination is invalid. Renaming must be done in the scope of the same dossier'));
                }

                options.ignoreMounts = true;
                dossierContext.archive.cloneFolder(dossierContext.relativePath, dstDossierContext.relativePath, options, callback);
            })
        });
    }

    this.mount = (path, archiveSSI, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = undefined;
        }

        callback = $$.makeSaneCallback(callback);

        const keySSISpace = require("opendsu").loadAPI("keyssi");

        if (typeof archiveSSI === "string") {
            try {
                archiveSSI = keySSISpace.parse(archiveSSI);
            } catch (e) {
                return callback(createOpenDSUErrorWrapper(`The provided archiveSSI is not a valid SSI string.`, e));
            }
        }

        if (typeof archiveSSI === "object") {
            try {
                archiveSSI = archiveSSI.getIdentifier();
            } catch (e) {
                return callback(createOpenDSUErrorWrapper(`The provided archiveSSI is not a valid SSI instance`));
            }
        } else {
            return callback(createOpenDSUErrorWrapper(`The provided archiveSSI is neither a string nor a valid SSI instance`));
        }

        function internalMount() {
            _listFiles(path, (err, files) => {
                if (!err && files.length > 0) {
                    return callback(Error("Tried to mount in a non-empty folder"));
                }
                getManifest((err, manifestHandler) => {
                    if (err) {
                        return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get manifest handler`, err));
                    }

                    manifestHandler.mount(path, archiveSSI, options, callback);
                });
            });
        }

        this.getArchiveForPath(path, (err, result) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${path}`, err));
            }
            if (result.relativePath === path) {
                internalMount()
            } else {
                result.archive.mount(result.relativePath, archiveSSI, options, callback)
            }
        });
    };

    this.unmount = (path, callback) => {
        callback = $$.makeSaneCallback(callback);

        getManifest((err, manifestHandler) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get manifest handler`, err));
            }

            manifestHandler.unmount(path, callback);
        });
    };

    this.listMountedDossiers = (path, callback) => {
        callback = $$.makeSaneCallback(callback);

        this.getArchiveForPath(path, (err, result) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${path}`, err));
            }

            if (result.archive === this) {
                getManifest(listMounts);
            } else {
                Manifest.getManifest(result.archive, listMounts);
            }

            function listMounts(err, handler) {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to list mounts`, err));
                }

                handler.getMountedDossiers(result.relativePath, callback);
            }
        });
    };

    this.listMountedDSUs = this.listMountedDossiers;

    this.hasUnanchoredChanges = () => {
        const changesExist = mountedArchivesForBatchOperations.reduce((acc, dossierContext) => {
            return acc || dossierContext.archive.hasUnanchoredChanges();
        }, false);
        return brickMapController.hasUnanchoredChanges() || changesExist;
    };

    this.getArchiveForPath = (path, callback) => {
        callback = $$.makeSaneCallback(callback);

        getManifest((err, handler) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get manifest handler`, err));
            }

            if (this.batchInProgress()) {
                return getArchiveForBatchOperations(handler, path, callback);
            }


            handler.getArchiveForPath(path, (err, result) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${path}`, err));
                }


                if (result.archive === this || (!publishAnchoringNotifications || publishOptions.ignoreMounts)) {
                    return callback(undefined, result);
                }

                result.archive.enableAnchoringNotifications(publishAnchoringNotifications, publishOptions, (err) => {
                    if (err) {
                        return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to toggle anchoring notification publishing for mount point: ${mountPoint}`, err));
                    }

                    callback(undefined, result);
                })
            });
        });
    };

    /**
     * Start a batch of operations
     * This will force the anchoring when the
     * batch is commited
     */
    this.beginBatch = () => {
        if (batchOperationsInProgress) {
            throw new Error("Another anchoring transaction is already in progress. Cancel the previous batch and try again.");
        }

        batchOperationsInProgress = true;

        // Save the previous decision function
        const anchoringStrategy = this.getAnchoringStrategy();
        prevAnchoringDecisionFn = anchoringStrategy.getDecisionFunction();

        // Prevent anchoring after each operation
        anchoringStrategy.setDecisionFunction((brickMap, callback) => {
            return callback(undefined, false);
        })
    };

    /**
     * @return {boolean}
     */
    this.batchInProgress = () => {
        return batchOperationsInProgress;
    }

    /**
     * Anchor batch of changes
     * @param {callback} onConflict If defined it will be called if a conflict occurs
     * @param {callback} callback
     */
    this.commitBatch = (onConflict, callback) => {
        if (typeof callback === 'undefined') {
            callback = onConflict;
            onConflict = undefined;
        }
        if (!batchOperationsInProgress) {
            return callback(new Error("No batch operations have been scheduled"))
        }

        let usesOnConflictCallback = false;

        const anchoringStrategy = this.getAnchoringStrategy();
        if (!anchoringStrategy.getConflictResolutionFunction() && typeof onConflict !== 'undefined') {
            prevConflictResolutionFunction = anchoringStrategy.getConflictResolutionFunction();
            // Set 'onConflict' callback
            anchoringStrategy.setConflictResolutionFunction(onConflict);
            usesOnConflictCallback = true;
        }

        commitBatchesInMountedArchives(onConflict, (err) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to anchor`, err));
            }
            this.doAnchoring((err, result) => {
                batchOperationsInProgress = false;
                anchoringStrategy.setDecisionFunction(prevAnchoringDecisionFn);
                if (usesOnConflictCallback) {
                    // Restore the 'conflictResolutionFn'
                    anchoringStrategy.setConflictResolutionFunction(prevConflictResolutionFunction);
                }

                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to anchor`, err));
                }

                this.refresh((err) => {
                    if (err) {
                        return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to reload current DSU`, err));
                    }
                    callback(undefined, result);
                })
            });
        });
    };

    /**
     * Cancel the current anchoring batch
     */
    this.cancelBatch = (callback) => {
        if (!batchOperationsInProgress) {
            return callback(new Error("No batch operations have been scheduled"))
        }

        cancelBatchesInMountedArchives((err) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to cancel batches in mounted archive`, err));
            }

            batchOperationsInProgress = false;
            this.getAnchoringStrategy().setDecisionFunction(prevAnchoringDecisionFn);
            this.load((err) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load current DSU`, err));
                }
                callback();
            })
        });
    };

    /**
     * Execute a batch of operations
     * then anchor the changes
     *
     * @param {function} batch
     * @param {callback} callback
     */
    this.batch = (batch, callback) => {
        this.beginBatch();
        batch((err) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to execute batch operations`, err));
            }

            this.commitBatch(callback);
        });
    }

    /**
     * @param {function} handler
     */
    this.setMergeConflictsHandler = (handler) => {
        this.getAnchoringStrategy().setConflictResolutionFunction(handler);
    }

    /**
     * Toggle notifications publishing for new anchors
     *
     * @param {boolean} status When `true` the DSU will publish a notification
     *                         after each successful anchoring
     * @param {object} options
     * @param {boolean} options.ignoreMounts Default `true`. If `false` enable publishing for all mount points
     * @param {function} callback
     */
    this.enableAnchoringNotifications = (status, options, callback) => {
        if (status === brickMapController.anchoringNotificationsEnabled()) {
            return callback();
        }
        options = options || {};

        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        const defaultOptions = {
            ignoreMounts: true
        };
        options = {
            ...defaultOptions,
            ...options
        };

        const prevOptions = publishOptions;

        publishAnchoringNotifications = status;
        publishOptions = (status) ? options : null;

        if (publishAnchoringNotifications && options.ignoreMounts) {
            // No need to recurse in mount points
            brickMapController.enableAnchoringNotifications(status);
            return callback();
        }

        // If the notificatios were enabled with ignoring mount
        // points there's no need to recurse in the mounted archives
        if (!status && (!prevOptions || prevOptions.ignoreMounts)) {
            brickMapController.enableAnchoringNotifications(status);
            return callback();
        }

        let mountPoints = [];

        // Recurse in all mount points and set the anchoring notifications settings
        const propagateNotificationSettings = (manifest, callback) => {
            if (!mountPoints.length) {
                return callback();
            }

            const mountPoint = mountPoints.pop();

            manifest.getArchiveForPath(mountPoint, (err, result) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${mountPoint}`, err));
                }

                result.archive.enableAnchoringNotifications(publishAnchoringNotifications, publishOptions, (err) => {
                    if (err) {
                        return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to toggle anchoring notification publishing for mount point: ${mountPoint}`, err));
                    }

                    propagateNotificationSettings(manifest, callback);
                })
            });
        }

        getManifest((err, manifest) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get manifest handler`, err));
            }

            mountPoints = manifest.getMountPoints();

            propagateNotificationSettings(manifest, (err) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Unable to toggle anchoring notifications publishing for mounted DSUs", err));
                }

                brickMapController.enableAnchoringNotifications(status);
                callback();
            })
        });
    }

    /**
     * Toggle subscribing to anchor notifications
     * and auto merging upstream changes
     *
     * @param {boolean} status
     * @param {object} options
     * @param {function} options.onError((err) => {}) Error listener
     * @param {function} options.onSync(() => {}) Sync listener
     * @param {boolean} options.ignoreMounts Default `true`. If `false` enable auto sync for all mount points
     * @param {function} callback
     */
    this.enableAutoSync = (status, options, callback) => {
        options = options || {};
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        if (status === autoSyncStatus && dsuObsHandler) {
            return callback();
        }

        const defaultOptions = {
            onError: () => {
            },
            onSync: () => {
            },
            ignoreMounts: true
        }

        options = {
            ...defaultOptions,
            ...options
        };

        const subscribe = (options, callback) => {
            archiveConfigurator.getKeySSI(undefined, (err, keySSI) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Failed to retrieve keySSI", err));
                }

                dsuObsHandler = notifications.getObservableHandler(keySSI);
                dsuObsHandler.on('error', (err) => {
                    options.onError(err);
                });

                dsuObsHandler.on('message', async (message) => {
                    if (!message.ok) {
                        options.onError(new Error(`Unable to fetch notification. Code: ${message.statusCode}. Message: ${message.statusMessage}`));
                        return;
                    }

                    try {
                        message = await message.json();
                        message = JSON.parse(message.message);
                    } catch (e) {
                        options.onError(e);
                    }

                    if (typeof message !== 'object' || message.event !== 'dsu:newAnchor') {
                        // We're interested only in new anchors
                        return;
                    }

                    if (brickMapController.getLastAnchoredHashLink().getAnchorId() === message.payload) {
                        // Nothing to do: we're up to date
                        return;
                    }

                    // Load and try to merge the latest changes
                    brickMapController.mergeUpstreamChanges((err, result) => {
                        if (err) {
                            return options.onError(err);
                        }
                        options.onSync(result);
                    })
                })

                callback();
            })
        };

        const unsubscribe = (callback) => {
            dsuObsHandler && notifications.unsubscribe(dsuObsHandler);
            dsuObsHandler = null;
            callback();
        }

        const prevOptions = autoSyncOptions;

        autoSyncStatus = status;
        autoSyncOptions = (status) ? options : null;

        if (options.ignoreMounts) {
            if (autoSyncStatus) {
                return subscribe(autoSyncOptions, callback);
            }

            // When unsubscribing make sure that the previous
            // subscription ignored mounts as well, else continue
            // and unsubscribe recursively
            if (!autoSyncStatus && (!prevOptions || prevOptions.ignoreMounts)) {
                return unsubscribe(callback)
            }
        }

        let mountPoints = [];

        // Recurse in all mount points and set the auto sync settings
        const propagateAutoSyncSettings = (manifest, callback) => {
            if (!mountPoints.length) {
                return callback();
            }

            const mountPoint = mountPoints.pop();

            manifest.getArchiveForPath(mountPoint, (err, result) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load DSU instance mounted at path ${mountPoint}`, err));
                }

                result.archive.enableAutoSync(autoSyncStatus, autoSyncOptions, (err) => {
                    if (err) {
                        return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to toggle auto sync for mount point: ${mountPoint}`, err));
                    }

                    propagateAutoSyncSettings(manifest, callback);
                })
            });
        }

        getManifest((err, manifest) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get manifest handler`, err));
            }

            mountPoints = manifest.getMountPoints();

            propagateAutoSyncSettings(manifest, (err) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper("Unable to toggle auto sync for mounted DSUs", err));
                }

                autoSyncStatus ? subscribe(autoSyncOptions, callback)
                    : unsubscribe(callback);
            })
        });
    }

    this.stat = (path, callback) => {
        callback = $$.makeSaneCallback(callback);

        this.getArchiveForPath(path, (err, res) => {
            if (err) {
                callback(undefined, {type: undefined})
            }

            if (res.archive === this) {
                let stats;
                try {
                    stats = brickMapController.stat(path);
                } catch (e) {
                    return callback(undefined, {type: undefined})
                }

                callback(undefined, stats);
            } else {
                res.archive.stat(res.relativePath, callback);
            }
        });
    };
}

module.exports = Archive;
