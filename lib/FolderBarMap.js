const Brick = require("./Brick");

function FolderBarMap(header) {
    header = header || {};

    this.add = function (filePath, brick) {
        if (typeof header[filePath] === "undefined") {
            header[filePath] = [];
        }

        const brickObj = {
            hash: brick.getHash()
        };

        const encKey = brick.getEncryptionKey();
        if (encKey) {
            brickObj.key = encKey;
        }
        header[filePath].push(brickObj);
    };

    this.getHashList = function (filePath) {
        return header[filePath].map(brickObj => brickObj.hash);
    };

    this.emptyList = function (filePath) {
        header[filePath] = [];
    };


    this.toBrick = function (config) {
        const brick = new Brick(config);
        brick.setTransformedData(Buffer.from(JSON.stringify(header)));
        return brick;
    };

    this.getFileList = function () {
        return Object.keys(header);
    };

    this.getEncryptionKey = function (brickId) {
        let bricks = [];
        const files = this.getFileList();
        files.forEach(file => {
            bricks = bricks.concat(header[file]);
        });

        const brickObj = bricks.find(brick => {
            return brick.hash === brickId;
        });

        return brickObj.key;
    }
}

module.exports = FolderBarMap;