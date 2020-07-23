'use strict';

const didResolver = require('key-ssi-resolver');
const swarmutils = require("swarmutils");
const BarMap = require('./BarMap');
const Brick = require('./Brick');
const AnchorValidator = require('./AnchorValidator');
const pskPth = swarmutils.path;
const BarMapDiff = require('./BarMapDiff');
const anchoringStatus = require('./constants').anchoringStatus;

/**
 * BarMap Proxy
 * 
 * Handles loading and anchoring a BarMap using the provided BarMapStrategy
 * in the ArchiveConfigurator
 * 
 * BarMap write operations are proxied to a copy of a valid BarMap and to a BarMapDiff
 * used later for anchoring. The reason for that is to preserve read consistency during
 * a session. Writing only to a BarMapDiff object will cause subsequent reads to fail;
 * in order to simplify the implementation the same "write" operation is written to the
 * "dirty" BarMap and to the BarMapDiff object (only this object will be anchored). Any
 * read operations will go directly to the "dirty" BarMap.
 * 
 * After anchoring any changes the valid BarMap is updated with the changes stored in BarMapDiff
 * thus being in sync with the "dirty" copy
 * 
 * @param {object} options
 * @param {ArchiveConfigurator} options.config
 * @param {BrickStorageService} options.brickStorageService
 */
