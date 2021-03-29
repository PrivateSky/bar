'use strict';

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
 * After anchoring any changes the valid BrickMap is updated with the changes stored in BrickMapDiff
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

    const DEFAULT_BRICK_MAP_STRATEGY = "LatestVersion";
    options = options || {};

    const config = options.config;
    const keySSI = options.keySSI;
    const brickStorageService = options.brickStorageService;
    const keyssi = require("opendsu").loadApi("keyssi");
    if (!config) {
        throw new Error('An ArchiveConfigurator is required!');
    }

    if (!brickStorageService) {
        throw new Error('BrickStorageService is required');
    }

    // HTTP error code returned by the anchoring middleware
    // when trying to anchor outdated changes
    const ALIAS_SYNC_ERR_CODE = 428;

    let strategy = config.getBrickMapStrategy();

    let validator = new AnchorValidator({
        rules: config.getValidationRules()
    });

    let anchoringInProgress = false;
    let validBrickMap;
    // A copy of the `validBrickMap`
    // Considered "dirty" when it contains any changes which haven't been anchored
    let dirtyBrickMap;

    let currentDiffBrickMap;
    // List of BrickMapDiff objects which haven't been scheduled for anchoring
    let newDiffs = [];
    // List of BrickMapDiff objects which are in the process of anchoring
    let pendingAnchoringDiffs = [];

    // The last anchored BrickMap hash
    let lastValidHashLink;

    // The hash of the latest created BrickMapDiff
    // Used for chaining multiple BrickMapDiff objects
    let lastDiffHash;


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
        strategy.setValidator(validator);

        const brickMap = new BrickMap();
        const brickMapProperties = Object.getOwnPropertyNames(brickMap);
        for (const propertyName of brickMapProperties) {
            if (typeof brickMap[propertyName] !== 'function' || propertyName === 'load') {
                continue;
            }
            this[propertyName] = createProxyMethod(propertyName);
        }
    }

    /**
     * Create a new instance of the DiffStrategy from DIDResolver
     * @return {DiffStrategy}
     */
    const getDefaultStrategy = () => {
        const factory = new BrickMapStrategyFactory();
        const strategy = factory.create(DEFAULT_BRICK_MAP_STRATEGY);

        return strategy;
    }

    /**j
     * Create a proxy method for BrickMap::{method}
     *
     * If BrickMapController has a method named ${method}ProxyHandler
     * the call to BrickMap::{method} is redirected to
     * BrickMapController::{method}ProxyHandler
     *
     * @param {string} method
     * @return {Proxy}
     */
    const createProxyMethod = (method) => {
        const proxy = new Proxy(function () {
        }, {
            apply: (target, thisArg, argumentsList) => {
                const targetHandlerName = `${method}ProxyHandler`;

                if (typeof this[targetHandlerName] === 'function') {
                    return this[targetHandlerName](...argumentsList);
                }
                return dirtyBrickMap[method].apply(dirtyBrickMap, argumentsList);
            }
        })

        return proxy
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
        let brickMapDiff = newDiffs[newDiffs.length - 1];
        if (!brickMapDiff) {
            brickMapDiff = new BrickMapDiff();
            return brickMapDiff.initialize((err) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to initialize brickMapDiff`, err));
                }


                brickMapDiff.setPrevDiffHashLink(lastDiffHash);
                this.configureBrickMap(brickMapDiff, (err) => {
                    if (err) {
                        return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to configure brickMap`, err));
                    }

                    currentDiffBrickMap = brickMapDiff;
                    newDiffs.push(brickMapDiff);
                    callback(undefined, brickMapDiff);
                });

            });
        }

        currentDiffBrickMap = brickMapDiff;
        setTimeout(() => {
            callback(undefined, brickMapDiff);
        })
    }

    /**
     * Move any new BrickMapDiff objects into the
     * "pending for anchoring" state
     */
    const moveNewDiffsToPendingAnchoringState = (callback) => {
        if (newDiffs.length === 0) {
            return callback();
        }

        const diff = newDiffs.shift();
        diff.getHashLink((err, _lastDiffHashLink) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get hashLink`, err));
            }

            lastDiffHash = _lastDiffHashLink;
            pendingAnchoringDiffs.push(diff);
            moveNewDiffsToPendingAnchoringState(callback);
        });
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
        if (status === anchoringStatus.OK) {
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
        return pendingAnchoringDiffs.length > 0;
    }

    ////////////////////////////////////////////////////////////
    // Public methods
    ////////////////////////////////////////////////////////////

    /**
     * Create an empty BrickMap
     */
    this.init = (callback) => {
        this.createNewBrickMap((err, _brickMap) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to create new brickMap`, err));
            }

            validBrickMap = _brickMap;
            validBrickMap.clone((err, _dirtyBrickMap) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to clone valid brickMap`, err));
                }

                dirtyBrickMap = _dirtyBrickMap;
                callback();
            });
        });
    }

    /**
     * Load an existing BrickMap using the BrickMapStrategy
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

                validBrickMap = brickMap;
                brickMap.clone((err, _dirtyBrickMap) => {
                    if (err) {
                        return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to clone brickMap`, err));
                    }

                    dirtyBrickMap = _dirtyBrickMap;
                    lastValidHashLink = strategy.getLastHashLink();
                    lastDiffHash = lastValidHashLink;
                    callback();
                });
            });
        });
    }

    /**
     * @param {string} path
     * @param {Array<object>} bricksData
     * @param {callback} callback
     */
    this.addFile = (path, bricksData, callback) => {
        validator.validate('preWrite', dirtyBrickMap, 'addFile', path, {
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
        validator.validate('preWrite', dirtyBrickMap, 'rename', srcPath, {
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
     * @param {string} path
     * @param {Array<object>} bricksData
     * @param {callback} callback
     */
    this.appendToFile = (path, bricksData, callback) => {
        validator.validate('preWrite', dirtyBrickMap, 'appendToFile', path, {
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
        validator.validate('preWrite', dirtyBrickMap, 'addFiles', path, {
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
        validator.validate('preWrite', dirtyBrickMap, 'deleteFile', path, (err) => {
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
        validator.validate('preWrite', dirtyBrickMap, 'createFolder', path, (err) => {
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
        validator.validate('preWrite', dirtyBrickMap, 'createFile', path, (err) => {
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
        let truncateFileIfExists = false;
        if (!dirtyBrickMap.isEmpty(path)) {
            truncateFileIfExists = true;
        }

        dirtyBrickMap.addFileEntry(path, bricks);
        if (truncateFileIfExists) {
            currentDiffBrickMap.emptyList(path);
        }
        currentDiffBrickMap.addFileEntry(path, bricks);
    }

    /**
     * Proxy for BrickMap.appendBricksToFile()
     *
     * @param {string} path
     * @param {Array<object>} bricks
     * @throws {Error}
     */
    this.appendBricksToFileProxyHandler = (path, bricks) => {
        dirtyBrickMap.appendBricksToFile(path, bricks);
        currentDiffBrickMap.appendBricksToFile(path, bricks);
    }

    /**
     * Proxy for BrickMap.delete();
     *
     * @param {string} path
     * @throws {Error}
     */
    this.deleteProxyHandler = (path) => {
        dirtyBrickMap.delete(path);
        currentDiffBrickMap.delete(path);
    }

    /**
     * Proxy for BrickMap.copy()
     *
     * @param {string} srcPath
     * @param {string} dstPath
     * @throws {Error}
     */
    this.copyProxyHandler = (srcPath, dstPath) => {
        dirtyBrickMap.copy(srcPath, dstPath);
        currentDiffBrickMap.copy(srcPath, dstPath);
    }

    /**
     * Proxy for BrickMap.createFolder()
     *
     * @param {string} path
     */
    this.createFolderProxyHandler = (path) => {
        dirtyBrickMap.createFolder(path);
        currentDiffBrickMap.createFolder(path);
    }

    /**
     * Proxy for BrickMap.createFile()
     *
     * @param {string} path
     */
    this.createFileProxyHandler = (path) => {
        dirtyBrickMap.createFile(path);
        currentDiffBrickMap.createFile(path);
    }


    /**
     * @param {string} keySSI
     * @param {callback} callback
     */
    this.versions = (keySSI, callback) => {
        brickStorageService.versions(keySSI, callback);
    }

    /**
     * @param {string} keySSI
     * @param {string} hashLinkSSI
     * @param {string|undefined} lastHashLinkSSI
     * @param {callback} callback
     */
    this.addVersion = (keySSI, hashLinkSSI, lastHashLinkSSI, callback) => {
        brickStorageService.addVersion(keySSI, hashLinkSSI, lastHashLinkSSI, callback);
    }

    /**
     * @param {Array<string>} hashLinkSSIs
     * @param {callback} callback
     */
    this.getMultipleBricks = (hashLinkSSIs, callback) => {
        brickStorageService.getMultipleBricks(hashLinkSSIs, callback);
    }

    /**
     * @param {string} hashLinkSSI
     * @param {callback} callback
     */
    this.getBrick = (hashLinkSSI, callback) => {
        brickStorageService.getBrick(hashLinkSSI, callback);
    }

    /**
     * Persists a BrickMap Brick
     *
     * @param {BrickMap} brickMap
     * @param {callback} callback
     */
    this.saveBrickMap = (keySSI, brickMap, callback) => {
        const brickMapBrick = brickMap.toBrick();
        brickMapBrick.setKeySSI(brickMap.getBrickEncryptionKeySSI());
        brickMapBrick.getTransformedData((err, brickData) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get brickMap brick's transformed data`, err));
            }

            brickStorageService.putBrick(keySSI, brickData, callback);
        });
    }

    /**
     * @param {Brick|undefined} brick
     * @return {BrickMap}
     */
    this.createNewBrickMap = (brick, callback) => {
        if (typeof brick === "function") {
            callback = brick;
            brick = undefined;
        }

        const brickMap = new BrickMap(brick);
        this.configureBrickMap(brickMap, (err => callback(err, brickMap)));
    }

    /**
     * @return {BrickMap}
     */
    this.getValidBrickMap = () => {
        return validBrickMap;
    }

    /**
     * @param {BrickMap}
     */
    this.setValidBrickMap = (brickMap) => {
        validBrickMap = brickMap;
    }

    /**
     * @param {BrickMap} brickMap
     * @param callback
     */
    this.configureBrickMap = (brickMap, callback) => {
        // if (config.getMapEncryptionKey()) {
        //     brickMap.setEncryptionKey(config.getMapEncryptionKey());
        // }

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
     */
    this.anchorChanges = (listener) => {
        // Move new BrickMapDiff's to the "pending anchoring" state
        moveNewDiffsToPendingAnchoringState((err) => {
            if (err) {
                return endAnchoring(listener, anchoringStatus.PERSIST_BRICKMAP_ERR, err);
            }

            if (!pendingAnchoringDiffs.length) {
                return listener();
            }

            if (anchoringInProgress) {
                return listener();
            }

            anchoringInProgress = true;

            // Use the strategy to compact/merge any BrickMapDiff objects into a single
            // diff object. Once this happens the "pendingAnchoringDiff" list is emptied
            strategy.compactDiffs(pendingAnchoringDiffs, (err, brickMap) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to compact diffs`, err));
                }

                this.saveBrickMap(keySSI, brickMap, (err, hash) => {
                    if (err) {
                        pendingAnchoringDiffs.unshift(brickMap);
                        return endAnchoring(listener, anchoringStatus.PERSIST_BRICKMAP_ERR, err);
                    }

                    const hashLink = keyssi.createHashLinkSSI(keySSI.getBricksDomain(), hash, keySSI.getVn(), keySSI.getHint());
                    // TODO: call strategy.signHash() and pass the signedHash
                    this.addVersion(keySSI, hashLink, lastValidHashLink, (err) => {
                        if (err) {
                            // In case of any errors, the compacted BrickMapDiff object
                            // is put back into the "pending anchoring" state in case
                            // we need to retry the anchoring process
                            pendingAnchoringDiffs.unshift(brickMap);

                            // The anchoring middleware detected that we were trying
                            // to anchor outdated changes. In order to finish anchoring
                            // these changes the conflict must be first resolved
                            if (err.statusCode === ALIAS_SYNC_ERR_CODE) {
                                return this.handleAnchoringConflict(listener);
                            }

                            return endAnchoring(listener, anchoringStatus.ANCHOR_VERSION_ERR, err);
                        }

                        // After the alias is updated, the strategy is tasked
                        // with updating the valid BrickMap with the new changes
                        strategy.afterBrickMapAnchoring(brickMap, hashLink, (err, _hashLink) => {
                            if (err) {
                                return endAnchoring(listener, anchoringStatus.BRICKMAP_UPDATE_ERR, err);
                            }

                            lastValidHashLink = _hashLink;
                            endAnchoring(listener, anchoringStatus.OK, _hashLink);

                            if (anchoringRequestExists()) {
                                // Another anchoring was requested during the time this one
                                // was in progress, as such, we start the process again
                                this.anchorChanges(listener);
                            }
                        });
                    })
                })
            });

        })
    }

    /**
     * If an anchoring conflict occurs, reload the valid BrickMap
     * in order to get the new changes and then try to merge our BrickMapDiff
     *
     * @param {callback} listener
     */
    this.handleAnchoringConflict = (listener) => {
        strategy.load(keySSI, (err, brickMap) => {
            if (err) {
                return endAnchoring(listener, anchoringStatus.BRICKMAP_LOAD_ERR, err);
            }
            lastValidHashLink = strategy.getLastHashLink();

            // Pick up any new BrickMapDiff's and add them to into the "pending anchoring" state
            moveNewDiffsToPendingAnchoringState((err) => {
                if (err) {
                    return endAnchoring(listener, anchoringStatus.BRICKMAP_RECONCILE_ERR, err);
                }

                // Try and merge our changes
                // Pass a reference to the `newDiffs` list in case some more changes occur
                // during the "reconciliation" process and merge them before re-trying the
                // anchoring process
                strategy.reconcile(brickMap, pendingAnchoringDiffs, newDiffs, (err) => {
                    if (err) {
                        return endAnchoring(listener, anchoringStatus.BRICKMAP_RECONCILE_ERR, err);
                    }

                    anchoringInProgress = false;
                    this.anchorChanges(listener);
                });
            });
        });
    }

    /**
     * The strategy will use this to update the dirtyBrickMap
     * after an anchoring conflict has been resolved
     * @param {BrickMap} brickMap
     */
    this.setDirtyBrickMap = (brickMap) => {
        dirtyBrickMap = brickMap;
    }

    /**
     * @return {boolean}
     */
    this.hasUnanchoredChanges = () => {
        return newDiffs.length || anchoringRequestExists();
    }

    initialize();
}

module.exports = BrickMapController;
