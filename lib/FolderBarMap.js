const Brick = require("./Brick");
const pathModule = "path";
const path = require(pathModule);

function FolderBarMap(header) {
    header = header || {};

    let archiveConfig;
    let encryptionKey;

    this.add = (filePath, brick) => {
        filePath = filePath.split(path.sep).join("/");
        this.load();
        const splitPath = filePath.split("/");
        if (splitPath.length === 0) {
            throw Error("No filepath specified");
        }

        __addFileRecursively(header, splitPath, brick);

        function __addFileRecursively(barMapObj, splitPath, brick) {
            const fileName = splitPath.shift();
            if (!barMapObj[fileName]) {
                let obj = {};
                if (splitPath.length === 0) {
                    const brickObj = {
                        checkSum: brick.getAdler32(),
                        hash: brick.getHash()
                    };

                    const encKey = brick.getTransformParameters() ? brick.getTransformParameters().key : undefined;
                    if (encKey) {
                        brickObj.key = encKey;
                    }


                    if (!barMapObj[fileName]) {
                        barMapObj[fileName] = [];
                    }

                    barMapObj[fileName].push(brickObj);
                } else {
                    barMapObj[fileName] = {};
                    __addFileRecursively(barMapObj[fileName], splitPath, brick);
                }
            } else {
                __addFileRecursively(barMapObj[fileName], splitPath, brick);
            }

        }
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
        const splitPath = filePath.split("/");
        if (splitPath.length === 0) {
            throw Error("No path was provided.");
        }

        return __getHashListRecursively(header, splitPath);
        function __getHashListRecursively(barMapObj, splitPath) {
            const fileName = splitPath.shift();
            if (barMapObj[fileName]) {
                if (splitPath.length === 0) {
                    return barMapObj[fileName].map(brickObj => brickObj.hash);
                } else {
                    return __getHashListRecursively(barMapObj[fileName], splitPath);
                }
            } else {
                throw Error("Invalid path");
            }
        }
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
        if (!folderBarPath || folderBarPath === "" || folderBarPath === "/") {
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
        } else {
            if (Buffer.isBuffer(header)) {
                header = header.toString();
            }

            if (typeof header === "string") {
                header = JSON.parse(header);
            }
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