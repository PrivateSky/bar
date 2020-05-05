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
    const pskPath = require("swarmutils").path;
    let archiveConfig;
    let encryptionKey;

    this.add = (filePath, brick) => {
        filePath = pskPath.normalize(filePath);
        if (filePath === "") {
            throw Error("Invalid path");
        }
        this.load();
        const pathSegments = filePath.split("/");
        __addFileRecursively(header, pathSegments, brick);

        function __addFileRecursively(barMapObj, splitPath, brick) {
            let fileName = splitPath.shift();
            if (fileName === "") {
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
        barPath = pskPath.normalize(barPath);

        if (barPath === "/") {
            header = {};
        } else {
            const pathSegments = barPath.split("/");
            if (pathSegments[0] === "") {
                pathSegments.shift();
            }
            __removeRecursively(header, pathSegments);
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

    this.getHashList = (filePath) => {
        filePath = pskPath.normalize(filePath);
        if (filePath === "") {
            throw Error("Invalid path.");
        }
        this.load();
        const pathSegments = filePath.split("/");

        return __getHashListRecursively(header, pathSegments);

        function __getHashListRecursively(barMapObj, pathSegments) {
            let folderName = pathSegments.shift();
            if (folderName === "") {
                folderName = pathSegments.shift();
            }
            if (barMapObj[folderName]) {
                if (pathSegments.length === 0) {
                    return barMapObj[folderName].map(brickObj => brickObj.hash);
                } else {
                    return __getHashListRecursively(barMapObj[folderName], pathSegments);
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
        filePath = pskPath.normalize(filePath);
        this.load();

        if (filePath === "/") {
            return Object.keys(header).length === 0;
        } else {
            const pathSegments = filePath.split("/");
            return __checkIsEmptyRecursively(header, pathSegments);
        }

        function __checkIsEmptyRecursively(folderObj, pathSegments) {
            if (Object.keys(folderObj).length === 0) {
                return true;
            }

            let folderName = pathSegments.shift();
            if (folderName === "") {
                folderName = pathSegments.shift();
            }

            if (folderObj[folderName]) {
                if (pathSegments.length === 0) {
                    if (Array.isArray(folderObj[folderName])) {
                        return folderObj[folderName].length === 0;
                    } else {
                        return Object.keys(folderObj[folderName]).length === 0;
                    }
                } else {
                    return __checkIsEmptyRecursively(folderObj[folderName], pathSegments);
                }
            } else {
                return true;
            }
        }
    };

    this.emptyList = (filePath) => {
        filePath = pskPath.normalize(filePath);
        this.load();

        const pathSegments = filePath.split("/");
        __emptyListRecursively(header, pathSegments);

        function __emptyListRecursively(folderObj, pathSegments) {
            let folderName = pathSegments.shift();
            if (folderName === "") {
                folderName = pathSegments.shift();
            }

            if (folderObj[folderName]) {
                if (pathSegments.length === 0) {
                    if (Array.isArray(folderObj[folderName])) {
                        folderObj[folderName] = []
                    } else {
                        throw Error("Invalid path");
                    }
                } else {
                    __emptyListRecursively(folderObj[folderName], pathSegments);
                }
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


    this.getFileList = (folderBarPath, recursive) => {
        if (typeof recursive === "undefined") {
            recursive = true;
        }
        folderBarPath = pskPath.normalize(folderBarPath);
        this.load();
        return getFilesFromPath(header, folderBarPath, recursive);


        function getFilesFromPath(folderObj, barPath, recursive){
            let files = [];
            if (barPath === "/") {
                __getAllFiles(header, barPath);

                return files;
            } else {
                const pathSegments = barPath.split("/");
                __getFilesFromPath(header, pathSegments);

                return files;
            }

            function __getFilesFromPath(folderObj, pathSegments) {
                let folderName = pathSegments.shift();
                if (folderName === "") {
                    folderName = pathSegments.shift();
                }
                if (folderObj[folderName]) {
                    if (pathSegments.length === 0) {
                        Object.keys(folderObj[folderName]).forEach(file => {
                            if (Array.isArray(folderObj[folderName][file])) {
                                files.push(file);
                            }
                        });
                    } else {
                        if (recursive === true) {
                            __getFilesFromPath(folderObj[folderName], pathSegments);
                        }
                    }
                } else {
                    throw Error(`Invalid path ${folderBarPath}`);
                }
            }

            function __getAllFiles(folderObj, relativePath) {
                Object.keys(folderObj).forEach(folderName => {
                    if (folderObj[folderName]) {
                        let newPath = pskPath.join(relativePath, folderName);

                        if (Array.isArray(folderObj[folderName])) {
                            files.push(newPath);
                        } else {
                            if (recursive === true) {
                                __getAllFiles(folderObj[folderName], newPath);
                            }
                        }
                    }
                });
            }
        }
    };

    this.getFolderList = (barPath, recursive) => {
        barPath = pskPath.normalize(barPath);
        let folders = [];
        if (barPath === "/") {
            __getAllFolders(header, barPath, recursive);
            return folders;
        } else {
            const pathSegments = barPath.split("/");
            __getFoldersFromPath(header, pathSegments, "/", recursive);
            return folders;
        }

        function __getAllFolders(folderObj, relativePath, recursive) {
            Object.keys(folderObj).forEach(folderName => {
                if (typeof folderObj[folderName] === "object" && !Array.isArray(folderObj[folderName])) {
                    const newPath = pskPath.join(relativePath, folderName);
                    folders.push(newPath);
                    if (recursive === true) {
                        __getAllFolders(folderObj[folderName], newPath);
                    }
                }
            });
        }

        function __getFoldersFromPath(folderObj, pathSegments, relativePath, recursive) {
            let folderName = pathSegments.shift();
            if (folderName === "") {
                folderName = pathSegments.shift();
            }
            if (folderObj[folderName]) {
                const newFolderPath = pskPath.join(relativePath, folderName);
                if (pathSegments.length === 0) {
                    folders.push(newFolderPath);
                    Object.keys(folderObj[folderName]).forEach(fileName => {
                        if (typeof folderObj[folderName][fileName] === "object" && !Array.isArray(folderObj[folderName][fileName])) {
                            const newFilePath = pskPath.join(relativePath, fileName);
                            folders.push(newFilePath);
                            if (recursive === true) {
                                __getFoldersFromPath(folderObj[folderName][fileName], pathSegments, newFilePath, recursive);
                            }
                        }
                    });
                } else {
                    __getFoldersFromPath(folderObj[folderName], pathSegments, newFolderPath, recursive);
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
        const files = this.getFileList("/", true);
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
        filePath = pskPath.normalize(filePath);
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
