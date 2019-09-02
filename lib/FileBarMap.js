const Brick = require("./Brick");
const util = require("../utils/utilities");

function FileBarMap(header) {
    header = header || {};

    let brickOffset = util.getBarMapOffsetSize();

    this.add = function (filePath, brick) {
        if (typeof header.files === "undefined") {
            header.files = {};
        }

        if (typeof header.files[filePath] === "undefined") {
            header.files[filePath] = [];
        }

        header.files[filePath].push(brickOffset + ":" + brick.getSize());
        brickOffset += brick.getSize();
    };

    this.getHashList = function (filePath) {
        return header.files[filePath];
    };

    this.getFileList = function () {
        return Object.keys(header.files);
    };

    this.toBrick = function () {
        return new Brick(Buffer.from(JSON.stringify(header)));
    };
}

module.exports = FileBarMap;