const fs = require("fs");
const path = require("path");
const BarMap = require("./FolderBarMap");
const Brick = require("./Brick");

function FolderBrickStorage(location) {

    this.putBrick = function (brick, callback) {
        const writeStream = fs.createWriteStream(path.join(location, brick.getHash()));
        writeStream.write(brick.getData(), (...args) => {
            writeStream.end();
            callback(...args);
        });
        //aceasta functie va primi un brick
        //si va apela o fucntie din BarWorker ce se va ocupa de scrierea datelor in fisier
    };


    this.getBrick = function (brickHash, callback) {
        fs.readFile(path.join(location, brickHash), (err, brickData) => {
            console.log(path.join(location,brickHash));
            callback(err, new Brick(brickData));
        });
    };

    this.deleteBrick = function (brickHash, callback) {
        fs.unlink(path.join(location, brickHash), callback);
    };

    this.putBarMap = function (barMap, callback) {
        const barMapBrick = barMap.toBrick();
        this.putBrick(barMapBrick, (err) => {
            if (err)
                return callback(err);
            callback(undefined, barMapBrick.getHash());
        });
    };

    this.getBarMap = function (mapDigest, callback) {
        if (typeof mapDigest === "function") {
            callback = mapDigest;
            mapDigest = undefined;
        }

        if (typeof mapDigest === "undefined") {
            return callback(undefined, new BarMap());
        }

        this.getBrick(mapDigest, (err, mapBrick) => {
            callback(err, new BarMap(JSON.parse(mapBrick.getData().toString())));
        });
    }
    //aceasta functie va primi id-ul unui brick
    //va cauta fisierul caruia ii corespunde id-ul
    //il va citi tot prin intermediul BarWorker, printr-o functie
    //il va trimite in callback, unde va fi mai departe, salvat
    //partea de citire va fi facuta prin intermediul functiei 'readFromFile' din BarWorker
}

module.exports = {
    createFolderBrickStorage: function (location) {
        return new FolderBrickStorage(location);
    }
};