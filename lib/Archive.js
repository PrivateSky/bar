const Brick = require('./Brick');
const pathModule = "path";
const path = require(pathModule);
const isStream = require("../utils/isStream");
const stream = require('stream');
const swarmutils = require("swarmutils");
const TaskCounter = swarmutils.TaskCounter;
const pskPth = swarmutils.path;
const crypto = require('pskcrypto');
const adler32 = require('adler32');

function Archive(archiveConfigurator) {

    const archiveFsAdapter = archiveConfigurator.getFsAdapter();
    const storageProvider = archiveConfigurator.getStorageProvider();
    const cache = archiveConfigurator.getCache();

    let cachedSEED;
    let barMap;
    let cachedMapDigest;
    let validator;

    this.getMapDigest = () => {
        if (cachedMapDigest) {
            return cachedMapDigest;
        }

        cachedMapDigest = archiveConfigurator.getMapDigest();
        return cachedMapDigest;
    };

    this.setSeed = (seed) => {
        cachedSEED = seed;
        archiveConfigurator.setSeed(Buffer.from(seed));
    };

    this.getSeed = () => {
        if (cachedSEED) {
            return cachedSEED;
        }

        cachedSEED = archiveConfigurator.getSeed().toString();
        return cachedSEED;
    };

    this.getFileHash = (barPath, callback) => {
        barPath = pskPth.normalize(barPath);
        loadBarMapThenExecute(() => {
            callback(undefined, __computeFileHash(barPath).toString("hex"));
        }, callback)
    };

    this.getFolderHash = (barPath, callback) => {
        barPath = pskPth.normalize(barPath);
        loadBarMapThenExecute(() => {
            const fileList = barMap.getFileList(barPath);
            if (fileList.length === 1) {
                return callback(undefined, __computeFileHash(pskPth.join(barPath, fileList[0]).toString("hex")));
            }
            fileList.sort();

            let xor = __computeFileHash(pskPth.join(barPath, fileList[0]));
            for (let i = 0; i < fileList.length - 1; i++) {
                xor = crypto.xorBuffers(xor, __computeFileHash(pskPth.join(barPath, fileList[i + 1])));
            }

            callback(undefined, crypto.pskHash(xor, "hex"));
        }, callback);
    };

    this.writeFile = (barPath, data, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {};
            options.encrypt = true;
        }
        barPath = pskPth.normalize(barPath);

        loadBarMapThenExecute(__addData, callback);

        function __addData() {
            archiveConfigurator.setIsEncrypted(options.encrypt);
            const bufferSize = archiveConfigurator.getBufferSize();

            if (typeof data === "string") {
                data = Buffer.from(data);
            }


            if (Buffer.isBuffer(data)) {
                let bricks;
                try {
                    bricks = createBricksFromBuffer(data, bufferSize);
                } catch (e) {
                    return callback(e);
                }
                return updateBar(barPath, bricks, callback);
            }

            if (isStream.isReadable(data)) {
                return createBricksFromStream(data, bufferSize, (err, bricks) => {
                    if (err) {
                        return callback(err);
                    }

                    updateBar(barPath, bricks, callback);
                });
            }

            return callback(Error(`Type of data is ${typeof data}. Expected Buffer or Stream.Readable`));
        }
    };

    this.readFile = (barPath, callback) => {
        barPath = pskPth.normalize(barPath);
        loadBarMapThenExecute(__readFile, callback);

        function __readFile() {
            let fileData = Buffer.alloc(0);
            let bricksMeta;
            try {
                bricksMeta = barMap.getBricksMeta(barPath);
            } catch (err) {
                return callback(err);
            }

            getFileRecursively(0, callback);

            function getFileRecursively(brickIndex, callback) {
                const brickMeta = bricksMeta[brickIndex];
                getBrickData(brickMeta, (err, data) => {
                    if (err) {
                        return callback(err);
                    }

                    fileData = Buffer.concat([fileData, data]);
                    ++brickIndex;

                    if (brickIndex < bricksMeta.length) {
                        getFileRecursively(brickIndex, callback);
                    } else {
                        callback(undefined, fileData);
                    }

                });
            }
        }
    };

    this.createReadStream = (barPath, callback) => {
        barPath = pskPth.normalize(barPath);
        loadBarMapThenExecute(__prepareStream, callback);

        function __prepareStream() {
            let brickIndex = 0;
            let bricksMeta;

            try {
                bricksMeta = barMap.getBricksMeta(barPath);
            } catch (err) {
                return callback(err);
            }

            const readableStream = new stream.Readable({
                read(size) {
                    if (brickIndex < bricksMeta.length) {
                        this.readBrickData(brickIndex++);
                    }
                }
            });

            // Get a brick and push it into the stream
            readableStream.readBrickData = function (brickIndex) {
                const brickMeta = bricksMeta[brickIndex];
                getBrickData(brickMeta, (err, data) => {
                    if (err) {
                        this.destroy(err);
                        return;
                    }

                    this.push(data);

                    if (brickIndex >= (bricksMeta.length - 1)) {
                        this.push(null);
                    }
                });
            };

            callback(null, readableStream);
        }
    };

    this.addFile = (fsFilePath, barPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {};
            options.encrypt = true;
        }

        barPath = pskPth.normalize(barPath);

        loadBarMapThenExecute(__addFile, callback);

        function __addFile() {
            createBricks(fsFilePath, barPath, archiveConfigurator.getBufferSize(), options.encrypt, (err) => {
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

    this.addFiles = (arrWithFilePaths, barPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {};
            options.encrypt = true;
        }

        barPath = pskPth.normalize(barPath);

        let arr = arrWithFilePaths.slice();

        loadBarMapThenExecute(() => {
            recAdd()
        }, callback);

        function recAdd() {
            if (arr.length > 0) {
                let filePath = arr.pop();
                let fileName = path.basename(filePath);

                createBricks(filePath, pskPth.join(barPath, fileName), archiveConfigurator.getBufferSize(), options.encrypt, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    recAdd();
                });
            } else {
                barMap.setConfig(archiveConfigurator);
                if (archiveConfigurator.getMapEncryptionKey()) {
                    barMap.setEncryptionKey(archiveConfigurator.getMapEncryptionKey());
                }
                storageProvider.putBarMap(barMap, callback);
            }
        }
    };

    this.extractFile = (fsFilePath, barPath, callback) => {
        if (typeof barPath === "function") {
            callback = barPath;
            barPath = pskPth.normalize(fsFilePath);
        }


        loadBarMapThenExecute(__extractFile, callback);

        function __extractFile() {
            const bricksMeta = barMap.getBricksMeta(barPath);
            getFileRecursively(0, callback);

            function getFileRecursively(brickIndex, callback) {
                const brickMeta = bricksMeta[brickIndex];
                getBrickData(brickMeta, (err, data) => {
                    if (err) {
                        return callback(err);
                    }

                    archiveFsAdapter.appendBlockToFile(fsFilePath, data, (err) => {
                        if (err) {
                            return callback(err);
                        }

                        ++brickIndex;
                        if (brickIndex < bricksMeta.length) {
                            getFileRecursively(brickIndex, callback);
                        } else {
                            callback();
                        }
                    });
                })
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

    this.addFolder = (fsFolderPath, barPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {};
            options.encrypt = true;
        }
        barPath = pskPth.normalize(barPath);
        const filesIterator = archiveFsAdapter.getFilesIterator(fsFolderPath);

        loadBarMapThenExecute(__addFolder, callback);

        function __addFolder() {

            filesIterator.next(readFileCb);

            function readFileCb(err, file, rootFsPath) {
                if (err) {
                    return callback(err);
                }

                if (typeof file !== "undefined") {
                    createBricks(path.join(rootFsPath, file), pskPth.join(barPath, file), archiveConfigurator.getBufferSize(), options.encrypt, (err) => {
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
        if (typeof barPath === "function") {
            callback = barPath;
            barPath = pskPth.normalize(fsFolderPath);
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

    this.delete = (barPath, callback) => {
        loadBarMapThenExecute(() => {
            barMap.delete(barPath);
            callback();
        }, callback);
    };

    this.listFiles = (folderBarPath, options, callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {recursive:true};
        } else if (typeof folderBarPath === "function") {
            callback = folderBarPath;
            options = {recursive: true};
            folderBarPath = "/";
        }


        loadBarMapThenExecute(() => {
            let fileList;
            try {
                fileList = barMap.getFileList(folderBarPath, options.recursive);
            } catch (e) {
                return callback(e);
            }

            callback(undefined, fileList);
        }, callback);
    };

    this.listFolders = (folderBarPath, recursive, callback) => {
        if (typeof recursive === "function") {
            callback = recursive;
            recursive = true;
        }

        loadBarMapThenExecute(() => {
            callback(undefined, barMap.getFolderList(folderBarPath, recursive));
        }, callback);
    };

    this.clone = (targetStorage, preserveKeys = true, callback) => {
        targetStorage.getBarMap((err, targetBarMap) => {
            if (err) {
                return callback(err);
            }

            loadBarMapThenExecute(__cloneBricks, callback);

            function __cloneBricks() {
                const fileList = barMap.getFileList("/");

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
                let bricksMeta;
                try {
                    bricksMeta = bricksMeta.getBricksMeta(filePath);
                } catch (e){
                    return callback(e);
                }

                __getBricksRecursively(filePath, bricksMeta, 0, (err) => {
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

            function __getBricksRecursively(filePath, bricksMeta, brickIndex, callback) {
                storageProvider.getBrick(bricksMeta[brickIndex].hash, (err, brick) => {
                    if (err) {
                        return callback(err);
                    }

                    brick.setTransformParameters(barMap.getTransformParameters(bricksMeta[brickIndex]));
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

                        if (brickIndex === bricksMeta.length) {
                            return callback();
                        }

                        __getBricksRecursively(filePath, bricksMeta, brickIndex, callback);
                    });
                }
            }
        });
    };

    /**
     * @param {object} _validator
     * @param {callback} _validator.writeRule Writes validator
     * @param {callback} _validator.readRule Reads validator
     */
    this.setValidator = (_validator) => {
        validator = _validator;
    };

    //------------------------------------------- internal methods -----------------------------------------------------

    function __computeFileHash(fileBarPath) {
        const hashList = barMap.getBricksMeta(fileBarPath).map(brickMeta => brickMeta.hash);
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

    function createBricks(fsFilePath, barPath, blockSize, areEncrypted, callback) {
        if (typeof areEncrypted === "function") {
            callback = areEncrypted;
            areEncrypted = true;
        }
        archiveFsAdapter.getFileSize(fsFilePath, (err, fileSize) => {
            if (err) {
                return callback(err);
            }

            let noBlocks = Math.floor(fileSize / blockSize);
            if (fileSize % blockSize > 0) {
                ++noBlocks;
            }

            if (!barMap.isEmpty(barPath)) {
                barMap.emptyList(barPath);
            }
            __createBricksRecursively(0, callback);

            function __createBricksRecursively(blockIndex, callback) {
                archiveFsAdapter.readBlockFromFile(fsFilePath, blockIndex * blockSize, (blockIndex + 1) * blockSize - 1, (err, blockData) => {
                    if (err) {
                        return callback(err);
                    }

                    archiveConfigurator.setIsEncrypted(areEncrypted);
                    const brick = new Brick(archiveConfigurator);
                    brick.setRawData(blockData);
                    barMap.add(barPath, brick);
                    storageProvider.putBrick(brick, (err) => {
                        if (err) {
                            return callback(err);
                        }

                        ++blockIndex;
                        if (blockIndex < noBlocks) {
                            __createBricksRecursively(blockIndex, callback);
                        } else {
                            callback();
                        }
                    });
                });
            }
        });
    }

    /**
     * Create bricks from a Buffer
     * @param {Buffer} buffer
     * @param {number} blockSize
     * @return {Array<Brick>}
     */
    function createBricksFromBuffer(buffer, blockSize) {
        let noBlocks = Math.floor(buffer.length / blockSize);
        if ((buffer.length % blockSize) > 0) {
            ++noBlocks;
        }

        const bricks = [];
        for (let blockIndex = 0; blockIndex < noBlocks; blockIndex++) {
            const blockData = buffer.slice(blockIndex * blockSize, (blockIndex + 1) * blockSize);

            const brick = new Brick(archiveConfigurator);
            brick.setRawData(blockData);
            bricks.push(brick);
        }

        return bricks;
    }

    /**
     * Create bricks from a Stream
     * @param {stream.Readable} stream
     * @param {number} blockSize
     * @param {callback|undefined} callback
     */
    function createBricksFromStream(stream, blockSize, callback) {
        let bricks = [];
        stream.on('data', (chunk) => {
            if (typeof chunk === 'string') {
                chunk = Buffer.from(chunk);
            }

            let chunkBricks = createBricksFromBuffer(chunk, chunk.length);
            bricks = bricks.concat(chunkBricks);
        });
        stream.on('error', (err) => {
            callback(err);
        });
        stream.on('end', () => {
            callback(undefined, bricks);
        });
    }

    /**
     * @param {string} barPath
     * @param {Array<Brick} bricks
     * @param {callback} callback
     */
    function updateBar(barPath, bricks, callback) {
        if (!barMap.isEmpty(barPath)) {
            barMap.emptyList(barPath);
        }

        for (let brick of bricks) {
            barMap.add(barPath, brick);
        }

        function __saveBricks(bricks, callback) {
            const brick = bricks.shift();

            if (!brick) {
                return storageProvider.putBarMap(barMap, callback);
            }

            storageProvider.putBrick(brick, (err) => {
                if (err) {
                    return callback(err);
                };

                __saveBricks(bricks, callback);
            })
        }

        if (!validator || typeof validator.writeRule !== 'function') {
            return __saveBricks(bricks, callback);
        }

        validator.writeRule.call(this, barMap, barPath, bricks, (err) => {
            if (err) {
                return callback(err);
            }

            __saveBricks(bricks, callback);
        });
    }

    /**
     * @param {*} key
     * @return {Boolean}
     */
    function hasInCache(key) {
        if (!cache) {
            return false;
        }

        return cache.has(key);
    }

    /**
     * @param {*} key
     * @param {*} value
     */
    function storeInCache(key, value) {
        if (!cache) {
            return;
        }

        cache.set(key, value);
    }

    /**
     * Try and get brick data from cache
     * Fallback to storage provide if not found in cache
     *
     * @param {string} brickMeta
     * @param {callback} callback
     */
    function getBrickData(brickMeta, callback) {
        if (!hasInCache(brickMeta.hash)) {
            return storageProvider.getBrick(brickMeta.hash, (err, brick) => {
                if (err) {
                    return callback(err);
                }

                brick.setConfig(archiveConfigurator);
                brick.setTransformParameters(barMap.getTransformParameters(brickMeta));
                const data = brick.getRawData();
                storeInCache(brickMeta.hash, data);
                callback(undefined, data);
            });
        }

        const data = cache.get(brickMeta.hash);
        callback(undefined, data);
    }

    function loadBarMapThenExecute(functionToBeExecuted, callback) {
        const digest = archiveConfigurator.getMapDigest();
        if (!digest || !hasInCache(digest)) {
            return storageProvider.getBarMap(digest, (err, map) => {
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
                if (digest) {
                    storeInCache(digest, barMap);
                }
                storageProvider.setBarMap(barMap);
                functionToBeExecuted();
            });
        }

        const map = cache.get(digest);
        barMap = map;
        storageProvider.setBarMap(barMap);
        functionToBeExecuted();
    }
}

module.exports = Archive;
