const Brick = require('./Brick');
const path = require("path");
const isStream = require("../utils/isStream");
const AsyncDispatcher = require("../utils/AsyncDispatcher");

function Archive(archiveConfigurator) {

    const archiveFsAdapter = archiveConfigurator.getFsAdapter();
    const storageProvider = archiveConfigurator.getStorageProvider();
    let barMap;


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

    this.addFolder = (folderPath, callback) => {
        loadBarMapThenExecute(__addFolder, callback);

        function __addFolder() {

            archiveFsAdapter.getNextFile(folderPath, readFileCb);

            function readFileCb(err, file) {
                if (err) {
                    return callback(err);
                }

                if (typeof file !== "undefined") {
                    readFileAsBlocks(path.join(path.dirname(folderPath), file), archiveConfigurator.getBufferSize(), (err) => {
                        if (err) {
                            return callback(err);
                        }

                        archiveFsAdapter.getNextFile(folderPath, readFileCb);
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

    this.addFile = (filePath, callback) => {
        loadBarMapThenExecute(__addFile, callback);

        function __addFile() {
            archiveFsAdapter.getNextFile(filePath, (err, file) => {
                if (err) {
                    return callback(err);
                }

                readFileAsBlocks(file, archiveConfigurator.getBufferSize(), (err) => {
                    if (err) {
                        return callback(err);
                    }

                    barMap.setConfig(archiveConfigurator);
                    if(archiveConfigurator.getMapEncryptionKey()) {
                        barMap.setEncryptionKey(archiveConfigurator.getMapEncryptionKey());
                    }

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

    this.deleteFile = (filePath, callback) => {
        loadBarMapThenExecute(() => {
            barMap.removeFile(filePath);
            storageProvider.putBarMap(barMap, callback);
        }, callback);
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
                    archiveFsAdapter.appendBlockToFile(filePath, brick.getRawData(), err => {
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
        loadBarMapThenExecute(() => {
            callback(undefined, barMap.getFileList());
        }, callback);
    };

    //------------------------------------------- internal methods -----------------------------------------------------

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

    function readFileAsBlocks(filePath, blockSize, callback) {
        archiveFsAdapter.getFileSize(filePath, (err, fileSize) => {
            if (err) {
                return callback(err);
            }


            let noBlocks = Math.floor(fileSize / blockSize);
            if (fileSize % blockSize > 0) {
                ++noBlocks;
            }

            __readBlocksRecursively(0, callback);

            function __readBlocksRecursively(blockIndex, callback) {
                archiveFsAdapter.readBlockFromFile(filePath, blockIndex, blockSize, (err, blockData) => {
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

    function loadBarMapThenExecute(functionToBeExecuted, callback) {
        storageProvider.getBarMap(archiveConfigurator.getMapDigest(), (err, map) => {
            if (err) {
                return callback(err);
            }
            map.setEncryptionKey(archiveConfigurator.getMapEncryptionKey());
            map.setConfig(archiveConfigurator);
            map.load();
            barMap = map;
            functionToBeExecuted();
        });
    }
}

module.exports = Archive;
