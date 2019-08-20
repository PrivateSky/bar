const Brick = require("./Brick");

function FolderBarMap(header){
    header = header || {};

    this.add = function (filePath, brick) {
        if (typeof header[filePath] === "undefined") {
            header[filePath] = [];
        }

        header[filePath].push(brick.getHash());
    };

    this.getHashList = function (filePath) {
        return header[filePath];
    };

    this.emptyList = function (filePath) {
        header[filePath] = [];
    };

    this.toBrick = function () {
        return new Brick(Buffer.from(JSON.stringify(header)));
    };

    this.getFileList = function () {
        return Object.keys(header);
    };

    this.setIsZip = function(){
        header['zlib'] = true;
    };

    this.isZip = function(){
        return header['zlib'];
    }

}

module.exports = FolderBarMap;