const Brick = require('./Brick');
const AsyncDispatcher = require("../utils/AsyncDispatcher");
const bufferSize = 256;
const path = require("path");

function BarMap(header){
    header = header || {};
    //header este un map in care vom retine datele intr-un format json
    //vom avea key-ul care va fi filename-ul, si datele care va fi lista de hash-uri
    this.add = function (filePath, hashList) {
        //hashList-ul va fi direct lista de hash-uri, pentru ca o putem face pe masura
        //ce ne ocupam de salvarea brick-urilor
        if (typeof header.files === "undefined") {
            header.files = {};
        }

        if (typeof header.files[filePath] === "undefined") {
            header.files[filePath] = [];
        }

        header.files[filePath].push(hashList);
    };

    this.setRootFolder = function (rootFolder) {
        header.rootFolder = rootFolder;
    };

    this.getHash = function (filePath) {
        //avem nevoie de hash-uri ca sa putem obtine brick-urile unui fisier
        //un hash este de fapt denumirea unui brick
        //aceasta functie returneaza lista de hash-uri
        return header.files[filePath];
    };

    this.getRootFolder = function () {
        return header.rootFolder;
    };

    this.emptyList = function (filePath) {
        header.files[filePath] = [];
    };

    this.toBrick = function () {
        return new Brick(Buffer.from(JSON.stringify(header)));
    };

    this.getHeader = function () {
        return header;
    };

}

