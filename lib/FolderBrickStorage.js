const fs = require("fs");
const path = require("path");
const BarMap = require("./FolderBarMap");
const Brick = require("./Brick");

function FolderBrickStorage(location) {

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

    this.deleteBrick = (brickHash, callback) => {
        fs.unlink(path.join(location, brickHash), callback);
    };

    this.putBarMap = (barMap, callback) => {
        const barMapBrick = barMap.toBrick();
        this.putBrick(barMapBrick, (err) => {
            if (err)
                return callback(err);
            callback(undefined, barMapBrick.getHash());
        });
    };

    this.getBarMap = (mapDigest, callback) => {
        if (typeof mapDigest === "function") {
            callback = mapDigest;
            mapDigest = undefined;
        }

        if (typeof mapDigest === "undefined") {
            return callback(undefined, new BarMap());
        }

        this.getBrick(mapDigest, (err, mapBrick) => {
            callback(err, new BarMap(JSON.parse(mapBrick.getTransformedData().toString())));
        });
    }
}

module.exports = {
    createFolderBrickStorage: function (location) {
        return new FolderBrickStorage(location);
    }
};