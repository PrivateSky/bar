const Brick = require('./Brick');
const isStream = require("../utils/isStream");
const stream = require('stream');
const crypto = require('pskcrypto');
const BrickStorageService = require('./BrickStorageService').Service;
const BrickMapController = require('./BrickMapController');

/**
 * @param {ArchiveConfigurator} archiveConfigurator
 */
function Archive(archiveConfigurator) {
    const swarmutils = require("swarmutils");
    const TaskCounter = swarmutils.TaskCounter;
    const pskPth = swarmutils.path;

    let cachedSEED;
    let brickMapController;
    let cachedMapDigest;
    let brickStorageService;

    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////
    const initialize = () => {
        let storageProvider = archiveConfigurator.getStorageProvider()
        if (!storageProvider) {
            storageProvider = archiveConfigurator.getBootstrapingService();
        }

        brickStorageService = buildBrickStorageServiceInstance(storageProvider);
        brickMapController = new BrickMapController({
            config: archiveConfigurator,
            brickStorageService
        });
    }

    /**
     * Create and configure the BrickStorageService
     *
     * @param {object} storageProvider
     * @return {BrickStorageService}
     */
    function buildBrickStorageServiceInstance(storageProvider) {
        const instance = new BrickStorageService({
            cache: archiveConfigurator.getCache(),
            bufferSize: archiveConfigurator.getBufferSize(),
            storageProvider: storageProvider,
            dlDomain: archiveConfigurator.getDLDomain(),
            favouriteEndpoint: archiveConfigurator.getFavouriteEndpoint(),

            brickFactoryCallback: () => {
                return new Brick(archiveConfigurator);
            },

            brickDataExtractorCallback: (brickMeta, brick) => {
                brick.setConfig(archiveConfigurator);
                const transformParameters = brickMapController.getTransformParameters(brickMeta);
                brick.setTransformParameters(transformParameters);

                return brick.getRawData();
            },

            fsAdapter: archiveConfigurator.getFsAdapter()
        });

        return instance;
    }

    /**
     * @param {string} fileBarPath
     * @return {string}
     */
    function computeFileHash(fileBarPath) {
        const hashList = brickMapController.getBricksMeta(fileBarPath).map(brickMeta => brickMeta.hash);
        const PskHash = crypto.PskHash;
        const pskHash = new PskHash();
        hashList.forEach(hash => {
            pskHash.update(hash);
        });

        return pskHash.digest();
    }

    ////////////////////////////////////////////////////////////
    // Public methods
    ////////////////////////////////////////////////////////////
    /**
     * @param {callback} callback
     */
    this.init = (callback) => {
        brickMapController.init(callback);
    }

    /**
     * @param {callback} callback
     */
    this.load = (callback) => {
        brickMapController.load(callback);
    };

    this.getConfig = () => {
        return archiveConfigurator;
    }

    /**
     * @return {string}
     */
    this.getMapDigest = () => {
        if (cachedMapDigest) {
            return cachedMapDigest;
        }

        cachedMapDigest = archiveConfigurator.getBrickMapId();
        return cachedMapDigest;
    };

    /**
     * @param {string} seed
     */
    this.setSeed = (seed) => {
        cachedSEED = seed;
        archiveConfigurator.setSeed(Buffer.from(seed));
    };

    /**
     * @return {string}
     */
    this.getSeed = () => {
        if (cachedSEED) {
            return cachedSEED;
        }

        cachedSEED = archiveConfigurator.getSeed().toString();
        return cachedSEED;
    };

    /**
     * @return {string}
     */
    this.getKeySSI = (keySSIType) => {
        return archiveConfigurator.getKeySSI(keySSIType).getIdentifier();
    }

    /**
     * @param {string} barPath
     * @param {callback} callback
     * @return {string}
     */
    this.getFileHash = (barPath, callback) => {
        barPath = pskPth.normalize(barPath);
        const hash = computeFileHash(barPath).toString("hex");
        callback(undefined, hash);
        return hash;
    };

    /**
     * @param {string} barPath
     * @param {callback} callback
     * @return {string}
     */
    this.getFolderHash = (barPath, callback) => {
        barPath = pskPth.normalize(barPath);
        const fileList = brickMapController.getFileList(barPath);
        if (fileList.length === 1) {
            const hash = computeFileHash(pskPth.join(barPath, fileList[0]).toString("hex"));
            callback(undefined, hash);
            return hash;
        }
        fileList.sort();

        let xor = computeFileHash(pskPth.join(barPath, fileList[0]));
        for (let i = 0; i < fileList.length - 1; i++) {
            xor = crypto.xorBuffers(xor, computeFileHash(pskPth.join(barPath, fileList[i + 1])));
        }

        const hash = crypto.pskHash(xor, "hex");
        callback(undefined, hash);
        return hash;
    };

    /**
     * @param {string} barPath
     * @param {string|Buffer|stream.ReadableStream} data
     * @param {object} options
     * @param {callback} callback
     */
    this.writeFile = (barPath, data, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {};
            options.encrypt = true;
        }
        barPath = pskPth.normalize(barPath);

        archiveConfigurator.setIsEncrypted(options.encrypt);

        brickStorageService.ingestData(data, (err, result) => {
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
    this.readFile = (barPath, callback) => {
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
    this.createReadStream = (barPath, callback) => {
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
    this.addFile = (fsFilePath, barPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {};
            options.encrypt = true;
        }

        barPath = pskPth.normalize(barPath);
        archiveConfigurator.setIsEncrypted(options.encrypt);

        brickStorageService.ingestFile(fsFilePath, (err, result) => {
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
    this.addFiles = (files, barPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {};
            options.encrypt = true;
        }

        barPath = pskPth.normalize(barPath);
        archiveConfigurator.setIsEncrypted(options.encrypt);

        const filesArray = files.slice();

        brickStorageService.ingestFiles(filesArray, (err, result) => {
            if (err) {
                return callback(err);
            }

            brickMapController.addFiles(barPath, result, callback);
        });
    };

    /**
     * @param {string} fsFilePath
     * @param {string} barPath
     * @param {callback} callback
     */
    this.extractFile = (fsFilePath, barPath, callback) => {
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
    this.appendToFile = (barPath, data, callback) => {
        barPath = pskPth.normalize(barPath);

        brickStorageService.ingestData(data, (err, result) => {
            if (err) {
                return callback(err);
            }

            brickMapController.appendToFile(barPath, result, callback);
        });
    };

    /**
     * @param {string} fsFolderPath
     * @param {string} barPath
     * @param {object} options
     * @param {callback} callback
     */
    this.addFolder = (fsFolderPath, barPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {};
            options.encrypt = true;
        }
        barPath = pskPth.normalize(barPath);
        archiveConfigurator.setIsEncrypted(options.encrypt);

        brickStorageService.ingestFolder(fsFolderPath, (err, result) => {
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
    this.extractFolder = (fsFolderPath, barPath, callback) => {
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
    this.delete = (barPath, callback) => {
        brickMapController.deleteFile(barPath, callback);
    };

    /**
     * @param {string} srcPath
     * @param {dstPath} dstPath
     */

    this.rename = (srcPath, dstPath, callback) => {
        srcPath = pskPth.normalize(srcPath);
        dstPath = pskPth.normalize(dstPath);

        brickMapController.renameFile(srcPath, dstPath, callback);
    }

    /**
     * @param {string} folderBarPath
     * @param {object} options
     * @param {callback} callback
     */
    this.listFiles = (folderBarPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {recursive: true};
        } else if (typeof folderBarPath === "function") {
            callback = folderBarPath;
            options = {recursive: true};
            folderBarPath = "/";
        }

        let fileList;
        try {
            fileList = brickMapController.getFileList(folderBarPath, options.recursive);
        } catch (e) {
            return callback(e);
        }

        callback(undefined, fileList);
    };

    /**
     * @param {string} folderBarPath
     * @param {object} options
     * @param {boolean} options.recursive
     * @param {callback} callback
     */
    this.listFolders = (folderBarPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {recursive: true};
        }

        callback(undefined, brickMapController.getFolderList(folderBarPath, options.recursive));
    };

    /**
     * @param {string} barPath
     * @param {callback} callback
     */
    this.createFolder = (barPath, callback) => {
        brickMapController.createDirectory(barPath, callback);
    };

    // @TODO: fix this
    /**
     * @param {EDFSBrickStorage} targetStorage
     * @param {boolean} preserveKeys
     * @param {callback} callback
     */
    this.clone = (targetStorage, preserveKeys = true, callback) => {
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

                    brick.setConfig(archiveConfigurator);
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

                cachedSEED = archiveConfigurator.getSeed();
                archiveConfigurator.generateSeed();
                targetBrickMap.setEncryptionKey(archiveConfigurator.getMapEncryptionKey());
                targetBrickMap.setConfig(archiveConfigurator);

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
     * @param {callback} callback
     */
    this.setAnchoringCallback = (callback) => {
        archiveConfigurator.getAnchoringStrategy().setAnchoringCallback(callback);
    }

    /**
     * @param {callback} callback
     */
    this.setDecisionCallback = (callback) => {
        archiveConfigurator.getAnchoringStrategy().setDecisionCallback(callback);
    }

    /**
     * @return {AnchoringStrategy}
     */
    this.getAnchoringStrategy = () => {
        return archiveConfigurator.getAnchoringStrategy();
    }

    /**
     * Manually anchor any changes
     */
    this.doAnchoring = () => {
        const strategy = this.getAnchoringStrategy();
        const anchoringEventListener = strategy.getAnchoringEventListener();
        if (typeof anchoringEventListener !== 'function') {
            throw new Error('An anchoring event listener is required');
        }

        brickMapController.anchorChanges(anchoringEventListener);
    }

    initialize();
}

module.exports = Archive;
