const Brick = require('./Brick');
const path = require("path");
const isStream = require("../utils/isStream");
const utils = require('../utils/utilities');
const ensureFileDoesNotExists = utils.ensureFileDoesNotExist;
const BRICKS_NUMBER = 50;
const AsyncDispatcher = require("../utils/AsyncDispatcher");

function Archive(archiveConfigurator, mapDigest) {

    const fsAdapter = archiveConfigurator.getFsAdapter();
    const storageProvider = archiveConfigurator.getStorageProvider();
    let barMap;

    function putBarMap(callback) {
        if (typeof mapDigest !== "undefined") {
            storageProvider.deleteBrick(mapDigest, (err) => {
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

            mapDigest = newMapDigest;
            callback(undefined, mapDigest);
        });
    }

    this.appendToFile = function (filePath, data, callback) {

        loadBarMapThenExecute(helperAppendToFile, callback);

        function helperAppendToFile() {
            filePath = validateFileName(filePath);

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

    this.addFolder = function (folderPath, callback) {
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
                    storageProvider.putBarMap(barMap, callback);
                }
            }
        }
    };

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

    this.replaceFile = function (fileName, stream, callback) {
        if (typeof stream !== 'object') {
            return callback(new Error('Wrong stream!'));
        }

        loadBarMapThenExecute(helperReplaceFile, callback);

        function helperReplaceFile() {
            fileName = validateFileName(fileName);
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

    this.addFile = function (filePath, callback) {
        loadBarMapThenExecute(helperAddFile, callback);

        function helperAddFile() {
            fsAdapter.getNextFile(filePath, (err, file) => {
                if (err) {
                    return callback(err);
                }

                readFileAsBlocks(file, archiveConfigurator.getBufferSize(), barMap, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    storageProvider.putBarMap(barMap, callback);
                });
            });
        }
    };

    this.getFile = function (savePath, callback) {
        this.extractFolder(savePath, callback);
    };

    this.extractFile = function (filePath, callback) {
        const brickHashes = barMap.getHashList(filePath);
        const brickOffsets = barMap.getBricksOffsets();
        loadBarMapThenExecute(helperExtractFile, callback);

        function helperExtractFile() {
            getFileRecursively(0, callback);
        }

        function getFileRecursively(brickIndex, callback) {
            storageProvider.getBrick(brickHashes[brickIndex], (err, brick) => {
                if (err) {
                    return callback(err);
                }

                fsAdapter.writeBlockToFile(filePath, brick.getData(), brickOffsets[brick.getHash()], brick.getSize(), (err) => {
                    if (err) {
                        return callback(err);
                    }

                    ++brickIndex;
                    if (brickIndex < brickHashes.length) {
                        getFileRecursively(brickIndex, callback);
                    } else {
                        callback();
                    }
                });
            });
        }
    };

    this.extractFolder = function (savePath, callback) {
        loadBarMapThenExecute(extractFolder, callback);

        function extractFolder() {
            let filePaths = barMap.getFileList();

            function readFilesRecursively(fileIndex, readFilesCb) {
                const filePath = filePaths[fileIndex];
                const brickList = barMap.getHashList(filePath);

                function getCurrentWindowBricks(indexStart, indexEnd, getBricksCb) {

                    if (indexStart >= brickList.length) {
                        return getBricksCb();
                    }

                    if (indexEnd >= brickList.length) {
                        indexEnd = brickList.length - 1;
                    }

                    let numberOfAvailableBricks = 0;
                    const newPath = path.join(savePath, filePath);

                    function appendBlock(queue) {
                        if (queue.length > 0) {

                            let brickData = queue.shift();
                            fsAdapter.appendBlockToFile(newPath, brickData.getData(), (err) => {
                                if (err) {
                                    return getBricksCb(err);
                                }
                                appendBlock(queue);

                            });
                        }
                    }

                    let queue = [];
                    while (indexStart <= indexEnd) {
                        numberOfAvailableBricks++;
                        const brickHash = brickList[indexStart];

                        storageProvider.getBrick(brickHash, (err, brickData) => {
                            if (err) {
                                return getBricksCb(err);
                            }

                            queue.push(brickData);
                            numberOfAvailableBricks--;
                            if (numberOfAvailableBricks === 0) {
                                appendBlock(queue);
                                getCurrentWindowBricks(indexEnd + 1, indexEnd + BRICKS_NUMBER, getBricksCb);
                            }
                        });

                        indexStart += 1;
                    }
                }

                function putBricksInFile(err) {

                    if (err) {
                        return readFilesCb(err);
                    }

                    if (brickList.length > 0) {
                        getCurrentWindowBricks(0, BRICKS_NUMBER, (err) => {
                            if (err) {
                                return readFilesCb(err);
                            }

                            fileIndex += 1;

                            if (fileIndex < filePaths.length) {
                                readFilesRecursively(fileIndex, readFilesCb);
                            } else {
                                readFilesCb();
                            }
                        });
                    }
                }

                ensureFileDoesNotExists(filePath, putBricksInFile);
            }

            readFilesRecursively(0, callback);
        }

    };

    this.store = function (callback) {
        storageProvider.putBarMap(barMap, callback);
    };

    this.list = function (callback) {
        if (typeof barMap === "undefined") {
            storageProvider.getBarMap(mapDigest, (err, map) => {
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

    function readFileAsBlocks(filePath, blockSize, barMap, callback) {
        fsAdapter.getFileSize(filePath, (err, fileSize) => {
            if (err) {
                return callback(err);
            }


            let noBlocks = Math.floor(fileSize / blockSize);
            if (fileSize % blockSize > 0) {
                ++noBlocks;
            }

            const asyncDispatcher = new AsyncDispatcher((errors, results) => {
                callback();
            });

            asyncDispatcher.dispatchEmpty(noBlocks);
            for (let i = 0; i < noBlocks; ++i) {
                fsAdapter.readBlockFromFile(filePath, i, blockSize, readCb);
            }

            function readCb(err, blockData) {
                if (err) {
                    return callback(err);
                }

                const brick = new Brick(blockData);
                barMap.add(filePath, brick);
                storageProvider.putBrick(brick, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    asyncDispatcher.markOneAsFinished();
                });
            }
        });
    }

    function validateFileName(fileName) {
        if (fileName[0] !== '/') {
            fileName = path.sep + fileName;
        }
        for (let it = 0; it < fileName.length; it++) {
            if (fileName[it] === '/')
                fileName = fileName.replace('/', path.sep);
        }
        return fileName;
    }

    function loadBarMapThenExecute(functionToBeExecuted, callback) {
        if (typeof barMap === "undefined") {
            storageProvider.getBarMap(mapDigest, (err, map) => {
                if (err) {
                    return callback(err);
                }
                barMap = map;
                functionToBeExecuted();
            });
        } else {
            functionToBeExecuted();
        }
    }
}

module.exports = Archive;
