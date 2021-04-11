'use strict';

const Brick = require("./Brick");
const pskPath = require("swarmutils").path;
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

const BrickMapMixin = {
    header: null,
    templateKeySSI: null,

    /**
     * @param {Brick|string|object} header
     */
    initialize: function (header) {
        this.header = header;
        if (this.header) {
            return;
        }

        this.header = {
            items: {},
            metadata: {
                createdAt: this.getTimestamp()
            }
        }
    },

    /**
     * @return {string}
     */
    getTimestamp: function () {
        return new Date().toUTCString();
    },

    /**
     * @param {object} node
     * @param {object} brick
     */
    appendBrick: function (node, brick) {
        node.metadata.updatedAt = this.getTimestamp();
        node.hashLinks.push(brick);
    },

    /**
     * @param {object} parent
     * @param {string} name
     */
    createFileNode: function (parent, name) {
        parent.items[name] = {
            hashLinks: [],
            metadata: {
                createdAt: this.getTimestamp()
            }
        }
    },

    /**
     * @param {object} root
     * @param {string} name
     */
    createDirectoryNode: function (root, name) {
        root.items[name] = {
            metadata: {
                createdAt: this.getTimestamp()
            },
            items: {}
        }
    },

    /**
     * Create all the nodes required to traverse `path`
     * and return the deepest node in the tree
     *
     * @param {string} path
     * @param {object} options
     * @param {string} options.trailingNodeType Possible values are 'child' or 'parent'
     * @return {object}
     */
    createNodesFromPath: function (path, options) {
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

            // remove the "deletedAt" attribute in case we're trying
            // to add an entry in a previously deleted location
            delete parentNode.metadata.deletedAt;

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
    },

    /**
     * @param {string} nodePath
     * @return {string} Returns a parent directory's path
     */
    dirname: function (path) {
        const segments = path.split('/');
        return segments.slice(0, -1).join('/');
    },

    /**
     * @param {string} nodePath
     * @return {string} Returns trailing name component of a path
     */
    basename: function (path) {
        const segments = path.split('/');
        return segments.pop();
    },

    /**
     * @param {object} node
     * @return {boolean}
     */
    nodeIsDeleted: function (node) {
        return typeof node.metadata.deletedAt !== 'undefined';
    },

    /**
     * @param {object} node
     * @return {boolean}
     */
    nodeIsDirectory: function (node) {
        return typeof node.items === 'object';
    },

    /**
     * @param {object} node
     */
    deleteNode: function (node) {
        node.metadata.deletedAt = this.getTimestamp();
        if (this.nodeIsDirectory(node)) {
            node.items = {};
            return;
        }

        node.hashLinks = [];
    },

    /**
     * @param {object} node
     */
    truncateNode: function (node) {
        delete node.metadata.deletedAt;
        node.metadata.updatedAt = this.getTimestamp();
        if (this.nodeIsDirectory(node)) {
            node.items = {};
        }

        node.hashLinks = [];
    },

    /**
     * Traverse the nodes identified by `toPath`
     * and return the deepest parent node in the tree
     *
     * @param {string} toPath
     * @return {object|undefined}
     */
    navigate: function (toPath) {
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

            if (this.nodeIsDirectory(parentNode.items[segment])) {
                parentNode = parentNode.items[segment];
                continue;
            }
        }

        return parentNode;
    },

    /**
     * Traverse `path` and return the deepest node
     * in the tree
     *
     * @param {string} path
     * @return {object}
     */
    getDeepestNode: function (path) {
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
    },


    /**
     * @param {string} path
     * @param {Array<object>} bricks
     */
    addFileEntry: function (path, bricks) {
        if (!this.isEmpty(path)) {
            this.emptyList(path);
        }

        this.appendBricksToFile(path, bricks);
    },

    /**
     * @param {string} path
     * @param {Array<object>} bricks
     */
    appendBricksToFile: function (path, bricks) {
        for (const data of bricks) {
            this.add(path, data);
        }
    },

    /**
     * Add brick data for `filePath`
     *
     * @param {string} filePath
     * @param {object} brick
     * @param {string} brick.hash
     * @param {object} brick.encryptionKey
     * @param {string} brick.checkSum
     *
     * @throws {Error}
     */
    add: function (filePath, brick) {
        filePath = pskPath.normalize(filePath);
        if (filePath === "") {
            throw new Error("Invalid path");
        }

        const brickObj = {
            checkSum: brick.checkSum,
            hashLink: brick.hashLink
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
    },

    /**
     * @param {string} barPath
     * @throws {Error}
     */
    delete: function (barPath) {
        barPath = pskPath.normalize(barPath);
        const childNode = this.getDeepestNode(barPath);
        if (!childNode || this.nodeIsDeleted(childNode)) {
            throw new Error(`Invalid path <${barPath}>`);
        }

        this.deleteNode(childNode);
    },

    createNode: function (barPath, options) {
        barPath = pskPath.normalize(barPath);

        if (barPath === '/') {
            throw new Error('Invalid path: /');
        }

        const dirName = this.basename(barPath);
        const dirPath = this.dirname(barPath);
        const parentDir = this.getDeepestNode(dirPath);

        if (!dirName) {
            throw new Error('Missing folder name');
        }

        if (dirPath && parentDir) {
            if (!this.nodeIsDirectory(parentDir)) {
                throw new Error('Unable to create a folder in a file');
            }

            if (parentDir.items[dirName] !== 'undefined' && options.trailingNodeType === "parent") {
                throw new Error('Unable to create folder. A file or folder already exists in that location.');
            }
        }

        this.createNodesFromPath(barPath, options);
    },
    /**
     * Create an empty directory
     *
     * @param {string} barPath
     * @throws {Error}
     */
    createFolder: function (barPath) {
        this.createNode(barPath, {trailingNodeType: "parent"});
    },

    createFile: function (barPath) {
        this.createNode(barPath, {trailingNodeType: "child"});
    },
    /**
     * @param {string} filePath
     * @return {Array<object>}
     * @throws {Error}
     */
    getBricksMeta: function (filePath) {
        const fileNode = this.getDeepestNode(filePath);
        if (!fileNode) {
            throw new Error(`Path <${filePath}> not found`);
        }
        if (this.nodeIsDirectory(fileNode)) {
            throw new Error(`Path <${filePath}> is a folder`);
        }

        if (this.nodeIsDeleted(fileNode)) {
            throw new Error(`Path <${filePath}> not found`);
        }

        return fileNode.hashLinks;
    },

    /**
     * @param {string} filePath
     * @return {Array<string>}
     * @throws {Error}
     */
    getHashList: function (filePath) {
        if (filePath === "") {
            throw new Error(`Invalid path ${filePath}.`);
        }

        const fileNode = this.getDeepestNode(filePath);
        if (!fileNode) {
            throw new Error(`Path <${filePath}> not found`);
        }
        if (this.nodeIsDirectory(fileNode)) {
            throw new Error(`Path <${filePath}> is a folder`);
        }

        const hashes = fileNode.hashLinks.map(brickObj => brickObj.hashLink);
        return hashes;
    },

    /**
     * @param {string} filePath
     * @return {boolean}
     */
    isEmpty: function (filePath) {
        const node = this.getDeepestNode(filePath);
        if (!node) {
            return true;
        }

        if (this.nodeIsDirectory(node)) {
            return !Object.keys(node.items);
        }
        return !node.hashLinks.length;
    },

    /**
     * Truncates `filePath`
     * @param {string} filePath
     * @throws {Error}
     */
    emptyList: function (filePath) {
        const node = this.getDeepestNode(filePath);
        if (!node) {
            throw new Error(`Invalid path ${filePath}`);
        }

        this.truncateNode(node);
    },

    /**
     * @param {string} srcPath
     * @param {string} dstPath
     * @throws {Error}
     */
    copy: function (srcPath, dstPath) {
        const srcNode = this.getDeepestNode(srcPath);
        if (!srcNode) {
            throw new Error(`Invalid path <${srcPath}>`);
        }

        const dstNode = this.createNodesFromPath(dstPath, {
            trailingNodeType: this.nodeIsDirectory(srcNode) ? 'parent' : 'child',
            addCreatedAtTimestamp: true
        });

        if (this.nodeIsDirectory(srcNode)) {
            // Clone hashlinks
            dstNode.items = Object.keys(srcNode.items).reduce((accumulator, itemKey) => {
                accumulator[itemKey] = {
                    hashLinks: [...srcNode.items[itemKey].hashLinks],
                    metadata: Object.assign({}, srcNode.items[itemKey].metadata)
                };

                return accumulator;
            }, {});
            return;
        }

        dstNode.hashLinks = [...srcNode.hashLinks];
    },


    /**
     * @return {Brick}
     */
    toBrick: function () {
        const brick = new Brick({templateKeySSI: this.templateKeySSI, brickMap: true});
        brick.setKeySSI(this.templateKeySSI);
        brick.setRawData($$.Buffer.from(JSON.stringify(this.header)));
        return brick;
    },


    /**
     * @param {string} folderBarPath
     * @param {boolean} recursive
     * @return {Array<string>}
     */
    getFileList: function (folderBarPath, recursive) {
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

                if (this.nodeIsDirectory(item) && recursive) {
                    files = files.concat(findFiles(item.items, itemPath));
                    continue;
                }

                if (!this.nodeIsDeleted(item) && !this.nodeIsDirectory(item)) {
                    files.push(itemPath);
                }

            }

            return files;
        }

        const files = findFiles(node.items);
        return files;
    },

    /**
     * @param {string} barPath
     * @param {boolean} recursive
     * @return {Array<string>}
     */
    getFolderList: function (barPath, recursive) {
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

                if (!this.nodeIsDirectory(item) || this.nodeIsDeleted(item)) {
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
    },

    getBrickEncryptionKeySSI: function (brickMeta) {
        if (typeof brickMeta === "undefined") {
            return this.templateKeySSI.getIdentifier();
        }

        return brickMeta.key;
    },

    /**
     * Load BrickMap state
     */
    load: function (callback) {
        /**
         * JSON reviver callback
         * Convert serialized $$.Buffer to $$.Buffer instance
         * @param {string} key
         * @param {string} value
         * @return {*}
         */
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

            if (value.type !== '$$.Buffer' || !Array.isArray(value.data)) {
                return value;
            }
            return $$.Buffer.from(value.data);
        };

        if (this.header instanceof Brick) {
            this.header.setKeySSI(this.templateKeySSI);
            this.header.setKeySSI(this.templateKeySSI.getIdentifier());
            this.header.getRawData((err, rawData) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get raw data`, err));
                }

                this.header = JSON.parse(rawData.toString(), reviver);
                callback();
            });
        } else {
            if ($$.Buffer.isBuffer(this.header)) {
                this.header = this.header.toString();
            }

            if (typeof this.header === "string") {
                this.header = JSON.parse(this.header, reviver);
            }
            callback();
        }
    },

    /**
     * @param {KeySSI} keySSI
     */
    setKeySSI: function (keySSI) {
        this.templateKeySSI = keySSI;
    },

    /**
     * @return {KeySSI}
     */
    getTemplateKeySSI: function () {
        return this.templateKeySSI;
    },

    /**
     * @return {BrickMap}
     */
    clone: function (callback) {
        const InstanceClass = this.constructor;
        const brickMap = new InstanceClass(JSON.stringify(this.header));
        brickMap.setKeySSI(this.templateKeySSI);
        brickMap.load((err) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load brickMap`, err));
            }

            callback(undefined, brickMap);
        });
    },

    /**
     * @return {object}
     */
    getState: function () {
        return JSON.parse(JSON.stringify(this.header));
    },

    /**
     * @param {string} path
     * @return {object}
     * @throws {Error}
     */
    getMetadata: function (path) {
        const node = this.getDeepestNode(path);
        if (!node) {
            throw new Error(`Invalid path <${path}`);
        }

        if (typeof node.metadata === 'undefined') {
            throw new Error(`Path dosn't have any metadata associated`);
        }

        return node.metadata
    },

    /**
     * @param {object} metadata
     * @throws {Error}
     */
    setMetadata: function (path, metadata) {
        const node = this.getDeepestNode(path);
        if (!node) {
            throw new Error(`Invalid path <${path}`);
        }
        node.metadata = JSON.parse(JSON.stringify(metadata));
    },

    /**
     * @param {string} path
     * @param {string} key
     * @param {*} value
     * @throws {Error}
     */
    updateMetadata: function (path, key, value) {
        const node = this.getDeepestNode(path);
        if (!node) {
            throw new Error(`Invalid path <${path}`);
        }

        node.metadata[key] = value;
    },

    /**
     * @param {object} operation
     * @param {string} operation.op
     * @param {string} operation.path
     * @param {string} operation.timestamp UTC string timestamp
     * @param {*} operation.data
     * @throws {Error}
     */
    replayOperation: function (operation) {
        const {op, path, timestamp, data} = operation;

        switch (op) {
            case 'add':
                this.appendBricksToFile(path, data);
                this.setMetadata(path, {
                    updatedAt: timestamp
                });
                break;
            case 'truncate':
                this.emptyList(path);
                this.updateMetadata(path, 'updatedAt', timestamp);
                break;
            case 'delete':
                this.delete(path);
                this.updateMetadata(path, 'deletedAt', timestamp);
                break;
            case 'copy':
                const dstPath = data;
                this.copy(path, dstPath);
                this.updateMetadata(dstPath, 'createdAt', timestamp);
                break;
            case 'createFolder':
                this.createFolder(path);
                this.updateMetadata(path, 'createdAt', timestamp);
                break;
            case 'createFile':
                this.createFile(path);
                this.updateMetadata(path, 'createdAt', timestamp);
                break;
            default:
                throw new Error(`Unknown operation <${operation}>`);
        }
    },

    /**
     * @param {BrickMap} brickMap
     * @throws {Error}
     */
    applyDiff: function (brickMap) {
        const metadata = brickMap.getMetadata('/');
        const operationsLog = metadata.log;

        if (!Array.isArray(operationsLog)) {
            throw new Error('Invalid BrickMapDiff. No replay log found');
        }

        if (!operationsLog.length) {
            return;
        }

        for (const operation of operationsLog) {
            this.replayOperation(operation, brickMap);
        }
        this.updateMetadata('/', 'updatedAt', this.getTimestamp());
        this.header.metadata.prevDiffHashLink = metadata.prevDiffHashLink;
    },

    getHashLink: function (callback) {
        const brick = this.toBrick();
        brick.setKeySSI(this.getBrickEncryptionKeySSI());
        brick.getHashLink(callback);
    }


}

module.exports = BrickMapMixin;
