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

    const mountedArchivesForBatchOperations = [];

    let brickMapController;
    let brickStorageService;
    let manifestHandler;
    let batchOperationsInProgress = false;
    let previousAnchoringDecisionFn;

    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////
    const initialize = (callback) => {
        archiveConfigurator.getKeySSI((err, keySSI) => {
            if (err) {
                return callback(err);
            }

            let storageProvider = archiveConfigurator.getBootstrapingService();
            brickStorageService = buildBrickStorageServiceInstance(keySSI, storageProvider);
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
    function buildBrickStorageServiceInstance(keySSI, storageProvider) {
        const instance = new BrickStorageService({
            cache: archiveConfigurator.getCache(),
            bufferSize: archiveConfigurator.getBufferSize(),
            storageProvider: storageProvider,
            keySSI,

            brickFactoryFunction: (encrypt) => {
                encrypt = (typeof encrypt === 'undefined') ? true : !!encrypt;
                if (encrypt) {
                    return new Brick(keySSI);
                }

                // Strip the encryption key from the SeedSSI
                const SSIKeys = require("opendsu").loadApi("keyssi");
                let key = SSIKeys.buildSeedSSI(keySSI.getDLDomain(), undefined, keySSI.getControl(), keySSI.getVn());
                return new Brick(key);
            },

            brickDataExtractorCallback: (brickMeta, brick, callback) => {
                brick.setKeySSI(keySSI);
                const transformParameters = brickMapController.getTransformParameters(brickMeta)

                brick.setTransformParameters(transformParameters);
                brick.getRawData(callback);
            },

            fsAdapter: archiveConfigurator.getFsAdapter()
        });

        return instance;
    }

    const beginBatchInMountedArchive = (archive) => {
        if (archive === this) {
            return;
        }

        if (!archive.batchInProgress()) {
            archive.beginBatch();
        }

        if (mountedArchivesForBatchOperations.indexOf(archive) === -1) {
            mountedArchivesForBatchOperations.push(archive);
        }
    }

    const cancelBatchesInMountedArchives = (callback) => {
        const cancelBatch = (dossierContext) => {
            if (!dossierContext) {
                return callback();
            }

            dossierContext.archive.cancelBatch((err) => {
                if (err) {
                    return callback(err);
                }

                cancelBatch(mountedArchivesForBatchOperations.pop());
            })
        }

        cancelBatch(mountedArchivesForBatchOperations.pop());
    }

    const commitBatchesInMountedArchives = (callback) => {
        const results = [];

        const commitBatch = (dossierContext) => {
            if (!dossierContext) {
                return callback(undefined, results);
            }

            dossierContext.archive.commitBatch((err, result) => {
                if (err) {
                    return callback(err);
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
                return callback(err);
            }

            if (result.archive === this) {
                return callback(undefined, result);
            }

            result.archive.getKeySSI((err, keySSI) => {
                if (err) {
                    return callback(err);
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
                callback(undefined, result);
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
                return callback(err);
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
                return callback(err);
            }
            brickMapController.load(callback);
        });
    };

    /**
     * @return {string}
     */
    this.getMapDigest = () => {
        return archiveConfigurator.getBrickMapId();
    };

    /**
     * @return {string}
     */
    this.getKeySSI = (keySSIType, callback) => {
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
     * @param {string|Buffer|stream.ReadableStream} data
     * @param {object} options
     * @param {callback} callback
     */
    const _writeFile = (barPath, data, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {
                encrypt: true
            }
        }
        barPath = pskPth.normalize(barPath);

        brickStorageService.ingestData(data, options, (err, result) => {
            if (err) {
                return callback(err);
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
            return callback(err);
        }

        brickStorageService.createBufferFromBricks(bricksMeta, (err, buffer) => {
            if (err) {
                return callback(err);
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
            return callback(err);
        }

        brickStorageService.createStreamFromBricks(bricksMeta, (err, stream) => {
            if (err) {
                return callback(err);
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
                return callback(err);
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
                batch: false
            };
        }

        barPath = pskPth.normalize(barPath);

        const filesArray = files.slice();

        const ingestionMethod = (!options.batch) ? 'ingestFiles' :'createBrickFromFiles';

        brickStorageService[ingestionMethod](filesArray, options, (err, result) => {
            if (err) {
                return callback(err);
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
                batch: false
            };
        }

        if (options.ignoreMounts === true) {
            _addFiles(files, barPath, options, callback);
        } else {
            this.getArchiveForPath(barPath, (err, dossierContext) => {
                if (err) {
                    return callback(err);
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
            return callback(err);
        }


        brickStorageService.createFileFromBricks(fsFilePath, bricksMeta, callback);
    };

    /**
     * @param {string} barPath
     * @param {string|Buffer|stream.ReadableStream} data
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
                    return callback(err);
                }

                brickMapController.appendToFile(barPath, result, callback);
            });
        } else {
            this.getArchiveForPath(barPath, (err, dossierContext) => {
                if (err) {
                    return callback(err);
                }
                if (dossierContext.readonly === true) {
                    return callback(Error("Tried to write in a readonly mounted RawDossier"));
                }

                options.ignoreMounts = true;
                dossierContext.archive.appendToFile(dossierContext.relativePath, data, options, callback);
            });
        }
    };

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
                batch: false
            };
        }
        barPath = pskPth.normalize(barPath);

        const ingestionMethod = (!options.batch) ? 'ingestFolder' :'createBrickFromFolder';

        brickStorageService[ingestionMethod](fsFolderPath, options, (err, result) => {
            if (err) {
                return callback(err);
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
                    return callback(err);
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
                return callback(err);
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
                return callback(err);
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

    // @TODO: fix this
    /**
     * @param {EDFSBrickStorage} targetStorage
     * @param {boolean} preserveKeys
     * @param {callback} callback
     */
    const _clone = (targetStorage, preserveKeys = true, callback) => {
        targetStorage.getBrickMap((err, targetBrickMap) => {
            if (err) {
                return callback(err);
            }


            const fileList = brickMapController.getFileList("/");
            const bricksList = {};
            for (const filepath of fileList) {
                bricksList[filepath] = brickMapController.getBricksMeta(filepath);
            }

            brickStorageService.copyBricks(bricksList, {
                dstStorage: targetStorage,
                beforeCopyCallback: (brickId, brick) => {
                    const transformParameters = brickMapController.getTransformParameters(brickId);
                    if (transformParameters) {
                        brick.setTransformParameters(transformParameters);
                    }

                    brick.setKeySSI(archiveConfigurator);
                    if (!preserveKeys) {
                        brick.createNewTransform();
                    }

                    return brick;
                }
            }, (err, result) => {
                if (err) {
                    return callback(err);
                }

                for (const filepath in result) {
                    const bricks = result[filepath];
                    targetBrickMap.addFileEntry(filepath, bricks);
                }

                targetBrickMap.setEncryptionKey(archiveConfigurator.getMapEncryptionKey());
                targetBrickMap.setKeySSI(archiveConfigurator);

                targetStorage.putBrickMap(targetBrickMap, err => callback(err, archiveConfigurator.getSeed()));
            });
        });
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
                    return callback(err);
                }

                manifestHandler = handler;
                return callback(undefined, manifestHandler);
            });
        } else {
            return callback(undefined, manifestHandler);
        }
    }

    this.getSSIForMount = (mountPoint, callback) => {
        getManifest(  (err, manifestHandler) => {
            if(err){
                return callback(createOpenDSUErrorWrapper("Failed to load manifest for " + mountPoint, err));
            }
            manifestHandler.getArchiveIdentifier(mountPoint, callback);
        });
    }

    this.addFolder = (fsFolderPath, barPath, options, callback) => {
        const defaultOpts = {encrypt: true, ignoreMounts: false, batch: false};
        if (typeof options === "function") {
            callback = options;
            options = {};
        }

        Object.assign(defaultOpts, options);
        options = defaultOpts;


        if (options.ignoreMounts === true) {
            _addFolder(fsFolderPath, barPath, options, callback);
        } else {
            this.getArchiveForPath(barPath, (err, result) => {
                if (err) {
                    return callback(err);
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

        Object.assign(defaultOpts, options);
        options = defaultOpts;

        if (options.ignoreMounts === true) {
            _addFile(fsFilePath, barPath, options, callback);
        } else {
            this.getArchiveForPath(barPath, (err, result) => {
                if (err) {
                    return callback(err);
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

        Object.assign(defaultOpts, options);
        options = defaultOpts;
        if (options.ignoreMounts === true) {
            _readFile(fileBarPath, callback);
        } else {
            this.getArchiveForPath(fileBarPath, (err, result) => {
                if (err) {
                    return callback(err);
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

        Object.assign(defaultOpts, options);
        options = defaultOpts;
        if (options.ignoreMounts === true) {
            _createReadStream(fileBarPath, callback);
        } else {
            this.getArchiveForPath(fileBarPath, (err, result) => {
                if (err) {
                    return callback(err);
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

        Object.assign(defaultOpts, options);
        options = defaultOpts;
        if (options.ignoreMounts === true) {
            _extractFolder(fsFolderPath, barPath, callback);
        } else {
            this.getArchiveForPath(barPath, (err, result) => {
                if (err) {
                    return callback(err);
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

        Object.assign(defaultOpts, options);
        options = defaultOpts;

        if (options.ignoreMounts === true) {
            _extractFile(fsFilePath, barPath, callback);
        } else {
            this.getArchiveForPath(barPath, (err, result) => {
                if (err) {
                    return callback(err);
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

        Object.assign(defaultOpts, options);
        options = defaultOpts;

        if (options.ignoreMounts === true) {
            _writeFile(path, data, options, callback);
        } else {
            this.getArchiveForPath(path, (err, dossierContext) => {
                if (err) {
                    return callback(err);
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
        const defaultOpts = {ignoreMounts: false};
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        Object.assign(defaultOpts, options);
        options = defaultOpts;

        if (options.ignoreMounts) {
            return _delete(path, callback);
        }

        this.getArchiveForPath(path, (err, dossierContext) => {
            if (err) {
                return callback(err);
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
        Object.assign(defaultOpts, options);
        options = defaultOpts;

        if (options.ignoreMounts) {
            _rename(srcPath, dstPath, callback);
            return;
        }

        this.getArchiveForPath(srcPath, (err, dossierContext) => {
            if (err) {
                return callback(err);
            }
            if (dossierContext.readonly === true) {
                return callback(Error("Tried to rename in a readonly mounted RawDossier"));
            }

            this.getArchiveForPath(dstPath, (err, dstDossierContext) => {
                if (err) {
                    return callback(err);
                }

                if (dstDossierContext.prefixPath !== dossierContext.prefixPath) {
                    return callback(Error('Destination is invalid. Renaming must be done in the scope of the same dossier'));
                }

                options.ignoreMounts = true;
                dossierContext.archive.rename(dossierContext.relativePath, dstDossierContext.relativePath, options, callback);
            })
        });
    };

    this.listFiles = (path, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {recursive: true, ignoreMounts: false};
        }

        if (options.ignoreMounts === true) {
            if (!options.recursive) {
                return _listFiles(path, options, callback);
            }

            return _listFiles(path, options, (err, files) => {
                if (err) {
                    return callback(err);
                }

                getManifest((err, manifest) => {
                    if (err) {
                        return callback(err);
                    }

                    const mountPoints = manifest.getMountPoints();
                    if (!mountPoints.length) {
                        return callback(undefined, files);
                    }

                    _listMountedFiles(mountPoints, (err, mountedFiles) => {
                        if (err) {
                            return callback(err);
                        }

                        files = files.concat(...mountedFiles);
                        return callback(undefined, files);
                    });
                })
            })
        }

        this.getArchiveForPath(path, (err, result) => {
            if (err) {
                return callback(err);
            }

            options.ignoreMounts = true;
            result.archive.listFiles(result.relativePath, options, callback);
        });
    };

    this.listFolders = (path, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {ignoreMounts: false, recursive: false};
        }

        if (options.ignoreMounts === true) {
            if (!options.recursive) {
                return _listFolders(path, options, callback);
            }

            return _listFolders(path, options, (err, folders) => {
                if (err) {
                    return callback(err);
                }

                getManifest((err, manifest) => {
                    if (err) {
                        return callback(err);
                    }

                    const mountPoints = manifest.getMountPoints();
                    if (!mountPoints.length) {
                        return callback(undefined, folders);
                    }

                    _listMountedFolders(mountPoints, (err, mountedFolders) => {
                        if (err) {
                            return callback(err);
                        }

                        folders = folders.concat(...mountedFolders);
                        return callback(undefined, folders);
                    });
                })
            })
        }

        this.getArchiveForPath(path, (err, result) => {
            if (err) {
                return callback(err);
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

        Object.assign(defaultOpts, options);
        options = defaultOpts;

        if (options.ignoreMounts === true) {
            _createFolder(barPath, callback);
        } else {
            this.getArchiveForPath(barPath, (err, dossierContext) => {
                if (err) {
                    return callback(err);
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

        const entries = {};
        this.getArchiveForPath(folderPath, (err, result) => {
            if (err) {
                return callback(err);
            }

            result.archive.listFiles(result.relativePath, {recursive: false, ignoreMounts: true}, (err, files) => {
                if (err) {
                    return callback(err);
                }

                entries.files = files;

                result.archive.listFolders(result.relativePath, {
                    recursive: false,
                    ignoreMounts: true
                }, (err, folders) => {
                    if (err) {
                        return callback(err);
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
                            return callback(err);
                        }

                        handler.getMountedDossiers(result.relativePath, (err, mounts) => {
                            if (err) {
                                return callback(err);
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


    this.mount = (path, archiveIdentifier, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = undefined;
        }

        _listFiles(path, (err, files) => {
            if (!err && files.length > 0) {
                return callback(Error("Tried to mount in a non-empty folder"));
            }
            getManifest((err, manifestHandler) => {
                if (err) {
                    return callback(err);
                }

                manifestHandler.mount(path, archiveIdentifier, options, callback);
            });
        });
    };

    this.unmount = (path, callback) => {
        getManifest((err, manifestHandler) => {
            if (err) {
                return callback(err);
            }

            manifestHandler.unmount(path, callback);
        });
    };

    this.listMountedDossiers = (path, callback) => {
        this.getArchiveForPath(path, (err, result) => {
            if (err) {
                return callback(err);
            }

            if (result.archive === this) {
                getManifest(listMounts);
            } else {
                Manifest.getManifest(result.archive, listMounts);
            }

            function listMounts(err, handler) {
                if (err) {
                    return callback(err);
                }

                handler.getMountedDossiers(result.relativePath, callback);
            }
        });
    };

    this.hasUnanchoredChanges = () => {
        const changesExist = mountedArchivesForBatchOperations.reduce((acc, dossierContext) => {
            return acc || dossierContext.archive.hasUnanchoredChanges();
        }, false);
        return brickMapController.hasUnanchoredChanges() || changesExist;
    };

    this.getArchiveForPath = (path, callback) => {
        getManifest((err, handler) => {
            if (err) {
                return callback(err);
            }

            if (this.batchInProgress()) {
                return getArchiveForBatchOperations(handler, path, callback);
            }

            handler.getArchiveForPath(path, callback);
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
        previousAnchoringDecisionFn = anchoringStrategy.getDecisionFunction();;

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
     * @param {callback} callback
     */
    this.commitBatch = (callback) => {
        if (!batchOperationsInProgress) {
            return callback(new Error("No batch operations have been scheduled"))
        }
        commitBatchesInMountedArchives((err) => {
            this.doAnchoring((err, result) => {
                batchOperationsInProgress = false;
                this.getAnchoringStrategy().setDecisionFunction(previousAnchoringDecisionFn);

                if (err) {
                    return callback(err);
                }

                callback(undefined, result);
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
                return callback(err);
            }

            batchOperationsInProgress = false;
            this.getAnchoringStrategy().setDecisionFunction(previousAnchoringDecisionFn);
            this.load((err) => {
                if (err) {
                    return callback(err);
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
                return callback(err);
            }

            this.commitBatch(callback);
        });
    }

    this.start = (callback) => {
        createBlockchain().start(callback);
    };

    const createBlockchain = () => {
        const blockchainModule = require("blockchain");
        const worldStateCache = blockchainModule.createWorldStateCache("bar", this);
        const historyStorage = blockchainModule.createHistoryStorage("bar", this);
        const consensusAlgorithm = blockchainModule.createConsensusAlgorithm("direct");
        const signatureProvider = blockchainModule.createSignatureProvider("permissive");
        return blockchainModule.createBlockchain(worldStateCache, historyStorage, consensusAlgorithm, signatureProvider, true);
    }
}

module.exports = Archive;
