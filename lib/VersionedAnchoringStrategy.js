'use strict';

const bar = require('bar');

function VersionedAnchoringStrategy(options) {
    options = options || {};

    let barMapController;
    let anchoringCallback = null;
    let decisionCallback =  null;
    let sessionBarMap = null;
    let sessionInProgress = false;
    let anchoringInProgress = false;

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

    const getAnchoringCallback = (defaultCallback) => {
        let anchoringCallback = this.anchoringCallback;
        if (typeof anchoringCallback !== 'function') {
            anchoringCallback = defaultCallback;
        }

        return anchoringCallback;
    }

    const endSession = () => {
        sessionInProgress = false;
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
        sessionInProgress = true;

        if (!sessionBarMap) {
            sessionBarMap = this.barMapController.getCurrentBarMap();
        }
        return sessionBarMap;
    }

    /**
     * @return {boolean}
     */
    this.sessionIsStarted = () => {
        return sessionInProgress;
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
    this.attemptAnchoring = (callback) => {
        ifChangesShouldBeAnchored(sessionBarMap, (err, result) => {
            if (err) {
                return callback(err);
            }

            if (!result) { // Changes will be anchored later
                return callback();
            }

            const anchoringCallback = getAnchoringCallback(callback);
            if (anchoringCallback !== callback) {
                // Resume execution and perform the anchoring in the background
                // When anchoring has been done the `anchoringCallback` will be called
                callback();
            }

            if (anchoringInProgress) {
                return callback(new Error('An anchoring operation is already in progress'));
            }

            anchoringInProgress = true;
            this.anchorChanges((err, result) => {
                anchoringInProgress = false;
                anchoringCallback(err, result);
            });
        });
    }

    this.anchorChanges = (callback) => {
        const sessBarMap = sessionBarMap;
        const alias = this.barMapController.getBarMapAlias();
        const barMapBrick = sessBarMap.toBrick();
        barMapBrick.setTransformParameters(sessBarMap.getTransformParameters());
        endSession();

        this.barMapController.getAliasVersions(alias, (err, versionHashes) => {
            if (err) {
                return callback(err);
            }

            const latestVersion = versionHashes[versionHashes.length - 1];

            // No changes detected
            if (latestVersion === barMapBrick.getHash()) {
                return callback(undefined, latestVersion);
            }

            anchorBarMapVersion(barMapBrick, callback);
        })
    }
}

module.exports = VersionedAnchoringStrategy;
