const BrickMap = require("./BrickMap");
const Brick = require("./Brick");

function FolderBrickStorage(location) {
    const fs = require("fs");
    const path = require("path");
    let map;

    this.setBrickMap = (brickMap) => {
        map = brickMap;
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
        this.getBrickMap((err, brickMap) => {
            if (err) {
                return callback(err);
            }

            fs.unlink(path.join(location, brickMap.toBrick().getHash()), (err) => {
                if (err) {
                    return callback(err);
                }

                brickMap.delete(filePath);
                this.putBrickMap(brickMap, callback);
            });
        });
    };

    this.putBrickMap = (brickMap, callback) => {
        map = brickMap;
        const brickMapBrick = brickMap.toBrick();
        brickMapBrick.setTransformParameters(brickMap.getTransformParameters());
       
        let brickId = brickMapBrick.getKey();
        if (!brickId) {
            brickId = brickMapBrick.getHash();
        }

        brickMapBrick.setKey(brickId);
        const writeStream = fs.createWriteStream(path.join(location, brickId));
        writeStream.write(brickMapBrick.getTransformedData(), (err) => {
            writeStream.end();
            callback(err, brickMapBrick.getSeed());
        });
    };

    this.getBrickMap = (mapDigest, callback) => {
        if (typeof mapDigest === "function") {
            callback = mapDigest;
            mapDigest = undefined;
        }

        if (map) {
            return callback(undefined, map);
        }

        if (typeof mapDigest === "undefined") {
            return callback(undefined, new BrickMap());
        }

        this.getBrick(mapDigest, (err, mapBrick) => {
            if (err) {
                return callback(err);
            }

            const brickMap = new BrickMap(mapBrick);
            map = brickMap;
            callback(undefined, brickMap);
        });
    }
}

module.exports = {
    createFolderBrickStorage(location) {
        return new FolderBrickStorage(location);
    }
};
