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
const pskPath = require("swarmutils").path;

/**
 * Maps file paths to bricks and metadata
 *
 * The state of the BarMap has the following structure
 *
 * header: {
 *  metadata: {
 *      createdAt: 'utc timestamp string'
 *  },
 *  items: {
 *      folder1: {
 *          metadata: {
 *              createdAt: 'utc timestamp string'
 *          },
 *          items: {
 *              file.txt: {
 *                  metadata: {
 *                      createdAt: 'utc timestamp string',
 *                      updatedAt: 'utc timestamp string'
 *                  },
 *                  hashes: [... list of bricks hashes and check sums ...]
 *              }
 *          }
 *
 *      },
 *
 *      file2.txt: {
 *          metadata: {
 *              createdAt: 'utc timestamp string',
 *              updatedAt: 'utc timestamp string'
 *          },
 *          hashes: [... list of bricks hashes and check sums ...]
 *      }
 *  }
 * }
 *
 * @param {object|undefined} header
 */
function BarMap(header) {
    this.archiveConfig = null;
    this.encryptionKey = null;
    this.header = header;

    if (!this.header) {
        this.header = {
            items: {},
            metadata: {
                createdAt: this.getTimestamp()
            }
        }
    }
}

/**
 * @return {string}
 */
BarMap.prototype.getTimestamp = function () {
    return new Date().toUTCString();
}

/**
 * @param {object} node
 * @param {object} brick
 */
BarMap.prototype.appendBrick = function (node, brick) {
    node.metadata.updatedAt = this.getTimestamp();
    node.hashes.push(brick);
}

/**
 * @param {object} parent
 * @param {string} name
 */
BarMap.prototype.createFileNode = function (parent, name) {
    parent.items[name] = {
        hashes: [],
        metadata: {
            createdAt: this.getTimestamp()
        }
    }
}

/**
 * @param {object} root
 * @param {string} name
 */
BarMap.prototype.createDirectoryNode = function (root, name) {
    root.items[name] = {
        metadata: {
            createdAt: this.getTimestamp()
        },
        items: {}
    }
};

/**
 * Create all the nodes required to traverse `path`
 * and return the deepest node in the tree
 *
 * @param {string} path
 * @param {object} options
 * @param {string} options.trailingNodeType Possible values are 'child' or 'parent'
 * @return {object}
 */
BarMap.prototype.createNodesFromPath = function (path, options) {
    options = options || {
        trailingNodeType: 'child',
        addCreatedAtTimestamp: true
    };

    const pathSegments = path.split('/');

    let parentNode = this.header;
    let nodeName;

    while (pathSegments.length) {
        nodeName = pathSegments.shift();
        if (nodeName === "") {
            nodeName = pathSegments.shift();
        }

        if (!pathSegments.length) {
            break;
        }

        if (!parentNode.items[nodeName]) {
            this.createDirectoryNode(parentNode, nodeName);
        }
        parentNode = parentNode.items[nodeName];
    }

    if (!parentNode.items[nodeName]) {
        if (options.trailingNodeType === 'child') {
            this.createFileNode(parentNode, nodeName);
        } else {
            this.createDirectoryNode(parentNode, nodeName);
        }
    }

    return parentNode.items[nodeName];
}

/**
 * @param {string} nodePath
 * @return {string} Returns a parent directory's path
 */
BarMap.prototype.dirname = function (path) {
    const segments = path.split('/');
    return segments.slice(0, -1).join('/');
}

/**
 * @param {string} nodePath
 * @return {string} Returns trailing name component of a path
 */
BarMap.prototype.basename = function (path) {
    const segments = path.split('/');
    return segments.pop();
}

/**
 * @param {object} node
 * @return {boolean}
 */
BarMap.prototype.nodeIsDeleted = function (node) {
    return typeof node.metadata.deletedAt !== 'undefined';
}

/**
 * @param {object} node
 * @return {boolean}
 */
BarMap.prototype.isDirectoryNode = function (node) {
    return typeof node.items === 'object';
}

/**
 * @param {object} node
 */
