'use strict';

const swarmutils = require("swarmutils");
const BarMap = require('./BarMap');
const Brick = require('./Brick');
const AnchorValidator = require('./AnchorValidator');
const VersionedAnchoringStrategy = require('./VersionedAnchoringStrategy');
const pskPth = swarmutils.path;

const BARMAP_METHODS_TO_PROXY = ['getBricksMeta', 'getHashList', 'isEmpty',
                                 'getFileList', 'getFolderList',
                                 'getTransformParameters'];

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
    let anchoringInProgress = false;

    let validBarMap;
    let sessionBarMap;

    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////

    /**
     * Initialize the decorator
     */
    const initialize = () => {
        // TODO: throw an error after switching to psk-key-did-resolver
        if (!strategy) {
            strategy = new VersionedAnchoringStrategy();
        }

        strategy.setBarMapController(this);

        for (const methodName of BARMAP_METHODS_TO_PROXY) {
            this[methodName] = createProxyMethod(methodName);
        }
    }

    /**
     * Create a proxy method for BarMap::{method}
     * If a `sessionBarMap` exists, use it as a target for the method call
     * otherwise pass the method call to `validBarMap`
     *
     * Usually read requests coming from the Archive won't have
     * a session started, so we forward the method call to `validBarMap`
     *
     * @param {string} method
     * @return {Proxy}
     */
    const createProxyMethod = (method) => {
        const proxy = new Proxy(function () {}, {
            apply: (target, thisArg, argumentsList) => {
                let targetBar = validBarMap;

                if (sessionBarMap) {
                    targetBar = sessionBarMap;
                }

                return targetBar[method].apply(targetBar, argumentsList);
            }
        })

        return proxy
    }

    /**
     * Creates or returns a session BarMap
     * @return {BarMap}
     */
    const getSessionBarMap = () => {
        if (strategy.sessionIsStarted()) {
            return sessionBarMap;
        }

        sessionBarMap = strategy.beginSession();
        return sessionBarMap;
    }

    ////////////////////////////////////////////////////////////
    // Public methods
    ////////////////////////////////////////////////////////////

    /**
     * Create an empty BarMap
     */
    this.init = (callback) => {
        validBarMap = this.createNewBarMap();
        callback();
    }

    /**
     * Load an existing BarMap
     */
    this.load = (callback) => {
        const alias = config.getBarMapId();
        this.getAliasVersions(alias, (err, versionHahes) => {
            if (err) {
                return callback(err);
            }

            if (!versionHahes.length) {
                return callback(new Error(`No data found for alias <${alias}>`));
            }

            strategy.assembleBarMap(versionHahes, (err, barMap) => {
                if (err) {
                    return callback(err);
                }
                validator.validate('afterLoad', barMap, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    validBarMap = barMap;
                    callback();
                });
            });
        })
    }

    /**
     * @param {string} path
     * @param {Array<object>} bricksData
     * @param {callback} callback
     */
    this.addFile = (path, bricksData, callback) => {
        const barMap = getSessionBarMap();
        validator.validate('preWrite', barMap, 'addFile', path, {
            bricksData
        }, (err) => {
            if (err) {
                return callback(err);
            }

            barMap.addFileEntry(path, bricksData);
            this.attemptAnchoring(callback);
        })
    }

    this.renameFile = (srcPath, dstPath, callback) => {
        const barMap = getSessionBarMap();
        validator.validate('preWrite', barMap, 'rename', srcPath, {
            dstPath
        }, (err) => {
            if (err) {
                return callback(err);
            }

            try {
                barMap.copy(srcPath, dstPath);
            } catch (e) {
                return callback(e);
            }

            barMap.delete(srcPath);
            this.attemptAnchoring(callback);
        })
    }

    /**
     * @param {string} path
     * @param {Array<object>} bricksData
     * @param {callback} callback
     */
    this.appendToFile = (path, bricksData, callback) => {
        const barMap = getSessionBarMap();
        validator.validate('preWrite', barMap, 'appendToFile', path, {
            bricksData
        }, (err) => {
            if (err) {
                return callback(err);
            }


            barMap.appendBricksToFile(path, bricksData);
            this.attemptAnchoring(callback);
        })
    }

    /**
     * @param {string} path
     * @param {Array<object>} filesBricksData
     * @param {callback} callback
     */
    this.addFiles = (path, filesBricksData, callback) => {
        const barMap = getSessionBarMap();
        validator.validate('preWrite', barMap, 'addFiles', path, {
            filesBricksData
        }, (err) => {
            if (err) {
                return callback(err);
            }

            for (const filePath in filesBricksData) {
                const bricks = filesBricksData[filePath];
                barMap.addFileEntry(pskPth.join(path, filePath), bricks);
            }
            this.attemptAnchoring(callback);
        })
    }

    /**
     * @param {string} path
     * @param {callback} callback
     */
    this.deleteFile = (path, callback) => {
        const barMap = getSessionBarMap();
        validator.validate('preWrite', barMap, 'deleteFile', path, (err) => {
            if (err) {
                return callback(err);
            }

            barMap.delete(path);
            this.attemptAnchoring(callback);
        })
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
     * @param {BarMap|Brick} barMap
     * @param {callback} callback
     */
    this.saveBarMap = (barMap, callback) => {
        let barMapBrick;

        if (! (barMap instanceof Brick)) {
            barMapBrick = barMap.toBrick();
            barMapBrick.setTransformParameters(barMap.getTransformParameters());
        } else {
            barMapBrick = barMap;
        }

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
    this.getCurrentBarMap = () => {
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
     * @return {string}
     */
    this.getBarMapAlias = () => {
        return config.getBarMapId();
    }

    /**
     * @param {object} rules
     * @param {object} rules.preWrite
     * @param {object} rules.afterLoad
     */
    this.setValidationRules = (rules) => {
        validator.setRules(rules);
    }

    this.attemptAnchoring = (callback) => {
        strategy.ifChangesShouldBeAnchored(sessionBarMap, (err, result) => {
            if (err) {
                return callback(err);
            }

            if (!result) {
                return callback(err);
            }

            const anchoringCallback = strategy.getAnchoringCallback(callback);

            // TODO: implement an AnchoringQueue
            // How to handle anchoring conflicts during queue processing?
            if (anchoringInProgress) {
                return anchoringCallback(new Error('An anchoring operation is already in progress'))
            }

            const barMap = strategy.endSession();

            if (anchoringCallback !== callback) {
                // Resume execution and perform the anchoring in the background
                // When anchoring has been done the `anchoringCallback` will be called
                callback();
            }

            anchoringInProgress = true;
            this.anchorBarMap(barMap, (err, result) => {
                anchoringInProgress = false;
                anchoringCallback(err, result);
            });
        });
    }

    this.anchorBarMap = (barMap, callback) => {
        const alias = config.getBarMapId();
        // Should I merge any new fresh diffs into the one we're about to save?
        // strategy.mergeLatestChangesInto(barMap)?

        this.saveBarMap(barMap, (err, hash) => {
            if (err) {
                return callback(err);
            }

            // TODO: call strategy.signHash() and pass the signedHash
            this.updateAlias(alias, hash, strategy.getLastHash(), (err) => {
                if (err) {
                    if (err.statusCode === ALIAS_SYNC_ERR_CODE) {
                        return this.handleAnchoringConflict(barMap, hash, callback);
                    }

                    // Should I discard the changes?
                    return callback(err);
                }

                strategy.afterBarMapUpdate(barMap, hash, callback);
            })
        })
    }

    this.handleAnchoringConflict = (barMap, hash, callback) => {
        strategy.resolveAnchoringConflict(barMap, hash, (err) => {
            if (err) {
                return callback(err);
            }

            const alias = config.getBarMapId();
            this.updateAlias(alias, hash, strategy.getLastHash(), (err) => {
                if (err) {
                    return callback(err);
                }

                strategy.afterBarMapUpdate(barMap, hash, callback);
            })
        })

    }

    initialize();
}

module.exports = BarMapController;
