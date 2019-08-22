const Brick = require('./Brick');
const path = require("path");
const isStream = require("../utils/isStream");
const util = require('../utils/utilConstants');
const utilConsts = new util();
const BUCKET_SIZE = 50;

function Archive(archiveConfigurator, mapDigest) {

    const diskAdapter = archiveConfigurator.getDiskAdapter();
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
        };

        helperPutBarMap(callback);
    };

    function helperPutBarMap(callback) {
        storageProvider.putBarMap(barMap, (err, newMapDigest) => {
            if (err) {
                return callback(err);
            }

            mapDigest = newMapDigest;
            callback(undefined, mapDigest);
        });
    };

    this.appendToFile = function (filePath, data, callback) {

        loadBarMapThenExecute(helperAppendToFile, callback);

        function helperAppendToFile() {
            filePath = validateFileName(filePath);

            if (typeof data === "string") {
                data = Buffer.from(data);
            };

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
            };

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
        };
    };

    this.addFolder = function (folderPath, callback) {
        loadBarMapThenExecute(helperAddFolder, callback);

        function helperAddFolder() {
            diskAdapter.getNextFile(folderPath, readFileCb);

            function readFileCb(err, file) {
                if(barMap.isVerbose() === true){
                    console.log(file);
                }

                if (err) {
                    return callback(err);
                }

                if (typeof file !== "undefined") {
                    const splitFolderPath = folderPath.split(path.sep);
                    splitFolderPath.pop();
                    readFileAsBlocks(splitFolderPath.join(path.sep), file, archiveConfigurator.getBufferSize(), barMap, (err) => {
                        if (err) {
                            return callback(err);
                        }

                        diskAdapter.getNextFile(folderPath, readFileCb);
                    });
                } else {
                    storageProvider.putBarMap(barMap, callback);
                };
            };
        };
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
    };

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
        };
    };

    this.addFile = function (filePath, callback) {
        loadBarMapThenExecute(helperAddFile, callback);

        function helperAddFile() {
            let folderPath;
            folderPath = path.dirname(filePath);
            diskAdapter.getNextFile(filePath, (err, file) => {
                if(barMap.isVerbose() === true){
                    console.log(file);
                }

                if (err) {
                    return callback(err);
                }

                readFileAsBlocks(folderPath, file, archiveConfigurator.getBufferSize(), barMap, (err) => {
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

    this.extractFile = function (fileName, location, callback) {
        loadBarMapThenExecute(helperExtractFile, callback);

        function helperExtractFile() {
            fileName = validateFileName(fileName);
            let filenamesList = barMap.getFileList();
            filenamesList.forEach(file => {
                const hashList = barMap.getHashList(file);
                getFileRecursively(hashList, hashList.length, 0, file, callback);
            });
        }

        function getFileRecursively(hashList, length, index, file, callback) {
            storageProvider.getBrick(hashList[index], (err, data) => {
                if (err) {
                    return callback(err);
                }
                appender(err, data, file, (err) => {
                    if (err) {
                        return callback(err);
                    }
                    if (index < length - 1) {
                        getFileRecursively(hashList, length, index + 1, file, callback);
                    } else {
                        return callback();
                    }
                });
            });
        }

        function appender(err, data, fileName, callback) {
            if (err) {
                return callback(err);
            }
            let pth = path.join(location, fileName);
            diskAdapter.appendBlockToFile(pth, data, callback);
        }
    };

    this.extractFolder = function (savePath, callback) {
        loadBarMapThenExecute(helperExtractFolder, callback);

        function helperExtractFolder() {
            let filePaths = barMap.getFileList();

            function readFilesRecursively(fileIndex, readFilesCb) {
                const filePath = filePaths[fileIndex];
                console.log(filePath);
                const brickList = barMap.getHashList(filePath);

                function getBricks(indexStart, indexEnd, getBricksCb) {

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
                            diskAdapter.appendBlockToFile(newPath, brickData.getData(), (err) => {
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
                                getBricks(indexEnd + 1, indexEnd + BUCKET_SIZE, getBricksCb);
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
                        getBricks(0, BUCKET_SIZE, (err) => {
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
                diskAdapter.ensureFileDoesNotExists(filePath, putBricksInFile);
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

    function readFileAsBlocks(folderPath, fileName, blockSize, barMap, callback) {
        const absolutePath = path.join(folderPath, fileName);
        diskAdapter.getFileSize(absolutePath, (err, fileSize) => {
            if (err) {
                return callback(err);
            }


            let noBlocks = Math.floor(fileSize / blockSize);
            if (fileSize % blockSize > 0) {
                ++noBlocks;
            }

            let blockIndex = 0;
            let contor = 0;

            function readCb(err, buffer) {


                if (err) {
                    return callback(err);
                }

                const brick = new Brick(buffer);
                barMap.add(fileName, brick);
                contor++;
                storageProvider.putBrick(brick, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    ++blockIndex;
                    if (blockIndex < noBlocks) {
                        diskAdapter.readBlockFromFile(absolutePath, blockIndex, blockSize, readCb);
                    } else {
                        callback();
                    }

                });
            }

            diskAdapter.readBlockFromFile(absolutePath, blockIndex, blockSize, readCb);
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
                barMap.setIsVerbose(archiveConfigurator.getVerbose());
                barMap.setIsZip(archiveConfigurator.getZipFlag());
                functionToBeExecuted();
            });
        } else {
            functionToBeExecuted();
        }
    }

}

module.exports = Archive;
