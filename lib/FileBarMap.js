const Brick = require("./Brick");
const util = require("../utils/utilities");
const path = require('path');

function FileBarMap(header) {
    header = header || {};

    let brickOffset = util.getBarMapOffsetSize();
    let archiveConfig;
    let encryptionKey;

    this.add = (filePath, brick) => {
        filePath = filePath.split(path.sep).join(path.posix.sep);
        this.load();
        if (typeof header.files === "undefined") {
            header.files = [];
        }

        let fileObj = findFile(filePath);
        const brickObj = {
            checkSum: brick.getAdler32(),
            offset: brickOffset,
            hash: brick.getHash()
        };

        const encKey = brick.getTransformParameters() ? brick.getTransformParameters().key : undefined;
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

        brickOffset += brick.getTransformedSize();
    };

    this.getHashList = (filePath) => {
        this.load();
        const brickObjects = Object.values(findFile(filePath))[0];
        return brickObjects.map(brickObj => brickObj.offset);
    };

    this.getFileList = () => {
        this.load();
        return header.files.map(fileObj => Object.keys(fileObj)[0]);
    };

    this.getDictionaryObject = ()=>{
        let objectDict = {};
        for(let i = 0 ; i < header.files.length ; i++){
            let brickObjects = Object.values(header.files[i]);
            for(let j = 0 ; j < brickObjects[0].length; j++){
                if(typeof objectDict[brickObjects[0][j]['checkSum']] === 'undefined'){
                    objectDict[brickObjects[0][j]['checkSum']] = [];
                }
                objectDict[brickObjects[0][j]['checkSum']].push(brickObjects[0][j]['hash']);
            }
        }
        return objectDict;
    };

    this.getTransformParameters = (brickId) => {
        if (!brickId) {
            return encryptionKey ? {key: encryptionKey} : {};
        }

        this.load();
        let bricks = [];
        const files = this.getFileList();

        files.forEach(filePath => {
            const fileObj = findFile(filePath);
            bricks = bricks.concat(fileObj[filePath]);
        });

        const brickObj = bricks.find(brick => {
            return brick.offset === brickId;
        });

        const addTransformData = {};
        if (brickObj.key) {
            addTransformData.key = Buffer.from(brickObj.key);
        }

        return addTransformData;
    };

    this.toBrick = () => {
        this.load();
        const brick = new Brick(archiveConfig);
        brick.setTransformParameters({key: encryptionKey});
        brick.setRawData(Buffer.from(JSON.stringify(header)));
        return brick;
    };

    this.load = () => {
        if (header instanceof Brick) {
            header.setConfig(archiveConfig);
            if (encryptionKey) {
                header.setTransformParameters({key: encryptionKey});
            }
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
        header.files = header.files.filter(fileObj => {
            return Object.keys(fileObj)[0] !== filePath;
        });
    };

    //------------------------------------------ internal functions --------------------------------------------------

    function findFile(filePath) {
        return header.files.find(file => {
            return Object.keys(file)[0] === filePath;
        });
    }
}

module.exports = FileBarMap;