'use strict';

const swarmutils = require("swarmutils");
const BarMap = require('./BarMap');
const Brick = require('./Brick');
const AnchorValidator = require('./AnchorValidator');
const pskPth = swarmutils.path;
const BarMapDiff = require('./BarMapDiff');
const anchoringStatus = require('./constants').anchoringStatus;

/**
 * Controls the way a BarMap is loaded, manipulated and saved
 *
 * @param {object} options
 * @param {ArchiveConfigurator} options.config
 * @param {BrickStorageService} options.brickStorageService
 */
function BarMapController(options) {
    options = options || {};

    const config = options.config;
    const brickStorageService = options.brickStorageService;

    if (!config) {
        throw new Error('An ArchiveConfigurator is required!');
    }

    if (!brickStorageService) {
        throw new Error('BrickStorageService is required');
    }

    const ALIAS_SYNC_ERR_CODE = 428;

    let strategy = config.getBarMapStrategy();
    let validator = new AnchorValidator({
        rules: config.getValidationRules()
    });

    let validBarMap;
    let dirtyBarMap;
    let pendingAnchoringDiffs = [];
    let newDiffs = [];
    let compactedDiffs = [];
    let lastValidHash;
    let lastDiffHash;


    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////

    /**
     * Initialize the decorator
     */
    const initialize = () => {
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

    const moveNewDiffsToPendingAnchoringState = () => {
        while (newDiffs.length) {
            const diff = newDiffs.shift();
            lastDiffHash = diff.getHash();
            pendingAnchoringDiffs.push(diff);
        }
    }

    const moveCompactedDiffsToPendingAnchoringState = () => {
        const index = 0;
        while (compactedDiffs.length) {
            const diff = compactedDiffs.shift();
            pendingAnchoringDiffs.splice(index++, 0, diff);
        }
    }

    /**
     * 
     * @param {callback} listener 
     * @param {number} status 
     * @param {*} data 
     */
    const notifyListener = (listener, status, data) => {
        if (status === anchoringStatus.OK) {
            return listener(undefined, data);
        }
        const error = data;
        error.type = status;
        listener(error);
    }

    const updateValidBarMap = (barMapdiff, hash, anchoringListener) => {

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
     * Load an existing BarMap
     */
    this.load = (callback) => {
        const alias = config.getBarMapId();
        strategy.load(alias, (err, barMap) => {
            if (err) {
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

            this.delete(path);
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
        dirtyBarMap.addFileEntry(path, bricks);
        getCurrentDiffBarMap().addFileEntry(path, bricks);
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
        moveNewDiffsToPendingAnchoringState();

        if (!pendingAnchoringDiffs.length) {
            return;
        }

        const barMap = strategy.compactDiffs(pendingAnchoringDiffs, compactedDiffs);

        this.saveBarMap(barMap, (err, hash) => {
            if (err) {
                return notifyListener(listener, anchoringStatus.PERSIST_BARMAP_ERR, err);
            }

            // TODO: call strategy.signHash() and pass the signedHash
            const alias = config.getBarMapId();
            this.updateAlias(alias, hash, lastValidHash, (err) => {
                if (err) {
                    if (err.statusCode === ALIAS_SYNC_ERR_CODE) {
                        return this.handleAnchoringConflict(listener);
                    }

                    moveCompactedDiffsToPendingAnchoringState();
                    return notifyListener(listener, anchoringStatus.ANCHOR_VERSION_ERR, err);
                }

                strategy.afterBarMapAnchoring(barMap, hash, (err, hash) => {
                    if (err) {
                        return notifyListener(listener, anchoringStatus.BARMAP_UPDATE_ERR, err);
                    }

                    lastValidHash = hash;
                    compactedDiffs = [];
                    notifyListener(listener, anchoringStatus.OK, hash);
                });
            })
        })
    }

    /**
     * @param {callback} listener
     */
    this.handleAnchoringConflict = (listener) => {
        const alias = config.getBarMapId();
        strategy.load(alias, (err, barMap) => {
            if (err) {
                return notifyListener(listener, anchoringStatus.BARMAP_LOAD_ERR, err);
            }
            lastValidHash = strategy.getLastHash();

            moveNewDiffsToPendingAnchoringState();

            strategy.reconcile(barMap, compactedDiffs, pendingAnchoringDiffs, newDiffs, (err) => {
                if (err) {
                    return notifyListener(listener, anchoringStatus.BARMAP_RECONCILE_ERR, err);
                }

                this.anchorChanges(listener);
            });
        });
    }

    /**
     * @param {BarMap} barMap
     */
    this.setDirtyBarMap = (barMap) => {
        dirtyBarMap = barMap;
    }

    initialize();
}

module.exports = BarMapController;
