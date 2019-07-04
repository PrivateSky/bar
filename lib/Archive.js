const Brick = require('./Brick');
const AsyncDispatcher = require("../utils/AsyncDispatcher");
const bufferSize = 256;

function BarMap(header){
    header = header || {};
    //header este un map in care vom retine datele intr-un format json
    //vom avea key-ul care va fi filename-ul, si datele care va fi lista de hash-uri
    this.add = function (filePath, hashList) {
        //hashList-ul va fi direct lista de hash-uri, pentru ca o putem face pe masura
        //ce ne ocupam de salvarea brick-urilor
        if (typeof header[filePath] === "undefined") {
            header[filePath] = [];
        }

        header[filePath].push(hashList);
    };

    this.getHash = function (filePath) {
        //avem nevoie de hash-uri ca sa putem obtine brick-urile unui fisier
        //un hash este de fapt denumirea unui brick
        //aceasta functie returneaza lista de hash-uri
        return header[filePath];
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

    function walkFiles(listFiles, callback){
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
            userProvider.getFilesAndFolders(listFolders[index], (err, listFolders, listFiles) => {
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

    this.appendToFile = function(fileName,buffer,callback){
        //fileName - numele fisierului in care vrem sa facem append
        //buffer - buffer-ul de citire, vom prelua din el datele
        //callback - aceeasi functie care se ocupa de prelucarea datelor,
        //de creerea de brick-uri si scrierea lor
    }

    this.addFolder = function (folderPath, callback) {
        //adaugam in arhiva un nou folder
        //functia de callback va fi o functie din abstractizarea BarWorker
        //functia de callback va fi cea care va face salvarea fisierelor .brk(un tip pentru fisierele brick)
        userProvider.getFilesAndFolders(folderPath, (err, listFolders, listFiles) => {
            if (err) {
                return callback(err);
            }

            extractData(listFolders, listFiles, callback);
        });
    };
    this.replaceFile = function(fileName,buffer,callback){
        //inlocuim in intregime un fisier
        //inlocuim brick-urile lui cu alte brick-uri
        //rezultate din datele citite dintr-un fisier, prin buffer
        //callback este o functie care se ocupa de scrierea datelor, functie tot din BarWorker?
    }
    this.getFile = function (fileName, callback) {
        //functia asta extrage un fisier din arhiva, si foloseste functia de callback
        //pentru a retine datele intr-o lista sau pentru a face o procesare ulterioara
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
            const filePaths = Object.keys(barMapHeader);
            filePaths.sort((a, b) => {
                let arr1 = a.split("/");
                let arr2 = b.split("/");

                return arr1.length - arr2.length;
            });

            const asyncDispatcher = new AsyncDispatcher(() => {
                callback();
            });

            asyncDispatcher.dispatchEmpty(filePaths.length);

            filePaths.forEach(filePath => {
                const brickList = barMapHeader[filePath];

                function __getBricksRecursively(brickIndex, cb) {
                    storageProvider.getBrick(brickList[brickIndex], (err, brickData) => {
                        if (err) {
                            return cb(err);
                        }

                        const newPath = path.join(savePath, filePath);
                        userProvider.appendBlockToFile(newPath, brickData, (err) => {
                            if (err) {
                                return cb(err);
                            }

                            ++brickIndex;
                            if (brickIndex < brickList.length) {
                                __getBricksRecursively(brickIndex, cb);
                            }else{
                                cb();
                            }
                        });
                    });
                }

                if (brickList.length > 0) {
                    __getBricksRecursively(0, (err) => {
                        if (err) {
                            return callback(err);
                        }

                        asyncDispatcher.markOneAsFinished();
                    });
                }
            });
        });
    };




    this.getReadStream = function(fileName){
        //ne va oferi un buffer care sa citeasca dintr-un fisier din arhiva noastra?
    }
    this.getWriteStream = function(fileName){
        //ne va oferi un buffer care sa scrie intr-un fisier din arhiva noastra
    }
    this.store = function(callback){
        const mapBrick = barMap.toBrick();
        storageProvider.putBrick(mapBrick, (err) => {
            if (err) {
                return callback(err);
            }

            callback(undefined, mapBrick.getHash());
        });
        //nu imi dau seama ce ar trebui sa faca functia asta
        //ar trebui sa salveze brick-urile in fisiere?
        //si pana nu apelam store, brick-urile sa le tinem in clasa, in ceva ca o lista?
        //dupa ce apelam store, vom salva intr-un brick si header-ul
        //aici difera putin logica, poate sa implementez functia asta la nivelul storage-ului?
        //daca provider-ul este StorageFolder, vom crea un brick pentru header
        //daca provider-ul este StorageFile, vom atasa header-ul fisierului .bar unde tinem toate datele
        //putem face aici logica care decide ce se intampla in functie de provider,
        //iar in acel BarWorker sa ne ocupam de scrierea datelor in functie de provider
        //adica sa avem doua functii, si apelam una din ele in functie de caz
    }
    this.list = function(callback){
        //aceasta functie va lista denumirile fisierelor din arhiva
        //nu inteleg ce ar trebui sa faca functia de callback
    }
}

module.exports = Archive;