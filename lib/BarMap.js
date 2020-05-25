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
    const pskPath = require("swarmutils").path;
    let archiveConfig;
    let encryptionKey;

    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////
    const initialize = () => {
        if (!header) {
            header = {
                items: {},
                metadata: {
                    createdAt: getTimestamp()
                }
            }
        }
    }

    /**
     * @return {string}
     */
    const getTimestamp = () => {
        return new Date().toUTCString();
    }

    /**
     * @param {object} node
     * @param {object} brick
     */
    const appendBrick = (node, brick) => {
        node.metadata.updatedAt = getTimestamp();
        node.hashes.push(brick);
    }

    /**
     * @param {object} parent
     * @param {string} name
     */
    const createFileNode = (parent, name) => {
        parent.items[name] = {
            hashes: [],
            metadata: {
                createdAt: getTimestamp()
            }
        }
    }

    /**
     * @param {object} root
     * @param {string} name
     */
    const createDirectoryNode = (root, name) => {
        root.items[name] = {
            metadata: {
                createdAt: getTimestamp()
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
    const createNodesFromPath = (path, options) => {
        options = options || {
            trailingNodeType: 'child',
            addCreatedAtTimestamp: true
        };

        const pathSegments = path.split('/');

        let parentNode = header;
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
                createDirectoryNode(parentNode, nodeName);
            }
            parentNode = parentNode.items[nodeName];
        }

        if (!parentNode.items[nodeName]) {
            if (options.trailingNodeType === 'child') {
                createFileNode(parentNode, nodeName);
            } else {
                createDirectoryNode(parentNode, nodeName);
            }
        }

        return parentNode.items[nodeName];
    }

    /**
     * @param {string} nodePath
     * @return {string} Returns a parent directory's path
     */
    const dirname = (path) => {
        const segments = path.split('/');
        return segments.slice(0, -1).join('/');
    }

    /**
     * @param {string} nodePath
     * @return {string} Returns trailing name component of a path
     */
    const basename = (path) => {
        const segments = path.split('/');
        return segments.pop();
    }

    /**
     * @param {object} node
     * @return {boolean}
     */
    const nodeIsDeleted = (node) => {
        return typeof node.metadata.deletedAt !== 'undefined';
    }

    /**
     * @param {object} node
     * @return {boolean}
     */
    const isDirectoryNode = (node) => {
        return typeof node.items === 'object';
    }

    /**
     * @param {object} node
     */
    const deleteNode = (node) => {
        node.metadata.deletedAt = getTimestamp();
        if (isDirectoryNode(node)) {
            node.items = {};
            return;
        }

        node.hashes = [];
    }

    /**
     * @param {object} node
     */
    const truncateNode = (node) => {
        delete node.metadata.deletedAt;
        node.metadata.updatedAt = getTimestamp();
        if (isDirectoryNode(node)) {
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
    const navigate = (toPath) => {
        let parentNode = header;
        const segments = toPath.split("/");

        for (let i in segments) {
            let segment = segments[i];
            if (!segment) {
                continue;
            }


            if (typeof parentNode.items[segment] === 'undefined') {
                return;
            }

            if (isDirectoryNode(parentNode.items[segment])) {
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
    const getDeepestNode = (path) => {
        path = pskPath.normalize(path);
        if (path === '/') {
            return header;
        }

        const filename = basename(path);
        const dirPath = dirname(path);

        const parentNode = navigate(dirPath);

        if (!parentNode) {
            return;
        }

        return parentNode.items[filename];
    }


    ////////////////////////////////////////////////////////////
    // Public methods
    ////////////////////////////////////////////////////////////

    /**
     * @param {string} path
     * @param {Array<object>} bricks
     */
    this.addFileEntry = (path, bricks) => {
        if (!this.isEmpty(path)) {
            this.emptyList(path);
        }

        this.appendBricksToFile(path, bricks);
    };

    /**
     * @param {string} path
     * @param {Array<object>} bricks
     */
    this.appendBricksToFile = (path, bricks) => {
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
    this.add = (filePath, brick) => {
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

        const filePathNode = createNodesFromPath(filePath);
        // If this node was previously deleted, remove the "deletedAt" timestamp
        if (filePathNode.metadata.deletedAt) {
            delete filePathNode.metadata.deletedAt;
        }
        appendBrick(filePathNode, brickObj);
    };

    /**
     * @param {string} barPath
     * @param {boolean} force If `force` is TRUE, add a
     *                  deletion entry in the map even
     *                  if `barPath` is invalid.
     *                  Usefull for diffing
     */
    this.delete = (barPath, force) => {
        force = !!force;
        barPath = pskPath.normalize(barPath);
        const filename = basename(barPath);

        const childNode = getDeepestNode(barPath);
        if (childNode) {
            deleteNode(childNode);
            return;
        }

        // Path wasn't found but a deletion entry is requested
        // Usually this happens when a deletion is requested in a
        // temporary BarMap
        if (force) {
            const nodeToBeDeleted = createNodesFromPath(barPath);
            deleteNode(nodeToBeDeleted);
        }
    };

    /**
     * @param {string} filePath
     * @return {Array<object>}
     *
     */
    this.getBricksMeta = (filePath) => {
        const fileNode = getDeepestNode(filePath);
        if (!fileNode) {
            throw new Error(`Path <${filePath}> not found`);
        }
        if (isDirectoryNode(fileNode)) {
            throw new Error(`Path <${filePath}> is a folder`);
        }

        return fileNode.hashes;
    };

    /**
     * @param {string} filePath
     * @return {Array<string>}
     */
    this.getHashList = (filePath) => {
        if (filePath === "") {
            throw new Error(`Invalid path ${filePath}.`);
        }

        const fileNode = getDeepestNode(filePath);
        if (!fileNode) {
            throw new Error(`Path <${filePath}> not found`);
        }
        if (isDirectoryNode(fileNode)) {
            throw new Error(`Path <${filePath}> is a folder`);
        }

        const hashes = fileNode.hashes.map(brickObj => brickObj.hash);
        return hashes;
    };

    /**
     * @param {string} filePath
     * @return {boolean}
     */
    this.isEmpty = (filePath) => {
        const node = getDeepestNode(filePath);
        if (!node) {
            return true;
        }

        if (isDirectoryNode(node)) {
            return !Object.keys(node.items);
        }
        return !node.hashes.length;
    };

    /**
     * Truncates `filePath`
     * @param {string} filePath
     */
    this.emptyList = (filePath) => {
        const node = getDeepestNode(filePath);
        if (!node) {
            throw new Error(`Invalid path ${filePath}`);
        }

        truncateNode(node);
    };


    /**
     * @return {Brick}
     */
    this.toBrick = () => {
        archiveConfig.setIsEncrypted(true);
        const brick = new Brick(archiveConfig);
        if (encryptionKey) {
            brick.setTransformParameters({key: encryptionKey});
        }
        brick.setRawData(Buffer.from(JSON.stringify(header)));
        return brick;
    };


    /**
     * @param {string} folderBarPath
     * @param {boolean} recursive
     * @return {Array<string>}
     */
    this.getFileList = (folderBarPath, recursive) => {
        if (typeof recursive === "undefined") {
            recursive = true;
        }
        const node = getDeepestNode(folderBarPath);
        if (!node) {
            return [];
        }

        const findFiles = (nodes, currentPath) => {
            let files = [];
            currentPath = currentPath || '';

            for (const itemName in nodes) {
                const item = nodes[itemName];
                const itemPath = pskPath.join(currentPath, itemName);

                if (isDirectoryNode(item) && recursive) {
                    files = files.concat(findFiles(item.items, itemPath));
                    continue;
                }

                if (!nodeIsDeleted(item) && !isDirectoryNode(item)) {
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
    this.getFolderList = (barPath, recursive) => {
        const node = getDeepestNode(barPath);
        if (!node) {
            return [];
        }

        const findFolders = (nodes, currentPath) => {
            let folders = [];
            currentPath = currentPath || '';

            for (const itemName in nodes) {
                const item = nodes[itemName];
                const itemPath = pskPath.join(currentPath, itemName);

                if (!isDirectoryNode(item) || nodeIsDeleted(item)) {
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
    this.getTransformParameters = (brickMeta) => {
        if (typeof brickMeta === "undefined") {
            return encryptionKey ? {key: encryptionKey} : undefined;
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

    /**
     * @param {ArchiveConfigurator} config
     */
    this.setConfig = (config) => {
        archiveConfig = config;
    };

    /**
     * @return {ArchiveConfigurator}
     */
    this.getConfig = () => {
        return archiveConfig;
    };

    /**
     * @param {string} encKey
     */
    this.setEncryptionKey = (encKey) => {
        encryptionKey = encKey;
    };

    /**
     * @return {BarMap}
     */
    this.clone = () => {
        const barMap = new BarMap(JSON.stringify(header));
        barMap.setEncryptionKey(encryptionKey);
        barMap.setConfig(archiveConfig);
        barMap.load();

        return barMap;
    }

    /**
     * @return {object}
     */
    this.getState = () => {
        return JSON.parse(JSON.stringify(header));
    }

    /**
     * @param {BarMap} barMap
     */
    this.applyDiff = (barMap) => {
        const state = barMap.getState();

        const recursiveMerge = (target, source) => {
            for (const key in source) {
                if (!Array.isArray(source[key]) && typeof source[key] === 'object') {
                    if (!target[key]) {
                        target[key] = {};
                    }
                    recursiveMerge(target[key], source[key]);
                    continue;
                }
                target[key] = source[key];
            }
        }

        recursiveMerge(header, state);
    }

    initialize();
}

module.exports = BarMap;
