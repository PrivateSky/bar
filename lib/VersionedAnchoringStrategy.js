'use strict';

const bar = require('bar');

function VersionedAnchoringStrategy(options) {
    options = options || {};

    let barMapController;
    let anchoringCallback = null;
    let decisionCallback =  null;
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
        barMapController.getBrick(barMapBrickId, (err, brick) => {
            if (err) {
                return callback(err);
            }

            if (barMapBrickId !== brick.getHash()) {
                return callback(new Error('Invalid data received'));
            }

            const barMap = bar.createBarMap(brick);
            barMapController.configureBarMap(barMap);
            callback(undefined, barMap);
        })
    }

    /**
     * @param {Brick} barMapBrick
     * @param {callback} callback
     */
    const anchorBarMapVersion = (barMapBrick, callback) => {
        const alias = barMapController.getBarMapAlias();
        const barMapHash = barMapBrick.getHash();

        barMapController.updateAlias(alias, barMapHash, (err) => {
            if (err) {
                return callback(err);
            }

            barMapController.saveBarMap(barMapBrick, (err, hash) => {
                if (err) {
                    return callback(err);
                }

                this.afterBarMapUpdate(sessionBarMap, hash, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    callback(undefined, hash);
                });
            })
        })
    }

    /**
     * 
     * @param {BarMap} barMap 
     * @param {callback} callback 
     */
    const ifChangesShouldBeAnchored = (barMap, callback) => {
        if (typeof decisionCallback !== 'function') {
            return callback(true);
        }

        decisionCallback(barMap, callback);
    };


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
     * 
     * @param {callback} callback 
     */
    this.setAnchoringCallback = (callback) => {
        anchoringCallback = callback;
    }

    /**
     * 
     * @param {callback} callback 
     */
    this.setDecisionCallback = (callback) => {
        decisionCallback = callback;
    }

    /**
     * Load and assemble the BarMap identified by `alias`
     *
     * @param {callback} callback
     */
    this.loadBarMap = (callback) => {
        const alias = barMapController.getBarMapAlias();
        if (!alias) {
            return callback(undefined, barMapController.createNewBarMap());
        }
        barMapController.getAliasVersions(alias, (err, versionHashes) => {
            if (err) {
                return callback(err);
            }

            if (!versionHashes.length) {
                return callback(new Error(`No data found for alias <${alias}>`));
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
        ifChangesShouldBeAnchored(sessionBarMap, (result) => {
            if (!result) {
                return callback();
            }

            const sessBarMap = sessionBarMap;
            this.endSession();

            let anchoringCallback = this.anchoringCallback;
            if (typeof anchoringCallback !== 'function') {
                anchoringCallback = callback;
            } else {
                callback();
            }

            const alias = barMapController.getBarMapAlias();
            const barMapBrick = sessBarMap.toBrick();
            barMapBrick.setTransformParameters(sessBarMap.getTransformParameters());

            barMapController.getAliasVersions(alias, (err, versionHashes) => {
                if (err) {
                    return anchoringCallback(err);
                }

                const latestVersion = versionHashes[versionHashes.length - 1];

                // No changes detected
                if (latestVersion === barMapBrick.getHash()) {
                    return anchoringCallback(undefined, latestVersion);
                }

                anchorBarMapVersion(barMapBrick, anchoringCallback);
            })
        });
    }
}

module.exports = VersionedAnchoringStrategy;