BarMap.prototype.deleteNode = function (node) {
    node.metadata.deletedAt = this.getTimestamp();
    if (this.isDirectoryNode(node)) {
        node.items = {};
        return;
    }

    node.hashes = [];
}

/**
 * @param {object} node
 */
BarMap.prototype.truncateNode = function (node) {
    delete node.metadata.deletedAt;
    node.metadata.updatedAt = this.getTimestamp();
    if (this.isDirectoryNode(node)) {
        node.items = {};
    }

    node.hashes = [];
}

/**
 * Traverse the nodes identified by `toPath`
 * and return the deepest parent node in the tree
 *
 * @param {string} toPath
 * @return {object|undefined}
 */
BarMap.prototype.navigate = function (toPath) {
    let parentNode = this.header;
    const segments = toPath.split("/");

    for (let i in segments) {
        let segment = segments[i];
        if (!segment) {
            continue;
        }


        if (typeof parentNode.items[segment] === 'undefined') {
            return;
        }

        if (this.isDirectoryNode(parentNode.items[segment])) {
            parentNode = parentNode.items[segment];
            continue;
        }
    }

    return parentNode;
}

/**
 * Traverse `path` and return the deepest node
 * in the tree
 *
 * @param {string} path
 * @return {object}
 */
BarMap.prototype.getDeepestNode = function (path) {
    path = pskPath.normalize(path);
    if (path === '/') {
        return this.header;
    }

    const filename = this.basename(path);
    const dirPath = this.dirname(path);

    const parentNode = this.navigate(dirPath);

    if (!parentNode) {
        return;
    }

    return parentNode.items[filename];
}


/**
 * @param {string} path
 * @param {Array<object>} bricks
 */
BarMap.prototype.addFileEntry = function (path, bricks) {
    if (!this.isEmpty(path)) {
        this.emptyList(path);
    }

    this.appendBricksToFile(path, bricks);
};

/**
 * @param {string} path
 * @param {Array<object>} bricks
 */
BarMap.prototype.appendBricksToFile = function (path, bricks) {
    for (const data of bricks) {
        this.add(path, data);
    }
}

/**
 * Add brick data for `filePath`
 *
 * @param {string} filePath
 * @param {object} brick
 * @param {string} brick.hash
 * @param {object} brick.encryptionKey
 * @param {string} brick.checkSum
 */
BarMap.prototype.add = function (filePath, brick) {
    filePath = pskPath.normalize(filePath);
    if (filePath === "") {
        throw new Error("Invalid path");
    }

    checkSum = brick.checkSum;
    hash = brick.hash;
    key = brick.encryptionKey;

    const brickObj = {
        checkSum: brick.checkSum,
        hash: brick.hash
    };

    if (brick.encryptionKey) {
        brickObj.key = brick.encryptionKey
    }

    const filePathNode = this.createNodesFromPath(filePath);
    // If this node was previously deleted, remove the "deletedAt" timestamp
    if (filePathNode.metadata.deletedAt) {
        delete filePathNode.metadata.deletedAt;
    }
    this.appendBrick(filePathNode, brickObj);
};

/**
 * @param {string} barPath
 * @param {boolean} force If `force` is TRUE, add a
 *                  deletion entry in the map even
 *                  if `barPath` is invalid.
 *                  Usefull for diffing
 */
BarMap.prototype.delete = function (barPath, force) {
    force = !!force;
    barPath = pskPath.normalize(barPath);
    const filename = this.basename(barPath);

    const childNode = this.getDeepestNode(barPath);
    if (childNode) {
        this.deleteNode(childNode);
        return true;
    }

    // Path wasn't found but a deletion entry is requested
    // Usually this happens when a deletion is requested in a
    // temporary BarMap
    if (force) {
        const nodeToBeDeleted = this.createNodesFromPath(barPath);
        this.deleteNode(nodeToBeDeleted);
        return true;
    }

    return false;
};

/**
 * @param {string} filePath
 * @return {Array<object>}
 *
 */
BarMap.prototype.getBricksMeta = function (filePath) {
    const fileNode = this.getDeepestNode(filePath);
    if (!fileNode) {
        throw new Error(`Path <${filePath}> not found`);
    }
    if (this.isDirectoryNode(fileNode)) {
        throw new Error(`Path <${filePath}> is a folder`);
    }

    return fileNode.hashes;
};

