const BarMap = require("./FileBarMap");
const util = require("../utils/utilities");
const fs = require("fs");
const Brick = require("./Brick");
const AsyncDispatcher = require("../utils/AsyncDispatcher");

function FileBrickStorage(filePath) {

    let isFirstBrick = true;
    let map;
    let mapOffset;

    this.putBrick = (brick, callback) => {
        if (isFirstBrick) {
            isFirstBrick = false;
            const writeStream = fs.createWriteStream(filePath, {start: util.getBarMapOffsetSize()});
            writeStream.on("error", (err) => {
                return callback(err);
            });

            writeStream.write(brick.getTransformedData(), callback);
        } else {
            fs.appendFile(filePath, brick.getTransformedData(), callback);
        }
    };

    this.getBrick = (brickId, callback) => {
        let brickOffsets = [];
        const fileList = map.getFileList();
        fileList.forEach(file => {
            brickOffsets = brickOffsets.concat(map.getHashList(file));
        });

        const brickIndex = brickOffsets.findIndex(el => {
            return el === brickId;
        });

        let nextBrickId = brickOffsets[brickIndex + 1];
        if (!nextBrickId) {
            nextBrickId = Number(mapOffset);
        }

        readBrick(brickId, nextBrickId, callback);
    };

    this.deleteFile = (fileName, callback) => {
        let tempFilePath = filePath + ".tmp";
        fs.rename(filePath, tempFilePath, (err) => {
            if (err) {
                return callback(err);
            }

            const localBrickStorage = new FileBrickStorage(tempFilePath);
            isFirstBrick = true;
            localBrickStorage.getBarMap((err, barMap) => {
                if (err) {
                    return callback(err);
                }

                barMap.removeFile(fileName);

                const asyncDispatcher = new AsyncDispatcher(() => {
                    this.putBarMap(barMap, (err) => {
                        if (err) {
                            return callback(err);
                        }

                        fs.unlink(tempFilePath, callback);
                    });
                });

                barMap.getFileList().forEach(file => {
                    asyncDispatcher.dispatchEmpty(barMap.getHashList(file).length);
                    barMap.getHashList(file).forEach(brickId => {
                        localBrickStorage.getBrick(brickId, (err, brick) => {
                            if (err) {
                                return callback(err);
                            }

                            this.putBrick(brick, (err) => {
                                if (err) {
                                    return callback(err);
                                }

                                asyncDispatcher.markOneAsFinished();
                            });
                        });
                    });
                });
            });
        });
    };


    this.putBarMap = (barMap, callback) => {
        map = barMap;
        fs.stat(filePath, (err, stats) => {
            if (err) {
                return callback(err);
            }

            const barMapOffset = stats.size;
            const mapBrick = barMap.toBrick();
            mapBrick.setTransformParameters(barMap.getTransformParameters());
            const bufferBarMapOffset = Buffer.alloc(util.getBarMapOffsetSize());
            bufferBarMapOffset.writeBigUInt64LE(BigInt(barMapOffset));

            const offsetWriteStream = fs.createWriteStream(filePath, {flags: "r+", start: 0});

            offsetWriteStream.on("error", (err) => {
                return callback(err);
            });

            offsetWriteStream.write(bufferBarMapOffset, (err) => {
                if (err) {
                    return callback(err);
                }

                const mapWriteStream = fs.createWriteStream(filePath, {flags: "r+", start: barMapOffset});
                mapWriteStream.on("error", (err) => {
                    return callback(err);
                });

                mapWriteStream.write(mapBrick.getTransformedData(), callback);
            });
        });
    };

    this.getBarMap = (mapDigest, callback) => {
        if (typeof mapDigest === "function") {
            callback = mapDigest;
        }

        if (map) {
            return callback(undefined, map);
        }

        readBarMap((err, barMap) => {
            if (err) {
                return callback(err);
            }

            map = barMap;
            callback(undefined, barMap);
        });
    };

    //------------------------------------------ Internal functions ---------------------------------------------------

    function readBarMapOffset(callback) {
        const readStream = fs.createReadStream(filePath, {start: 0, end: util.getBarMapOffsetSize() - 1});

        const buffer = Buffer.alloc(util.getBarMapOffsetSize());
        let offsetBuffer = 0;

        readStream.on("data", (chunk) => {
            chunk.copy(buffer, offsetBuffer);
            offsetBuffer += chunk.length;
        });

        readStream.on("end", () => {
            callback(undefined, buffer.readBigUInt64LE());
        });

        readStream.on("error", (err) => {
            return callback(err);
        });
    }

    function readBarMap(callback) {
        readBarMapOffset((err, barMapOffset) => {
            if (err) {
                if (err.code === "ENOENT") {
                    return callback(undefined, new BarMap());
                }

                return callback(err)
            }

            mapOffset = barMapOffset;
            const readStream = fs.createReadStream(filePath, {start: Number(barMapOffset)});
            let barMapData = Buffer.alloc(0);

            readStream.on("data", (chunk) => {
                barMapData = Buffer.concat([barMapData, chunk]);
            });

            readStream.on("error", (err) => {
                return callback(err);
            });

            readStream.on("end", () => {
                const mapBrick = new Brick();
                mapBrick.setTransformedData(barMapData);
                callback(undefined, new BarMap(mapBrick));
            });
        });
    }

    function readBrick(brickOffsetStart, brickOffsetEnd, callback) {
        const readStream = fs.createReadStream(filePath, {start: brickOffsetStart, end: brickOffsetEnd - 1});
        let brickData = Buffer.alloc(0);

        readStream.on("data", (chunk) => {
            brickData = Buffer.concat([brickData, chunk]);
        });

        readStream.on("error", (err) => {
            return callback(err);
        });

        readStream.on("end", () => {
            const brick = new Brick();
            brick.setTransformedData(brickData);
            callback(undefined, brick);
        });
    }
}

module.exports = {
    createFileBrickStorage: function (filePath) {
        return new FileBrickStorage(filePath);
    }
};