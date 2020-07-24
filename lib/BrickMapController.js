'use strict';

const didResolver = require('key-ssi-resolver');
const swarmutils = require("swarmutils");
const BrickMap = require('./BrickMap');
const Brick = require('./Brick');
const AnchorValidator = require('./AnchorValidator');
const pskPth = swarmutils.path;
const BrickMapDiff = require('./BrickMapDiff');
const anchoringStatus = require('./constants').anchoringStatus;

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
    options = options || {};

    const config = options.config;
    const brickStorageService = options.brickStorageService;
    let legacyMode = false;

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

    // List of BrickMapDiff objects which haven't been scheduled for anchoring
    let newDiffs = [];
    // List of BrickMapDiff objects which are in the process of anchoring
    let pendingAnchoringDiffs = [];

    // The last anchored BrickMap hash
    let lastValidHash;

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
            legacyMode = true;
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
        const factory = new didResolver.BrickMapStrategyFactory();
        const strategy = factory.create(didResolver.constants.DEFAULT_BAR_MAP_STRATEGY);

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
        const proxy = new Proxy(function () {}, {
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
    const getCurrentDiffBrickMap = () => {
        let brickMapDiff = newDiffs[newDiffs.length - 1];
        if (!brickMapDiff) {
            brickMapDiff = new BrickMapDiff();
            brickMapDiff.setPrevDiffHash(lastDiffHash);
            this.configureBrickMap(brickMapDiff);
            newDiffs.push(brickMapDiff);
        }
        return brickMapDiff;
    }

    /**
     * Move any new BrickMapDiff objects into the
     * "pending for anchoring" state
     */
    const moveNewDiffsToPendingAnchoringState = () => {
        while (newDiffs.length) {
            const diff = newDiffs.shift();
            lastDiffHash = diff.getHash();
            pendingAnchoringDiffs.push(diff);
        }
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
        validBrickMap = this.createNewBrickMap();
        dirtyBrickMap = validBrickMap.clone();
        callback();
    }

    /**
     * Load an existing BrickMap using the BrickMapStrategy
     */
    this.load = (callback) => {
        const alias = config.getBrickMapId();
        strategy.load(alias, (err, brickMap) => {
            if (err) {
                if (legacyMode && typeof err.message === 'string' && err.message.startsWith('No data found for alias')) {
                    return this.init(callback);

                }
                return callback(err);
            }

            validBrickMap = brickMap;
            dirtyBrickMap = brickMap.clone();
            lastValidHash = strategy.getLastHash();
            lastDiffHash = lastValidHash;
            callback();
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
                return callback(err);
            }

            this.addFileEntry(path, bricksData);
            this.attemptAnchoring(callback);
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
                return callback(err);
            }

            try {
                this.copy(srcPath, dstPath);
            } catch (e) {
                return callback(e);
            }

            this.delete(srcPath);
            this.attemptAnchoring(callback);
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
                return callback(err);
            }

            this.appendBricksToFile(path, bricksData);
            this.attemptAnchoring(callback);
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
                return callback(err);
            }

            for (const filePath in filesBricksData) {
                const bricks = filesBricksData[filePath];
                this.addFileEntry(pskPth.join(path, filePath), bricks);
            }
            this.attemptAnchoring(callback);
        })
    }

    /**
     * @param {string} path
     * @param {callback} callback
     */
    this.deleteFile = (path, callback) => {
        validator.validate('preWrite', dirtyBrickMap, 'deleteFile', path, (err) => {
            if (err) {
                return callback(err);
            }

            try {
                this.delete(path);
            } catch (e) {
                return callback(e);
            }
            this.attemptAnchoring(callback);
        })
    }

    /**
     * @param {string} path
     * @param {callback} callback
     */
    this.createDirectory = (path, callback) => {
        validator.validate('preWrite', dirtyBrickMap, 'createFolder', path, (err) => {
            if (err) {
                return callback(err);
            }

            try {
                this.createFolder(path);
            } catch (e) {
                return callback(e);
            }
            this.attemptAnchoring(callback);
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
        const diffBrickMap = getCurrentDiffBrickMap();
        let truncateFileIfExists = false;
        if (!dirtyBrickMap.isEmpty(path)) {
            truncateFileIfExists = true;
        }

        dirtyBrickMap.addFileEntry(path, bricks);
        if (truncateFileIfExists) {
            diffBrickMap.emptyList(path);
        }
        diffBrickMap.addFileEntry(path, bricks);
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
        getCurrentDiffBrickMap().appendBricksToFile(path, bricks);
    }

    /**
     * Proxy for BrickMap.delete();
     * 
     * @param {string} path
     * @throws {Error}
     */
    this.deleteProxyHandler = (path) => {
        dirtyBrickMap.delete(path);
        getCurrentDiffBrickMap().delete(path);
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
        getCurrentDiffBrickMap().copy(srcPath, dstPath);
    }

    /**
     * Proxy for BrickMap.createFolder()
     * 
     * @param {string} path
     */
    this.createFolderProxyHandler = (path) => {
        dirtyBrickMap.createFolder(path);
        getCurrentDiffBrickMap().createFolder(path);
    }


    /**
     * @param {string} alias
     * @param {callback} callback
     */
    this.getAliasVersions = (alias, callback) => {
        brickStorageService.getAliasVersions(alias, callback);
    }

    /**
     * @param {string} alias
     * @param {string} hash
     * @param {string|undefined} lastHash
     * @param {callback} callback
     */
    this.updateAlias = (alias, hash, lastHash, callback) => {
        brickStorageService.updateAlias(alias, hash, lastHash, callback);
    }

    /**
     * @param {Array<string>} hashes
     * @param {callback} callback
     */
    this.getMultipleBricks = (hashes, callback) => {
        brickStorageService.getMultipleBricks(hashes, callback);
    }

    /**
     * @param {string} id
     * @param {callback} callback
     */
    this.getBrick = (id, callback) => {
        brickStorageService.getBrick(id, callback);
    }

    /**
     * Persists a BrickMap Brick
     * 
     * @param {BrickMap} brickMap
     * @param {callback} callback
     */
    this.saveBrickMap = (brickMap, callback) => {
        const brickMapBrick = brickMap.toBrick();
        brickMapBrick.setTransformParameters(brickMap.getTransformParameters());

        brickStorageService.putBrick(brickMapBrick, callback);
    }

    /**
     * @param {Brick|undefined} brick
     * @return {BrickMap}
     */
    this.createNewBrickMap = (brick) => {
        const brickMap = new BrickMap(brick);
        this.configureBrickMap(brickMap);
        return brickMap;
    }

    /**
     * @return {BrickMap}
     */
    this.getValidBrickMap = () => {
        return validBrickMap;
    }

    /**
     * @param {BrickMap} brickMap
     */
    this.configureBrickMap = (brickMap) => {
        if (config.getMapEncryptionKey()) {
            brickMap.setEncryptionKey(config.getMapEncryptionKey());
        }

        if (!brickMap.getConfig()) {
            brickMap.setConfig(config);
        }

        brickMap.load();
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
                return callback(err);
            }

            if (!result) {
                return callback(err);
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
        moveNewDiffsToPendingAnchoringState();

        if (!pendingAnchoringDiffs.length) {
            return;
        }

        if (anchoringInProgress) {
            return;
        }

        anchoringInProgress = true;

        // Use the strategy to compact/merge any BrickMapDiff objects into a single
        // diff object. Once this happens the "pendingAnchoringDiff" list is emptied
        const brickMap = strategy.compactDiffs(pendingAnchoringDiffs);

        this.saveBrickMap(brickMap, (err, hash) => {
            if (err) {
                pendingAnchoringDiffs.unshift(brickMap);
                return endAnchoring(listener, anchoringStatus.PERSIST_BRICKMAP_ERR, err);
            }

            // TODO: call strategy.signHash() and pass the signedHash
            const alias = config.getBrickMapId();
            this.updateAlias(alias, hash, lastValidHash, (err) => {
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
                strategy.afterBrickMapAnchoring(brickMap, hash, (err, hash) => {
                    if (err) {
                        return endAnchoring(listener, anchoringStatus.BRICKMAP_UPDATE_ERR, err);
                    }

                    lastValidHash = hash;
                    endAnchoring(listener, anchoringStatus.OK, hash);

                    if (anchoringRequestExists()) {
                        // Another anchoring was requested during the time this one
                        // was in progress, as such, we start the process again
                        this.anchorChanges(listener);
                    }
                });
            })
        })
    }

    /**
     * If an anchoring conflict occurs, reload the valid BrickMap
     * in order to get the new changes and then try to merge our BrickMapDiff
     * 
     * @param {callback} listener
     */
    this.handleAnchoringConflict = (listener) => {
        const alias = config.getBrickMapId();
        strategy.load(alias, (err, brickMap) => {
            if (err) {
                return endAnchoring(listener, anchoringStatus.BRICKMAP_LOAD_ERR, err);
            }
            lastValidHash = strategy.getLastHash();

            // Pick up any new BrickMapDiff's and add them to into the "pending anchoring" state
            moveNewDiffsToPendingAnchoringState();

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
    }

    /**
     * The strategy will use this to update the dirtyBrickMap
     * after an anchoring conflict has been resolved
     * @param {BrickMap} brickMap
     */
    this.setDirtyBrickMap = (brickMap) => {
        dirtyBrickMap = brickMap;
    }

    initialize();
}

module.exports = BrickMapController;
