const fs = require("fs");
const path = require("path");

function FolderBrickStorage(location){

    this.putBrick = function (brick, callback) {
        const writeStream = fs.createWriteStream(path.join(location, brick.getHash()));
        writeStream.write(brick.getData(), callback);
        //aceasta functie va primi un brick
        //si va apela o fucntie din BarWorker ce se va ocupa de scrierea datelor in fisier
    };

    this.getBrick = function(brickHash, callback){
        fs.readFile(path.join(location, brickHash), (err, brickData) => {
            callback(err, brickData);
        });
    }

    this.deleteBrick = function(brickHash,callback){
        fs.unlink(path.join(location,brickHash),(err)=>{
            return callback(err);
        });
        callback();
    }

    this.getBarMap = function(hashDigest,callback){
        fs.readFile(path.join(location,hashDigest),(err,brickData)=>{
            if(err)
                callback(undefined,undefined);
            else
                callback(err,brickData);
        });
    }
        //aceasta functie va primi id-ul unui brick
        //va cauta fisierul caruia ii corespunde id-ul
        //il va citi tot prin intermediul BarWorker, printr-o functie
        //il va trimite in callback, unde va fi mai departe, salvat
        //partea de citire va fi facuta prin intermediul functiei 'readFromFile' din BarWorker
}

module.exports = FolderBrickStorage;