const BarMap = require("./FileBarMap");
const util = require("../utils/utilities");
const fs = require("fs");
const Brick = require("./Brick");

function FileBrickStorage(filePath) {

    let isFirstBrick = true;
    let map;
    let mapOffset;

    this.putBrick = function (brick, callback) {
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

    this.getBrick = function (brickId, callback) {
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

    this.putBarMap = function (barMap, callback) {
        fs.stat(filePath, (err, stats) => {
            if (err) {
                return callback(err);
            }

            const barMapOffset = stats.size;
            const mapBrick = barMap.toBrick();
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

    this.getBarMap = function (mapDigest, callback) {
        if (typeof mapDigest === "function") {
            callback = mapDigest;
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
            let barMapData = '';

            readStream.on("data", (chunk) => {
                barMapData += chunk.toString();
            });

            readStream.on("error", (err) => {
                return callback(err);
            });

            readStream.on("end", () => {
                callback(undefined, new BarMap(JSON.parse(barMapData)));
            });
        });
    }

    function readBrick(brickOffsetStart, brickOffsetEnd, callback) {
        const readStream = fs.createReadStream(filePath, {start: brickOffsetStart, end: brickOffsetEnd - 1});
        let brickData = '';

        readStream.on("data", (chunk) => {
            brickData += chunk.toString();
        });

        readStream.on("error", (err) => {
            return callback(err);
        });

        readStream.on("end", () => {
            const brick = new Brick();
            brick.setRawData(Buffer.from(brickData));
            callback(undefined, brick, brickOffsetStart);
        });
    }
}

module.exports = {
    createFileBrickStorage: function (filePath) {
        return new FileBrickStorage(filePath);
    }
};