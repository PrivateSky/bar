const Brick = require("./Brick");
const util = require("../utils/utilities");

function FileBarMap(header) {
    header = header || {};

    let brickOffset = util.getBarMapOffsetSize();
    let archiveConfig;
    let encryptionKey;

    this.add = (filePath, brick) => {
        this.load();
        if (typeof header.files === "undefined") {
            header.files = [];
        }

        let fileObj = findFile(filePath);
        const brickObj = {
            offset: brickOffset
        };

        const transformParameters = brick.getTransformParameters();
        if (transformParameters) {
            brickObj.key = transformParameters.key;
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

    this.getTransformParameters = (brickId) => {
        if (!brickId) {
            return {key: encryptionKey};
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
        addTransformData.key = brickObj.key ? Buffer.from(brickObj.key) : brickObj.key;
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
        const fileIndex = header.files.findIndex(file => {
            return Object.keys(file)[0] === filePath;
        });

        const fileToBeRemoved = header.files[fileIndex][filePath];

        let fileSize = Object.values(header.files[fileIndex + 1])[0][0].offset - fileToBeRemoved[0].offset;

        for (let i = fileIndex + 1; i < header.files.length; i++) {
            const fileName = Object.keys(header.files[i])[0];
            header.files[i][fileName].forEach(brickObj => {
                brickObj.offset -= fileSize;
            });
        }

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