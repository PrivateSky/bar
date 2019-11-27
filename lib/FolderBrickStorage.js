const fs = require("fs");
const path = require("path");
const BarMap = require("./FolderBarMap");
const Brick = require("./Brick");

function FolderBrickStorage(location) {
    let map;

    this.setBarMap = (barMap) => {
        map = barMap;
    };

    this.putBrick = (brick, callback) => {
        const writeStream = fs.createWriteStream(path.join(location, brick.getHash()));
        writeStream.write(brick.getTransformedData(), (...args) => {
            writeStream.end();
            callback(...args);
        });
    };

    this.getBrick = (brickHash, callback) => {
        fs.readFile(path.join(location, brickHash), (err, brickData) => {
            if (err) {
                return callback(err);
            }

            const brick = new Brick();
            brick.setTransformedData(brickData);
            callback(err, brick);
        });
    };

    this.deleteFile = (filePath, callback) => {
        this.getBarMap((err, barMap) => {
            if (err) {
                return callback(err);
            }

            fs.unlink(path.join(location, barMap.toBrick().getHash()), (err) => {
                if (err) {
                    return callback(err);
                }

                barMap.removeFile(filePath);
                this.putBarMap(barMap, callback);
            });
        });
    };

    this.putBarMap = (barMap, callback) => {
        map = barMap;
        const barMapBrick = barMap.toBrick();
        barMapBrick.setTransformParameters(barMap.getTransformParameters());
       
        let brickId = barMapBrick.getId();
        if (!brickId) {
            brickId = barMapBrick.getHash();
        }

        barMapBrick.setId(brickId);
        const writeStream = fs.createWriteStream(path.join(location, brickId));
        writeStream.write(barMapBrick.getTransformedData(), (err) => {
            writeStream.end();
            callback(err, barMapBrick.getSeed());
        });
    };

    this.getBarMap = (mapDigest, callback) => {
        if (typeof mapDigest === "function") {
            callback = mapDigest;
            mapDigest = undefined;
        }

        if (map) {
            return callback(undefined, map);
        }

        if (typeof mapDigest === "undefined") {
            return callback(undefined, new BarMap());
        }

        this.getBrick(mapDigest, (err, mapBrick) => {
            if (err) {
                return callback(err);
            }

            const barMap = new BarMap(mapBrick);
            map = barMap;
            callback(undefined, barMap);
        });
    }
}

module.exports = {
    createFolderBrickStorage(location) {
        return new FolderBrickStorage(location);
    }
};