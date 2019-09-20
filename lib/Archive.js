const Brick = require('./Brick');
const path = require("path");
const isStream = require("../utils/isStream");
const AsyncDispatcher = require("../utils/AsyncDispatcher");

function Archive(archiveConfigurator, mapEncryptionKey) {

    const fsAdapter = archiveConfigurator.getFsAdapter();
    const storageProvider = archiveConfigurator.getStorageProvider();
    let barMap;


    this.appendToFile = (filePath, data, callback) => {

        loadBarMapThenExecute(helperAppendToFile, callback);

        function helperAppendToFile() {
            filePath = normalizeFilePath(filePath);

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
                    storageProvider.putBrick(dataBrick, (err) => {
                        if (err) {
                            return callback(err);
                        }
                        barMap.add(filePath, dataBrick);
                    });
                }).on("end", () => {
                    putBarMap(callback);
                });
                return;
            }
            callback(new Error("Invalid type of parameter data"));
        }
    };

    this.addFolder = (folderPath, callback) => {
        loadBarMapThenExecute(helperAddFolder, callback);

        function helperAddFolder() {
            fsAdapter.getNextFile(folderPath, readFileCb);

            function readFileCb(err, file) {

                if (err) {
                    return callback(err);
                }

                if (typeof file !== "undefined") {
                    readFileAsBlocks(path.join(path.dirname(folderPath), file), archiveConfigurator.getBufferSize(), barMap, (err) => {
                        if (err) {
                            return callback(err);
                        }

                        fsAdapter.getNextFile(folderPath, readFileCb);
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

    this.replaceFile = (fileName, stream, callback) => {
        if (typeof stream !== 'object') {
            return callback(new Error('Wrong stream!'));
        }

        loadBarMapThenExecute(helperReplaceFile, callback);

        function helperReplaceFile() {
            fileName = normalizeFilePath(fileName);
            stream.on('error', () => {
                return callback(new Error("File does not exist!"));
            }).on('open', () => {
                let hashList = barMap.getHashList(fileName);
                deleteForFileName(fileName, hashList, hashList.length, 0, (err) => {
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

    this.addFile = (filePath, callback) => {
        loadBarMapThenExecute(__addFile, callback);

        function __addFile() {
            fsAdapter.getNextFile(filePath, (err, file) => {
                if (err) {
                    return callback(err);
                }

                readFileAsBlocks(file, archiveConfigurator.getBufferSize(), barMap, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    barMap.setConfig(archiveConfigurator);
                    barMap.setEncryptionKey(mapEncryptionKey);
                    storageProvider.putBarMap(barMap, (err) => {
                        if (err) {
                            return callback(err);
                        }

                        barMap = undefined;
                        callback();
                    });
                });
            });
        }
    };

    this.getFile = (savePath, callback) => {
        this.extractFolder(savePath, callback);
    };

    this.extractFile = (filePath, callback) => {

        loadBarMapThenExecute(__extractFile, callback);

        function __extractFile() {
            const brickIds = barMap.getHashList(filePath);
            getFileRecursively(0, callback);

            function getFileRecursively(brickIndex, callback) {
                const brickId = brickIds[brickIndex];
                storageProvider.getBrick(brickId, (err, brick) => {
                    if (err) {
                        return callback(err);
                    }

                    brick.setConfig(archiveConfigurator);
                    brick.setTransformParameters(barMap.getTransformParameters(brickId));
                    fsAdapter.appendBlockToFile(filePath, brick.getRawData(), err => {
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

    this.extractFolder = (savePath, callback) => {
        loadBarMapThenExecute(() => {
            const filePaths = barMap.getFileList();
            const asyncDispatcher = new AsyncDispatcher(() => {
                callback();
            });
            asyncDispatcher.dispatchEmpty(filePaths.length);
            filePaths.forEach(filePath => {
                this.extractFile(filePath, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    asyncDispatcher.markOneAsFinished();
                });
            });
        }, callback);
    };

    this.store = (callback) => {
        storageProvider.putBarMap(barMap, callback);
    };

    this.list = (callback) => {
        if (typeof barMap === "undefined") {
            storageProvider.getBarMap(archiveConfigurator.getMapDigest(), (err, map) => {
                if (err) {
                    return callback(err);
                }

                barMap = map;
                callback(undefined, barMap.getFileList());
            });
        } else {
            callback(undefined, barMap.getFileList());
        }
    };

    //------------------------------------------- internal methods -----------------------------------------------------
    function deleteForFileName(filename, hashList, length, index, callback) {
        if (index === length) {
            return callback();
        }
        storageProvider.deleteBrick(hashList[index], (err) => {
            if (err) {
                return callback(err);
            }

            deleteForFileName(filename, hashList, length, (index + 1), callback);
        });
    }

    function putBarMap(callback) {
        if (typeof archiveConfigurator.getMapDigest() !== "undefined") {
            storageProvider.deleteBrick(archiveConfigurator.getMapDigest(), (err) => {
                if (err) {
                    return callback(err);
                }

                helperPutBarMap(callback);
            });
            return;
        }
        helperPutBarMap(callback);
    }

    function helperPutBarMap(callback) {
        storageProvider.putBarMap(barMap, (err, newMapDigest) => {
            if (err) {
                return callback(err);
            }

            archiveConfigurator.setMapDigest(newMapDigest);
            callback(undefined, archiveConfigurator.getMapDigest());
        });
    }

    function readFileAsBlocks(filePath, blockSize, barMap, callback) {
        fsAdapter.getFileSize(filePath, (err, fileSize) => {
            if (err) {
                return callback(err);
            }


            let noBlocks = Math.floor(fileSize / blockSize);
            if (fileSize % blockSize > 0) {
                ++noBlocks;
            }

            __readBlocksRecursively(0, callback);

            function __readBlocksRecursively(blockIndex, callback) {
                fsAdapter.readBlockFromFile(filePath, blockIndex, blockSize, (err, blockData) => {
                    if (err) {
                        return callback(err);
                    }

                    const brick = new Brick(archiveConfigurator);

                    brick.setRawData(blockData);
                    barMap.add(filePath, brick);
                    storageProvider.putBrick(brick, (err) => {
                        if (err) {
                            return callback(err);
                        }

                        ++blockIndex;
                        if (blockIndex < noBlocks) {
                            __readBlocksRecursively(blockIndex, callback);
                        } else {
                            callback();
                        }
                    });
                });
            }
        });
    }

    function normalizeFilePath(filePath) {
        if (filePath[0] !== '/') {
            filePath = path.sep + filePath;
        }

        filePath = filePath.replace('/', path.sep);
        return filePath;
    }

    function loadBarMapThenExecute(functionToBeExecuted, callback) {
        if (!barMap) {
            storageProvider.getBarMap(archiveConfigurator.getMapDigest(), (err, map) => {
                if (err) {
                    return callback(err);
                }
                map.setEncryptionKey(mapEncryptionKey);
                map.setConfig(archiveConfigurator);
                map.load();
                barMap = map;
                functionToBeExecuted();
            });
        } else {
            functionToBeExecuted();
        }
    }
}

module.exports = Archive;
