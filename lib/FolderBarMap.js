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
            let fileName = splitPath.shift();
            if (fileName === "") {
                fileName = splitPath.shift();
            }
            if (!barMapObj[fileName]) {
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
            let folderName = splitPath.shift();
            if (folderName === "") {
                folderName = splitPath.shift();
            }
            if (barMapObj[folderName]) {
                if (splitPath.length === 0) {
                    return barMapObj[folderName].map(brickObj => brickObj.hash);
                } else {
                    return __getHashListRecursively(barMapObj[folderName], splitPath);
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
        this.load();
        const splitPath = filePath.split("/");
        __emptyListRecursively(header, splitPath);

        function __emptyListRecursively(folderObj, splitPath) {
            let folderName = splitPath.shift();
            if (folderName === "") {
                folderName = splitPath.shift();
            }

            if (folderObj[folderName]) {
                if (splitPath.length === 0) {
                    if (Array.isArray(folderObj[folderName])) {
                        folderObj[folderName] = []
                    } else {
                        throw Error("Invalid path");
                    }
                } else {
                    __emptyListRecursively(folderObj[folderName], splitPath);
                }
            } else {
                throw Error("Invalid path");
            }
        }
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
        let files = [];

        if (!folderBarPath || folderBarPath === "" || folderBarPath === "/") {
            __getAllFilesRecursively(header, "");
            return files;
        } else {
            // folderBarPath = folderBarPath.split(path.sep).join("/");
            const splitFolderBarPath = folderBarPath.split("/");
            __getFileListRecursively(header, splitFolderBarPath);
            return files.map(file => folderBarPath + "/" + file);
        }

        function __getFileListRecursively(folderObj, splitFolderBarPath) {
            let folderName = splitFolderBarPath.shift();
            if (folderName === "") {
                folderName = splitFolderBarPath.shift();
            }
            if (folderObj[folderName]) {
                if (splitFolderBarPath.length === 0) {
                    Object.keys(folderObj[folderName]).forEach(file => {
                        if (Array.isArray(folderObj[folderName][file])) {
                            files.push(file);
                        }
                    });
                } else {
                    __getFileListRecursively(folderObj[folderName], splitFolderBarPath);
                }
            } else {
                throw Error("Invalid path");
            }
        }

        function __getAllFilesRecursively(folderObj, path) {
            const folders = Object.keys(folderObj);
            folders.forEach(folderName => {
                if (Array.isArray(folderObj[folderName])) {
                    if (path === "") {
                        files.push(folderName)
                    } else {
                        files.push(path + "/" + folderName);
                    }
                } else {
                    if (path === "") {
                        path = folderName;
                    } else {
                        path = path + "/" + folderName;
                    }

                    __getAllFilesRecursively(folderObj[folderName], path);
                }
            });
        }
    };

    function getBricksForFile(filePath) {
        filePath = filePath.split(path.sep).join("/");
        const splitPath = filePath.split("/");
        return __getBricksForFileRecursively(header, splitPath);

        function __getBricksForFileRecursively(folderObj, splitPath) {
            const folderName = splitPath.shift();
            if (folderObj[folderName]) {
                if (splitPath.length === 0) {
                    if (Array.isArray(folderObj[folderName])) {
                        return folderObj[folderName];
                    } else {
                        throw Error("Invalid path");
                    }
                } else {
                    return __getBricksForFileRecursively(folderObj[folderName], splitPath);
                }
            } else {
                throw Error("Invalid path");
            }
        }
    }

    this.getTransformParameters = (brickId) => {
        this.load();
        if (!brickId) {
            return encryptionKey ? {key: encryptionKey} : undefined;
        }
        let bricks = [];
        const files = this.getFileList();
        files.forEach(file => {
            bricks = bricks.concat(getBricksForFile(file));
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