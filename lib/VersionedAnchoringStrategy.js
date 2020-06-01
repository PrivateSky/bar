'use strict';

const bar = require('bar');

function VersionedAnchoringStrategy(options) {
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
        const alias = barMapController.getBarMapAlias();
        const barMapBrick = sessionBarMap.toBrick();
        barMapBrick.setTransformParameters(sessionBarMap.getTransformParameters());

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

            anchorBarMapVersion(barMapBrick, callback);
        })
    }
}

module.exports = VersionedAnchoringStrategy;
