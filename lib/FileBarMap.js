const Brick = require("./Brick");

function FileBarMap(header){
    header = header || {};
    brickDimensions = {};
    //header este un map in care vom retine datele intr-un format json
    //vom avea key-ul care va fi filename-ul, si datele care va fi lista de hash-uri
    this.add = function (filePath, brick) {
        //hashList-ul va fi direct lista de hash-uri, pentru ca o putem face pe masura
        //ce ne ocupam de salvarea brick-urilor
        if (typeof header[filePath] === "undefined") {
            header[filePath] = [];
            header[filePath].push(brick.getSize());
        }
        else{
            let tempL = header[filePath].length;
            let tempSize = header[filePath][tempL-1];
            header[filePath].push((tempSize + brick.getSize()));
        }
    };

    this.getHashList = function (filePath) {
        //avem nevoie de hash-uri ca sa putem obtine brick-urile unui fisier
        //un hash este de fapt denumirea unui brick
        //aceasta functie returneaza lista de hash-uri
        return header[filePath];
    };

    this.emptyList = function (filePath) {
        header[filePath] = [];
    };

    this.toBrick = function () {
        return new Brick(Buffer.from(JSON.stringify(header)));
    };
}

module.exports = FileBarMap;