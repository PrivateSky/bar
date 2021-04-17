const BrickMapMixin = require('./BrickMapMixin');

/**
 * Maps file paths to bricks and metadata
 *
 * The state of the BrickMap has the following structure
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

function BrickMap(header) {
    Object.assign(this, BrickMapMixin);
    this.initialize(header);

    /**
     * Clone object/array
     */
    const clone = (obj) => {
        const cloned = Object.keys(obj).reduce((acc, key) => {
            if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                acc[key] = clone(obj[key]);
                return acc;
            }

            if (Array.isArray(obj[key])) {
                acc[key] = [];
                for (const i in obj[key]) {
                    if (typeof obj[key][i] === 'object' || Array.isArray(obj[key][i])) {
                        acc[key][i] = clone(obj[key][i]);
                        continue;
                    }

                    acc[key][i] = obj[key][i];
                }

                return acc;
            }

            acc[key] = obj[key];
            return acc;
        }, {});
        return cloned;
    };

    /**
     * Compare two BrickMap paths for changes
     */
    const pathChanged = (src, dst) => {
        if (this.nodeIsDirectory(src) !== this.nodeIsDirectory(dst)) {
            return true;
        }

        // Compare directories
        if (this.nodeIsDirectory(src)) {
            const srcFiles = Object.keys(src.items).sort();
            const dstFiles = Object.keys(dst.items).sort();

            if (srcFiles.length !== dstFiles.length) {
                return true;
            }

            const max = Math.max(srcFiles, dstFiles);

            for (let i = 0; i < max; i++) {
                const srcKey = srcFiles[i];
                const dstKey = dstFiles[i];

                if (srcKey !== dstKey) {
                    return true;
                }

                if (pathChanged(src.items[srcKey], dst.items[dstKey])) {
                    return true;
                }
            }
            return false;
        }

        // Compare files
        if (src.hashLinks.length !== dst.hashLinks.length) {
            return true;
        }

        const max = Math.max(src.hashLinks.length, dst.hashLinks.length);
        for (let i = 0; i < max; i++) {
            const srcHashLink = src.hashLinks[i];
            const dstHashLink = dst.hashLinks[i];

            if (typeof srcHashLink !== typeof dstHashLink) {
                return true;
            }

            const srcKeys = Object.keys(srcHashLink).sort();
            const dstKeys = Object.keys(dstHashLink).sort();
            const max = Math.max(srcKeys.length, dstKeys.length);

            for (let i = 0; i < max; i++) {
                if (srcKeys[i] !== dstKeys[i]) {
                    return true;
                }

                if (srcHashLink[srcKeys[i]] !== dstHashLink[dstKeys[i]]) {
                    return true;
                }
            }
        }

        return false;
    };


    /**
     * Merge `brickMap` items into
     * this instance
     * @param {BrickMap} brickMap
     */
    this.merge = function (brickMap) {
        const changes = this.diff(brickMap);

        if (!changes.hasItems) {
            return;
        }

        const merge = (target, source) => {
            for (const key in source) {
                if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    if (typeof target[key] !== 'object' || Array.isArray(target[key])) {
                        target[key] = {};
                    }
                    merge(target[key], source[key]);
                    continue;
                }

                if (Array.isArray(source[key])) {
                    target[key] = [];
                    for (let i = 0; i < source[key].length; i++) {
                        if (typeof source[key][i] === 'object') {
                            target[key][i] = {}
                            merge(target[key][i], source[key][i])
                            continue;
                        }
                        target[key][i] = source[key][i];
                    }
                    continue;
                }

                target[key] = source[key];
            }
        };

        merge(this.header.items, changes.header.items);
        this.updateMetadata('/', 'updatedAt', this.getTimestamp());
    }

    /**
     * Return all items that changed in `brickMap`
     * compared to our version
     * @param {BrickMap} brickMap
     */
    this.diff = function (brickMap) {
        const dst = brickMap.header.items;
        const dstKeys = Object.keys(dst)
                              .filter(item => item !== 'dsu-metadata-log')
                              .sort();

        const src = this.header.items;
        const changes = {};
        for (const key of dstKeys) {
            // New items
            if (typeof src[key] === 'undefined') {
                changes[key] = clone(dst[key]);
                continue;
            }

            // Existing items
            if (pathChanged(src[key], dst[key])) {
                changes[key] = clone(dst[key]);
                continue;
            }
        }

        const brickMapDiff = new this.constructor({
            metadata: {
                createdAt: this.getTimestamp()
            },
            items: changes
        });
        return brickMapDiff;
    }

    /**
     * @param {object} operation
     * @param {string} operation.op
     * @param {string} operation.path
     * @param {string} operation.timestamp UTC string timestamp
     * @param {*} operation.data
     * @throws {Error}
     */
    this.replayOperation = function (operation) {
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
    }

    /**
     * @param {BrickMap} brickMap
     * @throws {Error}
     */
    this.applyDiff = function (brickMap) {
        if (brickMap.constructor === BrickMap) {
            // This is not a BrickMapDiff so we need to merge the changes from a regular BrickMap instance
            this.merge(brickMap);
            return;
        }

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
    }

    /**
     * Check for same path conflicts
     * @param {BrickMap} remoteChanges
     * @param {Array<BrickMapDiff>} localChangesList
     * @return {object}
     */
    this.detectMergeConflicts = function (remoteChanges, localChangesList) {
        const conflicts = localChangesList.reduce((acc, changeSet) => {
            const metadata = changeSet.getMetadata('/');
            const operationsLog = metadata.log;

            if (!Array.isArray(operationsLog)) {
                return acc;
            }

            if (!operationsLog.length) {
                return acc;
            }

            for (const operation of operationsLog) {
                switch (operation.op) {
                    case 'add':
                    case 'createFolder':
                    case 'createFile':
                    case 'truncate':
                        if (remoteChanges.fileExists(operation.path)) {
                            acc[operation.path] = {
                                error: 'LOCAL_OVERWRITE',
                                message: `Path ${operation.path} will overwrite a previously anchored file or directory`,
                                remoteHashLinks: remoteChanges.getBricksMeta(operation.path)
                            }
                        }
                        break;

                    case 'copy':
                        if (!remoteChanges.fileExists(operation.path)) {
                            acc[operation.path] = {
                                error: 'REMOTE_DELETE',
                                message: `Unable to copy ${operation.path} to ${operation.data}. Source was previously deleted`
                            };
                        }

                        if (remoteChanges.fileExists(operation.data)) {
                            acc[operation.data] = {
                                error: 'LOCAL_OVERWRITE',
                                message: `Unable to copy ${operation.path} to ${operation.data}. The destination path will overwrite a previously anchored file or directory`
                            };
                        }
                        break;

                    case 'delete':
                        if (remoteChanges.fileExists(operation.path)) {
                            acc[operation.path] = {
                                error: 'LOCAL_DELETE',
                                message: `Unable to delete ${operation.path}. This will delete a previously anchored file.`
                            }
                        }
                        break;

                }
            }

            return acc;
        }, {});

        if (!Object.keys(conflicts).length) {
            return;
        }
        return conflicts;
    }
}
module.exports = BrickMap;