function BarMapController(options) {
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

    let strategy = config.getBarMapStrategy();
    let validator = new AnchorValidator({
        rules: config.getValidationRules()
    });

    let anchoringInProgress = false;
    let validBarMap;
    // A copy of the `validBarMap`
    // Considered "dirty" when it contains any changes which haven't been anchored
    let dirtyBarMap;

    // List of BarMapDiff objects which haven't been scheduled for anchoring
    let newDiffs = [];
    // List of BarMapDiff objects which are in the process of anchoring
    let pendingAnchoringDiffs = [];

    // The last anchored BarMap hash
    let lastValidHash;

    // The hash of the latest created BarMapDiff
    // Used for chaining multiple BarMapDiff objects
    let lastDiffHash;


    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////

    /**
     * Configure the strategy and create
     * proxy methods for BarMap
     */
    const initialize = () => {
        if (!strategy) {
            legacyMode = true;
            strategy = getDefaultStrategy();
        }
        strategy.setCache(config.getCache());
        strategy.setBarMapController(this);
        strategy.setValidator(validator);

        const barMap = new BarMap();
        const barMapProperties = Object.getOwnPropertyNames(barMap);
        for (const propertyName of barMapProperties) {
            if (typeof barMap[propertyName] !== 'function' || propertyName === 'load') {
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
        const factory = new didResolver.BarMapStrategyFactory();
        const strategy = factory.create(didResolver.constants.DEFAULT_BAR_MAP_STRATEGY);

        return strategy;
    }

    /**j
     * Create a proxy method for BarMap::{method}
     *
     * If BarMapController has a method named ${method}ProxyHandler
     * the call to BarMap::{method} is redirected to
     * BarMapController::{method}ProxyHandler
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
                return dirtyBarMap[method].apply(dirtyBarMap, argumentsList);
            }
        })

        return proxy
    }

    /**
     * Returns the latest BarMapDiff that
     * hasn't been scheduled for anchoring
     * 
     * Write operations will be added into this object
     * 
     * If no such object exists, a new object is created
     * and push into the list
     * 
     * @return {BarMapDiff}
     */
    const getCurrentDiffBarMap = () => {
        let barMapDiff = newDiffs[newDiffs.length - 1];
        if (!barMapDiff) {
            barMapDiff = new BarMapDiff();
            barMapDiff.setPrevDiffHash(lastDiffHash);
            this.configureBarMap(barMapDiff);
            newDiffs.push(barMapDiff);
        }
        return barMapDiff;
    }

    /**
     * Move any new BarMapDiff objects into the
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
     * Returns true if any BarMapDiff objects 
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
     * Create an empty BarMap
     */
    this.init = (callback) => {
        validBarMap = this.createNewBarMap();
        dirtyBarMap = validBarMap.clone();
        callback();
    }

    /**
     * Load an existing BarMap using the BarMapStrategy
     */
    this.load = (callback) => {
        const alias = config.getBarMapId();
        strategy.load(alias, (err, barMap) => {
            if (err) {
                if (legacyMode && typeof err.message === 'string' && err.message.startsWith('No data found for alias')) {
                    return this.init(callback);

                }
                return callback(err);
            }

            validBarMap = barMap;
            dirtyBarMap = barMap.clone();
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
        validator.validate('preWrite', dirtyBarMap, 'addFile', path, {
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
        validator.validate('preWrite', dirtyBarMap, 'rename', srcPath, {
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
        validator.validate('preWrite', dirtyBarMap, 'appendToFile', path, {
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
        validator.validate('preWrite', dirtyBarMap, 'addFiles', path, {
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
        validator.validate('preWrite', dirtyBarMap, 'deleteFile', path, (err) => {
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
        validator.validate('preWrite', dirtyBarMap, 'createFolder', path, (err) => {
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
        const diffBarMap = getCurrentDiffBarMap();
        let truncateFileIfExists = false;
        if (!dirtyBarMap.isEmpty(path)) {
            truncateFileIfExists = true;
        }

        dirtyBarMap.addFileEntry(path, bricks);
        if (truncateFileIfExists) {
            diffBarMap.emptyList(path);
        }
        diffBarMap.addFileEntry(path, bricks);
    }

    /**
     * Proxy for BarMap.appendBricksToFile()
     * 
     * @param {string} path
     * @param {Array<object>} bricks
     * @throws {Error}
     */
    this.appendBricksToFileProxyHandler = (path, bricks) => {
        dirtyBarMap.appendBricksToFile(path, bricks);
        getCurrentDiffBarMap().appendBricksToFile(path, bricks);
    }

    /**
     * Proxy for BarMap.delete();
     * 
     * @param {string} path
     * @throws {Error}
     */
    this.deleteProxyHandler = (path) => {
        dirtyBarMap.delete(path);
        getCurrentDiffBarMap().delete(path);
    }

    /**
     * Proxy for BarMap.copy()
     * 
     * @param {string} srcPath
     * @param {string} dstPath
     * @throws {Error}
     */
    this.copyProxyHandler = (srcPath, dstPath) => {
        dirtyBarMap.copy(srcPath, dstPath);
        getCurrentDiffBarMap().copy(srcPath, dstPath);
    }

    /**
     * Proxy for BarMap.createFolder()
     * 
     * @param {string} path
     */
    this.createFolderProxyHandler = (path) => {
        dirtyBarMap.createFolder(path);
        getCurrentDiffBarMap().createFolder(path);
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
     * Persists a BarMap Brick
     * 
     * @param {BarMap} barMap
     * @param {callback} callback
     */
    this.saveBarMap = (barMap, callback) => {
        const barMapBrick = barMap.toBrick();
        barMapBrick.setTransformParameters(barMap.getTransformParameters());

        brickStorageService.putBrick(barMapBrick, callback);
    }

    /**
     * @param {Brick|undefined} brick
     * @return {BarMap}
     */
    this.createNewBarMap = (brick) => {
        const barMap = new BarMap(brick);
        this.configureBarMap(barMap);
        return barMap;
    }

    /**
     * @return {BarMap}
     */
    this.getValidBarMap = () => {
        return validBarMap;
    }

    /**
     * @param {BarMap} barMap
     */
    this.configureBarMap = (barMap) => {
        if (config.getMapEncryptionKey()) {
            barMap.setEncryptionKey(config.getMapEncryptionKey());
        }

        if (!barMap.getConfig()) {
            barMap.setConfig(config);
        }

        barMap.load();
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
     * if the BarMapStrategy decides it's time
     * 
     * @param {callback} callback
     */
    this.attemptAnchoring = (callback) => {
        strategy.ifChangesShouldBeAnchored(dirtyBarMap, (err, result) => {
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
        // Move new BarMapDiff's to the "pending anchoring" state
        moveNewDiffsToPendingAnchoringState();

        if (!pendingAnchoringDiffs.length) {
            return;
        }

        if (anchoringInProgress) {
            return;
        }

        anchoringInProgress = true;

        // Use the strategy to compact/merge any BarMapDiff objects into a single
        // diff object. Once this happens the "pendingAnchoringDiff" list is emptied
        const barMap = strategy.compactDiffs(pendingAnchoringDiffs);

        this.saveBarMap(barMap, (err, hash) => {
            if (err) {
                pendingAnchoringDiffs.unshift(barMap);
                return endAnchoring(listener, anchoringStatus.PERSIST_BARMAP_ERR, err);
            }

            // TODO: call strategy.signHash() and pass the signedHash
            const alias = config.getBarMapId();
            this.updateAlias(alias, hash, lastValidHash, (err) => {
                if (err) {
                    // In case of any errors, the compacted BarMapDiff object
                    // is put back into the "pending anchoring" state in case
                    // we need to retry the anchoring process
                    pendingAnchoringDiffs.unshift(barMap);

                    // The anchoring middleware detected that we were trying
                    // to anchor outdated changes. In order to finish anchoring
                    // these changes the conflict must be first resolved
                    if (err.statusCode === ALIAS_SYNC_ERR_CODE) {
                        return this.handleAnchoringConflict(listener);
                    }

                    return endAnchoring(listener, anchoringStatus.ANCHOR_VERSION_ERR, err);
                }

                // After the alias is updated, the strategy is tasked
                // with updating the valid BarMap with the new changes
                strategy.afterBarMapAnchoring(barMap, hash, (err, hash) => {
                    if (err) {
                        return endAnchoring(listener, anchoringStatus.BARMAP_UPDATE_ERR, err);
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
     * If an anchoring conflict occurs, reload the valid BarMap
     * in order to get the new changes and then try to merge our BarMapDiff
     * 
     * @param {callback} listener
     */
    this.handleAnchoringConflict = (listener) => {
        const alias = config.getBarMapId();
        strategy.load(alias, (err, barMap) => {
            if (err) {
                return endAnchoring(listener, anchoringStatus.BARMAP_LOAD_ERR, err);
            }
            lastValidHash = strategy.getLastHash();

            // Pick up any new BarMapDiff's and add them to into the "pending anchoring" state
            moveNewDiffsToPendingAnchoringState();

            // Try and merge our changes
            // Pass a reference to the `newDiffs` list in case some more changes occur
            // during the "reconciliation" process and merge them before re-trying the
            // anchoring process
            strategy.reconcile(barMap, pendingAnchoringDiffs, newDiffs, (err) => {
                if (err) {
                    return endAnchoring(listener, anchoringStatus.BARMAP_RECONCILE_ERR, err);
                }

                anchoringInProgress = false;
                this.anchorChanges(listener);
            });
        });
    }

    /**
     * The strategy will use this to update the dirtyBarMap
     * after an anchoring conflict has been resolved
     * @param {BarMap} barMap
     */
    this.setDirtyBarMap = (barMap) => {
        dirtyBarMap = barMap;
    }

    initialize();
}

module.exports = BarMapController;
