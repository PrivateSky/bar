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

        if (typeof header.bricks === "undefined") {
            header.bricks = {};
        }

        const brickHash = brick.getHash();

        header.files[filePath].push(brickHash);
        header.bricks[brickHash] = brickOffset;
        brickOffset += brick.getSize();
    };

    this.getFileBricksOffsets = function (filePath) {
        const offsets = [];
        header.files[filePath].forEach(brickHash => {
            offsets.push(header.bricks[brickHash]);
        });

        return offsets;
    };

    this.getBricksOffsets = function () {
        return Object.values(header.bricks);
    };

    this.getBrickOffset = function (brickHash) {
        return header.bricks[brickHash];
    };

    this.getHashList = function (filePath) {
        return header.files[filePath];
    };

    this.getFileList = function () {
        return Object.keys(header.files);
    };

    this.getBrickHashes = function () {
        return Object.keys(header.bricks);
    };

    this.toBrick = function () {
        return new Brick(Buffer.from(JSON.stringify(header)));

    };
}

module.exports = FileBarMap;