const Brick = require('./Brick');
const path = require("path");
const isStream = require("../utils/isStream");

function Archive(archiveConfigurator, mapDigest) { //configObj
    //numele si provider-ul pe care il vom utiliza, provider-ul va fi un string
    //in functie de valoarea acestui string vom crea in variabila storagePrv
    //un obiect de tipul StorageFile sau StorageFolder


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
        //fileName - numele fisierului in care vrem sa facem append
        //data - buffer-ul de citire, vom prelua din el datele
        //callback - aceeasi functie care se ocupa de prelucarea datelor,
        //de creerea de brick-uri si scrierea lor
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
            diskAdapter.getNextFile(folderPath, readFileCb);

            function readFileCb(err, file) {
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
            const folderPath = path.dirname(filePath);
            diskAdapter.getNextFile(filePath, (err, file) => {
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
            console.log(fileName);
            let filenamesList = barMap.getFileList();
            filenamesList.forEach(file=> {
                const hashList = barMap.getHashList(file);
                getFileRecursively(hashList, hashList.length, 0, file, callback);
            });
        }

        function getFileRecursively(hashList, length, index, file, callback) {
            // if (index === length) {
            //     return callback();
            // }

            storageProvider.getBrick(hashList[index], (err, data) => {
                if (err) {
                    return callback(err);
                }
                appender(err, data, file, (err) => {
                    if (err) {
                        return callback(err);
                    }
                    if(index < length-1) {
                        getFileRecursively(hashList, length, index + 1, file, callback);
                    }else{
                        return callback();
                    }
                });
            });
        }

        function appender(err, data, fileName, callback) {
            if (err) {
                return callback(err);
            }
            //let base = path.basename(fileName);
            let pth = path.join(location, fileName);
            diskAdapter.appendBlockToFile(pth, data, callback);
        }
    };

    this.extractFolder = function (savePath, callback) {
        //functia asta extrage un fisier din arhiva, si foloseste functia de callback
        //pentru a retine datele intr-o lista sau pentru a face o procesare ulterioara
        loadBarMapThenExecute(helperExtractFolder, callback);

        function helperExtractFolder() {
            let filePaths = barMap.getFileList();
            function readFilesRecursively(fileIndex, readFilesCb) {

                function getBricksRecursively(brickIndex, getBricksCb) {
                    const brickHash = brickList[brickIndex];
                    storageProvider.getBrick(brickHash, (err, brickData) => {
                        if (err) {
                            return getBricksCb(err);
                        }
                        const newPath = path.join(savePath, filePath);
                        diskAdapter.appendBlockToFile(newPath, brickData.getData(), (err) => {
                            if (err) {
                                return getBricksCb(err);
                            }

                            ++brickIndex;
                            if (brickIndex < brickList.length) {
                                getBricksRecursively(brickIndex, getBricksCb);
                            } else {
                                getBricksCb();
                            }
                        });
                    });
                }

                const filePath = filePaths[fileIndex];
                const brickList = barMap.getHashList(filePath);
                if (brickList.length > 0) {
                    getBricksRecursively(0, (err) => {
                        if (err) {
                            return readFilesCb(err);
                        }

                        ++fileIndex;
                        if (fileIndex < filePaths.length) {
                            readFilesRecursively(fileIndex, readFilesCb);
                        } else {
                            readFilesCb();
                        }
                    });
                }
            }

            readFilesRecursively(0, callback);
        }

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
        //aceasta functie va lista denumirile fisierelor din arhiva
        //nu inteleg ce ar trebui sa faca functia de callback
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
                functionToBeExecuted();
            });
        } else {
            functionToBeExecuted();
        }
    }

}

module.exports = Archive;