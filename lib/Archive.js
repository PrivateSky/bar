const Brick = require('./Brick');
const BarMap = require('./BarMap');
const pathModule = "path";
const path = require(pathModule);
const swarmutils = require("swarmutils");
const TaskCounter = swarmutils.TaskCounter;
const pskPth = swarmutils.path;
const crypto = require('pskcrypto');
const BrickStorageService = require('./BrickStorageService').Service;

/**
 * @param {ArchiveConfigurator} archiveConfigurator
 */
function Archive(archiveConfigurator) {
    let cachedSEED;
    let barMap;
    let cachedMapDigest;
    let validator;
    let brickStorageService;

    if (archiveConfigurator.getStorageProvider()) {
        brickStorageService = buildBrickStorageServiceInstance(archiveConfigurator.getStorageProvider());
    } else {
        brickStorageService = buildBrickStorageServiceInstance(archiveConfigurator.getBootstrapingService());
    }

    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////

    /**
     * Create and configura the BrickStorageService
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
                const transformParameters = barMap.getTransformParameters(brickMeta);
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
        const hashList = barMap.getBricksMeta(fileBarPath).map(brickMeta => brickMeta.hash);
        const PskHash = crypto.PskHash;
        const pskHash = new PskHash();
        hashList.forEach(hash => {
            pskHash.update(hash);
        });

        return pskHash.digest();
    }

    /**
     * @param {string} hash
     * @param {callback} callback
     */
    function getBarMap(hash, callback) {
        if (typeof hash === 'function') {
            callback = hash;
            hash = undefined;
        }

        if (!hash) {
            return callback(undefined, new BarMap());
        }

        brickStorageService.getAliasVersions(hash, (err, hashesList) => {
            if (err) {
                return callback(err);
            }

            let barMapId;
            if (hashesList.length === 0) {
                barMapId = hash;
            } else {
                barMapId = hashesList[hashesList.length - 1];
            }

            brickStorageService.getBrick(barMapId, (err, barMapBrick) => {
                if (err) {
                    return callback(err);
                }

                if (barMapId !== barMapBrick.getHash()) {
                    return callback(Error("Invalid data received"));
                }
                const barMap = new BarMap(barMapBrick);
                callback(undefined, barMap);
            });

        });
    }

    /**
     * @param {string} alias
     * @param {Brick} brick
     * @param {callback} callback
     */
    function updateAlias(alias, brick, callback) {
        brickStorageService.updateAlias(alias, brick.getHash(), (err) => {
            if (err) {
                return callback(err);
            }

            brickStorageService.putBrick(brick, callback);
        })
    }

    /**
     * @param {BarMap} barMap
     * @param {callback} callback
     */
    function putBarMap(barMap, callback) {
        const barMapBrick = barMap.toBrick();
        barMapBrick.setTransformParameters(barMap.getTransformParameters());

        let brickId = barMapBrick.getKey();
        if (!brickId) {
            brickId = barMapBrick.getHash();
            barMapBrick.setKey(brickId);
        }

        brickStorageService.getAliasVersions(brickId, (err, hashesList) => {
            if (err) {
                return callback(err);
            }

            if (!hashesList.length) {
                return updateAlias(brickId, barMapBrick, callback);
            }

            const barMapHash = hashesList[hashesList.length - 1];
            if (barMapHash !== barMapBrick.getHash()) {
                return updateAlias(brickId, barMapBrick, callback);
            }

            callback();
        })
    }

    ////////////////////////////////////////////////////////////
    // Public methods
    ////////////////////////////////////////////////////////////

    /**
     * @param {callback} callback
     */
    this.load = (callback) => {
        const barMapHash = archiveConfigurator.getBarMapId();
        getBarMap(barMapHash, (err, map) => {
            if (err) {
                return callback(err);
            }

            barMap = map;
            if (archiveConfigurator.getMapEncryptionKey()) {
                barMap.setEncryptionKey(archiveConfigurator.getMapEncryptionKey());
            }

            if (!barMap.getConfig()) {
                barMap.setConfig(archiveConfigurator);
            }

            barMap.load();
            callback();
        });
    };

    /**
     * @return {string}
     */
    this.getMapDigest = () => {
        if (cachedMapDigest) {
            return cachedMapDigest;
        }

        cachedMapDigest = archiveConfigurator.getBarMapId();
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
        const fileList = barMap.getFileList(barPath);
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

            barMap.addFileEntry(barPath, result);
            this.saveBarMap(callback);
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
            bricksMeta = barMap.getBricksMeta(barPath);
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
            bricksMeta = barMap.getBricksMeta(barPath);
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

            barMap.addFileEntry(barPath, result);
            this.saveBarMap(callback);
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

            for (const filePath in result) {
                const bricks = result[filePath];
                barMap.addFileEntry(pskPth.join(barPath, filePath), bricks);
            }

            this.saveBarMap(callback);
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
            bricksMeta = barMap.getBricksMeta(barPath);
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

            barMap.appendBricksToEntry(barPath, result);
            this.saveBarMap(callback);
        })
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


            for (const filePath in result) {
                const bricks = result[filePath];
                barMap.addFileEntry(pskPth.join(barPath, filePath), bricks);
            }

            this.saveBarMap(callback);
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

        const filePaths = barMap.getFileList(barPath);
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
                    actualPath = path.join(fsFolderPath, filePath);
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
     * @param {callback} callback
     */
    this.saveBarMap = (callback) => {
        putBarMap(barMap, callback);
    };


    /**
     * @param {string} barPath
     * @param {callback} callback
     */
    this.delete = (barPath, callback) => {
        barMap.delete(barPath);
        callback();
    };

    /**
     * @param {string} folderBarPath
     * @param {object} options
     * @param {callback} callback
     */
    this.listFiles = (folderBarPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {recursive:true};
        } else if (typeof folderBarPath === "function") {
            callback = folderBarPath;
            options = {recursive: true};
            folderBarPath = "/";
        }

        let fileList;
        try {
            fileList = barMap.getFileList(folderBarPath, options.recursive);
        } catch (e) {
            return callback(e);
        }

        callback(undefined, fileList);
    };

    /**
     * @param {string} folderBarPath
     * @param {boolean} recursive
     * @param {callback} callback
     */
    this.listFolders = (folderBarPath, recursive, callback) => {
        if (typeof recursive === "function") {
            callback = recursive;
            recursive = true;
        }

        callback(undefined, barMap.getFolderList(folderBarPath, recursive));
    };

    /**
     * @param {EDFSBrickStorage} targetStorage
     * @param {boolean} preserveKeys
     * @param {callback} callback
     */
    this.clone = (targetStorage, preserveKeys = true, callback) => {
        targetStorage.getBarMap((err, targetBarMap) => {
            if (err) {
                return callback(err);
            }


            const fileList = barMap.getFileList("/");
            const bricksList = {};
            for (const filepath of fileList) {
                bricksList[filepath] = barMap.getBricksMeta(filepath);
            }

            brickStorageService.copyBricks(bricksList, {
                dstStorage: targetStorage,
                beforeCopyCallback: (brickId, brick) => {
                    const transformParameters = barMap.getTransformParameters(brickId);
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
                    targetBarMap.addFileEntry(filepath, bricks);
                }

                cachedSEED = archiveConfigurator.getSeed();
                archiveConfigurator.generateSeed();
                targetBarMap.setEncryptionKey(archiveConfigurator.getMapEncryptionKey());
                targetBarMap.setConfig(archiveConfigurator);

                targetStorage.putBarMap(targetBarMap, err => callback(err, archiveConfigurator.getSeed()));
            });
        });
    };

    /**
     * @param {object} _validator
     * @param {callback} _validator.writeRule Writes validator
     * @param {callback} _validator.readRule Reads validator
     */
    this.setValidator = (_validator) => {
        validator = _validator;
    };
}

module.exports = Archive;
