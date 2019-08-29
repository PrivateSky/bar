const BarMap = require("./FileBarMap");
const util = require("../utils/utilities");
const fs = require("fs");
const Brick = require("./Brick");
const AsyncDispatcher = require("../utils/AsyncDispatcher");

function FileBrickStorage(filePath) {

    let isFirstBrick = true;
    let map;

    this.putBrick = function (brick, callback) {
        if (isFirstBrick) {
            const writeStream = fs.createWriteStream(filePath, {start: util.getBarMapOffsetSize()});
            writeStream.on("error", (err) => {
                return callback(err);
            });

            writeStream.write(brick.getData(), (err) => {
                if (err) {
                    return callback(err);
                }

                isFirstBrick = false;
                callback();
            });
        }else {
            fs.appendFile(filePath, brick.getSize(), callback);
        }
    };

    this.getBrick = function (brickHash, callback) {
        if (typeof map === "undefined") {
            return callback(new Error("File bar map is undefined"));
        }

        const brickOffset = map.getBrickOffset(brickHash);
        let bricksOffsets = map.getBricksOffsets();
        bricksOffsets.sort();
        const brickIndex = bricksOffsets.findIndex((el) => {
            return el === brickOffset;
        });

        let nextBrickOffset = bricksOffsets[brickIndex + 1];

        if (typeof nextBrickOffset === "undefined") {
            readBarMapOffset((err, mapOffset) => {
                if (err) {
                    return callback(err);
                }

                readBrick(brickOffset, mapOffset - brickOffset, callback);
            });
        }else{
            readBrick(brickOffset, nextBrickOffset - brickOffset, callback);
        }
    };

    this.putBarMap = function (barMap, callback) {
        fs.stat(filePath, (err, stats) => {
            if (err) {
                return callback(err);
            }

            const barMapOffset = stats.size;
            const mapBrick = barMap.toBrick();

            const asyncDispatcher = new AsyncDispatcher(() => {
                callback();
            });

            asyncDispatcher.dispatchEmpty(2);
            const offsetWriteStream = fs.createWriteStream(filePath, {flags: "r+", start: 0});
            const mapWriteStream = fs.createWriteStream(filePath, {flags: "r+", start: barMapOffset});

            offsetWriteStream.on("error", (err) => {
                return callback(err);
            });

            mapWriteStream.on("error", (err) => {
                return callback(err);
            });

            offsetWriteStream.write(Buffer.from(barMapOffset.toString()), (err) => {
                if (err) {
                    return callback(err);
                }

                asyncDispatcher.markOneAsFinished();
            });

            mapWriteStream.write(mapBrick.getData(), (err) => {
                if (err) {
                    return callback(err);
                }

                asyncDispatcher.markOneAsFinished();
            });
        });
    };

    this.getBarMap = function (mapDigest, callback) {
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
        const readStream = fs.createReadStream(filePath, {start: 0, end: util.getBarMapOffsetSize()});

        let offset = '';

        readStream.on("data", (chunk) => {
            offset += chunk.toString();
        });

        readStream.on("error", (err) => {
            return callback(err);
        });

        readStream.on("end", () => {
            callback(undefined, parseInt(offset));
        });
    }

    function readBarMap(callback) {
        readBarMapOffset((err, barMapOffset) => {
            if(err) {
                if (err.code === "ENOENT") {
                    return callback(undefined, new BarMap());
                }else {
                    return callback(err);
                }
            }

            const readStream = fs.createReadStream(filePath, {start: barMapOffset});
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

    function readBrick(brickOffset, brickSize, callback) {
        const readStream = fs.createReadStream(filePath, {start: brickOffset, end: brickOffset + brickSize});
        let brickData = '';

        readStream.on("data", (chunk) => {
            brickData += chunk.toString();
        });

        readStream.on("end", () => {
            callback(undefined, new Brick(Buffer.from(brickData)));
        });
    }
}

module.exports = {
    createFolderBrickStorage: function (filePath) {
        return new FileBrickStorage(filePath);
    }
};