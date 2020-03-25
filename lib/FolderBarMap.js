const Brick = require("./Brick");
const pathModule = "path";
let path;
try {
    path = require(pathModule);
} catch (err) {
} finally {
    if (typeof path === "undefined") {
        path = {sep: "/"};
    }
}

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
            while (fileName === "") {
                fileName = splitPath.shift();
            }
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
                if (!barMapObj[fileName]) {
                    barMapObj[fileName] = {};
                }
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

    this.delete = (barPath) => {
        if (typeof barPath === "undefined") {
            throw Error("No path was provided");
        }

        if (barPath === "/" || barPath === "") {
            header = {};
        } else {
            const splitPath = barPath.split("/");
            if (splitPath[0] === "") {
                splitPath.shift();
            }
            __removeRecursively(header, splitPath);
        }

        function __removeRecursively(folderObj, splitPath) {
            const folderName = splitPath.shift();
            if (folderObj[folderName]) {
                if (splitPath.length === 0) {
                    folderObj[folderName] = undefined;
                } else {
                    __removeRecursively(folderObj[folderName], splitPath);
                }
            }
        }
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
                throw Error(`Invalid path ${filePath}`);
            }
        }
    };

    this.getCheckSumList = (filePath) => {
        this.load();
        return header[filePath].map(brickObj => brickObj.checkSum);
    };

    this.isEmpty = (filePath) => {
        filePath = filePath.split(path.sep).join("/");
        this.load();

        if (!filePath || filePath === "" || filePath === "/") {
            return Object.keys(header).length === 0;
        } else {
            const splitPath = filePath.split("/");
            return __checkIsEmptyRecursively(header, splitPath);
        }

        function __checkIsEmptyRecursively(folderObj, splitPath) {
            if (Object.keys(folderObj).length === 0) {
                return true;
            }

            let folderName = splitPath.shift();
            if (folderName === "") {
                folderName = splitPath.shift();
            }

            if (folderObj[folderName]) {
                if (splitPath.length === 0) {
                    if (Array.isArray(folderObj[folderName])) {
                        return folderObj[folderName].length === 0;
                    } else {
                        return Object.keys(folderObj[folderName]).length === 0;
                    }
                } else {
                    return __checkIsEmptyRecursively(folderObj[folderName], splitPath);
                }
            } else {
                return true;
            }
        }
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
        archiveConfig.setIsEncrypted(true);
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
                throw Error(`Invalid path ${folderBarPath}`);
            }
        }

        function __getAllFilesRecursively(folderObj, path) {
            Object.keys(folderObj).forEach(folderName => {
                if (folderObj[folderName]) {
                    let newPath;
                    if (path === "" || path === "/") {
                        newPath = "/" + folderName;
                    } else {
                        newPath = path + "/" + folderName;
                    }

                    if (Array.isArray(folderObj[folderName])) {
                        files.push(newPath);
                    } else {
                        __getAllFilesRecursively(folderObj[folderName], newPath);
                    }
                }
            });
        }


    };

    this.getFolderList = (barPath) => {
        let folders = [];
        if (!barPath || barPath === "" || barPath === "/") {
            __getAllFolders(header, "");
            return folders;
        } else {
            const splitPath = barPath.split("/");
            __getFoldersRecursively(header, splitPath, "");
            return folders;
        }

        function __getAllFolders(folderObj, path) {
            Object.keys(folderObj).forEach(folderName => {
                if (typeof folderObj[folderName] === "object" && !Array.isArray(folderObj[folderName])) {
                    folders.push(path + "/" + folderName);
                    __getAllFolders(folderObj[folderName], path + "/" + folderName);
                }
            });
        }

        function __getFoldersRecursively(folderObj, splitPath, folderPath) {
            let folderName = splitPath.shift();
            if (folderName === "") {
                folderName = splitPath.shift();
            }
            if (folderObj[folderName]) {
                if (splitPath.length === 0) {
                    folders.push(folderPath + "/" + folderName);
                    Object.keys(folderObj[folderName]).forEach(fileName => {
                        if (typeof folderObj[folderName][fileName] === "object" && !Array.isArray(folderObj[folderName][fileName])) {
                            folders.push(folderPath + "/" + fileName);
                            __getFoldersRecursively(folderObj[folderName][fileName], splitPath, folderPath + "/" + fileName);
                        }
                    });
                } else {
                    __getFoldersRecursively(folderObj[folderName], splitPath, folderPath + "/" + folderName);
                }
            }
        }
    };

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

    function getBricksForFile(filePath) {
        filePath = filePath.split(path.sep).join("/");
        const splitPath = filePath.split("/");
        return __getBricksForFileRecursively(header, splitPath);


        function __getBricksForFileRecursively(folderObj, splitPath) {
            let folderName = splitPath.shift();
            if (folderName === "") {
                folderName = splitPath.shift();
            }
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
}

module.exports = FolderBarMap;