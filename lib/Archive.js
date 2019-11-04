const Brick = require('./Brick');
const path = require("path");
const isStream = require("../utils/isStream");
const AsyncDispatcher = require("../utils/AsyncDispatcher");

function Archive(archiveConfigurator) {

    const archiveFsAdapter = archiveConfigurator.getFsAdapter();
    const storageProvider = archiveConfigurator.getStorageProvider();
    let barMap;

    this.setSeed = (seed) => {
        archiveConfigurator.setSeed(seed);
    };

    this.getSeed = () => {
        return archiveConfigurator.getSeed();
    };

    this.update = (fsPath, callback) => {
        loadBarMapThenExecute(__update, callback);

        let blocksPositions = {};

        /**
         * in this function, i do a directory traversal and process every file that i find, looking for blocks that already exists in our archive
         * @private
         */
        function __createMap(checkSums, hashes) {
            let map = {};
            for (let j = 0; j < checkSums.length; j++) {
                if (map[checkSums[j]] === undefined) {
                    map[checkSums[j]] = [];
                }
                map[checkSums[j]].push(hashes[j]);
            }
            return map;
        }

        function __readDirectoryRecur(path, callback) {
            archiveFsAdapter.getNextFile(path, __readFileChk);

            function __readFileChk(err, file) {
                if (err) {
                    return callback(err);
                }
                if (!file) {
                    return callback();
                }
                let checkSumMap = __createMap(barMap.getCheckSums(file), barMap.getHashList(file));

                archiveFsAdapter.getFileSize(path, (err, size) => {
                    __readBlock(file, size, 0, barMap.getBufferSize(), undefined, checkSumMap, (err) => {
                        if (err) {
                            return callback(err);
                        }
                        __readDirectoryRecur(path, __readFileChk);
                    });
                });

            }

            function __readBlock(file, fileSize, index, blockSize, currentBlockCheckSum, firstByte, checksSumMap, callback) {
                if (index * blockSize >= fileSize) {
                    return callback();
                }
                archiveFsAdapter.readBlockFromFile(file, index * blockSize, (index + 1) * blockSize - 1, (err, data) => {
                    if (err) {
                        return callback(err);
                    }
                    if (currentBlockCheckSum === undefined) {
                        currentBlockCheckSum = adler32.sum(data);
                    } else {
                        currentBlockCheckSum = adler32.roll(currentBlockCheckSum, blockSize, firstByte, data[data.length - 1]);
                    }
                    if (checksSumMap[currentBlockCheckSum] !== undefined) {
                        let collision = true;
                        let hardDigest = crypto.createHash('sha256').update(data).digest('hex');
                        for (let k = 0; k < checksSumMap[currentBlockCheckSum].length; k++) {
                            if (checksSumMap[currentBlockCheckSum][k] === hardDigest) {
                                if (blocksPositions[file] === undefined) {
                                    blocksPositions[file] = [];
                                }
                                blocksPositions[file].push({start: index, end: index + blockSize});
                                collision = false;
                                break;
                            }
                        }
                        if (collision === false) {
                            currentBlockCheckSum = undefined;
                        }
                    }
                    __readBlock(file, fileSize, index + 1, blockSize, currentBlockCheckSum, data[0], checksSumMap, callback);
                });
            }

        }

        function __update() {
            // let hashList = barMap.getHashList(fsPath);
            // barMap.
            __readDirectoryRecur(fsPath, callback);
        }
    };

    this.writeFile = (filePath, data, callback) => {
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
            barMap.add(filePath, brick);

            storageProvider.putBrick(brick, (err) => {
                if (err) {
                    return callback(err);
                }

                storageProvider.putBarMap(barMap, callback);
            });
        }
    };

    this.readFile = (filePath, callback) => {
        loadBarMapThenExecute(__readFile, callback);

        function __readFile() {
            let fileData = Buffer.alloc(0);
            let brickIds;
            try {
                brickIds = barMap.getHashList(filePath);
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

        loadBarMapThenExecute(__addFolder, callback);

        function __addFolder() {

            archiveFsAdapter.getNextFile(fsFolderPath, readFileCb);

            function readFileCb(err, file) {
                if (err) {
                    return callback(err);
                }

                if (typeof file !== "undefined") {

                    readFileAsBlocks(path.join(path.dirname(fsFolderPath), file), path.join(path.dirname(barPath), file), archiveConfigurator.getBufferSize(), (err) => {
                        if (err) {
                            return callback(err);
                        }

                        archiveFsAdapter.getNextFile(fsFolderPath, readFileCb);
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
    this.extractFolder = (callback) => {

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

    this.clone = (targetStorage, preserveKeys = true, callback) => {
        targetStorage.getBarMap((err, targetBarMap) => {
            if (err) {
                return callback(err);
            }

            targetBarMap.setConfig(archiveConfigurator);
            targetBarMap.setEncryptionKey(archiveConfigurator.getMapEncryptionKey());
            loadBarMapThenExecute(__cloneBricks, callback);

            function __cloneBricks() {
                const fileList = barMap.getFileList();
                __getFilesRecursively(fileList, 0, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    targetStorage.putBarMap(targetBarMap, callback);
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

                    if (barMap.getTransformParameters(brickList[brickIndex]).key) {
                        brick.setTransformParameters({key: barMap.getTransformParameters(brickList[brickIndex]).key});
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
                    barMap.add(barPath, brick);//

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

            if (!map.getTransformParameters()) {
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
