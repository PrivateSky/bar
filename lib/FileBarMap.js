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
        const encKey = brick.getEncryptionKey();
        const brickObj = {
            offset: brickOffset
        };
        if (encKey) {
            brickObj.key = encKey;
        }

        if (typeof fileObj === "undefined") {
            fileObj = {};
            fileObj[filePath] = [brickObj];
            header.files.push(fileObj);
        } else {


            fileObj[filePath].push(brickObj);
        }

        brickOffset += brick.getRawSize();
    };

    this.getHashList = function (filePath) {
        const brickObjects = Object.values(findFile(filePath))[0];
        return brickObjects.map(brickObj => brickObj.offset);
    };

    this.getFileList = function () {
        return header.files.map(fileObj => Object.keys(fileObj)[0]);
    };

    this.getEncryptionKey = function (brickId) {
        let bricks = [];
        const files = this.getFileList();
        files.forEach(file => {
            bricks = bricks.concat(header.files[file]);
        });

        const brickObj = bricks.find(brick => {
            return brick.offset = brickId;
        });

        return brickObj.key;
    };

    this.toBrick = function (config) {
        const brick = new Brick(config);
        brick.setTransformedData(Buffer.from(JSON.stringify(header)));
        return brick;
    };

    //------------------------------------------ internal functions --------------------------------------------------

    function findFile(filePath) {
        return header.files.find(file => {
            return Object.keys(file)[0] === filePath;
        });
    }
}

module.exports = FileBarMap;