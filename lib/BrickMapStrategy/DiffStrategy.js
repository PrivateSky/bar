'use strict';

const BrickMapDiff = require('../../lib/BrickMapDiff');
const BrickMapStrategyMixin = require('./BrickMapStrategyMixin');
/**
 * @param {object} options
 * @param {callback} options.decisionFn Callback which will decide when to effectively anchor changes
 *                                                              If empty, the changes will be anchored after each operation
 * @param {callback} options.conflictResolutionFn Callback which will handle anchoring conflicts
 *                                                              The default strategy is to reload the BrickMap and then apply the new changes
 * @param {callback} options.anchoringCb A callback which is called when the strategy anchors the changes
 * @param {callback} options.signingFn  A function which will sign the new alias
 * @param {callback} callback
 */
function DiffStrategy(options) {
    options = options || {};
    Object.assign(this, BrickMapStrategyMixin);

    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////

    /**
     *
     * @param {Array<BrickMapDiff} brickMapDiffs
     * @param {callback} callback
     */
    const createBrickMapFromDiffs = (brickMapDiffs, callback) => {
        this.brickMapController.createNewBrickMap((err, brickMap) => {
            if (err) {
                return callback(err);
            }

            try {
                for (const brickMapDiff of brickMapDiffs) {
                    brickMap.applyDiff(brickMapDiff);
                }
            } catch (e) {
                return callback(e);
            }

            callback(undefined, brickMap);
        });
    }

    /**
     * @param {Array<string>} hashes
     * @return {string}
     */
    const createBricksCacheKey = (hashes) => {
        return hashes.map(hash => {
            return hash.getIdentifier();
        }).join(':');
    };

    /**
     * @param {Array<Brick>} bricks
     * @return {Array<BrickMapDiff}
     */
    const createDiffsFromBricks = (bricks, callback) => {
        const diffs = [];
        const __createDiffsRecursively = (_bricks) => {
            if (_bricks.length === 0) {
                return callback(undefined, diffs);
            }

            const brick = _bricks.shift();
            this.brickMapController.createNewBrickMap(brick, (err, brickMap) => {
                if (err) {
                    return callback(err);
                }

                diffs.push(brickMap);
                __createDiffsRecursively(_bricks);
            });
        };

        __createDiffsRecursively(bricks);
    }

    /**
     * Get the list of BrickMapDiffs either from cache
     * or from Brick storage
     *
     * @param {Array<string>} hashes
     * @param {callback} callback
     */
    const getBrickMapDiffs = (hashes, callback) => {
        const cacheKey = createBricksCacheKey(hashes);
        if (this.hasInCache(cacheKey)) {
            const brickMapDiffs = this.getFromCache(cacheKey);
            return callback(undefined, brickMapDiffs);
        }

        const TaskCounter = require("swarmutils").TaskCounter;
        const bricks = [];
        const taskCounter = new TaskCounter(() => {
            createDiffsFromBricks(bricks, (err, brickMapDiffs) => {
                if (err) {
                    return callback(err);
                }

                this.storeInCache(cacheKey, brickMapDiffs);
                callback(undefined, brickMapDiffs);
            });
        });
        taskCounter.increment(hashes.length);
        this.brickMapController.getMultipleBricks(hashes, (err, brickData) => {
            if (err) {
                return callback(err);
            }

            bricks.push(createBrick(brickData));
            taskCounter.decrement();
        });
    }

    const createBrick = (brickData) => {
        const Brick = require("../../lib/Brick");
        const brick = new Brick();
        brick.setTransformedData(brickData);
        return brick;
    };
    /**
     * Assemble a final BrickMap from several BrickMapDiffs
     * after validating the history
     *
     * @param {Array<string>} hashes
     * @param {callback} callback
     */
    const assembleBrickMap = (hashes, callback) => {
        this.lastHashLink = hashes[hashes.length - 1];
        getBrickMapDiffs(hashes, (err, brickMapDiffs) => {
            if (err) {
                return callback(err);
            }

            this.validator.validate('brickMapHistory', brickMapDiffs, (err) => {
                if (err) {
                    return callback(err);
                }

                createBrickMapFromDiffs(brickMapDiffs, callback);
            });
        })
    }


    ////////////////////////////////////////////////////////////
    // Public methods
    ////////////////////////////////////////////////////////////

    this.load = (keySSI, callback) => {
        this.brickMapController.versions(keySSI, (err, versionHashes) => {
            if (err) {
                return callback(err);
            }

            if (!versionHashes.length) {
                return callback(new Error(`No data found for alias <${keySSI.getAnchorId()}>`));
            }

            assembleBrickMap(versionHashes, callback);
        })
    }


    /**
     * Compact a list of BrickMapDiff objects
     * into a single BrickMapDiff object
     *
     * @param {Array<BrickMapDiff} diffsList
     * @return {BrickMapDiff}
     */
    this.compactDiffs = (diffsList) => {
        const brickMap = diffsList.shift();

        while (diffsList.length) {
            const brickMapDiff = diffsList.shift();

            brickMap.applyDiff(brickMapDiff);
        }

        return brickMap;
    }

    /**
     * Merge the `diff` object into the current valid
     * BrickMap object
     *
     * @param {BrickMapDiff} diff
     * @param {string} diffHash
     * @param {callback} callback
     */
    this.afterBrickMapAnchoring = (diff, diffHash, callback) => {
        const validBrickMap = this.brickMapController.getValidBrickMap();
        try {
            validBrickMap.applyDiff(diff);
        } catch (e) {
            return callback(e);
        }
        this.lastHashLink = diffHash;
        callback(undefined, diffHash);
    }

    /**
     * Call the `conflictResolutionFn` if it exists
     * @param {object} conflictInfo
     * @param {BrickMap} conflictInfo.brickMap The up to date valid BrickMap
     * @param {Array<BrickMapDiff} conflictInfo.pendingAnchoringDiffs A list of BrickMapDiff that were requested for anchoring or failed to anchor
     * @param {Array<BrickMapDiff} conflictInfo.newDiffs A list of BrickMapDiff objects that haven't been scheduled for anchoring
     * @param {callback} callback
     */
    this.handleConflict = (conflictInfo, callback) => {
        if (typeof this.conflictResolutionFn !== 'function') {
            return callback(conflictInfo.error);
        }

        this.conflictResolutionFn(this.brickMapController, {
            validBrickMap: conflictInfo.brickMap,
            pendingAnchoringDiffs: conflictInfo.pendingAnchoringDiffs,
            newDiffs: conflictInfo.newDiffs,
            error: conflictInfo.error
        }, callback);
    }

    /**
     * Try and fix an anchoring conflict
     *
     * Merge any "pending anchoring" BrickMapDiff objects in a clone
     * of the valid brickMap. If merging fails, call the 'conflictResolutionFn'
     * in order to fix the conflict. If merging succeeds, update the "dirtyBrickMap"
     *
     * @param {BrickMap} brickMap The up to date valid BrickMap
     * @param {Array<BrickMapDiff} pendingAnchoringDiffs A list of BrickMapDiff that were requested for anchoring or failed to anchor
     * @param {Array<BrickMapDiff} newDiffs A list of BrickMapDiff objects that haven't been scheduled for anchoring
     * @param {callback} callback
     */
    this.reconcile = (brickMap, pendingAnchoringDiffs, newDiffs, callback) => {
        // Try and apply the changes on a brickMap copy
        brickMap.clone((err, brickMapCopy) => {
            if (err) {
                return callback(err);
            }

            try {
                for (let i = 0; i < pendingAnchoringDiffs; i++) {
                    brickMapCopy.applyDiff(pendingAnchoringDiffs[i]);
                }
            } catch (e) {
                return this.handleConflict({
                    brickMap,
                    pendingAnchoringDiffs,
                    newDiffs,
                    error: e
                }, callback);
            }

            this.brickMapController.setDirtyBrickMap(brickMapCopy);
            callback();
        });
    }

    this.initialize(options);
}

module.exports = DiffStrategy;
