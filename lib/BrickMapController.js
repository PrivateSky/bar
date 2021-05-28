'use strict';

// HTTP error code returned by the anchoring middleware
// when trying to anchor outdated changes
const ALIAS_SYNC_ERR_CODE = 428;


/**
 * The current state of the BrickMapController
 */
function State() {
    const brickMap = {
        // The latest anchored BrickMap
        anchored: undefined,
        // The current BrickMap, cloned from `anchored`. Contains un-anchored changes
        dirty: undefined,
    };
    const diffs = {
        inAnchoring: [], // BrickMapDiff objects which are in the process of anchoring
        new: [], // BrickMapDiff objects which haven't been scheduled for anchoring
        current: undefined, // A reference to the current BrickMapDiff
        latestHash: undefined // Used for chaining multiple BrickMapDiff objects
    };
    let lastAnchoredHashLink = undefined;

    this.init = (anchoredBrickMap, latestHashLink, callback) => {
        if (typeof latestHashLink === 'function') {
            callback = latestHashLink;
            latestHashLink = undefined;
        }

        brickMap.anchored = anchoredBrickMap;
        this.cloneAnchoredBrickMap((err, clone) => {
            if (err) {
                return callback(err);
            }
            brickMap.dirty = clone;
            lastAnchoredHashLink = latestHashLink;
            diffs.latestHash = latestHashLink;
            callback();
        });
    }

    /**
     * @return {boolean}
     */
    this.canBeAnchored = () => {
        return this.hasNewDiffs() || this.hasDiffsForAnchoring();
    }

    /**
     * @return {Array<BrickMapDiff>}
     */
    this.getDiffsForAnchoring = () => {
        return diffs.inAnchoring;
    }

    /**
     * @param {BrickMap} anchoredBrickMap
     */
    this.setAnchoredBrickMap = (anchoredBrickMap) => {
        brickMap.anchored = anchoredBrickMap;
    }

    /**
     * @return {BrickMap}
     */
    this.getAnchoredBrickMap = () => {
        return brickMap.anchored;
    }

    /**
     * @return {BrickMapDiff}
     */
    this.getCurrentDiff = () => {
        return diffs.current;
    }

    /**
     * @param {BrickMapDiff} diff
     */
    this.setCurrentDiff = (diff) => {
        diffs.current = diff;
    }

    /**
     * Returns the BrickMap containing un-anchored changes
     * @return {BrickMap}
     */
    this.getDirtyBrickMap = () => {
        return brickMap.dirty;
    }

    /**
     * @param {BrickMap} dirtyBrickMap
     */
    this.setDirtyBrickMap = (dirtyBrickMap) => {
        brickMap.dirty = dirtyBrickMap;
    }

    /**
     * Returns the latest BrickMapDiff in the "new" list
     * @return {BrickMapDiff}
     */
    this.getLastestNewDiff = () => {
        const newDiffsLength = diffs.new.length;
        return diffs.new[newDiffsLength - 1];
    }

    /**
     * @param {BrickMapDiff} diff
     */
    this.pushNewDiff = (diff) => {
        diffs.new.push(diff);
    }

    this.getLastAnchoredHashLink = () => {
        return lastAnchoredHashLink;
    }

    this.setLastAnchoredHashLink = (hashLink) => {
        lastAnchoredHashLink = hashLink;
    }

    this.getLatestDiffHashLink = () => {
        return diffs.latestHash;
    }


    /**
     * @return {boolean}
     */
    this.hasNewDiffs = () => {
        return diffs.new.length > 0;
    }

    /**
     * @return {boolean}
     */
    this.hasDiffsForAnchoring = () => {
        return diffs.inAnchoring.length > 0;
    }

    /**
     * Moves the BrickMapDiffs from the 'new' array to the 'inAnchoring' array
     * @param {function} callback
     */
    this.prepareNewChangesForAnchoring = (callback) => {
        if (!this.hasNewDiffs()) {
            return callback();
        }

        const diff = diffs.new.shift();
        diff.getHashLink((err, lastDiffHashLink) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get hashLink`, err));
            }

            diffs.latestHash = lastDiffHashLink;
            diffs.inAnchoring.push(diff);
            this.prepareNewChangesForAnchoring(callback);
        });
    }

    this.rollback = (mergedDiffs) => {
        diffs.inAnchoring.unshift(...mergedDiffs);
    }

    /**
     * Clone the anchored brickmap
     * @param {function} callback
     */
    this.cloneAnchoredBrickMap = (callback) => {
        brickMap.anchored.clone((err, brickMap) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to clone BrickMap`, err));
            }
            callback(undefined, brickMap);
        })
    }
}