/**
 * @param {string} filePath
 * @return {Array<string>}
 */
BarMap.prototype.getHashList = function (filePath) {
    if (filePath === "") {
        throw new Error(`Invalid path ${filePath}.`);
    }

    const fileNode = this.getDeepestNode(filePath);
    if (!fileNode) {
        throw new Error(`Path <${filePath}> not found`);
    }
    if (this.isDirectoryNode(fileNode)) {
        throw new Error(`Path <${filePath}> is a folder`);
    }

    const hashes = fileNode.hashes.map(brickObj => brickObj.hash);
    return hashes;
};

/**
 * @param {string} filePath
 * @return {boolean}
 */
BarMap.prototype.isEmpty = function (filePath) {
    const node = this.getDeepestNode(filePath);
    if (!node) {
        return true;
    }

    if (this.isDirectoryNode(node)) {
        return !Object.keys(node.items);
    }
    return !node.hashes.length;
};

/**
 * Truncates `filePath`
 * @param {string} filePath
 */
BarMap.prototype.emptyList = function (filePath) {
    const node = this.getDeepestNode(filePath);
    if (!node) {
        throw new Error(`Invalid path ${filePath}`);
    }

    this.truncateNode(node);
};


/**
 * @return {Brick}
 */
BarMap.prototype.toBrick = function () {
    this.archiveConfig.setIsEncrypted(true);
    const brick = new Brick(this.archiveConfig);
    if (this.encryptionKey) {
        brick.setTransformParameters({key: this.encryptionKey});
    }
    brick.setRawData(Buffer.from(JSON.stringify(this.header)));
    return brick;
};


/**
 * @param {string} folderBarPath
 * @param {boolean} recursive
 * @return {Array<string>}
 */
BarMap.prototype.getFileList = function (folderBarPath, recursive) {
    if (typeof recursive === "undefined") {
        recursive = true;
    }
    const node = this.getDeepestNode(folderBarPath);
    if (!node) {
        return [];
    }

    const findFiles = (nodes, currentPath) => {
        let files = [];
        currentPath = currentPath || '';

        for (const itemName in nodes) {
            const item = nodes[itemName];
            const itemPath = pskPath.join(currentPath, itemName);

            if (this.isDirectoryNode(item) && recursive) {
                files = files.concat(findFiles(item.items, itemPath));
                continue;
            }

            if (!this.nodeIsDeleted(item) && !this.isDirectoryNode(item)) {
                files.push(itemPath);
            }

        }

        return files;
    }

    const files = findFiles(node.items);
    return files;
};

/**
 * @param {string} barPath
 * @param {boolean} recursive
 * @return {Array<string>}
 */
BarMap.prototype.getFolderList = function (barPath, recursive) {
    const node = this.getDeepestNode(barPath);
    if (!node) {
        return [];
    }

    const findFolders = (nodes, currentPath) => {
        let folders = [];
        currentPath = currentPath || '';

        for (const itemName in nodes) {
            const item = nodes[itemName];
            const itemPath = pskPath.join(currentPath, itemName);

            if (!this.isDirectoryNode(item) || this.nodeIsDeleted(item)) {
                continue;
            }

            folders.push(itemPath);

            if (recursive) {
                folders = folders.concat(findFolders(item.items, itemPath));
                continue;
            }
        }

        return folders;
    }

    const folders = findFolders(node.items);
    return folders;
};

/**
 * @param {object} brickMeta
 * @param {Buffer} brickMeta.key
 * @return {object}
 */
BarMap.prototype.getTransformParameters = function (brickMeta) {
    if (typeof brickMeta === "undefined") {
        return this.encryptionKey ? {key: this.encryptionKey} : undefined;
    }

    const addTransformData = {};
    if (brickMeta.key) {
        addTransformData.key = Buffer.from(brickMeta.key);
    }

    return addTransformData;
};

/**
 * Load BarMap state
 */
