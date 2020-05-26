'use strict';

const swarmutils = require("swarmutils");
const BarMap = require('./BarMap');
const BarMapDiff = require('./BarMapDiff');
const pskPth = swarmutils.path;
const SessionBarMap = require('./SessionBarMap');

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

    const strategy = config.getAnchorVerificationStrategy();

    let validBarMap = new BarMap();
    let sessionBarMap;

    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////

    /**
     * Initialize the decorator
     */
    const initialize = () => {
        configureBarMap(validBarMap);
        // TODO: throw an error after switching to psk-key-did-resolver
        if (!strategy) {
            strategy = new SimpleAnchorVerificationStrategy();
            //throw new Error('An anchor verification strategy is required');
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

    /**
     * Calls the strategy's doAnchoring() method
     * @param {callback} callback
     */
    const anchorChange = (callback) => {
        strategy.doAnchoring((err, result) => {
            if (err) {
                return callback(err);
            }

            if (result.sessionEnded) {
                // Changes were anchored, reset the session
                sessionBarMap = null;
                callback(undefined, result.hash);
                return;
            } // else, session is still going

            // notify the caller that BarMap anchoring hasn't been done yet
            callback(undefined, false);
        });
    }

    /**
     * @param {BarMap} barMap
     * @param {callback} callback
     */
    const saveBarMapBrick = (barMap, callback) => {
        const barMapBrick = barMap.toBrick();
        barMapBrick.setTransformParameters(barMap.getTransformParameters());

        let brickId = barMapBrick.getKey();
        if (!brickId) {
            brickId = barMapBrick.getHash();
            barMapBrick.setKey(brickId);
        }

        brickStorageService.putBrick(barMapBrick, callback);
    }

    /**
     * @param {Brick} brick
     * @return {BarMap}
     */
    const createBarMapDiff = (brick) => {
        const barMap = new BarMap(brick);
        configureBarMap(barMap);
        return barMap;
    }

    /**
     * @param {string} alias
     * @param {callback} callback
     */
    function loadBarMap(alias, callback) {
        if (typeof alias === 'function') {
            callback = alias;
            alias = undefined;
        }

        if (!alias) {
            return callback(undefined, validBarMap);
        }


        brickStorageService.getAliasVersions(alias, (err, hashesList) => {
            if (err) {
                return callback(err);
            }

            let barMapId;
            if (hashesList.length === 0) {
                barMapId = alias;
            } else {
                barMapId = hashesList[hashesList.length - 1];
            }

            brickStorageService.getBrick(barMapId, (err, barMapBrick) => {
                if (err) {
                    return callback(err);
                }

                if (barMapId !== barMapBrick.getHash()) {
                    return callback(Error("Invalid data received"));
                }
                const barMap = new BarMap(barMapBrick);
                callback(undefined, barMap);
            });

        });
    }

    /**
     * @param {BarMap} barMap
     */
    const configureBarMap = (barMap) => {
        if (config.getMapEncryptionKey()) {
            barMap.setEncryptionKey(config.getMapEncryptionKey());
        }

        if (!barMap.getConfig()) {
            barMap.setConfig(config);
        }

        barMap.load();
    }

    ////////////////////////////////////////////////////////////
    // Public methods
    ////////////////////////////////////////////////////////////
    this.init = (callback) => {
        callback();
    }

    this.load = (callback) => {
        const id = config.getBarMapId();
        brickStorageService.getAliasVersions(id, (err, hashes) => {
            if (err) {
                return callback(err);
            }

            if (!hashes.length) {
                return callback(new Error(`No data found for alias <${id}>`));
            }

            brickStorageService.getMultipleBricks(hashes, (err, bricks) => {
                if (err) {
                    return callback(err);
                }

                if (bricks.length !== hashes.length) {
                    return callback(new Error('Invalid data received'));
                }

                for (const brick of bricks) {
                    const barMapDiff = createBarMapDiff(brick);
                    validBarMap.applyDiff(barMapDiff);
                }

                callback();
            });
        })
    }

    this.addFile = (path, bricksData, callback) => {
        const barMap = getSessionBarMap();
        strategy.validatePreWrite('addFile', path, {
            bricksData
        }, (err) => {
            if (err) {
                return callback(err);
            }

            barMap.addFileEntry(path, bricksData);
            anchorChange(callback);
        })
    }

    this.appendToFile = (path, bricksData, callback) => {
        const barMap = getSessionBarMap();
        strategy.validatePreWrite('appendToFile', path, {
            bricksData
        }, (err) => {
            if (err) {
                return callback(err);
            }


            barMap.appendBricksToFile(path, bricksData);
            anchorChange(callback);
        })
    }

    this.addFiles = (path, filesBricksData, callback) => {
        const barMap = getSessionBarMap();
        strategy.validatePreWrite('addFiles', path, {
            filesBricksData
        }, (err) => {
            if (err) {
                return callback(err);
            }

            for (const filePath in filesBricksData) {
                const bricks = filesBricksData[filePath];
                barMap.addFileEntry(pskPth.join(path, filePath), bricks);
            }
            anchorChange(callback);
        })
    }

    this.deleteFile = (path, callback) => {
        const barMap = getSessionBarMap();
        strategy.validatePreWrite('deleteFile', path, (err) => {
            if (err) {
                return callback(err);
            }

            barMap.delete(path);
            anchorChange(callback);
        })
    }

    this.createSessionBarMap = () => {
        const diffBarMap = new BarMapDiff();
        configureBarMap(diffBarMap);

        const sessionBarMap = new SessionBarMap({
            currentBarMap: validBarMap.clone(),
            diffBarMap
        })
        return sessionBarMap;
    }

    this.getValidBarMap = () => {
        return validBarMap;
    }

    this.saveSession = (sessionBarMap, callback) => {
        const diffBarMap = sessionBarMap.getDiff();

        saveBarMapBrick(diffBarMap, (err, hash) => {
            if (err) {
                return callback(err);
            }

            const alias = config.getBarMapId();
            brickStorageService.updateAlias(alias, hash, (err) => {
                if (err) {
                    return callback(err);
                }

                validBarMap.applyDiff(diffBarMap);
                return callback(undefined, hash);
            })
        });
    }

    initialize();
}

// @TODO: remove this after switching to psk-key-did-resolver
function SimpleAnchorVerificationStrategy(options) {
    options = options || {};

    let barMapController;
    let sessionBarMap = null;

    this.setBarMapController = (controller) => {
        barMapController = controller;
    }

    this.beginSession = () => {
        sessionBarMap = barMapController.createSessionBarMap();
        return sessionBarMap;
    }

    this.sessionIsStarted = () => {
        return sessionBarMap !== null;
    }

    this.endSession = () => {
        sessionBarMap = null;
    }

    this.validatePreWrite = (operation, path, options, callback) => {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        callback();
    }

    this.afterBarMapUpdate = (diff, callback) => {
        callback();
    }

    /**
     * Anchor each change
     * @param {callback} callback
     */
    this.doAnchoring = (callback) => {
        barMapController.saveSession(sessionBarMap, (err, hash) => {
            if (err) {
                return callback(err);
            }

            this.afterBarMapUpdate(sessionBarMap.getDiff(), (err) => {
                if (err) {
                    return callback(err);
                }
                this.endSession();
                callback(undefined, hash);
            })

        })
    }
}

module.exports = BarMapController;
