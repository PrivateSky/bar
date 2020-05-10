'use strict'

const pathModule = "path";
const path = require(pathModule);

const isStream = require("../../utils/isStream");
const stream = require('stream');

/**
 * Brick storage layer
 * Wrapper over EDFSBrickStorage
 *
 * @param {object} options
 * @param {Cache} options.cache
 * @param {number} options.bufferSize
 * @param {EDFSBrickStorage} options.storageProvider
 * @param {callback} options.brickFactoryCallback
 * @param {FSAdapter} options.fsAdapter
 * @param {callback} options.brickDataExtractorCallback
 * @param {callback} options.barMapConfiguratorCallback
 */
function Service(options) {
    options = options || {};

    this.cache = options.cache;
    this.bufferSize = parseInt(options.bufferSize, 10);
    this.storageProvider = options.storageProvider;
    this.brickFactoryCallback = options.brickFactoryCallback;
    this.fsAdapter = options.fsAdapter;
    this.brickDataExtractorCallback = options.brickDataExtractorCallback;
    this.barMapConfiguratorCallback = options.barMapConfiguratorCallback;

    if (isNaN(this.bufferSize) || this.bufferSize < 1) {
        throw new Error('Buffer size is required');
    }

    if (!this.storageProvider) {
        throw new Error('Storage provider is required');
    }

    if (typeof this.brickFactoryCallback !== 'function') {
        throw new Error('A brick factory callback is required');
    }

    if (!this.fsAdapter) {
        throw new Error('A file system adapter is required');
    }

    if (typeof this.brickDataExtractorCallback !== 'function') {
        throw new Error('A Brick data extractor callback is required');
    }

    if (typeof this.barMapConfiguratorCallback !== 'function') {
        throw new Error('A BarMap configurator callback is required');
    }

    /**
     * @param {*} key
     * @return {Boolean}
     */
    const hasInCache = (key) => {
        if (!this.cache) {
            return false;
        }

        return this.cache.has(key);
    }

    /**
     * @param {*} key
     * @param {*} value
     */
    const storeInCache = (key, value) => {
        if (!this.cache) {
            return;
        }

        this.cache.set(key, value);
    }

    /**
     * Creates writable stream to a EDFSBrickStorage instance
     *
     * @param {EDFSBrickStorage} storageProvider
     * @param {callback} beforeCopyCallback
     * @return {stream.Writable}
     */
    const createBricksWritableStream = (storageProvider, beforeCopyCallback) => {
        return ((storageProvider, beforeCopyCallback) => {

            const writableStream = new stream.Writable({
                write(brickContainer, encoding, callback) {
                    let { brick, brickId } = brickContainer;
                    if (typeof beforeCopyCallback === 'function') {
                        brick = beforeCopyCallback(brickId, brick);
                    }

                    storageProvider.putBrick(brick, (err, digest) => {
                        if (err) {
                            return callback(err);
                        }

                        const brickSummary = brick.getSummary();
                        brickSummary.digest = digest;
                        this.bricksSummary.push(brickSummary);

                        callback();
                    })
                },
                objectMode: true
            });

            writableStream.bricksSummary = [];
            return writableStream;

        })(storageProvider, beforeCopyCallback);
    }

    /**
     * Create a readable stream of Brick objects
     * retrieved from EDFSBrickStorage
     *
     * @param {Array} brickIds
     * @return {stream.Readable}
     */
    const createBricksReadableStream = (brickIds) => {
        return ((brickIds) => {

            let brickIndex = 0;

            const readableStream = new stream.Readable({
                read(size) {
                    if (brickIndex < brickIds.length) {
                        this.getBrick(brickIndex++);
                    }
                },
                objectMode: true
            });

            // Get a brick and push it into the stream
            const self = this;
            readableStream.getBrick = function (brickIndex) {
                const brickId = brickIds[brickIndex];
                self.storageProvider.getBrick(brickId, (err, brick) => {
                    if (err) {
                        this.destroy(err);
                        return;
                    }

                    this.push({
                        brickId,
                        brick
                    });

                    if (brickIndex >= (brickIds.length - 1)) {
                        this.push(null);
                    }
                });
            };

            return readableStream;

        })(brickIds);
    }

    /**
     * Retrieves a Brick from storage and converts
     * it into a Buffer
     *
     * @param {string} hash
     * @param {callback} callback
     */
    const getBrickAsBuffer = (hash, callback) => {
        if (hasInCache(hash)) {
            const data = this.cache.get(hash);
            return data;
        }

        this.storageProvider.getBrick(hash, (err, brick) => {
            if (err) {
                return callback(err);
            }

            const data = this.brickDataExtractorCallback(hash, brick);
            storeInCache(hash, data);
            callback(undefined, data);
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
        const brick = this.brickFactoryCallback();
        brick.setRawData(data);

        this.storageProvider.putBrick(brick, (err, digest) => {
            if (err) {
                return callback(err);
            }

            const brickSummary = brick.getSummary();
            brickSummary.digest = digest;

            return callback(undefined, brickSummary);
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
        stream.on('data', (chunk) => {
            if (typeof chunk === 'string') {
                chunk = Buffer.from(chunk);
            }

            stream.pause();
            this.ingestBuffer(chunk, chunk.length, (err, summary) => {
                if (err) {
                    stream.destroy(err);
                    return;
                }
                bricksSummary = bricksSummary.concat(summary);
                stream.resume();
            });
        });
        stream.on('error', (err) => {
            callback(err);
        });
        stream.on('end', () => {
            callback(undefined, bricksSummary);
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
            const filename = path.basename(filePath);

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

            const filePath = path.join(dirname, filename);
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
     * Retrieve all the Bricks identified by `brickIds`
     * from storage and create a Buffer using their data
     *
     * @param {Array<string>} brickIds
     * @param {callback} callback
     */
    this.createBufferFromBricks = (brickIds, callback) => {
        let buffer = Buffer.alloc(0);

        const getBricksAsBufferRecursive = (index, callback) => {
            const brickId = brickIds[index];

            getBrickAsBuffer(brickId, (err, data) => {
                if (err) {
                    return callback(err);
                }

                buffer = Buffer.concat([buffer, data]);
                ++index;

                if (index < brickIds.length) {
                    return getBricksAsBufferRecursive(index, callback);
                }

                callback(undefined, buffer);
            });
        };

        getBricksAsBufferRecursive(0, callback);
    }

    /**
     * Retrieve all the Bricks identified by `brickIds`
     * from storage and create a readable stream
     * from their data
     *
     * @param {Array<string>} brickIds
     * @param {callback} callback
     */
    this.createStreamFromBricks = (brickIds, callback) => {
        let brickIndex = 0;

        const readableStream = new stream.Readable({
            read(size) {
                if (brickIndex < brickIds.length) {
                    this.readBrickData(brickIndex++);
                }
            }
        });

        // Get a brick and push it into the stream
        readableStream.readBrickData = function (brickIndex) {
            const brickId = brickIds[brickIndex];
            getBrickAsBuffer(brickId, (err, data) => {
                if (err) {
                    this.destroy(err);
                    return;
                }

                this.push(data);

                if (brickIndex >= (brickIds.length - 1)) {
                    this.push(null);
                }
            });
        };

        callback(undefined, readableStream);
    }

    /**
     * Retrieve all the Bricks identified by `brickIds`
     * and store their data into a file
     *
     * @param {string} filePath
     * @param {Array<string>} brickIds
     * @param {callback} callback
     */
    this.createFileFromBricks = (filePath, brickIds, callback) => {
        const getBricksAsBufferRecursive = (index, callback) => {
            const brickId = brickIds[index];

            getBrickAsBuffer(brickId, (err, data) => {
                if (err) {
                    return callback(err);
                }

                this.fsAdapter.appendBlockToFile(filePath, data, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    ++index;

                    if (index < brickIds.length) {
                        return getBricksAsBufferRecursive(index, callback);
                    }

                    callback();
                });
            });
        };

        getBricksAsBufferRecursive(0, callback);
    }

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
            const brickIds = bricksList[setKey];

            const srcStream = createBricksReadableStream(brickIds);
            const dstStream = createBricksWritableStream(options.dstStorage, options.beforeCopyCallback);

            srcStream.on('error', (err) => {
                console.error(err);
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
     * @param {string} hash
     * @param {callback} callback
     */
    this.getBarMap = (hash, callback) => {
        if (hash && hasInCache(hash)) {
            const map = this.cache.get(hash);
            this.storageProvider.setBarMap(map);
            callback(undefined, map);
        }

        this.storageProvider.getBarMap(hash, (err, map) => {
            if (err) {
                return callback(err);
            }

            map = this.barMapConfiguratorCallback(map);

            if (hash) {
                storeInCache(hash, map);
            }

            this.storageProvider.setBarMap(map);
            callback(undefined, map);
        })
    }

    /**
     * @param {FolderBarMap} barMap
     * @param {callback} callback
     */
    this.putBarMap = (barMap, callback) => {
        this.storageProvider.putBarMap(barMap, callback);
    }
}

module.exports = Service;
