const Brick = require("./Brick");

function FileBarMap(header){
    header = header || {};
    let brickPositions = [];
    let position = 0;
    let index=0;
    //header este un map in care vom retine datele intr-un format json
    //vom avea key-ul care va fi filename-ul, si datele care va fi lista de hash-uri
    this.add = function (filePath, brick) {
        //hashList-ul va fi direct lista de hash-uri, pentru ca o putem face pe masura
        //ce ne ocupam de salvarea brick-urilor
        let lastPosition = 96;
        if(index>0)
            lastPosition = brickPositions[index-1];
        if (typeof header[filePath] === "undefined") {
            header[filePath] = [];
            brickPositions.push((lastPosition+brick.getSize()));
            header[filePath].push(index);
            index++;
        }
        else{
            //let tempL = header[filePath].length;
            //let tempSize = header[filePath][tempL-1];
            brickPositions.push((lastPosition+brick.getSize()));
            header[filePath].push(index);
            index++;
        }
    };

    this.setBarMapPositon = function(actualPosition){
        position = actualPosition;
    }

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
        let tempMap = {};
        tempMap.positions = header;
        tempMap.indexes = brickPositions;
        return new Brick(Buffer.from(JSON.stringify(tempMap)));
    };

    this.getFileList = function(){
        return Object.keys(header);
    }

    this.getListOfBrickPositions = function(){
        return brickPositions;
    }

    this.getPosition = function(index){
        if(index>brickPositions.length)
            return undefined;
        return brickPositions[index];
    }

    this.setListOfBrickPositions = function(list){
        brickPositions = list;
    }
}

module.exports = FileBarMap;