/**
 * BrickMap Proxy
 *
 * Handles loading and anchoring a BrickMap using the provided BrickMapStrategy
 * in the ArchiveConfigurator
 *
 * BrickMap write operations are proxied to a copy of a valid BrickMap and to a BrickMapDiff
 * used later for anchoring. The reason for that is to preserve read consistency during
 * a session. Writing only to a BrickMapDiff object will cause subsequent reads to fail;
 * in order to simplify the implementation the same "write" operation is written to the
 * "dirty" BrickMap and to the BrickMapDiff object (only this object will be anchored). Any
 * read operations will go directly to the "dirty" BrickMap.
 *
 * After anchoring any changes, the anchored BrickMap is updated with the changes stored in BrickMapDiff
 * thus being in sync with the "dirty" copy
 *
 * @param {object} options
 * @param {ArchiveConfigurator} options.config
 * @param {BrickStorageService} options.brickStorageService
 */
function BrickMapController(options) {
    const swarmutils = require("swarmutils");
    const BrickMap = require('./BrickMap');
    const Brick = require('./Brick');
    const AnchorValidator = require('./AnchorValidator');
    const pskPth = swarmutils.path;
    const BrickMapDiff = require('./BrickMapDiff');
    const BrickMapStrategyFactory = require('./BrickMapStrategy');
    const anchoringStatus = require('./constants').anchoringStatus;
    const openDSU = require("opendsu");
    const bricking = openDSU.loadAPI("bricking");
    const anchoring = openDSU.loadAPI("anchoring");
    options = options || {};

    let anchoringInProgress = false;
    const config = options.config;
    const keySSI = options.keySSI;
    const brickStorageService = options.brickStorageService;
    const keyssi = openDSU.loadApi("keyssi");
    if (!config) {
        throw new Error('An ArchiveConfigurator is required!');
    }

    if (!brickStorageService) {
        throw new Error('BrickStorageService is required');
    }

    let strategy = config.getBrickMapStrategy();
    let validator = new AnchorValidator({
        rules: config.getValidationRules()
    });
    const state = new State();


    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////

    /**
     * Configure the strategy and create
     * proxy methods for BrickMap
     */
    const initialize = () => {
        if (!strategy) {
            strategy = getDefaultStrategy();
        }
        strategy.setCache(config.getCache());
        strategy.setBrickMapController(this);
        strategy.setBrickMapState(state);
        strategy.setValidator(validator);

        const brickMap = new BrickMap();
        const brickMapProperties = Object.getOwnPropertyNames(brickMap);
        for (const propertyName of brickMapProperties) {
            if (typeof brickMap[propertyName] !== 'function' || propertyName === 'load') {
                continue;
            }
            // Proxy method calls to BrickMap through BrickMapController
            const method = propertyName;
            this[propertyName] = new Proxy(function () {
            }, {
                apply: (...args) => {
                    const targetHandlerName = `${method}ProxyHandler`;

                    if (typeof this[targetHandlerName] === 'function') {
                        return this[targetHandlerName](...args.pop());
                    }

                    const dirtyBrickMap = state.getDirtyBrickMap();
                    return dirtyBrickMap[method].apply(dirtyBrickMap, args.pop());
                }
            });
        }
    }

    /**
     * @return {BrickMapStrategyMixin}
     */
    const getDefaultStrategy = () => {
        const factory = new BrickMapStrategyFactory();
        const strategy = factory.create();

        return strategy;
    }

    const createBrickMapDiff = (data, callback) => {
        if (typeof data === 'function') {
            callback = data;
            data = undefined;
        }

        const brickMapDiff = new BrickMapDiff(data);
        if (typeof data !== 'undefined') {
            return this.configureBrickMap(brickMapDiff, (err) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to configure brickMap`, err));
                }
                callback(undefined, brickMapDiff);
            });
        }
        brickMapDiff.initialize((err) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to initialize brickMapDiff`, err));
            }

            brickMapDiff.setPrevDiffHashLink(state.getLatestDiffHashLink());
            this.configureBrickMap(brickMapDiff, (err) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to configure brickMap`, err));
                }
                callback(undefined, brickMapDiff);
            });
        });
    }

    /**
     * Returns the latest BrickMapDiff that
     * hasn't been scheduled for anchoring
     *
     * Write operations will be added into this object
     *
     * If no such object exists, a new object is created
     * and push into the list
     *
     * @return {BrickMapDiff}
     */
    const getCurrentDiffBrickMap = (callback) => {
        let brickMapDiff = state.getLastestNewDiff();
        if (!brickMapDiff) {
            return createBrickMapDiff((err, brickMapDiff) => {
                if (err) {
                    return callback(err);
                }

                state.setCurrentDiff(brickMapDiff);
                state.pushNewDiff(brickMapDiff);
                callback(undefined, brickMapDiff);
            })
        }

        state.setCurrentDiff(brickMapDiff);
        callback(undefined, brickMapDiff);
    }

    /**
     * Release the "anchoringInProgress" lock
     * and notify the anchoring listener of
     * the status and data of the current anchoring process
     *
     * To preserve backwards compatibility with the existing
     * code, the listener is called in the same way as
     *  the classic NodeJS callback convention: callback(err, result)
     *
     * If the anchoring status is OK, the listener is called as: listener(undefined, anchoringResult)
     * If the anchoring process has failed, the `status` parameter will contain
     * the error type (string) and the `data` parameter will contain
     * the actual error object. The error type is added as a property
     * tot the error object and the listener will be called as: listener(err)
     *
     * @param {callback} listener
     * @param {number} status
     * @param {*} data
     */
    const endAnchoring = (listener, status, data) => {
        anchoringInProgress = false;
        if (status === anchoringStatus.OK || status === anchoringStatus.BRICKMAP_RECONCILIATION_HANDOFF) {
            return listener(undefined, data);
        }

        const error = data;
        error.type = status;
        listener(error);
    }

    /**
     * Returns true if any BrickMapDiff objects
     * exist in the pending state.
     *
     * This function is used to determine if a new anchoring
     * process should be started after the current one has ended
     *
     * @return {boolean}
     */
    const anchoringRequestExists = () => {
        return state.hasDiffsForAnchoring();
    }

    /**
     * Returns true if the anchoring service returned an 'out of sync' error
     * @return {boolean}
     */
    const isAliasSyncError = (err) => {
        let error = err;
        do {
            if (error.statusCode === ALIAS_SYNC_ERR_CODE) {
                return true;
            }

            error = error.previousError;
        } while (error && (error.previousError || error.statusCode));
        return false;
    }

    ////////////////////////////////////////////////////////////
    // Public methods
    ////////////////////////////////////////////////////////////

    /**
     * Create an empty BrickMap
     */
    this.init = (callback) => {
        this.createBrickMap((err, brickMap) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to create new brickMap`, err));
            }

            state.init(brickMap, callback);
        });
    }

    /**
     * Load an existing BrickMap using the BrickMap strategy
     */
    this.load = (callback) => {
        config.getKeySSI((err, keySSI) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to retrieve keySSI`, err));
            }

            strategy.load(keySSI, (err, brickMap) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to load brickMap`, err));
                }


                state.init(brickMap, strategy.getLastHashLink(), callback);
            });
        });
    }

    /**
     * @param {string} path
     * @param {Array<object>} bricksData
     * @param {callback} callback
     */
    this.addFile = (path, bricksData, callback) => {
        validator.validate('preWrite', state.getDirtyBrickMap(), 'addFile', path, {
            bricksData
        }, (err) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to validate addFile operation`, err));
            }

            getCurrentDiffBrickMap((err, _brickMap) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to retrieve current diffBrickMap`, err));
                }

                this.addFileEntry(path, bricksData);
                this.attemptAnchoring(callback);
            });
        })
    }

    /**
     * @param {string} srcPath
     * @param {string} dstPath
     * @param {callback} callback
     */
    this.renameFile = (srcPath, dstPath, callback) => {
        validator.validate('preWrite', state.getDirtyBrickMap(), 'rename', srcPath, {
            dstPath
        }, (err) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to validate rename operation`, err));
            }

            getCurrentDiffBrickMap((err, _brickMap) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to retrieve current diffBrickMap`, err));
                }
                try {
                    this.copy(srcPath, dstPath);
                } catch (e) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to copy`, e));
                }
                this.delete(srcPath);
                this.attemptAnchoring(callback);
            })
        })
    }
    /**
     * @param {string} srcPath
     * @param {string} dstPath
     * @param {callback} callback
     */
    this.cloneFolder = (srcPath, dstPath, callback) => {
        validator.validate('preWrite', state.getDirtyBrickMap(), 'clone', srcPath, {
            dstPath
        }, (err) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to validate copy operation`, err));
            }

            getCurrentDiffBrickMap((err, _brickMap) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to retrieve current diffBrickMap`, err));
                }
                try {
                    this.copy(srcPath, dstPath);
                } catch (e) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to copy`, e));
                }

                this.attemptAnchoring(callback);
            })
        })
    }

    /**
     * @param {string} path
     * @param {Array<object>} bricksData
     * @param {callback} callback
     */
    this.appendToFile = (path, bricksData, callback) => {
        validator.validate('preWrite', state.getDirtyBrickMap(), 'appendToFile', path, {
            bricksData
        }, (err) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to validate appendToFile operation`, err));
            }

            getCurrentDiffBrickMap((err, _brickMap) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to retrieve current diffBrickMap`, err));
                }

                this.appendBricksToFile(path, bricksData);
                this.attemptAnchoring(callback);
            })
        })
    }

    /**
     * @param {string} path
     * @param {Array<object>} filesBricksData
     * @param {callback} callback
     */
    this.addFiles = (path, filesBricksData, callback) => {
        validator.validate('preWrite', state.getDirtyBrickMap(), 'addFiles', path, {
            filesBricksData
        }, (err) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to validate addFiles operation`, err));
            }

            getCurrentDiffBrickMap((err, _brickMap) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to retrieve current diffBrickMap`, err));
                }

                for (const filePath in filesBricksData) {
                    const bricks = filesBricksData[filePath];
                    this.addFileEntry(pskPth.join(path, filePath), bricks);
                }
                this.attemptAnchoring(callback);
            })
        })
    }

    /**
     * @param {string} path
     * @param {callback} callback
     */
    this.deleteFile = (path, callback) => {
        validator.validate('preWrite', state.getDirtyBrickMap(), 'deleteFile', path, (err) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to validate deleteFile operation`, err));
            }

            getCurrentDiffBrickMap((err, _brickMap) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to retrieve current diffBrickMap`, err));
                }

                try {
                    this.delete(path);
                } catch (e) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to delete`, e));
                }
                this.attemptAnchoring(callback);
            })
        })
    }

    /**
     * @param {string} path
     * @param {callback} callback
     */
    this.createDirectory = (path, callback) => {
        validator.validate('preWrite', state.getDirtyBrickMap(), 'createFolder', path, (err) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to validate createFolder operation`, err));
            }

            getCurrentDiffBrickMap((err, _brickMap) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to retrieve current diffBrickMap`, err));
                }

                try {
                    this.createFolder(path);
                } catch (e) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to create folder ${path}`, e));
                }
                this.attemptAnchoring(callback);
            })
        })
    }

    /**
     * @param {string} path
     * @param {callback} callback
     */
    this.createEmptyFile = (path, callback) => {
        validator.validate('preWrite', state.getDirtyBrickMap(), 'createFile', path, (err) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to validate createFile operation`, err));
            }

            getCurrentDiffBrickMap((err, _brickMap) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to retrieve current diffBrickMap`, err));
                }

                try {
                    this.createFile(path);
                } catch (e) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to create file ${path}`, e));
                }
                this.attemptAnchoring(callback);
            })
        })
    }

    /**
     * Proxy for BatMap.addFileEntry()
     *
     * @param {string} path
     * @param {Array<object>} bricks
     * @throws {Error}
     */
    this.addFileEntryProxyHandler = (path, bricks) => {
        const dirtyBrickMap = state.getDirtyBrickMap();
        let truncateFileIfExists = false;
        if (!dirtyBrickMap.isEmpty(path)) {
            truncateFileIfExists = true;
        }

        dirtyBrickMap.addFileEntry(path, bricks);
        if (truncateFileIfExists) {
            state.getCurrentDiff().emptyList(path);
        }
        state.getCurrentDiff().addFileEntry(path, bricks);
    }

    /**
     * Proxy for BrickMap.appendBricksToFile()
     *
     * @param {string} path
     * @param {Array<object>} bricks
     * @throws {Error}
     */
    this.appendBricksToFileProxyHandler = (path, bricks) => {
        const dirtyBrickMap = state.getDirtyBrickMap();
        dirtyBrickMap.appendBricksToFile(path, bricks);
        state.getCurrentDiff().appendBricksToFile(path, bricks);
    }

    /**
     * Proxy for BrickMap.delete();
     *
     * @param {string} path
     * @throws {Error}
     */
    this.deleteProxyHandler = (path) => {
        const dirtyBrickMap = state.getDirtyBrickMap();
        dirtyBrickMap.delete(path);
        state.getCurrentDiff().delete(path);
    }

    /**
     * Proxy for BrickMap.copy()
     *
     * @param {string} srcPath
     * @param {string} dstPath
     * @throws {Error}
     */
    this.copyProxyHandler = (srcPath, dstPath) => {
        const dirtyBrickMap = state.getDirtyBrickMap();
        dirtyBrickMap.copy(srcPath, dstPath);
        state.getCurrentDiff().copy(srcPath, dstPath);
    }

    /**
     * Proxy for BrickMap.createFolder()
     *
     * @param {string} path
     */
    this.createFolderProxyHandler = (path) => {
        const dirtyBrickMap = state.getDirtyBrickMap();
        dirtyBrickMap.createFolder(path);
        state.getCurrentDiff().createFolder(path);
    }

    /**
     * Proxy for BrickMap.createFile()
     *
     * @param {string} path
     */
    this.createFileProxyHandler = (path) => {
        const dirtyBrickMap = state.getDirtyBrickMap();
        dirtyBrickMap.createFile(path);
        state.getCurrentDiff().createFile(path);
    }

    /**
     * Persists a BrickMap Brick
     *
     * @param {BrickMap} brickMap
     * @param {callback} callback
     */
    this.saveBrickMap = (domain, brickMap, callback) => {
        const brickMapBrick = brickMap.toBrick();
        brickMapBrick.setKeySSI(brickMap.getBrickEncryptionKeySSI());
        brickMapBrick.getTransformedData((err, brickData) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get brickMap brick's transformed data`, err));
            }

            bricking.putBrick(domain, brickData, callback);
        });
    }

    /**
     * @param {Brick|undefined} brick
     * @param {function} callback
     */
    this.createBrickMap = (brick, callback) => {
        if (typeof brick === "function") {
            callback = brick;
            brick = undefined;
        }

        const brickMap = new BrickMap(brick);
        this.configureBrickMap(brickMap, (err => callback(err, brickMap)));
    }

    /**
     * @param {Brick|undefined} brick
     * @return {function} callback
     */
    this.createBrickMapDiff = (brick, callback) => {
        return createBrickMapDiff(brick, callback);
    }

    /**
     * @param {BrickMap} brickMap
     * @param callback
     */
    this.configureBrickMap = (brickMap, callback) => {
        if (!brickMap.getTemplateKeySSI()) {
            brickMap.setKeySSI(keySSI);
        }

        brickMap.load(callback);
    }

    /**
     * @param {object} rules
     * @param {object} rules.preWrite
     * @param {object} rules.afterLoad
     */
    this.setValidationRules = (rules) => {
        validator.setRules(rules);
    }

    /**
     * Start the anchoring process only
     * if the BrickMapStrategy decides it's time
     *
     * @param {callback} callback
     */
    this.attemptAnchoring = (callback) => {
        const dirtyBrickMap = state.getDirtyBrickMap();
        strategy.ifChangesShouldBeAnchored(dirtyBrickMap, (err, result) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to determine if changes should be anchored`, err));
            }

            if (!result) {
                return callback();
            }

            // In order to preserve backwards compatibility
            // with the existing code, if no "anchoring event listener"
            // is set, use the `callback` as a listener
            const anchoringEventListener = strategy.getAnchoringEventListener(callback);
            if (anchoringEventListener !== callback) {
                // Resume execution and perform the anchoring in the background
                // When anchoring has been done the `anchoringEventListener` will be notified
                callback();
            }

            this.anchorChanges(anchoringEventListener);
        });
    }

    /**
     * @param {callback} listener
     * @param {BrickMap|undefined} brickMap
     */
    this.anchorChanges = (listener, brickMap) => {
        if (anchoringInProgress || (!state.canBeAnchored() && !brickMap)) {
            return listener();
        }

        anchoringInProgress = true;

        // Use the strategy to compact/merge any BrickMapDiff objects into a single
        // BrickMap instance
        strategy.compactDiffs(brickMap, (err, result) => {
            if (err) {
                return OpenDSUSafeCallback(listener)(createOpenDSUErrorWrapper(`Failed to compact diffs`, err));
            }

            const [brickMap, mergedDiffs] = result;
            const bricksDomain = keySSI.getBricksDomain();
            this.saveBrickMap(bricksDomain, brickMap, (err, hash) => {
                if (err) {
                    state.rollback(mergedDiffs);
                    return endAnchoring(listener, anchoringStatus.PERSIST_BRICKMAP_ERR, err);
                }

                const timestamp = Date.now();
                const hashLink = keyssi.createHashLinkSSI(bricksDomain, hash, keySSI.getVn(), keySSI.getHint());
                let dataToSign = timestamp;
                if (state.getLastAnchoredHashLink()) {
                    dataToSign = state.getLastAnchoredHashLink().getIdentifier() + timestamp;
                }
                dataToSign += keySSI.getAnchorId();
                keySSI.sign(dataToSign, (err, signature) => {
                    if (err) {
                        return OpenDSUSafeCallback(listener)(createOpenDSUErrorWrapper(`Failed to sign data`, err));
                    }

                    //signedHashLink should not contain any hint because is not trusted
                    const signedHashLink = keyssi.createSignedHashLinkSSI(bricksDomain, hashLink.getHash(), timestamp, signature, keySSI.getVn());

                    const updateAnchorCallback = (err) => {
                        if (err) {
                            // In case of any errors, the compacted BrickMapDiff objects
                            // are put back into the "pending anchoring" state in case
                            // we need to retry the anchoring process
                            state.rollback(mergedDiffs);

                            // The anchoring middleware detected that we were trying
                            // to anchor outdated changes. In order to finish the anchoring
                            // process the conflict must be first resolved
                            if (isAliasSyncError(err)) {
                                return this.handleAnchoringConflict(listener);
                            }

                            return endAnchoring(listener, anchoringStatus.ANCHOR_VERSION_ERR, err);
                        }

                        // After the alias is updated, the strategy is tasked
                        // with updating our anchored BrickMap with the new changes
                        strategy.afterBrickMapAnchoring(brickMap, signedHashLink, (err, hashLink) => {
                            if (err) {
                                return endAnchoring(listener, anchoringStatus.BRICKMAP_UPDATE_ERR, err);
                            }

                            endAnchoring(listener, anchoringStatus.OK, hashLink);

                            if (anchoringRequestExists()) {
                                // Another anchoring was requested during the time this one
                                // was in progress, as such, we start the process again
                                this.anchorChanges(listener);
                            }
                        });
                    }

                    const lastAnchoredHashLink = state.getLastAnchoredHashLink();
                    if (!lastAnchoredHashLink) {
                        anchoring.createAnchor(keySSI, (err) => {
                            if (err) {
                                return OpenDSUSafeCallback(listener)(createOpenDSUErrorWrapper(`Failed to create anchor`, err));
                            }

                            anchoring.appendToAnchor(keySSI, signedHashLink, '', updateAnchorCallback);
                        });
                    } else {
                        anchoring.appendToAnchor(keySSI, signedHashLink, lastAnchoredHashLink, updateAnchorCallback);
                    }
                })
            })
        });
    }

    /**
     * If an anchoring conflict occurs, reload our anchored BrickMap
     * in order to get the new changes and then try to merge our BrickMapDiff
     * instances
     *
     * @param {callback} listener
     */
    this.handleAnchoringConflict = (listener) => {
        const currentAnchoredHashLinkSSI = strategy.getLastHashLink();
        strategy.load(keySSI, (err, brickMap) => {
            if (err) {
                return endAnchoring(listener, anchoringStatus.BRICKMAP_LOAD_ERR, err);
            }
            state.setLastAnchoredHashLink(strategy.getLastHashLink());

            // Try and merge our changes
            strategy.reconcile(brickMap, currentAnchoredHashLinkSSI, (err, result) => {
                if (err) {
                    return endAnchoring(listener, anchoringStatus.BRICKMAP_RECONCILE_ERR, err);
                }

                anchoringInProgress = false;

                if (!result.status) {
                    return endAnchoring(listener, anchoringStatus.BRICKMAP_RECONCILIATION_HANDOFF)
                }
                this.anchorChanges(listener, result.brickMap);
            });
        });
    }

    /**
     * @return {boolean}
     */
    this.hasUnanchoredChanges = () => {
        return state.hasNewDiffs() || anchoringRequestExists();
    }

    /**
     * @return {object}
     */
    this.getState = () => {
        return state;
    }

    initialize();
}

module.exports = BrickMapController;
