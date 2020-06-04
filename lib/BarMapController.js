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

    let strategy = config.getAnchoringStrategy();
    let validator = new AnchorValidator({
        rules: config.getValidationRules()
    });

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
        strategy.loadBarMap((err, barMap) => {
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
            strategy.attemptAnchoring(callback);
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
            strategy.attemptAnchoring(callback);
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
            strategy.attemptAnchoring(callback);
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
            strategy.attemptAnchoring(callback);
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
            strategy.attemptAnchoring(callback);
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

    initialize();
}

module.exports = BarMapController;
