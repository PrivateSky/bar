'use strict';

const swarmutils = require("swarmutils");
const BarMap = require('./BarMap');
const pskPth = swarmutils.path;

function SimpleAnchorVerificationStrategy(options) {
    options = options || {};

    this.barMap = null;

    this.beginSession = (barMap) => {
        this.barMap = barMap;
        return this.barMap;
    }

    this.sessionIsStarted = () => {
        return this.barMap !== null;
    }

    this.endSession = () => {
        this.barMap = null;
    }

    this.validatePreWrite = (operation, path, options, callback) => {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        callback();
    }

    this.afterBarMapUpdate = (diffBarMap, callback) => {
        callback();
    }

    /**
     * Anchor each change
     * @param {callback} callback
     */
    this.doAnchoring = (callback) => {
        this.barMap.saveChanges((err, result) => {
            if (err) {
                return callback(err);
            }

            this.afterBarMapUpdate(result.diffBarMap, (err) => {
                if (err) {
                    return callback(err);
                }

                this.endSession();

                const anchoringResult = {
                    status: true,
                    hash: result.hash
                }
                callback(undefined, anchoringResult);
            });
        })
    }
}

function BarMapDecorator(options) {
    options = options || {};

    const bar = options.bar;

    if (!bar) {
        throw new Error('Bar is required!');
    }

    let barMap = new BarMap();
    const config = bar.getConfig();
    const brickStorageService = bar.getBrickStorageService();
    const DONT_PROXY_METHODS = ['load']
    let strategy = config.getAnchorVerificationStrategy();
    let sessionBarMap;

    // TODO: throw an error after switching to psk-key-did-resolver
    if (!strategy) {
        strategy = new SimpleAnchorVerificationStrategy();
        //throw new Error('An anchor verification strategy is required');
    }

    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////

    /**
     * Initialize the decorator
     */
    const initialize = () => {
        const barMapProperties = Object.getOwnPropertyNames(barMap);

        for (const property of barMapProperties) {
            if (typeof barMap[property] !== 'function') {
                continue;
            }

            if (DONT_PROXY_METHODS.indexOf(property) !== -1) {
                continue;
            }

            createProxyMethod(property);
        }
    }

    /**
     * Create a proxy method for BarMap::{method}
     *
     * If a BarMapDecorator has a method named ${method}ProxyHandler exists
     * the call to BarMap::{method} is redirected to
     * BarMapDecorator::{method}ProxyHandler
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
                return barMap[method].apply(barMap, argumentsList);
            }
        })

        this[method] = proxy;
    }

    /**
     * Creates or returns a session BarMap
     * @return {BarMap}
     */
    const getSessionBarMap = () => {
        if (strategy.sessionIsStarted()) {
            return sessionBarMap;
        }

        sessionBarMap = strategy.beginSession(this);
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

            if (result.status) {
                // Changes were anchored, reset the session
                sessionBarMap = null;
            } // else, session is still going

            callback(undefined, result.hash);
        });
    }

    /**
     * @param {string} alias
     * @param {Brick} brick
     * @param {callback} callback
     */
    const updateAlias = (alias, brick, callback) => {
        brickStorageService.updateAlias(alias, brick.getHash(), (err) => {
            if (err) {
                return callback(err);
            }

            brickStorageService.putBrick(brick, callback);
        })
    }

    /**
     * @param {string} alias
     * @param {BarMap} barMap
     * @param {callback} callback
     */
    const saveBarMap = (alias, barMap, callback) => {
        const barMapBrick = barMap.toBrick();
        barMapBrick.setTransformParameters(barMap.getTransformParameters());

        let brickId = barMapBrick.getKey();
        if (!brickId) {
            brickId = barMapBrick.getHash();
            barMapBrick.setKey(brickId);
        }

        // @TODO: remove this after switching completely to psk-did-resolver
        if (!alias) {
            alias = brickId;
        }

        brickStorageService.getAliasVersions(alias, (err, hashesList) => {
            if (err) {
                return callback(err);
            }

            if (!hashesList.length) {
                return updateAlias(alias, barMapBrick, callback);
            }

            const barMapHash = hashesList[hashesList.length - 1];
            if (barMapHash !== barMapBrick.getHash()) {
                return updateAlias(alias, barMapBrick, callback);
            }

            callback();
        })
    }

    /**
     * @param {string} alias
     * @param {callback} callback
     */
    function getBarMap(alias, callback) {
        if (typeof alias === 'function') {
            callback = alias;
            alias = undefined;
        }

        if (!alias) {
            return callback(undefined, barMap);
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
        configureBarMap(barMap);
        callback();
    }

    this.load = (callback) => {
        const id = config.getBarMapId();
        getBarMap(id, (err, map) => {
            barMap = map;
            configureBarMap(barMap);
            callback();
        });
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


            barMap.appendBricksToEntry(path, bricksData);
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

    this.deleteFile = (path, force, callback) => {
        if (typeof force === 'function') {
            callback = force;
            force = false;
        }
        const barMap = getSessionBarMap();
        strategy.validatePreWrite('deleteFile', path, (err) => {
            if (err) {
                return callback(err);
            }

            barMap.delete(path, force);
            anchorChange(callback);
        })
    }

    /**
     * Save changes to bar map
     * @param {callback} callback
     */
    this.saveChanges = (callback) => {
        const barMapId = config.getBarMapId();

        // Anchor
        saveBarMap(barMapId, barMap, (err, hash) => {
            if (err) {
                return callback(err);
            }

            const result = {
                diffBarMap: sessionBarMap,
                hash
            };

            return callback(undefined, result);
        });
    };

    initialize();
}


module.exports = SimpleAnchorVerificationStrategy;

module.exports = BarMapDecorator;
