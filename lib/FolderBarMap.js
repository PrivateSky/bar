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

        function deletePath(targetObj, path) {
            if (path === "") {
                header = {};
            } else {
                delete targetObj[path];
            }
        }

        const pathSegments = barPath.split("/");
        let path = pathSegments.pop();
        deletePath(navigate(pathSegments.join("/")), path);
    };

    this.getBricksMeta = (filePath) => {
        const pathSegments = filePath.split("/");
        const fileName = pathSegments.pop();
        let fileBricks = navigate(pathSegments.join("/"));
        fileBricks = fileBricks[fileName];
        if (typeof fileBricks === "undefined") {
            throw Error(`Path <${filePath}> not found`);
        }
        if (!Array.isArray(fileBricks) && typeof fileBricks === "object") {
            throw Error(`Path <${filePath}> is a folder`);
        }

        return fileBricks;
    };

    this.getHashList = (filePath) => {
        filePath = pskPath.normalize(filePath);
        if (filePath === "") {
            throw Error(`Invalid path ${filePath}.`);
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
                        throw Error(`Invalid path ${filePath}`);
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
        let files = [];

        function printFiles(targetObj, currentPath) {
            for (let prop in targetObj) {
                if (Array.isArray(targetObj[prop])) {
                    let filePath = pskPath.join(currentPath, prop);
                    files.push(filePath);
                } else {
                    if (typeof targetObj[prop] === "object") {
                        if (recursive === true) {
                            printFiles(targetObj[prop], pskPath.join(currentPath, prop));
                        }
                    } else {
                        throw Error("BarMap corrupted.");
                    }
                }
            }
        }

        printFiles(navigate(folderBarPath), "");
        return files;
    };

    function navigate(toPath) {
        let target = header;
        let segments = toPath.split("/");
        for (let i in segments) {
            let segment = segments[i];
            if (segment !== "") {
                if (typeof target[segment] !== "undefined") {
                    if (!Array.isArray(target[segment]) && typeof target[segment] === "object") {
                        target = target[segment];
                    } else {
                        if (Array.isArray(target[segment]) && i < segments.length) {
                            throw Error(`Path ${toPath} is not valid!`);
                        }
                    }
                } else {
                    return undefined;
                }
            }
        }

        return target;
    }

    this.getFolderList = (barPath, recursive) => {
        let folders = [];

        function printFolders(targetObj, currentPath) {
            for (let prop in targetObj) {
                if (typeof targetObj[prop] === "object" && !Array.isArray(targetObj[prop])) {
                    folders.push(pskPath.join(currentPath, prop));
                    if (recursive === true) {
                        printFolders(targetObj[prop], pskPath.join(currentPath, prop));
                    }
                } else {
                    if (!Array.isArray(targetObj[prop])) {
                        throw Error("BarMap corrupted.");
                    }
                }
            }
        }

        printFolders(navigate(barPath), "");
        return folders;
    };

    this.getTransformParameters = (brickMeta) => {
        this.load();
        if (typeof brickMeta === "undefined") {
            return encryptionKey ? {key: encryptionKey} : undefined;
        }

        const addTransformData = {};
        if (brickMeta.key) {
            addTransformData.key = Buffer.from(brickMeta.key);
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
