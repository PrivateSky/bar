const fs = require("fs");
const path = require("path");
const BarMap = require("./FolderBarMap");
const Brick = require("./Brick");

function FolderBrickStorage(location) {

    let barMap;
    this.putBrick = function (brick, callback) {
        const writeStream = fs.createWriteStream(path.join(location, brick.getHash()));
        writeStream.write(brick.getData(), callback);
        //aceasta functie va primi un brick
        //si va apela o fucntie din BarWorker ce se va ocupa de scrierea datelor in fisier
    };

    this.getBrick = function (brickHash, callback) {
        fs.readFile(path.join(location, brickHash), (err, brickData) => {
            callback(err, new Brick(brickData));
        });
    };

    this.deleteBrick = function (brickHash, callback) {
        fs.unlink(path.join(location, brickHash), callback);
    };

    this.putBarMap = function(callback){
        let tempBrick = barMap.toBrick();
        this.putBrick(tempBrick,(err)=>{
            if(err)
                return callback(err);
            callback(undefined,tempBrick.getHash());
        });
    }

    this.getBarMap = function (mapDigest, callback) {
        if (typeof mapDigest === "function") {
            callback = mapDigest;
            mapDigest = undefined;
        }

        if (typeof mapDigest === "undefined") {
            barMap = new BarMap();
            return callback(undefined, barMap);
        }

        this.getBrick(mapDigest, (err, mapBrick) => {
            barMap = new BarMap(JSON.parse(mapBrick.getData().toString()));
            callback(err, barMap);
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