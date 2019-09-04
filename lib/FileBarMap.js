const Brick = require("./Brick");
const util = require("../utils/utilities");

function FileBarMap(header) {
    header = header || {};

    let brickOffset = util.getBarMapOffsetSize();

    this.add = function (filePath, brick) {
        if (typeof header.files === "undefined") {
            header.files = [];
        }

        let fileObj = findFile(filePath);

        if (typeof fileObj === "undefined") {
            fileObj = {};
            fileObj[filePath] = [brickOffset];
            header.files.push(fileObj);
        }else{
            fileObj[filePath].push(brickOffset);
        }

        brickOffset += brick.getSize();
    };

    this.getHashList = function (filePath) {
        return Object.values(findFile(filePath))[0];
    };

    this.getFileList = function () {
        return header.files.map(fileObj => Object.keys(fileObj)[0]);
    };

    this.toBrick = function () {
        return new Brick(Buffer.from(JSON.stringify(header)));
    };

    //------------------------------------------ internal functions --------------------------------------------------

    function findFile(filePath) {
        return header.files.find(file => {
            return Object.keys(file)[0] === filePath;
        });
    }
}

module.exports = FileBarMap;