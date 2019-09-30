const Brick = require("./Brick");

function FolderBarMap(header) {
    header = header || {};

    let archiveConfig;
    let encryptionKey;

    this.add = (filePath, brick) => {
        this.load();
        if (typeof header[filePath] === "undefined") {
            header[filePath] = [];
        }

        const brickObj = {
            hash: brick.getHash()
        };

        const encKey = brick.getTransformParameters() ? brick.getTransformParameters().key : undefined;
        if (encKey) {
            brickObj.key = encKey;
        }
        header[filePath].push(brickObj);
    };

    this.getHashList = (filePath) => {
        this.load();
        return header[filePath].map(brickObj => brickObj.hash);
    };

    this.emptyList = (filePath) => {
        header[filePath] = [];
    };


    this.toBrick = () => {
        this.load();
        const brick = new Brick(archiveConfig);
        brick.setTransformParameters({key: encryptionKey});
        brick.setRawData(Buffer.from(JSON.stringify(header)));
        return brick;
    };

    this.getFileList = () => {
        this.load();
        return Object.keys(header);
    };

    this.getTransformParameters = (brickId) => {
        this.load();
        if (!brickId) {
            return {key: encryptionKey};
        }
        let bricks = [];
        const files = this.getFileList();
        files.forEach(file => {
            bricks = bricks.concat(header[file]);
        });

        const brickObj = bricks.find(brick => {
            return brick.hash === brickId;
        });

        const addTransformData = {};
        addTransformData.key = brickObj.key ? Buffer.from(brickObj.key) : brickObj.key;
        return addTransformData;
    };

    this.load = () => {
        if (header instanceof Brick) {
            header.setConfig(archiveConfig);
            header.setTransformParameters({key: encryptionKey});
            header = JSON.parse(header.getRawData().toString());
        }
    };

    this.setConfig = (config) => {
        archiveConfig = config;
    };

    this.getConfig = () => {
        return archiveConfig;
    };

    this.setEncryptionKey = (encKey) => {
        encryptionKey = encKey;
    };

    this.removeFile = (filePath) => {
        this.load();
        delete header[filePath];
    };
}

module.exports = FolderBarMap;