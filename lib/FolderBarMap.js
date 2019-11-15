const Brick = require("./Brick");
const path = require('path');

function FolderBarMap(header) {
    header = header || {};

    let archiveConfig;
    let encryptionKey;

    this.add = (filePath, brick) => {
        filePath = filePath.split(path.sep).join(path.posix.sep);
        this.load();
        if (typeof header[filePath] === "undefined") {
            header[filePath] = [];
        }

        const brickObj = {
            checkSum: brick.getAdler32(),
            hash: brick.getHash()
        };

        const encKey = brick.getTransformParameters() ? brick.getTransformParameters().key : undefined;
        if (encKey) {
            brickObj.key = encKey;
        }
        header[filePath].push(brickObj);
    };

    this.isInHeader = (filePath) => {
        return header[filePath] !== undefined;
    };

    this.removeBrick = (filePath, brickHash) => {
        let indexToRemove = header[filePath].findIndex(brickObj => brickObj.hash === brickHash);
        header[filePath].splice(indexToRemove, 1);
    };

    this.getDictionaryObject = () => {
        let objectDict = {};
        Object.keys(header).forEach((fileName) => {
            let brickObjects = header[fileName];
            for (let j = 0; j < brickObjects.length; j++) {
                if (typeof objectDict[brickObjects[j]['checkSum']] === 'undefined') {
                    objectDict[brickObjects[j]['checkSum']] = [];
                }
                objectDict[brickObjects[j]['checkSum']].push(brickObjects[j]['hash']);
            }
        });
        return objectDict;
    };

    this.getHashList = (filePath) => {
        this.load();
        return header[filePath].map(brickObj => brickObj.hash);
    };

    this.getCheckSumList = (filePath) => {
        this.load();
        return header[filePath].map(brickObj => brickObj.checkSum);
    };

    this.emptyList = (filePath) => {
        header[filePath] = [];
    };


    this.toBrick = () => {
        this.load();
        const brick = new Brick(archiveConfig);
        if (encryptionKey) {
            brick.setTransformParameters({key: encryptionKey});
        }
        brick.setRawData(Buffer.from(JSON.stringify(header)));
        return brick;
    };


    this.getFileList = (folderBarPath) => {
        this.load();
        if (!folderBarPath) {
            return Object.keys(header);
        }
        return Object.keys(header).filter(fileName => fileName.includes(folderBarPath));
    };

    this.getTransformParameters = (brickId) => {
        this.load();
        if (!brickId) {
            return encryptionKey ? {key: encryptionKey} : undefined;
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
        if (brickObj.key) {
            addTransformData.key = Buffer.from(brickObj.key);
        }

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