BarMap.prototype.load = function () {
    const reviver = (key, value) => {
        if (key !== 'key') {
            return value;
        }

        if (typeof value !== 'object') {
            return value;
        }

        if (Object.keys(value).length !== 2) {
            return value;
        }

        if (value.type !== 'Buffer' || !Array.isArray(value.data)) {
            return value;
        }
        return Buffer.from(value.data);
    };
    if (this.header instanceof Brick) {
        this.header.setConfig(this.archiveConfig);
        this.header.setTransformParameters({key: this.encryptionKey});
        this.header = JSON.parse(this.header.getRawData().toString(), reviver);
    } else {
        if (Buffer.isBuffer(this.header)) {
            this.header = this.header.toString();
        }

        if (typeof this.header === "string") {
            this.header = JSON.parse(this.header, reviver);
        }
    }
};

/**
 * @param {ArchiveConfigurator} config
 */
BarMap.prototype.setConfig = function (config) {
    this.archiveConfig = config;
};

/**
 * @return {ArchiveConfigurator}
 */
BarMap.prototype.getConfig = function () {
    return this.archiveConfig;
};

/**
 * @param {string} encKey
 */
BarMap.prototype.setEncryptionKey = function (encKey) {
    this.encryptionKey = encKey;
};

/**
 * @return {BarMap}
 */
BarMap.prototype.clone = function () {
    const barMap = new BarMap(JSON.stringify(this.header));
    barMap.setEncryptionKey(this.encryptionKey);
    barMap.setConfig(this.archiveConfig);
    barMap.load();

    return barMap;
}

/**
 * @return {object}
 */
BarMap.prototype.getState = function () {
    return JSON.parse(JSON.stringify(this.header));
}

/**
 * @param {string} path
 * @return {object}
 */
BarMap.prototype.getMetadata = function (path) {
    const node = this.getDeepestNode(path);
    if (!node) {
        throw new Error(`Invalid path <${path}`);
    }

    if (typeof node.metadata === 'undefined') {
        throw new Error(`Path dosn't have any metadata associated`);
    }

    return node.metadata
}

/**
 * @param {object} metadata
 */
BarMap.prototype.setMetadata = function (path, metadata) {
    const node = this.getDeepestNode(path);
    if (!node) {
        throw new Error(`Invalid path <${path}`);
    }
    node.metadata = JSON.parse(JSON.stringify(metadata));
}

/**
 * @param {string} path
 * @param {string} key
 * @param {*} value
 */
BarMap.prototype.updateMetadata = function (path, key, value) {
    const node = this.getDeepestNode(path);
    if (!node) {
        throw new Error(`Invalid path <${path}`);
    }

    node.metadata[key] = value;
}

/**
 * @param {string} operation
 * @param {string} path
 * @param {BarMap} barMap
 */
BarMap.prototype.replayOperation = function (operation, path, barMap) {
    const pathMetadata = barMap.getMetadata(path);
    switch (operation) {
        case 'add':
            const bricksMeta = barMap.getBricksMeta(path).map(brick => {
                return {
                    encryptionKey: brick.key,
                    hash: brick.hash,
                    checkSum: brick.checkSum
                }
            });
            this.appendBricksToFile(path, bricksMeta);
            this.setMetadata(path, pathMetadata);
            break;
        case 'truncate':
            this.emptyList(path);
            this.setMetadata(path, pathMetadata);
            break;
        case 'delete':
            if (this.delete(path)) {
                this.setMetadata(path, pathMetadata);
            }

            throw new Error(`Unable to replay delete operation. Path <${path} doesn't exist in target map`);
            break;
        default:
            throw new Error(`Unknown operation <${operation}>`);
    }

}

/**
 * @param {BarMap} barMap
 */
BarMap.prototype.applyDiff = function (barMap) {
    const metadata = barMap.getMetadata('/');
    const operationsLog = metadata.log;

    if (!Array.isArray(operationsLog)) {
        throw new Error('Invalid BarMapDiff. No replay log found');
    }

    if (!operationsLog.length) {
        return;
    }

    for (const entry of operationsLog) {
        const { op, path } = entry;
        this.replayOperation(op, path, barMap);
    }
    this.updateMetadata('/', 'updatedAt', this.getTimestamp());
}

module.exports = BarMap;
