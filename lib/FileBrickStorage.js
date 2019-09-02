const BarMap = require("./FileBarMap");
const util = require("../utils/utilities");
const fs = require("fs");
const Brick = require("./Brick");

function FileBrickStorage(filePath) {

    let isFirstBrick = true;
    let map;

    this.putBrick = function (brick, callback) {
        if (isFirstBrick) {
            isFirstBrick = false;
            const writeStream = fs.createWriteStream(filePath, {start: util.getBarMapOffsetSize()});
            writeStream.on("error", (err) => {
                return callback(err);
            });

            writeStream.write(brick.getData(), callback);
        } else {
            fs.appendFile(filePath, brick.getData(), callback);
        }
    };

    this.getBrick = function (brickId, callback) {
        const splitBrickId = brickId.split(":");
        const brickOffset = parseInt(splitBrickId[0]);
        const brickSize = parseInt(splitBrickId[1]);

        readBrick(brickOffset, brickOffset + brickSize, callback);
    };

    this.putBarMap = function (barMap, callback) {
        fs.stat(filePath, (err, stats) => {
            if (err) {
                return callback(err);
            }

            const barMapOffset = stats.size;
            const mapBrick = barMap.toBrick();


            const offsetWriteStream = fs.createWriteStream(filePath, {flags: "r+", start: 0});


            offsetWriteStream.on("error", (err) => {
                return callback(err);
            });

            offsetWriteStream.write(Buffer.from(barMapOffset.toString()), (err) => {
                if (err) {
                    return callback(err);
                }

                const mapWriteStream = fs.createWriteStream(filePath, {flags: "r+", start: barMapOffset});
                mapWriteStream.on("error", (err) => {
                    return callback(err);
                });
                mapWriteStream.write(mapBrick.getData(), callback);
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
        const readStream = fs.createReadStream(filePath, {start: 0, end: util.getBarMapOffsetSize() - 1});

        let offset = '';

        readStream.on("data", (chunk) => {
            offset += chunk.toString();
        });

        readStream.on("end", () => {
            callback(undefined, parseInt(offset));
        });

        readStream.on("error", (err) => {
            return callback(err, offset);
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

    function readBrick(brickOffsetStart, brickOffsetEnd, callback) {
        const readStream = fs.createReadStream(filePath, {start: brickOffsetStart, end: brickOffsetEnd - 1});
        let brickData = '';

        readStream.on("data", (chunk) => {
            brickData += chunk.toString();
        });

        readStream.on("error", (err) => {
            console.log("error", err);
            return callback(err);
        });

        readStream.on("end", () => {
            callback(undefined, new Brick(Buffer.from(brickData)), brickOffsetStart);
        });
    }
}

module.exports = {
    createFileBrickStorage: function (filePath) {
        return new FileBrickStorage(filePath);
    }
};