function Archive(name, storageProvider, userProvider){
    //numele si provider-ul pe care il vom utiliza, provider-ul va fi un string
    //in functie de valoarea acestui string vom crea in variabila storagePrv
    //un obiect de tipul StorageFile sau StorageFolder

    let barMap = new BarMap();

    this.appendToFile = function (filePath, stream, callback) {
        //fileName - numele fisierului in care vrem sa facem append
        //buffer - buffer-ul de citire, vom prelua din el datele
        //callback - aceeasi functie care se ocupa de prelucarea datelor,
        //de creerea de brick-uri si scrierea lor
        stream.on('error', () => {
            return callback(new Error('File does not exist'));
        }).on('data', (chunk) => {
            const tempBrick = new Brick(chunk);
            barMap.add(filePath, tempBrick.getHash());
            storageProvider.putBrick(tempBrick, (err) => {
                return callback(err);
            });
        });
    };

    this.addFolder = function (folderPath, callback) {
        userProvider.getFilesAndFolders(folderPath, (err, rootFolder, listFolders, listFiles) => {
            if (err) {
                return callback(err);
            }

            barMap.setRootFolder(rootFolder);
            extractData(listFolders, listFiles, callback);
        });
    };
    function deleteForFileName(filename,hashList,length,index,callback){
        if(index===length)
            return callback();
        storageProvider.deleteBrick(hashList[index],(err)=>{
            if(err)
                return callback(err);
            deleteForFileName(filename,hashList,length,(index+1),callback);
        });
    }

    this.replaceFile = function (fileName, stream, callback) {
        stream.on('error', () => {
            return callback(new Error("File does not exist!"));
        }).on('open', () => {
            let hashList = barMap.getHeader()[fileName];
            deleteForFileName(fileName, hashList, hashList.length, 0, (err) => {
                if (err)
                    return callback(err);
                barMap.emptyList(fileName);
            });
        }).on('data', (chunk) => {
            let tempBrick = new Brick(chunk);
            barMap.add(fileName, tempBrick.getHash());
            storageProvider.putBrick(tempBrick, (err) => {
                if (err)
                    return callback(err);
            });
        });
    };

    this.getFile = function (fileName, location, callback) {
        const hashList = barMap.getHeader().files[fileName];
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
            userProvider.appendBlockToFile(pth, data, callback);
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
            const barMapHeader = barMap.getHeader();
            let filePaths = Object.keys(barMapHeader.files);
            filePaths.sort((a, b) => {
                let arr1 = a.split(path.sep);
                let arr2 = b.split(path.sep);

                return arr1.length - arr2.length;
            });

            let removablePath = barMap.getRootFolder().split(path.sep);
            removablePath.pop();
            removablePath = removablePath.join(path.sep);
            const removablePathLen = removablePath.length;

            function __readFilesRecursively(fileIndex, cb) {

                function __getBricksRecursively(brickIndex, getBricksCb) {
                    const brickHash = brickList[brickIndex];
                    storageProvider.getBrick(brickHash, (err, brickData) => {
                        if (err) {
                            return getBricksCb(err);
                        }

                        const newPath = path.join(savePath, filePath.substring(removablePathLen));
                        userProvider.appendBlockToFile(newPath, brickData, (err) => {
                            if (err) {
                                return getBricksCb(err);
                            }

                            ++brickIndex;
                            if (brickIndex < brickList.length) {
                                __getBricksRecursively(brickIndex, getBricksCb);
                            }else{
                                getBricksCb();
                            }
                        });
                    });
                }

                const filePath = filePaths[fileIndex];
                const brickList = barMapHeader.files[filePath];
                if (brickList.length > 0) {
                    __getBricksRecursively( 0, (err) => {
                        if (err) {
                            return cb(err);
                        }

                        ++fileIndex;
                        if (fileIndex < filePaths.length) {
                            __readFilesRecursively(fileIndex, cb);
                        }else{
                            cb();
                        }
                    });
                }
            }

            __readFilesRecursively(0, (err)=>{
                callback(err);
            });
        });

    };




    this.getReadStream = function(filePath){
        //ne va oferi un buffer care sa citeasca dintr-un fisier din arhiva noastra?
        return userProvider.getReadStream(filePath,bufferSize);
    }
    this.getWriteStream = function(filePath){
        //ne va oferi un buffer care sa scrie intr-un fisier din arhiva noastra
        return userProvider.getWriteStream(filePath);
    }
    this.store = function (callback) {
        const mapBrick = barMap.toBrick();
        storageProvider.putBrick(mapBrick, (err) => {
            if (err) {
                return callback(err);
            }

            callback(undefined, mapBrick.getHash());
        });
    };

    this.list = function(callback){
        callback(undefined,Object.keys(barMap.getHeader().files));
        //aceasta functie va lista denumirile fisierelor din arhiva
        //nu inteleg ce ar trebui sa faca functia de callback
    }

    function walkFiles(listFiles, callback){
        if(listFiles.length === 0) {
            return callback();
        }

        const asyncDispatcher = new AsyncDispatcher((errors, results) => {
            callback();
        });


        asyncDispatcher.dispatchEmpty(listFiles.length);
        listFiles.forEach(filePath => {
            readFileAsBlocks(filePath, bufferSize, (err) => {
                if(err) {
                    return callback(err);
                }

                asyncDispatcher.markOneAsFinished();
            });
        });
    }

    function readFileAsBlocks(filePath, blockSize, callback){
        userProvider.getFileSize(filePath, (err, fileSize) => {
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
                barMap.add(filePath, brick.getHash());
                storageProvider.putBrick(brick, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    ++iter;

                    if (iter < noBlocks) {
                        userProvider.readBlockFromFile(filePath, iter, blockSize, __readCb);
                    }else{
                        callback();
                    }

                });
            }

            userProvider.readBlockFromFile(filePath, iter, blockSize, __readCb);
        });
    }

    function walkFolders(listFolders, callback){
        if (listFolders.length > 0) {
            __walkFoldersRecursively(0);
        }else{
            callback();
        }
        function __walkFoldersRecursively(index){
            userProvider.getFilesAndFolders(listFolders[index], (err, rootFolder, listFolders, listFiles) => {
                if (err) {
                    return callback(err);
                }
                ++index;
                if (index < listFolders.length) {
                    __walkFoldersRecursively(index);
                }else{
                    extractData(listFolders, listFiles, callback);
                }
            });
        }
    }

    function extractData(listFolders, listFiles, callback) {
        //process lists
        walkFiles(listFiles, (err) => {
            if (err) {
                return callback(err);
            }

            walkFolders(listFolders, callback);
        });
    }
}

module.exports = Archive;