const Brick = require("./Brick");

function FileBarMap(header){
    header = header || {};
    let brickPositions = [];
    let position;
    let index=0;
    this.add = function (filePath, brick) {
        if(index>0)
            position = brickPositions[index-1];
        else
            position = 64;
        if (typeof header[filePath] === "undefined") {
            header[filePath] = [];
            brickPositions.push((position+brick.getSize()));
            header[filePath].push(index);
            index++;
        }
        else{
            brickPositions.push((position+brick.getSize()));
            header[filePath].push(index);
            index++;
        }
    };

    this.setBarMapPositon = function(actualPosition){
        position = actualPosition;
    }

    this.getHashList = function (filePath) {
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
        if(typeof index === "undefined")
            return position;
        if(index>brickPositions.length)
            return undefined;
        return brickPositions[index];
    }

    this.setListOfBrickPositions = function(list){
        brickPositions = list;
    }
}

module.exports = FileBarMap;