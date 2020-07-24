function FileBrickStorage(filePath) {
    const fsModuleName = "fs";
    const fs = require(fsModuleName);
    const BrickMap = require("./obsolete/FileBrickMap");
    const util = require("../utils/utilities");
    const Brick = require("./Brick");

    let isFirstBrick = true;
    let map;
    let mapOffset;

    this.setBrickMap = (brickMap) => {
        map = brickMap;
    };

    this.putBrick = (brick, callback) => {
        if (isFirstBrick) {
            isFirstBrick = false;
            const writeStream = fs.createWriteStream(filePath, {start: util.getBrickMapOffsetSize()});
            writeStream.on("error", (err) => {
                return callback(err);
            });

            writeStream.write(brick.getTransformedData(), callback);
        } else {
            fs.appendFile(filePath, brick.getTransformedData(), callback);
        }
    };

    this.getBrick = (brickId, callback) => {
        this.getBrickMap((err, brickMap) => {
            if (err) {
                return callback(err);
            }
            let brickOffsets = [];
            const fileList = brickMap.getFileList();
            fileList.forEach(file => {
                brickOffsets = brickOffsets.concat(brickMap.getHashList(file));
            });

            const brickIndex = brickOffsets.findIndex(el => {
                return el === brickId;
            });

            let nextBrickId = brickOffsets[brickIndex + 1];
            if (!nextBrickId) {
                nextBrickId = Number(mapOffset);
            }

            readBrick(brickId, nextBrickId, callback);
        });

    };

    this.deleteFile = (fileName, callback) => {
        this.getBrickMap((err, brickMap) => {
            if (err) {
                return callback(err);
            }

            brickMap.delete(fileName);
            this.putBrickMap(brickMap, callback);
        });
    };


    this.putBrickMap = (brickMap, callback) => {
        map = brickMap;
        readBrickMapOffset((err, offset) => {
            if(offset) {
                offset = Number(offset);
                fs.truncate(filePath, offset, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    __writeBrickMap(offset);
                });
            }else{
                fs.stat(filePath, (err, stats) => {
                    if (err) {
                        return callback(err);
                    }

                    const brickMapOffset = stats.size;

                    const bufferBrickMapOffset = Buffer.alloc(util.getBrickMapOffsetSize());
                    bufferBrickMapOffset.writeBigUInt64LE(BigInt(brickMapOffset));
                    mapOffset = brickMapOffset;
                    const offsetWriteStream = fs.createWriteStream(filePath, {flags: "r+", start: 0});

                    offsetWriteStream.on("error", (err) => {
                        return callback(err);
                    });

                    offsetWriteStream.write(bufferBrickMapOffset, (err) => {
                        if (err) {
                            return callback(err);
                        }

                        __writeBrickMap(brickMapOffset);
                    });
                });
            }
        });

        function __writeBrickMap(offset) {
            const mapWriteStream = fs.createWriteStream(filePath, {flags: "r+", start: offset});
            mapWriteStream.on("error", (err) => {
                return callback(err);
            });

            const mapBrick = brickMap.toBrick();
            mapBrick.setTransformParameters(brickMap.getTransformParameters());
            mapWriteStream.write(mapBrick.getTransformedData(), callback);
        }

    };

    this.getBrickMap = (mapDigest, callback) => {
        if (typeof mapDigest === "function") {
            callback = mapDigest;
        }

        if (map) {
            return callback(undefined, map);
        }

        readBrickMap((err, brickMap) => {
            if (err) {
                return callback(err);
            }

            map = brickMap;
            callback(undefined, brickMap);
        });
    };

    //------------------------------------------ Internal functions ---------------------------------------------------

    function readBrickMapOffset(callback) {
        const readStream = fs.createReadStream(filePath, {start: 0, end: util.getBrickMapOffsetSize() - 1});

        const buffer = Buffer.alloc(util.getBrickMapOffsetSize());
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

    function readBrickMap(callback) {
        readBrickMapOffset((err, brickMapOffset) => {
            if (err) {
                if (err.code === "ENOENT") {
                    return callback(undefined, new BrickMap());
                }

                return callback(err)
            }

            mapOffset = brickMapOffset;
            const readStream = fs.createReadStream(filePath, {start: Number(brickMapOffset)});
            let brickMapData = Buffer.alloc(0);

            readStream.on("data", (chunk) => {
                brickMapData = Buffer.concat([brickMapData, chunk]);
            });

            readStream.on("error", (err) => {
                return callback(err);
            });

            readStream.on("end", () => {
                const mapBrick = new Brick();
                mapBrick.setTransformedData(brickMapData);
                callback(undefined, new BrickMap(mapBrick));
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
    createFileBrickStorage(filePath) {
        return new FileBrickStorage(filePath);
    }
};
