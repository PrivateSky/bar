'use strict';


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
    const envTypes = require("overwrite-require").constants;
    const isStream = require("../../utils/isStream");
    const stream = require('stream');
    const utils = require("swarmutils");
    const crypto = require("opendsu").loadAPI("crypto");
    const HASHLINK_EMBEDDED_HINT_PREFIX = 'embedded/';

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
        throw new Error('$$.Buffer size is required');
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
                            return callback(createOpenDSUErrorWrapper(`Failed to get transformed data`, err));
                        }

                        self.putBrick(self.keySSI, brickData, (err, digest) => {
                            if (err) {
                                return callback(createOpenDSUErrorWrapper(`Failed to put brick`, err));
                            }

                            brick.getSummary((err, brickSummary) => {
                                if (err) {
                                    return callback(createOpenDSUErrorWrapper(`Failed to get bricks summary`, err));
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
     * @param {HashLinkSSI} hlSSI
     * @return {boolean}
     */
    const hashLinkHasEmbeddedHint = (hlSSI) => {
        const hlSSIHint = hlSSI.getHint();
        return (hlSSIHint && hlSSIHint.indexOf(HASHLINK_EMBEDDED_HINT_PREFIX) === 0)
    }

    /**
     * Extract an embedded Brick from an unencrypted Brick container
     * @param {HashLinkSSI} hlSSI
     * @param {object} brickMeta
     * @param {callback} callback
     */
    const getEmbeddedBrickAsBuffer = (hlSSI, brickMeta, callback) => {
        const hlSSIHint = hlSSI.getHint();
        const hintSegments = hlSSIHint.split('/').pop();
        let [offset, size, embeddedHlSSI] = hintSegments.split(',');

        offset = parseInt(offset, 10);
        size = parseInt(size, 10);

        if (isNaN(offset) || isNaN(size) || !embeddedHlSSI) {
            return callback(new Error(`Embedded hint is invalid. Expected offset,size,hlSSI and got: ${hintSegments}`));
        }

        const cacheKey = embeddedHlSSI;

        if (hasInCache(cacheKey)) {
            const data = this.cache.get(cacheKey);
            return callback(undefined, data);
        }

        const containerBrickMeta = Object.assign({}, brickMeta);
        // The container Brick is not encrypted
        delete containerBrickMeta.key;
        // The container Brick doesn't need the hint
        containerBrickMeta.hashLink = stripHintFromHashLinkSSI(hlSSI);

        // Get the container Brick data
        getBrickAsBuffer(containerBrickMeta, (err, data) => {
            if (err) {
                return callback(createOpenDSUErrorWrapper(`Failed to get bricks as buffer`, err));
            }

            const brickData = data.slice(offset, offset + size);
            return this.brickDataExtractorCallback(brickMeta, createBrick(brickData), (err, data) => {
                if (err) {
                    return callback(createOpenDSUErrorWrapper(`Failed to process brick data`, err));
                }

                storeInCache(cacheKey, data);
                return callback(undefined, data);
            });
        });
    }

    /**
     * Retrieves a Brick from storage and converts
     * it into a $$.Buffer
     *
     * @param {object} brickMeta
     * @param {callback} callback
     */
    const getBrickAsBuffer = (brickMeta, callback) => {
        const hlSSI = SSIKeys.parse(brickMeta.hashLink);

        if (hashLinkHasEmbeddedHint(hlSSI)) {
            return getEmbeddedBrickAsBuffer(hlSSI, brickMeta, callback);
        }

        let cacheKey = brickMeta.hashLink;
        if (hasInCache(cacheKey)) {
            const data = this.cache.get(cacheKey);
            return callback(undefined, data);
        }

        this.getBrick(hlSSI, (err, brickData) => {
            if (err) {
                return callback(createOpenDSUErrorWrapper(`Failed to get brick data`, err));
            }

            function checkBrickDataIntegrity(brickData, callback) {
                brickData = utils.convertToBuffer(brickData);
                crypto.hash(hlSSI, brickData, (err, _brickHash) => {
                    if (err) {
                        return callback(createOpenDSUErrorWrapper(`Failed to compute brick hash`, err));
                    }

                    const brickHash = hlSSI.getHash();

                    if (brickHash !== _brickHash) {
                        return callback(createOpenDSUErrorWrapper(`Got invalid data for brick ${brickHash}`, Error("Possible brick data corruption")));
                    }

                    callback();
                });
            }

            checkBrickDataIntegrity(brickData, (err) => {
                if (err) {
                    return callback(err);
                }

                this.brickDataExtractorCallback(brickMeta, createBrick(brickData), (err, data) => {
                    if (err) {
                        return callback(createOpenDSUErrorWrapper(`Failed to process brick data`, err));
                    }

                    if (!$$.Buffer.isBuffer(data) && (data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
                        data = utils.convertToBuffer(data);
                    }
                    storeInCache(cacheKey, data);
                    return callback(undefined, data);
                });
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
                return callback(createOpenDSUErrorWrapper(`Failed to get size for file <${filePath}>`, err));
            }

            let blocksCount = Math.floor(size / this.bufferSize);
            if (size % this.bufferSize > 0) {
                ++blocksCount;
            }

            callback(undefined, blocksCount);
        })
    };

    /**
     * Creates a Brick from a $$.Buffer
     * and saves it into brick storage
     *
     * @param {$$.Buffer} data
     * @param {boolean|callback} encrypt Defaults to `true`
     * @param {callback|undefined} callback
     */
    const convertDataBlockToBrick = (data, encrypt, callback) => {
        if (typeof encrypt === 'function') {
            callback = encrypt;
            encrypt = true;
        }
        const brick = this.brickFactoryFunction(encrypt);
        brick.setRawData(data);
        brick.getTransformedData((err, brickData) => {
            if (err) {
                return callback(createOpenDSUErrorWrapper(`Failed to get transformed data`, err));
            }

            this.putBrick(this.keySSI, brickData, (err, digest) => {
                if (err) {
                    return callback(createOpenDSUErrorWrapper(`Failed to put brick`, err));
                }

                brick.getSummary((err, brickSummary) => {
                    if (err) {
                        return callback(createOpenDSUErrorWrapper(`Failed to get bricks summary`, err));
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
     * @param {$$.Buffer} buffer
     * @param {number} blockIndex
     * @param {object} options
     * @param {number} options.bufferSize
     * @param {callback} callback
     */
    const convertBufferToBricks = (resultContainer, buffer, blockIndex, options, callback) => {
        const bufferSize = options.bufferSize;
        let blocksCount = Math.floor(buffer.length / bufferSize);
        if ((buffer.length % bufferSize) > 0) {
            ++blocksCount;
        }

        const encrypt = (typeof options.encrypt === 'undefined') ? true : options.encrypt;
        const blockData = buffer.slice(blockIndex * bufferSize, (blockIndex + 1) * bufferSize);

        convertDataBlockToBrick(blockData, encrypt, (err, result) => {
            if (err) {
                return callback(createOpenDSUErrorWrapper(`Failed to convert data block to brick`, err));
            }

            resultContainer.push(result);
            ++blockIndex;

            if (blockIndex < blocksCount) {
                return convertBufferToBricks(resultContainer, buffer, blockIndex, options, callback);
            }

            return callback();
        });
    };

    /**
     * Copy the contents of a file into brick storage
     *
     * @param {Array<object>} resultContainer
     * @param {string} filePath
     * @param {object} options
     * @param {number} options.blockIndex
     * @param {number} options.blocksCount
     * @param {boolean} options.encrypt
     * @param {callback} callback
     */
    const convertFileToBricks = (resultContainer, filePath, options, callback) => {
        if (typeof options === 'function') {
            callback = options;
            options = {
                encrypt: true
            }
        }

        if (typeof options.blockIndex === 'undefined') {
            options.blockIndex = 0;
        }

        let blockIndex = options.blockIndex;
        const blocksCount = options.blocksCount;
        const blockOffset = blockIndex * this.bufferSize;
        const blockEndOffset = (blockIndex + 1) * this.bufferSize - 1;
        this.fsAdapter.readBlockFromFile(filePath, blockOffset, blockEndOffset, (err, data) => {
            if (err) {
                return callback(createOpenDSUErrorWrapper(`Failed to read block from file <${filePath}>`, err));
            }

            convertDataBlockToBrick(data, options.encrypt, (err, result) => {
                if (err) {
                    return callback(createOpenDSUErrorWrapper(`Failed to convert data block to brick`, err));
                }

                resultContainer.push(result);
                ++blockIndex;

                if (blockIndex < blocksCount) {
                    options.blockIndex = blockIndex;
                    return convertFileToBricks(resultContainer, filePath, options, callback);
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
     * @param {$$.Buffer} buffer
     * @param {Array<Object>} filesList
     * @param {string} filesList[].filename
     * @param {Number} filesList[].offset
     * @param {Number} filesList[].size
     * @param {callback} callback
     */
    const storeCompactedFiles = (buffer, filesList, callback) => {
        return convertDataBlockToBrick(buffer, false, (err, brickMeta) => {
            if (err) {
                return callback(createOpenDSUErrorWrapper(`Failed to convert data block to brick`, err));
            }
            const files = {};
            const brickHLSSI = SSIKeys.parse(brickMeta.hashLink);

            for (const fileInfo of filesList) {
                const fileHLSSIHint = `${HASHLINK_EMBEDDED_HINT_PREFIX}${fileInfo.offset},${fileInfo.size},${fileInfo.brickSummary.hashLink}`;

                const fileHLSSI = SSIKeys.buildHashLinkSSI(
                    brickHLSSI.getDLDomain(),
                    brickHLSSI.getSpecificString(),
                    brickHLSSI.getControl(),
                    brickHLSSI.getVn(),
                    fileHLSSIHint
                );
                fileInfo.brickSummary.hashLink = fileHLSSI.getIdentifier();
                files[fileInfo.filename] = [fileInfo.brickSummary];
            }

            return callback(undefined, files);
        });
    }

    /**
     * Stores a $$.Buffer as Bricks into brick storage
     *
     * @param {$$.Buffer} buffer
     * @param {objects|callback} options
     * @param {number|callback} options.bufferSize
     * @param {callback|undefined} callback
     */
    this.ingestBuffer = (buffer, options, callback) => {
        if (typeof options === 'function') {
            callback = options;
            options = {
                encrypt: true
            }
        }

        if (!options.bufferSize) {
            options.bufferSize = this.bufferSize;
        }

        const bricksSummary = [];

        convertBufferToBricks(bricksSummary, buffer, 0, options, (err) => {
            if (err) {
                return callback(createOpenDSUErrorWrapper(`Failed to convert buffer to bricks`, err));
            }

            callback(undefined, bricksSummary);
        });
    };

    /**
     * Reads a stream of data into multiple Brick objects
     * stored in brick storage
     *
     * @param {stream.Readable} stream
     * @param {object|callback} options
     * @param {boolean} options.encrypt
     * @param {callback}
     */
    this.ingestStream = (stream, options, callback) => {
        if (typeof options === 'function') {
            callback = options;
            options = {
                encrypt: true
            };
        }

        let bricksSummary = [];
        let receivedData = [];
        stream.on('data', (chunk) => {
            if (typeof chunk === 'string') {
                chunk = $$.Buffer.from(chunk);
            }

            receivedData.push(chunk);
            let chunksCount = this.bufferSize / chunk.length;
            if (receivedData.length >= chunksCount) {
                const buffer = $$.Buffer.concat(receivedData.splice(0, chunksCount));
                stream.pause();
                const ingestBufferOptions = {
                    bufferSize: buffer.length,
                    encrypt: options.encrypt
                };
                this.ingestBuffer(buffer, ingestBufferOptions, (err, summary) => {
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
            return callback(createOpenDSUErrorWrapper(`Failed to ingest stream`, err));
        });
        stream.on('end', () => {
            const buffer = $$.Buffer.concat(receivedData);
            const ingestBufferOptions = {
                bufferSize: buffer.length,
                encrypt: options.encrypt
            };
            this.ingestBuffer(buffer, ingestBufferOptions, (err, summary) => {
                if (err) {
                    return callback(createOpenDSUErrorWrapper(`Failed to ingest buffer`, err));
                }

                bricksSummary = bricksSummary.concat(summary);
                callback(undefined, bricksSummary);
            });
        })
    };

    /**
     * @param {string|$$.Buffer|stream.Readable} data
     * @param {callback} callback
     */
    this.ingestData = (data, options, callback) => {
        if (typeof data === 'string') {
            data = $$.Buffer.from(data);
        }

        if (typeof options === 'function') {
            callback = options;
            options = {
                encrypt: true,
            };
        }

        if (!$$.Buffer.isBuffer(data) && !isStream.isReadable(data)) {
            return callback(Error(`Type of data is ${typeof data}. Expected $$.Buffer or Stream.Readable`));
        }

        if ($$.Buffer.isBuffer(data)) {
            return this.ingestBuffer(data, options, callback);
        }

        return this.ingestStream(data, options, callback);
    };

    /**
     * Copy the contents of a file into brick storage
     *
     * @param {string} filePath
     * @param {object|callback} options
     * @param {boolean} options.encrypt
     * @param {callback} callback
     */
    this.ingestFile = (filePath, options, callback) => {
        if (typeof options === 'function') {
            callback = options;
            options = {
                encrypt: true
            }
        }
        const bricksSummary = [];

        getFileBlocksCount(filePath, (err, blocksCount) => {
            if (err) {
                return callback(createOpenDSUErrorWrapper(`Failed get blocks for file <${filePath}>`, err));
            }

            const conversionOptions = Object.assign({}, options);
            conversionOptions.blocksCount = blocksCount;
            convertFileToBricks(bricksSummary, filePath, conversionOptions, (err, result) => {
                if (err) {
                    return callback(createOpenDSUErrorWrapper(`Failed to convert file <${filePath}> to bricks`, err));
                }

                callback(undefined, bricksSummary);
            });
        });
    };

    /**
     * Copy the contents of multiple files into brick storage
     *
     * @param {Array<string>} filePath
     * @param {object|callback} options
     * @param {boolean} options.encrypt
     * @param {callback} callback
     */
    this.ingestFiles = (files, options, callback) => {
        if (typeof options === 'function') {
            callback = options;
            options = {
                encrypt: true
            }
        }

        const bricksSummary = {};

        const ingestFilesRecursive = (files, callback) => {
            if (!files.length) {
                return callback(undefined, bricksSummary);
            }

            const filePath = files.pop();
            const filename = require("path").basename(filePath);

            this.ingestFile(filePath, options, (err, result) => {
                if (err) {
                    return callback(createOpenDSUErrorWrapper(`Failed to ingest file <${filePath}>`, err));
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
     * @param {object|callback} options
     * @param {boolean} options.encrypt
     * @param {callback} callback
     */
    this.createBrickFromFolder = (folderPath, options, callback) => {
        if (typeof options === 'function') {
            callback = options;
            options = {
                encrypt: true
            }
        }
        const filesIterator = this.fsAdapter.getFilesIterator(folderPath);
        const filesList = [];

        const brickBuffers = [];
        let currentOffset = 0;

        const iteratorHandler = (err, filename, dirname) => {
            if (err) {
                return callback(createOpenDSUErrorWrapper(`Failed to create brick from folder <${folderPath}>`, err));
            }

            if (typeof filename === 'undefined') {
                const buffer = $$.Buffer.concat(brickBuffers);
                return storeCompactedFiles(buffer, filesList, callback);
            }

            const filePath = require("path").join(dirname, filename);
            this.readFile(filePath, (err, fileBuffer) => {
                if (err) {
                    return callback(createOpenDSUErrorWrapper(`Failed to read file <${filePath}>`, err));
                }

                const fileBrick = this.brickFactoryFunction(options.encrypt);
                fileBrick.setRawData(fileBuffer);
                fileBrick.getTransformedData((err, brickData) => {
                    if (err) {
                        return callback(createOpenDSUErrorWrapper(`Failed to get transformed data`, err));
                    }

                    fileBrick.getSummary((err, brickSummary) => {
                        if (err) {
                            return callback(createOpenDSUErrorWrapper(`Failed to get brick summary`, err));
                        }

                        const size = brickData.length;
                        const offset = currentOffset;

                        currentOffset += size;
                        filesList.push({
                            filename,
                            offset,
                            size,
                            brickSummary
                        });
                        brickBuffers.push(brickData);

                        filesIterator.next(iteratorHandler);
                    })
                });
            });
        };

        filesIterator.next(iteratorHandler);

    };

    /**
     * Copy the contents of multiple files into a single brick
     *
     * @param {string} folderPath
     * @param {object|callback} options
     * @param {boolean} options.encrypt
     * @param {callback} callback
     */
    this.createBrickFromFiles = (files, options, callback) => {
        if (typeof options === 'function') {
            callback = options;
            options = {
                encrypt: true
            }
        }
        const filesList = [];

        const brickBuffers = [];
        let currentOffset = 0;

        const readFilesRecursive = (files, callback) => {
            if (!files.length) {
                const buffer = $$.Buffer.concat(brickBuffers);
                return storeCompactedFiles(buffer, filesList, callback);
            }

            const filePath = files.pop();
            const filename = require("path").basename(filePath);

            this.readFile(filePath, (err, fileBuffer) => {
                if (err) {
                    return callback(createOpenDSUErrorWrapper(`Failed to read file <${filePath}>`, err));
                }

                const fileBrick = this.brickFactoryFunction(options.encrypt);
                fileBrick.setRawData(fileBuffer);
                fileBrick.getTransformedData((err, brickData) => {
                    if (err) {
                        return callback(createOpenDSUErrorWrapper(`Failed to get transformed data`, err));
                    }

                    fileBrick.getSummary((err, brickSummary) => {
                        if (err) {
                            return callback(createOpenDSUErrorWrapper(`Failed to ingest file <${filePath}>`, err));
                        }

                        const size = brickData.length;
                        const offset = currentOffset;

                        currentOffset += size;
                        filesList.push({
                            filename,
                            offset,
                            size,
                            brickSummary
                        });
                        brickBuffers.push(brickData);

                        readFilesRecursive(files, callback);
                    });
                });
            });
        }

        readFilesRecursive(files, callback);
    };

    /**
     * Copy the contents of folder into brick storage
     *
     * @param {string} folderPath
     * @param {object|callback} options
     * @param {boolean} options.encrypt
     * @param {callback} callback
     */
    this.ingestFolder = (folderPath, options, callback) => {
        if (typeof options === 'function') {
            callback = options;
            options = {
                encrypt: true
            };
        }
        const bricksSummary = {};
        const filesIterator = this.fsAdapter.getFilesIterator(folderPath);

        const iteratorHandler = (err, filename, dirname) => {
            if (err) {
                return callback(createOpenDSUErrorWrapper(`Failed to ingest folder <${folderPath}>`, err));
            }

            if (typeof filename === 'undefined') {
                return callback(undefined, bricksSummary);
            }

            const filePath = require("path").join(dirname, filename);
            this.ingestFile(filePath, options, (err, result) => {
                if (err) {
                    return callback(createOpenDSUErrorWrapper(`Failed to ingest file <${filePath}>`, err));
                }

                bricksSummary[filename] = result;
                filesIterator.next(iteratorHandler);
            });
        };

        filesIterator.next(iteratorHandler);
    };

    /**
     * Retrieve all the Bricks identified by `bricksMeta`
     * from storage and create a $$.Buffer using their data
     *
     * @param {Array<object>} bricksMeta
     * @param {callback} callback
     */
    this.createBufferFromBricks = (bricksMeta, callback) => {
        const buffers = [];

        const getBricksAsBufferRecursive = (index, callback) => {
            const brickMeta = bricksMeta[index];

            getBrickAsBuffer(brickMeta, (err, data) => {
                if (err) {
                    return callback(createOpenDSUErrorWrapper(`Failed to get bricks as buffer`, err));
                }

                buffers.push(data);
                ++index;

                if (index < bricksMeta.length) {
                    return getBricksAsBufferRecursive(index, callback);
                }

                const buffer = $$.Buffer.concat(buffers);
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
                    return callback(createOpenDSUErrorWrapper(`Failed to get bricks as buffer`, err));
                }

                this.fsAdapter.appendBlockToFile(filePath, data, (err) => {
                    if (err) {
                        return callback(createOpenDSUErrorWrapper(`Failed to append block to file <${filePath}>`, err));
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
                callback(createOpenDSUErrorWrapper(`Failed to copy bricks`, err));
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
                return callback(createOpenDSUErrorWrapper(`Failed to copy bricks recursive`, err));

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
                return callback(createOpenDSUErrorWrapper(`Failed to get size for file <${filePath}>`, err));
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
