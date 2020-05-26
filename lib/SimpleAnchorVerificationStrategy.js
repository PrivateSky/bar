'use strict';

const BarMap = require('./BarMap');
const Brick = require('./Brick');

function SimpleAnchorVerificationStrategy(options) {
    options = options || {};

    let barMapController;
    let sessionBarMap = null;

    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////

    /**
     * Assemble a final BarMap from a Brick
     *
     * @param {Array<string>} hashes
     * @param {callback} callback
     */
    const assembleBarMap = (barMapBrickId, callback) => {
        barMapController.getBrick(barMapBrickId, (err, data) => {
            if (err) {
                return callback(err);
            }

            const brick = new Brick();
            brick.setTransformedData(data);
            if (barMapBrickId !== brick.getHash()) {
                return callback(new Error('Invalid data received'));
            }

            barMap = new BarMap(brick);
            callback(undefined, barMap);
        })
    }

    /**
     * @param {string} barMapHash
     * @param {callback} callback
     */
    const anchorBarMapVersion = (barMapHash, callback) => {
        const alias = barMapController.getBarMapAlias();
        barMapController.updateAlias(alias, barMapHash, (err) => {
            if (err) {
                return callback(err);
            }

            barMapController.saveBarMap(sessionBarMap, (err, hash) => {
                if (err) {
                    return callback(err);
                }

                this.afterBarMapUpdate(sessionBarMap, hash, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    this.endSession();
                    const result = {
                        sessionEnded: true,
                        hash
                    };
                    callback(undefined, result);
                });
            })
        })
    }


    ////////////////////////////////////////////////////////////
    // Public methods
    ////////////////////////////////////////////////////////////

    /**
     * @param {BarMapController} controller
     */
    this.setBarMapController = (controller) => {
        barMapController = controller;
    }

    /**
     * Load and assemble the BarMap identified by `alias`
     *
     * @param {callback} callback
     */
    this.loadBarMap = (callback) => {
        const alias = barMapController.getBarMapAlias();
        barMapController.getAliasVersions(alias, (err, versionHashes) => {
            if (err) {
                return callback(err);
            }

            if (!versionHashes.length) {
                return callback(new Error(`No data found for alias <${id}>`));
            };

            const barMapBrickId = versionHashes[versionHashes.length - 1];
            assembleBarMap(barMapBrickId, callback);
        });
    }

    /**
     * @return {SessionBarMap}
     */
    this.beginSession = () => {
        sessionBarMap = barMapController.getCurrentBarMap();
        return sessionBarMap;
    }

    /**
     * @return {boolean}
     */
    this.sessionIsStarted = () => {
        return sessionBarMap !== null;
    }

    this.endSession = () => {
        sessionBarMap = null;
    }

    /**
     * @param {string} operation
     * @param {string} path
     * @param {object} options
     * @param {callback} callback
     */
    this.validatePreWrite = (operation, path, options, callback) => {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        callback();
    }

    /**
     * @param {BarMapDiff} diff
     * @param {string} diffHash
     * @param {callback} callback
     */
    this.afterBarMapUpdate = (diff, diffHash, callback) => {
        callback();
    }

    /**
     * Anchor each change
     * @param {callback} callback
     */
    this.doAnchoring = (callback) => {
        const alias = barMapController.getBarMapAlias();
        const barMapBrick = sessionBarMap.toBrick();
        barMapBrick.setTransformParameters(sessionBarMap.getTransformParameters());

        let brickId = barMapBrick.getKey();
        if (!brickId) {
            brickId = barMapBrick.getHash();
            barMapBrick.setKey(brickId);
        }

        barMapController.getAliasVersions(alias, (err, versionHashes) => {
            if (err) {
                return callback(err);
            }

            const latestVersion = versionHashes[versionHashes.length - 1];

            // No changes detected
            if (latestVersion === barMapBrick.getHash()) {
                this.endSession();
                return callback(undefined, {
                    sessionEnded: true,
                    latestVersion
                });
            }

            anchorBarMapVersion(barMapBrick.getHash(), callback);
        })
    }
}

module.exports = SimpleAnchorVerificationStrategy;
