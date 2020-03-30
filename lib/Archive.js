const Brick = require('./Brick');
const pathModule = "path";
const path = require(pathModule);
const isStream = require("../utils/isStream");
const TaskCounter = require("swarmutils").TaskCounter;
const crypto = require('pskcrypto');
const adler32 = require('adler32');

function Archive(archiveConfigurator) {

    const archiveFsAdapter = archiveConfigurator.getFsAdapter();
    const storageProvider = archiveConfigurator.getStorageProvider();
    let cachedSEED;
    let barMap;
    let cachedMapDigest;

    this.getMapDigest = () => {
        if (cachedMapDigest) {
            return cachedMapDigest;
        }

        cachedMapDigest = archiveConfigurator.getMapDigest();
        return cachedMapDigest;
    };

    this.setSeed = (seed) => {
        cachedSEED = seed;
        archiveConfigurator.setSeed(Buffer.from(seed));
    };

    this.getSeed = () => {
        if (cachedSEED) {
            return cachedSEED;
        }

        cachedSEED = archiveConfigurator.getSeed().toString();
        return cachedSEED;
    };

    this.getFileHash = (fileBarPath, callback) => {
        loadBarMapThenExecute(() => {
            callback(undefined, __computeFileHash(fileBarPath).toString("hex"));
        }, callback)
    };

    this.getFolderHash = (folderBarPath, callback) => {
        loadBarMapThenExecute(() => {
            const fileList = barMap.getFileList(folderBarPath);
            if (fileList.length === 1) {
                return callback(undefined, __computeFileHash(fileList[0]).toString("hex"));
            }
            fileList.sort();

            let xor;
            for (let i = 0; i < fileList.length - 1; i++) {
                xor = crypto.xorBuffers(__computeFileHash(fileList[i]), __computeFileHash(fileList[i + 1]));
            }

            callback(undefined, crypto.pskHash(xor, "hex"));
        }, callback);
    };

    this.writeFile = (fileBarPath, data, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {};
            options.encrypt = true;
        }
        loadBarMapThenExecute(__addData, callback);

        function __addData() {
            archiveConfigurator.setIsEncrypted(options.encrypt);
            const brick = new Brick(archiveConfigurator);
            if (typeof data === "string") {
                data = Buffer.from(data);
            }

            if (!Buffer.isBuffer(data)) {
                return callback(Error(`Type of data is ${typeof data}. Expected Buffer.`));
            }

            brick.setRawData(data);
            barMap.emptyList(fileBarPath);
            barMap.add(fileBarPath, brick);
            storageProvider.putBrick(brick, (err) => {
                if (err) {
                    return callback(err);
                }

                storageProvider.putBarMap(barMap, (err, digest) => {
                    if (err) {
                        return callback(err);
                    }

                    callback(undefined, digest);
                });
            });
        }
    };

    this.readFile = (barPath, callback) => {
        loadBarMapThenExecute(__readFile, callback);

        function __readFile() {
            let fileData = Buffer.alloc(0);
            let brickIds;
            try {
                brickIds = barMap.getHashList(barPath);
            } catch (err) {
                return callback(err);
            }

            getFileRecursively(0, callback);

            function getFileRecursively(brickIndex, callback) {
                const brickId = brickIds[brickIndex];
                storageProvider.getBrick(brickId, (err, brick) => {
                    if (err) {
                        return callback(err);
                    }

                    brick.setConfig(archiveConfigurator);
                    brick.setTransformParameters(barMap.getTransformParameters(brickId));
                    fileData = Buffer.concat([fileData, brick.getRawData()]);
                    ++brickIndex;

                    if (brickIndex < brickIds.length) {
                        getFileRecursively(brickIndex, callback);
                    } else {
                        callback(undefined, fileData);
                    }
                });
            }
        }
    };

    this.addFile = (fsFilePath, barPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {};
            options.encrypt = true;
        }
        loadBarMapThenExecute(__addFile, callback);

        function __addFile() {
            createBricks(fsFilePath, barPath, archiveConfigurator.getBufferSize(), options.encrypt, (err) => {
                if (err) {
                    return callback(err);
                }

                barMap.setConfig(archiveConfigurator);
                if (archiveConfigurator.getMapEncryptionKey()) {
                    barMap.setEncryptionKey(archiveConfigurator.getMapEncryptionKey());
                }

                storageProvider.putBarMap(barMap, callback);
            });
        }
    };

    this.addFiles = (arrWithFilePaths, barPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {};
            options.encrypt = true;
        }

        let arr = arrWithFilePaths.slice();

        loadBarMapThenExecute(() => {
            recAdd()
        }, callback);

        function recAdd() {
            if (arr.length > 0) {
                let filePath = arr.pop();
                let fileName = path.basename(filePath);

                createBricks(filePath, barPath + "/" + fileName, archiveConfigurator.getBufferSize(), options.encrypt, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    recAdd();
                });
            } else {
                barMap.setConfig(archiveConfigurator);
                if (archiveConfigurator.getMapEncryptionKey()) {
                    barMap.setEncryptionKey(archiveConfigurator.getMapEncryptionKey());
                }
                storageProvider.putBarMap(barMap, callback);
            }
        }
    };

    this.extractFile = (fsFilePath, barPath, callback) => {
        if (typeof barPath === "function") {
            callback = barPath;
            barPath = fsFilePath;
        }


        loadBarMapThenExecute(__extractFile, callback);

        function __extractFile() {
            const brickIds = barMap.getHashList(barPath);
            getFileRecursively(0, callback);

            function getFileRecursively(brickIndex, callback) {
                const brickId = brickIds[brickIndex];
                storageProvider.getBrick(brickId, (err, brick) => {
                    if (err) {
                        return callback(err);
                    }

                    brick.setConfig(archiveConfigurator);
                    brick.setTransformParameters(barMap.getTransformParameters(brickId));
                    archiveFsAdapter.appendBlockToFile(fsFilePath, brick.getRawData(), (err) => {
                        if (err) {
                            return callback(err);
                        }

                        ++brickIndex;
                        if (brickIndex < brickIds.length) {
                            getFileRecursively(brickIndex, callback);
                        } else {
                            callback();
                        }
                    });
                });
            }
        }
    };

    this.appendToFile = (filePath, data, callback) => {

        loadBarMapThenExecute(__appendToFile, callback);

        function __appendToFile() {
            filePath = path.normalize(filePath);

            if (typeof data === "string") {
                data = Buffer.from(data);
            }
            if (Buffer.isBuffer(data)) {
                const dataBrick = new Brick(data);
                storageProvider.putBrick(dataBrick, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    barMap.add(filePath, dataBrick);
                    putBarMap(callback);
                });
                return;
            }

            if (isStream.isReadable(data)) {
                data.on('error', (err) => {
                    return callback(err);
                }).on('data', (chunk) => {
                    const dataBrick = new Brick(chunk);
                    barMap.add(filePath, dataBrick);
                    storageProvider.putBrick(dataBrick, (err) => {
                        if (err) {
                            return callback(err);
                        }
                    });
                }).on("end", () => {
                    putBarMap(callback);
                });
                return;
            }
            callback(new Error("Invalid type of parameter data"));
        }
    };


    this.replaceFile = (fileName, stream, callback) => {
        if (typeof stream !== 'object') {
            return callback(new Error('Wrong stream!'));
        }

        loadBarMapThenExecute(__replaceFile, callback);

        function __replaceFile() {
            fileName = path.normalize(fileName);
            stream.on('error', () => {
                return callback(new Error("File does not exist!"));
            }).on('open', () => {
                storageProvider.deleteFile(fileName, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    barMap.emptyList(fileName);
                });
            }).on('data', (chunk) => {
                let tempBrick = new Brick(chunk);
                barMap.add(fileName, tempBrick);
                storageProvider.putBrick(tempBrick, (err) => {
                    if (err) {
                        return callback(err);
                    }
                    putBarMap(callback);
                });
            });
        }
    };

    this.addFolder = (fsFolderPath, barPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {};
            options.encrypt = true;
        }
        const filesIterator = archiveFsAdapter.getFilesIterator(fsFolderPath);

        loadBarMapThenExecute(__addFolder, callback);

        function __addFolder() {

            filesIterator.next(readFileCb);

            function readFileCb(err, file, rootFsPath) {
                if (err) {
                    return callback(err);
                }

                if (typeof file !== "undefined") {
                    const normalizedFilePath = file.split(path.sep).join("/");
                    createBricks(path.join(rootFsPath, file), barPath + "/" + normalizedFilePath, archiveConfigurator.getBufferSize(), options.encrypt, (err) => {
                        if (err) {
                            return callback(err);
                        }

                        filesIterator.next(readFileCb);
                    });
                } else {
                    storageProvider.putBarMap(barMap, (err, mapDigest) => {
                        if (err) {
                            return callback(err);
                        }

                        archiveConfigurator.setMapDigest(mapDigest);
                        callback(undefined, mapDigest);
                    });
                }
            }
        }
    };


    this.extractFolder = (fsFolderPath, barPath, callback) => {
        if (typeof fsFolderPath === "function") {
            callback = fsFolderPath;
            fsFolderPath = undefined;
        }
        if (typeof barPath === "function") {
            callback = barPath;
            barPath = undefined;
        }

        loadBarMapThenExecute(() => {
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
        }, callback);
    };

    this.store = (callback) => {
        storageProvider.putBarMap(barMap, callback);
    };

    this.delete = (barPath, callback) => {
        loadBarMapThenExecute(() => {
            barMap.delete(barPath);
            callback();
        }, callback);
    };

    this.listFiles = (folderBarPath, callback) => {
        if (typeof folderBarPath === "function") {
            callback = folderBarPath;
            folderBarPath = undefined;
        }
        loadBarMapThenExecute(() => {
            callback(undefined, barMap.getFileList(folderBarPath));
        }, callback);
    };

    this.listFolders = (folderBarPath, callback) => {
        if (typeof folderBarPath === "function") {
            callback = folderBarPath;
            folderBarPath = undefined;
        }

        loadBarMapThenExecute(() => {
            callback(undefined, barMap.getFolderList(folderBarPath));
        }, callback);
    };

    this.clone = (targetStorage, preserveKeys = true, callback) => {
        targetStorage.getBarMap((err, targetBarMap) => {
            if (err) {
                return callback(err);
            }

            loadBarMapThenExecute(__cloneBricks, callback);

            function __cloneBricks() {
                const fileList = barMap.getFileList();

                __getFilesRecursively(fileList, 0, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    cachedSEED = archiveConfigurator.getSeed();
                    archiveConfigurator.generateSeed();
                    targetBarMap.setEncryptionKey(archiveConfigurator.getMapEncryptionKey());
                    targetBarMap.setConfig(archiveConfigurator);
                    targetStorage.putBarMap(targetBarMap, err => callback(err, archiveConfigurator.getSeed()));
                });
            }

            function __getFilesRecursively(fileList, fileIndex, callback) {
                const filePath = fileList[fileIndex];
                __getBricksRecursively(filePath, barMap.getHashList(filePath), 0, (err) => {
                    if (err) {
                        return callback(err);
                    }
                    ++fileIndex;
                    if (fileIndex === fileList.length) {
                        return callback();
                    }

                    __getFilesRecursively(fileList, fileIndex, callback);
                });
            }

            function __getBricksRecursively(filePath, brickList, brickIndex, callback) {
                storageProvider.getBrick(brickList[brickIndex], (err, brick) => {
                    if (err) {
                        return callback(err);
                    }

                    if (barMap.getTransformParameters(brickList[brickIndex])) {
                        brick.setTransformParameters(barMap.getTransformParameters(brickList[brickIndex]));
                    }
                    __addBrickToTarget(brick, callback);
                });

                function __addBrickToTarget(brick, callback) {
                    brick.setConfig(archiveConfigurator);
                    if (!preserveKeys) {
                        brick.createNewTransform();
                    }

                    ++brickIndex;
                    targetBarMap.add(filePath, brick);
                    targetStorage.putBrick(brick, (err) => {
                        if (err) {
                            return callback(err);
                        }

                        if (brickIndex === brickList.length) {
                            return callback();
                        }

                        __getBricksRecursively(filePath, brickList, brickIndex, callback);
                    });
                }
            }
        });
    };

    //------------------------------------------- internal methods -----------------------------------------------------

    function __computeFileHash(fileBarPath) {
        const hashList = barMap.getHashList(fileBarPath);
        const PskHash = crypto.PskHash;
        const pskHash = new PskHash();
        hashList.forEach(hash => {
            pskHash.update(hash);
        });

        return pskHash.digest();
    }

    function putBarMap(callback) {
        if (typeof archiveConfigurator.getMapDigest() !== "undefined") {
            storageProvider.deleteFile(archiveConfigurator.getMapDigest(), (err) => {
                if (err) {
                    return callback(err);
                }

                __putBarMap(callback);
            });
            return;
        }
        __putBarMap(callback);
    }

    function __putBarMap(callback) {
        storageProvider.putBarMap(barMap, (err, newMapDigest) => {
            if (err) {
                return callback(err);
            }

            archiveConfigurator.setMapDigest(newMapDigest);
            callback(undefined, archiveConfigurator.getMapDigest());
        });
    }

    function createBricks(fsFilePath, barPath, blockSize, areEncrypted, callback) {
        if (typeof areEncrypted === "function") {
            callback = areEncrypted;
            areEncrypted = true;
        }
        archiveFsAdapter.getFileSize(fsFilePath, (err, fileSize) => {
            if (err) {
                return callback(err);
            }

            let noBlocks = Math.floor(fileSize / blockSize);
            if (fileSize % blockSize > 0) {
                ++noBlocks;
            }

            barMap.emptyList(barPath);
            __createBricksRecursively(0, callback);

            function __createBricksRecursively(blockIndex, callback) {
                archiveFsAdapter.readBlockFromFile(fsFilePath, blockIndex * blockSize, (blockIndex + 1) * blockSize - 1, (err, blockData) => {
                    if (err) {
                        return callback(err);
                    }

                    archiveConfigurator.setIsEncrypted(areEncrypted);
                    const brick = new Brick(archiveConfigurator);
                    brick.setRawData(blockData);
                    barMap.add(barPath, brick);
                    storageProvider.putBrick(brick, (err) => {
                        if (err) {
                            return callback(err);
                        }

                        ++blockIndex;
                        if (blockIndex < noBlocks) {
                            __createBricksRecursively(blockIndex, callback);
                        } else {
                            callback();
                        }
                    });
                });
            }
        });
    }

    function loadBarMapThenExecute(functionToBeExecuted, callback) {
        storageProvider.getBarMap(archiveConfigurator.getMapDigest(), (err, map) => {
            if (err) {
                return callback(err);
            }

            if (archiveConfigurator.getMapEncryptionKey()) {
                map.setEncryptionKey(archiveConfigurator.getMapEncryptionKey());
            }

            if (!map.getConfig()) {
                map.setConfig(archiveConfigurator);
            }

            map.load();
            barMap = map;
            storageProvider.setBarMap(barMap);
            functionToBeExecuted();
        });
    }
}

module.exports = Archive;
