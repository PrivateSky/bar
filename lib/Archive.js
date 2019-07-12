const Brick = require('./Brick');
const AsyncDispatcher = require("../utils/AsyncDispatcher");
const path = require("path");
const BarMap = require("./FolderBarMap");

function Archive(archiveConfigurator) { //configObj
    //numele si provider-ul pe care il vom utiliza, provider-ul va fi un string
    //in functie de valoarea acestui string vom crea in variabila storagePrv
    //un obiect de tipul StorageFile sau StorageFolder

    let barMap = new BarMap();
    const diskAdapter = archiveConfigurator.getDiskAdapter();
    const storageProvider = archiveConfigurator.getStorageProvider();

    this.appendToFile = function (filePath, stream, callback) {
        //fileName - numele fisierului in care vrem sa facem append
        //buffer - buffer-ul de citire, vom prelua din el datele
        //callback - aceeasi functie care se ocupa de prelucarea datelor,
        //de creerea de brick-uri si scrierea lor
        stream.on('error', () => {
            return callback(new Error('File does not exist'));
        }).on('data', (chunk) => {
            const tempBrick = new Brick(chunk);
            barMap.add(filePath, tempBrick);
            storageProvider.putBrick(tempBrick, (err) => {
                return callback(err);
            });
        });
    };

    function readFilesRecursively(folderPath, callback) {
        diskAdapter.getNextFile(folderPath, (err, file) => {

        });
    }

    this.addFolder = function (folderPath, callback) {
        diskAdapter.getNextFile(folderPath, __readFileCb);

        function __readFileCb(err, file) {
            if (err) {
                return callback(err);
            }

            if (typeof file !== "undefined") {
                readFileAsBlocks(folderPath, file, archiveConfigurator.getBufferSize(), (err) => {
                    if (err) {
                        return callback(err);
                    }

                    diskAdapter.getNextFile(folderPath, __readFileCb);
                });
            }else {
                return callback();
            }
        }
    };

    function deleteForFileName(filename, hashList, length, index, callback) {
        if (index === length) {
            return callback();
        }
        storageProvider.deleteBrick(hashList[index], (err) => {
            if (err)
                return callback(err);
            deleteForFileName(filename, hashList, length, (index + 1), callback);
        });
    }

    this.replaceFile = function (fileName, stream, callback) {
        stream.on('error', () => {
            return callback(new Error("File does not exist!"));
        }).on('open', () => {
            let hashList = barMap.getHashList(fileName);
            deleteForFileName(fileName, hashList, hashList.length, 0, (err) => {
                if (err)
                    return callback(err);
                barMap.emptyList(fileName);
            });
        }).on('data', (chunk) => {
            let tempBrick = new Brick(chunk);
            barMap.add(fileName, tempBrick);
            storageProvider.putBrick(tempBrick, (err) => {
                if (err)
                    return callback(err);
            });
        });
    };

    this.getFile = function (fileName, location, callback) {
        const hashList = barMap.getHashList(fileName);
        __getFileRecursively(hashList, hashList.length, 0, callback);

        function __getFileRecursively(hashList, length, index, callback) {
            if (index === length) {
                return callback();
            }

            storageProvider.getBrick(hashList[index], (err, data) => {
                if (err) {
                    return callback(err);
                }
                __appender(err, data, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    __getFileRecursively(hashList, length, index + 1, callback);
                });
            });
        }

        function __appender(err, data, callback) {
            if (err) {
                return callback(err);
            }
            let base = path.basename(fileName);
            let pth = path.join(location, base.toString());
            diskAdapter.appendBlockToFile(pth, data, callback);
        }
    };

    this.getFolder = function (savePath, barMapHash, callback) {
        //functia asta extrage un fisier din arhiva, si foloseste functia de callback
        //pentru a retine datele intr-o lista sau pentru a face o procesare ulterioara
        storageProvider.getBrick(barMapHash, (err, barMapData) => {
            if (err) {
                return callback(err);
            }

            barMap = new BarMap(JSON.parse(barMapData.toString()));
            let filePaths = barMap.getFileList();
            function __readFilesRecursively(fileIndex, readFilesCb) {

                function __getBricksRecursively(brickIndex, getBricksCb) {
                    const brickHash = brickList[brickIndex];
                    storageProvider.getBrick(brickHash, (err, brickData) => {
                        if (err) {
                            return getBricksCb(err);
                        }

                        const newPath = path.join(savePath, filePath);
                        diskAdapter.appendBlockToFile(newPath, brickData, (err) => {
                            if (err) {
                                return getBricksCb(err);
                            }

                            ++brickIndex;
                            if (brickIndex < brickList.length) {
                                __getBricksRecursively(brickIndex, getBricksCb);
                            } else {
                                getBricksCb();
                            }
                        });
                    });
                }

                const filePath = filePaths[fileIndex];
                const brickList = barMap.getHashList(filePath);
                if (brickList.length > 0) {
                    __getBricksRecursively(0, (err) => {
                        if (err) {
                            return readFilesCb(err);
                        }

                        ++fileIndex;
                        if (fileIndex < filePaths.length) {
                            __readFilesRecursively(fileIndex, readFilesCb);
                        } else {
                            readFilesCb();
                        }
                    });
                }
            }

            __readFilesRecursively(0, callback);
        });

    };


    this.getReadStream = function (filePath) {
        //ne va oferi un buffer care sa citeasca dintr-un fisier din arhiva noastra?
        //return diskAdapter.getReadStream(filePath,bufferSize);

    };

    this.getWriteStream = function (filePath) {
        //ne va oferi un buffer care sa scrie intr-un fisier din arhiva noastra
        //return diskAdapter.getWriteStream(filePath);

    };

    this.store = function (callback) {
        const mapBrick = barMap.toBrick();
        storageProvider.putBrick(mapBrick, (err) => {
            if (err) {
                return callback(err);
            }

            callback(undefined, mapBrick.getHash());
        });
    };

    this.list = function (callback) {
        callback(undefined, barMap.getFileList());
        //aceasta functie va lista denumirile fisierelor din arhiva
        //nu inteleg ce ar trebui sa faca functia de callback
    };

    function readFileAsBlocks(folderPath, fileName, blockSize, callback) {
        const absolutePath = path.join(folderPath, fileName);
        diskAdapter.getFileSize(absolutePath, (err, fileSize) => {
            if (err) {
                return callback(err);
            }


            let noBlocks = Math.floor(fileSize / blockSize);
            if (fileSize % blockSize > 0) {
                ++noBlocks;
            }

            let iter = 0;

            function __readCb(err, buffer) {
                if (err) {
                    return callback(err);
                }

                const brick = new Brick(buffer);
                barMap.add(fileName, brick);
                storageProvider.putBrick(brick, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    ++iter;

                    if (iter < noBlocks) {
                        diskAdapter.readBlockFromFile(absolutePath, iter, blockSize, __readCb);
                    } else {
                        callback();
                    }

                });
            }

            diskAdapter.readBlockFromFile(absolutePath, iter, blockSize, __readCb);
        });
    }


}

module.exports = Archive;