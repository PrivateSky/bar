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

    this.setSeed = (seed) => {
        cachedSEED = seed;
        archiveConfigurator.setSeed(seed);
    };

    this.getSeed = () => {
        if (cachedSEED) {
            return cachedSEED;
        }

        cachedSEED = archiveConfigurator.getSeed();
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
            let xor;
            for (let i = 0; i < fileList.length - 1; i++) {
                xor = crypto.xorBuffers(__computeFileHash(fileList[i]), __computeFileHash(fileList[i + 1]));
            }

            callback(undefined, crypto.pskHash(xor, "hex"));
        }, callback);
    };

    this.update = (fsPath, callback) => {
        let blocksPositions = {};
        let checksSumMap = barMap.getDictionaryObject();
        let fileNameHashes = __setFromHashList();
        let fileState = {};
        loadBarMapThenExecute(__update, callback);

        /**
         * in this function, i do a directory traversal and process every file that i find, looking for blocks that already exists in our archive
         * @private
         */

        function __setFromHashList() {
            let folderHashList = {};
            barMap.getFileList().forEach((file) => {
                folderHashList[file.slice(file.indexOf('/'))] = new Set(barMap.getHashList(file));
            });
            return folderHashList;
        }

        function __readDirectoryRecursively(folderPath, sign, callback) {
            archiveFsAdapter.getNextFile(folderPath, sign, __readFileChk);

            function __readFileChk(err, file) {
                if (err) {
                    return callback(err);
                }

                if (typeof file === 'undefined') {
                    return callback(undefined, blocksPositions, fileNameHashes);
                }

                const goodPath = path.posix.normalize(path.join(path.dirname(folderPath), file).split(path.sep).join(path.posix.sep));
                archiveFsAdapter.getFileSize(goodPath, (err, size) => {
                    if (err) {
                        return callback(err);
                    }
                    __readBlock(goodPath, goodPath.slice(goodPath.indexOf('/')), size, 0, archiveConfigurator.getBufferSize(), undefined, undefined, barMap.isInHeader(goodPath), (err) => {
                        if (err) {
                            return callback(err);
                        }
                        __readDirectoryRecursively(folderPath, false, callback);
                    });
                });

            }

            function __readBlock(file, cutFile, fileSize, index, blockSize, currentBlockCheckSum, firstByte, alreadyInBarMap, callback) {
                if (index >= fileSize) {
                    if (blocksPositions[file] === undefined) {
                        blocksPositions[file] = [];
                    }
                    blocksPositions[file].push({start: fileSize, end: fileSize});
                    return callback();
                }
                archiveFsAdapter.readBlockFromFile(file, index, index + blockSize - 1, (err, data) => {
                    if (err) {
                        return callback(err);
                    }
                    if (currentBlockCheckSum === undefined) {
                        currentBlockCheckSum = adler32.sum(data);
                    } else {
                        currentBlockCheckSum = adler32.roll(currentBlockCheckSum, blockSize, firstByte, data[blockSize - 1]);
                    }
                    let matchFound = false;
                    if (checksSumMap[currentBlockCheckSum] !== undefined) {
                        let hardDigest = crypto.pskHash(data).toString('hex');
                        for (let k = 0; k < checksSumMap[currentBlockCheckSum].length; k++) {
                            if (checksSumMap[currentBlockCheckSum][k] === hardDigest) {
                                if (blocksPositions[file] === undefined) {
                                    blocksPositions[file] = [];
                                }
                                blocksPositions[file].push({start: index, end: index + blockSize});
                                // if(alreadyInBarMap === false){
                                //     let tempBrick = new Brick();
                                //     tempBrick.setTransformedData(data);
                                // }
                                fileState[file] = alreadyInBarMap;
                                if (typeof fileNameHashes[cutFile] !== 'undefined') {
                                    fileNameHashes[cutFile].delete(hardDigest);
                                }
                                matchFound = true;
                                break;
                            }
                        }
                    }
                    if (matchFound === false) {
                        __readBlock(file, cutFile, fileSize, index + 1, blockSize, currentBlockCheckSum, data[0], alreadyInBarMap, callback);
                    } else {
                        __readBlock(file, cutFile, fileSize, index + blockSize, blockSize, undefined, undefined, alreadyInBarMap, callback);
                    }
                });
            }

        }

        function iterateThroughOffsets(fileName, goodPath, precedence, iteratorIndex, filePositions, callback) {
            if (iteratorIndex >= filePositions.length) {
                return callback();
            }
            let positionObj = filePositions[iteratorIndex];
            if (positionObj === undefined) {
                return callback();
            }
            if (positionObj.start > precedence) {
                archiveFsAdapter.readBlockFromFile(goodPath, precedence, positionObj.end - 1, (err, blockData) => {
                    if (err) {
                        return callback(err);
                    }
                    let bufferSize = archiveConfigurator.getBufferSize();
                    for (let index = 0; index < blockData.length; index += bufferSize) {
                        let brick = new Brick();
                        brick.setTransformedData(blockData.slice(index, index + bufferSize));
                        barMap.add(fileName, brick);
                        storageProvider.putBrick(brick, (err) => {
                            if (err) {
                                return callback(err);
                            }
                            if (index + bufferSize >= blockData.length) {
                                iterateThroughOffsets(fileName, goodPath, positionObj.end, iteratorIndex + 1, filePositions, callback);
                            }
                        });
                    }
                });
            } else {
                if (fileState[goodPath] === false) {
                    archiveFsAdapter.readBlockFromFile(goodPath, positionObj.start, positionObj.end - 1, (err, blockData) => {
                        if (err) {
                            return callback(err);
                        }
                        let brick = new Brick();
                        brick.setTransformedData(blockData);
                        barMap.add(fileName, brick);
                        iterateThroughOffsets(fileName, goodPath, positionObj.end, iteratorIndex + 1, filePositions, callback);
                    });
                } else {
                    iterateThroughOffsets(fileName, goodPath, positionObj.end, iteratorIndex + 1, filePositions, callback);
                }
            }
        }

        function __addBricks(positions, callback) {
            let precedence;
            const taskCounter = new TaskCounter((errs, results) => {
                return callback();
            });
            taskCounter.increment(Object.keys(positions).length);
            Object.keys(positions).forEach((fileName) => {
                precedence = 0;
                let goodPath = path.posix.normalize(fileName.split(path.sep).join(path.posix.sep));

                iterateThroughOffsets(fileName, goodPath, precedence, 0, positions[fileName], (err) => {
                    if (err) {
                        return callback(err);
                    }
                    taskCounter.decrement(undefined, fileName);
                });
            });
        }

        function __deleteBricks(deletions) {
            //de adaugat, barMap.removeBrick(filePath,brickHash);
            Object.keys(deletions).forEach((fileName) => {
                deletions[fileName].forEach((brickHash) => {
                    barMap.removeBrick(fileName, brickHash);
                });
            });
        }

        function __update() {
            __readDirectoryRecursively(fsPath, true, (err, positions, deletions) => {
                if (err) {
                    return callback(err);
                }
                __addBricks(positions, (err) => {
                    if (err) {
                        return callback(err);
                    }
                    __deleteBricks(deletions);
                    storageProvider.putBarMap(barMap, callback);
                });
            });
        }
    };

    this.writeFile = (fileBarPath, data, callback) => {
        loadBarMapThenExecute(__addData, callback);

        function __addData() {
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

    this.addFile = (fsFilePath, barPath, callback) => {
        if (typeof barPath === "function") {
            callback = barPath;
            barPath = fsFilePath;
        }
        loadBarMapThenExecute(__addFile, callback);

        function __addFile() {
            readFileAsBlocks(fsFilePath, barPath, archiveConfigurator.getBufferSize(), (err) => {
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

    this.deleteFile = (filePath, callback) => {
        loadBarMapThenExecute(() => {
            storageProvider.deleteFile(filePath, callback);
        }, callback);
    };

    this.addFolder = (fsFolderPath, barPath, callback) => {
        if (typeof barPath === "function") {
            callback = barPath;
            barPath = fsFolderPath;
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
                    readFileAsBlocks(path.join(rootFsPath, file), path.join(barPath, file), archiveConfigurator.getBufferSize(), (err) => {
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

    this.listFiles = (folderBarPath, callback) => {
        loadBarMapThenExecute(() => {
            callback(undefined, barMap.getFileList(folderBarPath));
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

    function readFileAsBlocks(fsFilePath, barPath, blockSize, callback) {

        archiveFsAdapter.getFileSize(fsFilePath, (err, fileSize) => {
            if (err) {
                return callback(err);
            }

            let noBlocks = Math.floor(fileSize / blockSize);
            if (fileSize % blockSize > 0) {
                ++noBlocks;
            }

            __readBlocksRecursively(0, callback);

            function __readBlocksRecursively(blockIndex, callback) {
                archiveFsAdapter.readBlockFromFile(fsFilePath, blockIndex * blockSize, (blockIndex + 1) * blockSize - 1, (err, blockData) => {
                    if (err) {
                        return callback(err);
                    }

                    const brick = new Brick(archiveConfigurator);

                    brick.setRawData(blockData);
                    barMap.add(barPath, brick);

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
