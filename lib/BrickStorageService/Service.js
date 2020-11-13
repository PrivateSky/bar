'use strict';

const envTypes = require("overwrite-require").constants;
const isStream = require("../../utils/isStream");
const stream = require('stream');

const HASHLINK_EMBEDDED_HINT_PREFIX = 'embedded/';

/**
 * Brick storage layer
 * Wrapper over EDFSBrickStorage
 *
 * @param {object} options
 * @param {Cache} options.cache
 * @param {number} options.bufferSize
 * @param {EDFSBrickStorage} options.storageProvider
 * @param {callback} options.brickFactoryFunction
 * @param {FSAdapter} options.fsAdapter
 * @param {callback} options.brickDataExtractorCallback
 */
function Service(options) {
    options = options || {};
    this.cache = options.cache;
    this.bufferSize = parseInt(options.bufferSize, 10);
    this.storageProvider = options.storageProvider;
    this.brickFactoryFunction = options.brickFactoryFunction;
    this.fsAdapter = options.fsAdapter;
    this.brickDataExtractorCallback = options.brickDataExtractorCallback;
    this.keySSI = options.keySSI;

    const SSIKeys = require("opendsu").loadApi("keyssi");

    if (isNaN(this.bufferSize) || this.bufferSize < 1) {
        throw new Error('Buffer size is required');
    }

    if (!this.storageProvider) {
        throw new Error('Storage provider is required');
    }

    if (typeof this.brickFactoryFunction !== 'function') {
        throw new Error('A brick factory function is required');
    }

    if (!this.fsAdapter && $$.environmentType !== envTypes.BROWSER_ENVIRONMENT_TYPE && $$.environmentType !== envTypes.SERVICE_WORKER_ENVIRONMENT_TYPE) {
        throw new Error('A file system adapter is required');
    }

    if (typeof this.brickDataExtractorCallback !== 'function') {
        throw new Error('A Brick data extractor callback is required');
    }

    /**
     * @param {HashLinkSSI} hlSSI
     * @return {HashLinkSSI}
     */
    const stripHintFromHashLinkSSI = (hlSSI) => {
        return SSIKeys.buildHashLinkSSI(
            hlSSI.getDLDomain(),
            hlSSI.getSpecificString(),
            hlSSI.getControl(),
            hlSSI.getVn()
        ).getIdentifier();
    };

    /**
     * @param {*} key
     * @return {Boolean}
     */
    const hasInCache = (key) => {
        if (!this.cache) {
            return false;
        }

        return this.cache.has(key);
    };

    /**
     * @param {*} key
     * @param {*} value
     */
    const storeInCache = (key, value) => {
        if (!this.cache) {
            return;
        }

        this.cache.set(key, value);
    };

    /**
     * Creates writable stream to a EDFSBrickStorage instance
     *
     * @param {EDFSBrickStorage} storageProvider
     * @param {callback} beforeCopyCallback
     * @return {stream.Writable}
     */
    const createBricksWritableStream = (storageProvider, beforeCopyCallback) => {
        const self = this;
        return ((storageProvider, beforeCopyCallback) => {

            const writableStream = new stream.Writable({
                write(brickContainer, encoding, callback) {
                    let {brick, brickMeta} = brickContainer;
                    if (typeof beforeCopyCallback === 'function') {
                        brick = beforeCopyCallback(brickMeta, brick);
                    }

                    brick.getTransformedData((err, brickData) => {
                        if (err) {
                            return callback(err);
                        }

                        self.putBrick(self.keySSI, brickData, (err, digest) => {
                            if (err) {
                                return callback(err);
                            }

                            brick.getSummary((err, brickSummary) => {
                                if (err) {
                                    return callback(err);
                                }


                                brickSummary.digest = digest;
                                this.bricksSummary.push(brickSummary);

                                callback();
                            });
                        })
                    });
                },
                objectMode: true
            });

            writableStream.bricksSummary = [];
            return writableStream;

        })(storageProvider, beforeCopyCallback);
    };

    /**
     * Create a readable stream of Brick objects
     * retrieved from EDFSBrickStorage
     *
     * @param {Array<object>} bricksMeta
     * @return {stream.Readable}
     */
    const createBricksReadableStream = (bricksMeta) => {
        return ((bricksMeta) => {

            let brickIndex = 0;

            const readableStream = new stream.Readable({
                read(size) {
                    if (!bricksMeta.length) {
                        return self.push(null);
                    }
                    if (brickIndex < bricksMeta.length) {
                        self.getBrick(brickIndex++);
                    }
                },
                objectMode: true
            });

            // Get a brick and push it into the stream
            const self = this;
            readableStream.getBrick = function (brickIndex) {
                const brickMeta = bricksMeta[brickIndex];
                const hlSSI = SSIKeys.parse(brickMeta.hashLink);
                self.getBrick(hlSSI, (err, brick) => {
                    if (err) {
                        this.destroy(err);
                        return;
                    }

                    this.push({
                        brickMeta,
                        brick
                    });

                    if (brickIndex >= (bricksMeta.length - 1)) {
                        this.push(null);
                    }
                });
            };

            return readableStream;

        })(bricksMeta);
    };

    const createBrick = (brickData) => {
        const Brick = require("../Brick");
        const brick = new Brick();
        brick.setTransformedData(brickData);
        return brick;
    };

    /**
     * Retrieves a Brick from storage and converts
     * it into a Buffer
     *
     * @param {object} brickMeta
     * @param {callback} callback
     */
    const getBrickAsBuffer = (brickMeta, callback) => {
        const hlSSI = SSIKeys.parse(brickMeta.hashLink);
        const hlSSIHint = hlSSI.getHint();
        let cacheKey = brickMeta.hashLink;

        // In case of compacted files (multiple files stored in a single brick)
        // the cache key is the HashLinkSSI identifier without the embed hint
        if (hlSSIHint && hlSSIHint.indexOf(HASHLINK_EMBEDDED_HINT_PREFIX) === 0) {
            cacheKey = stripHintFromHashLinkSSI(hlSSI);
        }

        // Based on the HashLinkSSI hint do additional processing
        // on the resulting Brick data
        const resolveHint = (data, hlSSIHint, callback) => {
            if (!hlSSIHint) {
                return callback(undefined, data);
            }

            // For "embedded" hints, extract the data identified by
            // the offset, size parameters stored in the hint
            if (hlSSIHint.indexOf(HASHLINK_EMBEDDED_HINT_PREFIX) === 0) {
                const hintSegments = hlSSIHint.split('/').pop();
                let [ offset, size ] = hintSegments.split(',');

                offset = parseInt(offset, 10);
                size = parseInt(size, 10);

                if (isNaN(offset) || isNaN(size)) {
                    return callback(new Error(`Embedded hint is invalid. Expected offset,size and got: ${hintSegments}`));
                }
                return callback(undefined, data.slice(offset, offset + size));
            }

            return callback(undefined, data);
        }

        if (hasInCache(cacheKey)) {
            const data = this.cache.get(cacheKey);
            return resolveHint(data, hlSSIHint, callback);
        }

        this.getBrick(hlSSI, (err, brickData) => {
            if (err) {
                return callback(err);
            }

            this.brickDataExtractorCallback(brickMeta, createBrick(brickData), (err, data) => {
                if (err) {
                    return callback(err);
                }

                storeInCache(cacheKey, data);
                return resolveHint(data, hlSSIHint, callback);
            });
        });
    };


    /**
     * Counts the number of blocks in a file
     *
     * @param {string} filePath
     * @param {callback} callback
     */
    const getFileBlocksCount = (filePath, callback) => {
        this.fsAdapter.getFileSize(filePath, (err, size) => {
            if (err) {
                return callback(err);
            }

            let blocksCount = Math.floor(size / this.bufferSize);
            if (size % this.bufferSize > 0) {
                ++blocksCount;
            }

            callback(undefined, blocksCount);
        })
    };

    /**
     * Creates a Brick from a Buffer
     * and saves it into brick storage
     *
     * @param {Buffer} data
     * @param {callback} callback
     */
    const convertDataBlockToBrick = (data, callback) => {
        const brick = this.brickFactoryFunction();
        brick.setRawData(data);
        brick.getTransformedData((err, brickData) => {
            if (err) {
                return callback(err);
            }

            this.putBrick(this.keySSI, brickData, (err, digest) => {
                if (err) {
                    return callback(err);
                }

                brick.getSummary((err, brickSummary) => {
                    if (err) {
                        return callback(err);
                    }


                    brickSummary.digest = digest;
                    callback(undefined, brickSummary);
                });
            });
        });
    };

    /**
     * Recursively breaks a buffer into Brick objects and
     * stores them into storage
     *
     * @param {Array<object>} resultContainer
     * @param {Buffer} buffer
     * @param {number} blockIndex
     * @param {number} blockSize
     * @param {callback} callback
     */
    const convertBufferToBricks = (resultContainer, buffer, blockIndex, blockSize, callback) => {
        let blocksCount = Math.floor(buffer.length / blockSize);
        if ((buffer.length % blockSize) > 0) {
            ++blocksCount;
        }

        const blockData = buffer.slice(blockIndex * blockSize, (blockIndex + 1) * blockSize);

        convertDataBlockToBrick(blockData, (err, result) => {
            if (err) {
                return callback(err);
            }

            resultContainer.push(result);
            ++blockIndex;

            if (blockIndex < blocksCount) {
                return convertBufferToBricks(resultContainer, buffer, blockIndex, blockSize, callback);
            }

            return callback();
        });
    };

    /**
     * Copy the contents of a file into brick storage
     *
     * @param {Array<object>} resultContainer
     * @param {string} filePath
     * @param {number} blockIndex
     * @param {number} blocksCount
     * @param {callback} callback
     */
    const convertFileToBricks = (resultContainer, filePath, blockIndex, blocksCount, callback) => {
        if (typeof blocksCount === 'function') {
            callback = blocksCount;
            blocksCount = blockIndex;
            blockIndex = 0;
        }

        const blockOffset = blockIndex * this.bufferSize;
        const blockEndOffset = (blockIndex + 1) * this.bufferSize - 1;
        this.fsAdapter.readBlockFromFile(filePath, blockOffset, blockEndOffset, (err, data) => {
            if (err) {
                return callback(err);
            }

            convertDataBlockToBrick(data, (err, result) => {
                if (err) {
                    return callback(err);
                }

                resultContainer.push(result);
                ++blockIndex;

                if (blockIndex < blocksCount) {
                    return convertFileToBricks(resultContainer, filePath, blockIndex, blocksCount, callback);
                }

                return callback();
            })
        })
    };

    /**
     * Save the buffer containing multiple files as a single brick
     * and generate the proper HashLinkSSI for each file in the brick
     *
     * Each file's HashLinkSSI is constructed by appending the `embedded/${offset},${size}` hint
     * at the end of the Brick's HashLinkSSI. Ex:
     * Brick HashLinkSSI:
     *      ssi:hl:default:29LuHPtSrCG7u4nKNPB8KbG2EuK1U84X5pTTTko2GGcpxZGyPFC1jG8hAh6g2DbYKJxYumJFmNyQWu3iNpQe5jHR::v0
     * File in brick HashLinkSSI:
     *      ssi:hl:default:29LuHPtSrCG7u4nKNPB8KbG2EuK1U84X5pTTTko2GGcpxZGyPFC1jG8hAh6g2DbYKJxYumJFmNyQWu3iNpQe5jHR::v0:embedded/0,5
     *
     * @param {Buffer} buffer
     * @param {Array<Object>} filesList
     * @param {string} filesList[].filename
     * @param {Number} filesList[].offset
     * @param {Number} filesList[].size
     * @param {callback} callback
     */
    const storeCompactedFiles = (buffer, filesList, callback) => {
        return convertDataBlockToBrick(buffer, (err, brickMeta) => {
            if (err) {
                return callback(err);
            }
            const files = {};
            const brickHLSSI = SSIKeys.parse(brickMeta.hashLink);

            for (const fileInfo of filesList) {
                const fileHLSSIHint = `${HASHLINK_EMBEDDED_HINT_PREFIX}${fileInfo.offset},${fileInfo.size}`;

                const fileHLSSI = SSIKeys.buildHashLinkSSI(
                    brickHLSSI.getDLDomain(),
                    brickHLSSI.getSpecificString(),
                    brickHLSSI.getControl(),
                    brickHLSSI.getVn(),
                    fileHLSSIHint
                );
                const fileBrickMeta = Object.assign({}, brickMeta);
                fileBrickMeta.hashLink = fileHLSSI.getIdentifier();
                files[fileInfo.filename] = [fileBrickMeta];
            }

            return callback(undefined, files);
        });
    }

    /**
     * Stores a Buffer as Bricks into brick storage
     *
     * @param {Buffer} buffer
     * @param {number|callback} bufferSize
     * @param {callback|undefined} callback
     */
    this.ingestBuffer = (buffer, bufferSize, callback) => {
        if (typeof bufferSize === 'function') {
            callback = bufferSize;
            bufferSize = this.bufferSize;
        }
        const bricksSummary = [];

        convertBufferToBricks(bricksSummary, buffer, 0, bufferSize, (err) => {
            if (err) {
                return callback(err);
            }

            callback(undefined, bricksSummary);
        });
    };

    /**
     * Reads a stream of data into multiple Brick objects
     * stored in brick storage
     *
     * @param {stream.Readable} stream
     * @param {callback}
     */
    this.ingestStream = (stream, callback) => {
        let bricksSummary = [];
        let receivedData = [];
        stream.on('data', (chunk) => {
            if (typeof chunk === 'string') {
                chunk = Buffer.from(chunk);
            }

            receivedData.push(chunk);
            let noChunks = this.bufferSize / chunk.length;
            if (receivedData.length >= noChunks) {
                const buffer = Buffer.concat(receivedData.splice(0, noChunks));
                stream.pause();
                this.ingestBuffer(buffer, buffer.length, (err, summary) => {
                    if (err) {
                        stream.destroy(err);
                        return;
                    }
                    bricksSummary = bricksSummary.concat(summary);
                    stream.resume();
                });
            }
        });
        stream.on('error', (err) => {
            callback(err);
        });
        stream.on('end', () => {
            const buffer = Buffer.concat(receivedData);
            this.ingestBuffer(buffer, buffer.length, (err, summary) => {
                if (err) {
                    return callback(err);
                }

                bricksSummary = bricksSummary.concat(summary);
                callback(undefined, bricksSummary);
            });
        })
    };

    /**
     * @param {string|Buffer|stream.Readable} data
     * @param {callback} callback
     */
    this.ingestData = (data, callback) => {
        if (typeof data === 'string') {
            data = Buffer.from(data);
        }

        if (!Buffer.isBuffer(data) && !isStream.isReadable(data)) {
            return callback(Error(`Type of data is ${typeof data}. Expected Buffer or Stream.Readable`));
        }

        if (Buffer.isBuffer(data)) {
            return this.ingestBuffer(data, callback);
        }

        return this.ingestStream(data, callback);
    };

    /**
     * Copy the contents of a file into brick storage
     *
     * @param {string} filePath
     * @param {callback} callback
     */
    this.ingestFile = (filePath, callback) => {
        const bricksSummary = [];

        getFileBlocksCount(filePath, (err, blocksCount) => {
            if (err) {
                return callback(err);
            }

            convertFileToBricks(bricksSummary, filePath, blocksCount, (err, result) => {
                if (err) {
                    return callback(err);
                }

                callback(undefined, bricksSummary);
            });
        });
    };

    /**
     * Copy the contents of multiple files into brick storage
     *
     * @param {Array<string>} filePath
     * @param {callback} callback
     */
    this.ingestFiles = (files, callback) => {
        const bricksSummary = {};

        const ingestFilesRecursive = (files, callback) => {
            if (!files.length) {
                return callback(undefined, bricksSummary);
            }

            const filePath = files.pop();
            const filename = require("path").basename(filePath);

            this.ingestFile(filePath, (err, result) => {
                if (err) {
                    return callback(err);
                }

                bricksSummary[filename] = result;

                ingestFilesRecursive(files, callback);
            });
        };

        ingestFilesRecursive(files, callback);
    };

    /**
     * Copy the contents of folder into a single brick
     *
     * @param {string} folderPath
     * @param {callback} callback
     */
    this.createBrickFromFolder = (folderPath, callback) => {
        const filesIterator = this.fsAdapter.getFilesIterator(folderPath);
        const filesList = [];

        let buffer = Buffer.alloc(0);
        let currentOffset = 0;

        const iteratorHandler = (err, filename, dirname) => {
            if (err) {
                return callback(err);
            }

            if (typeof filename === 'undefined') {
                return storeCompactedFiles(buffer, filesList, callback);
            }

            const filePath = require("path").join(dirname, filename);
            this.readFile(filePath, (err, fileBuffer) => {
                if (err) {
                    return callback(err);
                }

                const size = fileBuffer.length;
                const offset = currentOffset;

                filesList.push({
                    filename,
                    offset,
                    size
                });

                currentOffset += size;
                buffer = Buffer.concat([buffer, fileBuffer]);

                filesIterator.next(iteratorHandler);
            });
        };

        filesIterator.next(iteratorHandler);

    };

    /**
     * Copy the contents of multiple files into a single brick
     *
     * @param {string} folderPath
     * @param {callback} callback
     */
    this.createBrickFromFiles = (files, callback) => {
        const filesList = [];

        let buffer = Buffer.alloc(0);
        let currentOffset = 0;

        const readFilesRecursive = (files, callback) => {
            if (!files.length) {
                return storeCompactedFiles(buffer, filesList, callback);
            }

            const filePath = files.pop();
            const filename = require("path").basename(filePath);

            this.readFile(filePath, (err, fileBuffer) => {
                if (err) {
                    return callback(err);
                }

                const size = fileBuffer.length;
                const offset = currentOffset;

                filesList.push({
                    filename,
                    offset,
                    size
                });

                currentOffset += size;
                buffer = Buffer.concat([buffer, fileBuffer]);

                readFilesRecursive(files, callback);
            });
        }

        readFilesRecursive(files, callback);
    };

    /**
     * Copy the contents of folder into brick storage
     *
     * @param {string} folderPath
     * @param {callback} callback
     */
    this.ingestFolder = (folderPath, callback) => {
        const bricksSummary = {};
        const filesIterator = this.fsAdapter.getFilesIterator(folderPath);

        const iteratorHandler = (err, filename, dirname) => {
            if (err) {
                return callback(err);
            }

            if (typeof filename === 'undefined') {
                return callback(undefined, bricksSummary);
            }

            const filePath = require("path").join(dirname, filename);
            this.ingestFile(filePath, (err, result) => {
                if (err) {
                    return callback(err);
                }

                bricksSummary[filename] = result;
                filesIterator.next(iteratorHandler);
            });
        };

        filesIterator.next(iteratorHandler);
    };

    /**
     * Retrieve all the Bricks identified by `bricksMeta`
     * from storage and create a Buffer using their data
     *
     * @param {Array<object>} bricksMeta
     * @param {callback} callback
     */
    this.createBufferFromBricks = (bricksMeta, callback) => {
        let buffer = Buffer.alloc(0);

        const getBricksAsBufferRecursive = (index, callback) => {
            const brickMeta = bricksMeta[index];

            getBrickAsBuffer(brickMeta, (err, data) => {
                if (err) {
                    return callback(err);
                }

                buffer = Buffer.concat([buffer, data]);
                ++index;

                if (index < bricksMeta.length) {
                    return getBricksAsBufferRecursive(index, callback);
                }

                callback(undefined, buffer);
            });
        };

        getBricksAsBufferRecursive(0, callback);
    };

    /**
     * Retrieve all the Bricks identified by `bricksMeta`
     * from storage and create a readable stream
     * from their data
     *
     * @param {Array<object>} bricksMeta
     * @param {callback} callback
     */
    this.createStreamFromBricks = (bricksMeta, callback) => {
        let brickIndex = 0;

        const readableStream = new stream.Readable({
            read(size) {
                if (!bricksMeta.length) {
                    return this.push(null);
                }

                if (brickIndex < bricksMeta.length) {
                    this.readBrickData(brickIndex++);
                }
            }
        });

        // Get a brick and push it into the stream
        readableStream.readBrickData = function (brickIndex) {
            const brickMeta = bricksMeta[brickIndex];
            getBrickAsBuffer(brickMeta, (err, data) => {
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

        callback(undefined, readableStream);
    };

    /**
     * Retrieve all the Bricks identified by `bricksMeta`
     * and store their data into a file
     *
     * @param {string} filePath
     * @param {Array<object>} bricksMeta
     * @param {callback} callback
     */
    this.createFileFromBricks = (filePath, bricksMeta, callback) => {
        const getBricksAsBufferRecursive = (index, callback) => {
            const brickMeta = bricksMeta[index];

            getBrickAsBuffer(brickMeta, (err, data) => {
                if (err) {
                    return callback(err);
                }

                this.fsAdapter.appendBlockToFile(filePath, data, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    ++index;

                    if (index < bricksMeta.length) {
                        return getBricksAsBufferRecursive(index, callback);
                    }

                    callback();
                });
            });
        };

        getBricksAsBufferRecursive(0, callback);
    };

    /**
     * Copy all the Bricks identified by `bricksList`
     * into another storage provider
     *
     * @param {object} bricksList
     * @param {object} options
     * @param {FSAdapter} options.dstStorage
     * @param {callback} options.beforeCopyCallback
     * @param {callback} callback
     */
    this.copyBricks = (bricksList, options, callback) => {
        const bricksSetKeys = Object.keys(bricksList);
        const newBricksSetKeys = {};

        const copyBricksRecursive = (callback) => {
            if (!bricksSetKeys.length) {
                return callback();
            }

            const setKey = bricksSetKeys.shift();
            const bricksMeta = bricksList[setKey];

            const srcStream = createBricksReadableStream(bricksMeta);
            const dstStream = createBricksWritableStream(options.dstStorage, options.beforeCopyCallback);

            srcStream.on('error', (err) => {
                callback(err);
                dstStream.destroy(err);
            });

            dstStream.on('finish', () => {
                newBricksSetKeys[setKey] = dstStream.bricksSummary;
                dstStream.destroy();
                copyBricksRecursive(callback);
            });

            srcStream.pipe(dstStream);
        };

        copyBricksRecursive((err) => {
            if (err) {
                return callback(err);
            }

            callback(undefined, newBricksSetKeys);
        });
    };

    /**
     * @param {string} filePath
     * @param {callback} callback
     */
    this.readFile = (filePath, callback) => {
        this.fsAdapter.getFileSize(filePath, (err, size) => {
            if (err) {
                return callback(err);
            }

            if (!size) {
                size = 1;
            }
            this.fsAdapter.readBlockFromFile(filePath, 0, size - 1, callback);
        });
    };

    /**
     * @param {string} keySSI
     * @param {callback} callback
     */
    this.versions = (keySSI, callback) => {
        this.storageProvider.versions(keySSI, callback);
    }

    /**
     * @param {string} keySSI
     * @param {string} value
     * @param {string|undefined} lastValue
     * @param {callback} callback
     */
    this.addVersion = (keySSI, hashLinkSSI, lastHashLinkSSI, callback) => {
        this.storageProvider.addVersion(keySSI, hashLinkSSI, lastHashLinkSSI, callback);
    }

    /**
     * @param {string} hashLinkSSI
     * @param {callback} callback
     */
    this.getBrick = (hashLinkSSI, callback) => {
        let args = [hashLinkSSI, callback];
        this.storageProvider.getBrick(...args);
    }

    this.getMultipleBricks = (hashLinkSSIs, callback) => {
        let args = [hashLinkSSIs, callback];
        this.storageProvider.getMultipleBricks(...args);
    }

    /**
     * @param {string} brickId
     * @param {Brick} brick
     * @param {callback} callback
     */
    this.putBrick = (keySSI, brick, callback) => {
        let args = [keySSI, brick, callback];
        this.storageProvider.putBrick(...args);
    }
}

module.exports = Service;
