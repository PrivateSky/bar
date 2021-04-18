'use strict';

const BrickMapDiff = require('../BrickMapDiff');
const BrickMap = require('../BrickMap');
const BrickMapStrategyMixin = require('./BrickMapStrategyMixin');
const Brick = require("../../lib/Brick");

/**
 * @param {object} options
 * @param {function} options.decisionFn Callback which will decide when to effectively anchor changes
 *                                                              If empty, the changes will be anchored after each operation
 * @param {function} options.anchoringCb A callback which is called when the strategy anchors the changes
 * @param {function} options.signingFn  A function which will sign the new alias
 * @param {function} callback
 */
function LatestVersionStrategy(options) {
    options = options || {};
    Object.assign(this, BrickMapStrategyMixin);

    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////

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
    const createMapsFromBricks = (bricks, callback) => {
        const brickMaps = [];
        const __createBrickMapsRecursively = (_bricks) => {
            if (_bricks.length === 0) {
                return callback(undefined, brickMaps);
            }

            const brick = _bricks.shift();
            this.brickMapController.createNewBrickMap(brick, (err, brickMap) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to create a new BrickMap`, err));
                }

                brickMaps.push(brickMap);
                __createBrickMapsRecursively(_bricks);
            });
        };

        __createBrickMapsRecursively(bricks);
    }

    /**
     * Get a list of BrickMap objects either from cache
     * or from Brick storage
     *
     * @param {Array<string>} hashes
     * @param {function} callback
     */
    const createBrickMapsFromHistory = (hashes, callback) => {
        const cacheKey = createBricksCacheKey(hashes);
        if (this.hasInCache(cacheKey)) {
            const brickMaps = this.getFromCache(cacheKey);
            return callback(undefined, brickMaps);
        }

        const TaskCounter = require("swarmutils").TaskCounter;
        const bricks = [];
        const taskCounter = new TaskCounter(() => {
            createMapsFromBricks(bricks, (err, brickMaps) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to create maps from bricks`, err));
                }

                this.storeInCache(cacheKey, brickMaps);
                callback(undefined, brickMaps);
            });
        });
        taskCounter.increment(hashes.length);
        this.brickMapController.getMultipleBricks(hashes, (err, brickData) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to retrieve multiple bricks`, err));
            }

            bricks.push(createBrick(brickData));
            taskCounter.decrement();
        });
    }

    const createBrick = (brickData) => {
        const brick = new Brick();
        brick.setTransformedData(brickData);
        return brick;
    };

    /**
     * Get the latest BrickMap version after validating the
     * history
     *
     * @param {Array<string>} hashes
     * @param {function} callback
     */
    const getLatestVersion = (hashes, callback) => {
        this.lastHashLink = hashes[hashes.length - 1];

        createBrickMapsFromHistory([this.lastHashLink], (err, brickMaps) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to create BrickMaps from history`, err));
            }

            this.validator.validate('brickMapHistory', brickMaps, (err) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to validate BrickMaps`, err));
                }

                const latestBrickMap = brickMaps[brickMaps.length - 1];
                callback(undefined, latestBrickMap);
            });
        })
    }


    ////////////////////////////////////////////////////////////
    // Public methods
    ////////////////////////////////////////////////////////////

    this.load = (keySSI, callback) => {
        this.brickMapController.versions(keySSI, (err, versionHashes) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get versions for anchor ${keySSI.getAnchorId()}`, err));
            }
            if (!versionHashes.length) {
                return callback(new Error(`No data found for alias <${keySSI.getAnchorId()}>`));
            }

            getLatestVersion(versionHashes, callback);
        })
    }


    /**
     * Compact a list of BrickMapDiff objects
     * into a single BrickMap object
     *
     * @param {BrickMap|undefined} dstBrickMap
     * @return {BrickMapDiff}
     */
    this.compactDiffs = (dstBrickMap, callback) => {
        if (typeof dstBrickMap === 'function') {
            callback = dstBrickMap;
            dstBrickMap = undefined;
        }
        this.brickMapState.prepareNewChangesForAnchoring((err) => {
            if (err) {
                return callback(err);
            }

            const mergeDiffs = (err, dst) => {
                if (err) {
                    return callback(err);
                }

                const result = this.mergeDiffs(dst, this.brickMapState.getDiffsForAnchoring());
                console.log(JSON.stringify(result[0].header, null, 2));
                callback(undefined, result);
            }

            if (!dstBrickMap) {
                return this.brickMapState.cloneAnchoredBrickMap(mergeDiffs);
            }

            mergeDiffs(undefined, dstBrickMap);
        })
    }

    /**
     * Tell the BrickMapController to use the newly anchored
     * BrickMap as a valid one
     *
     * @param {BrickMap} diff
     * @param {string} brickMapHashLink
     * @param {function} callback
     */
    this.afterBrickMapAnchoring = (brickMap, brickMapHashLink, callback) => {
        this.lastHashLink = brickMapHashLink;
        this.lastAnchorTimestamp = new Date().getTime();

        callback(undefined, brickMapHashLink);
    }

    /**
     * Try and fix an anchoring conflict
     *
     * Merge any "pending anchoring" BrickMapDiff objects in a clone
     * of our anchored BrickMap. If merging fails, call the 'conflictResolutionFn'
     * in order to fix the conflict. If merging succeeds, update the "dirtyBrickMap"
     *
     * @param {BrickMap} brickMap The up to date anchored BrickMap
     * @param {function} callback
     */
    this.reconcile = (theirBrickMap, callback) => {
        const state = this.brickMapState;

        state.cloneAnchoredBrickMap((err, ourAnchoredBrickMap) => {
            if (err) {
                return callback(err);
            }

            state.prepareNewChangesForAnchoring((err) => {
                if (err) {
                    return callback(err);
                }

                // Detect the upstream changeset
                const theirChanges = ourAnchoredBrickMap.diff(theirBrickMap);

                // Check if any of our changes conflict with upstream changeset
                const conflicts = theirBrickMap.detectMergeConflicts(theirChanges, state.getDiffsForAnchoring());

                // Call the conflict resolution function if it is defined, or return with error
                if (conflicts) {
                    if (typeof conflictResolutionFn === 'function') {
                        return this.conflictResolutionFn(this.brickMapController, conflicts, callback);
                    }

                    const conflictError = new Error('Anchoring conflict error');
                    conflictError.conflicts = conflicts;
                    return callback(conflictError);
                }

                // No conflicts detected, merge changes
                try {
                    const [ourChanges, mergedDiffs] = this.mergeDiffs(ourAnchoredBrickMap, state.getDiffsForAnchoring());
                    theirBrickMap.merge(ourChanges);
                    //console.log(JSON.stringify(theirBrickMap.header, null, 2));
                } catch (e) {
                    state.rollback(mergedDiffs)
                    return callback(e);
                }
                state.setDirtyBrickMap(theirBrickMap);
                return callback(undefined, theirBrickMap);
            });
        })
    };

    /**
     * Merge diffs into a single BrickMap object
     * Handles the case when the list of diffs contains
     * whole BrickMap objects
     *
     * @param {BrickMap|Array<BrickMapMixin>} brickMap
     * @param {Array<BrickMapMixin>|undefined} diffs
     * @return {BrickMap}
     */
    this.mergeDiffs = (brickMap, diffs) => {
        if (!brickMap && (!Array.isArray(diffs) || !diffs.length)) {
            throw new Error('A target and a list of diffs is required');
        }

        if (brickMap.constructor !== BrickMap) {
            throw new Error('The target brick map instance is invalid');
        }

        const mergedDiffs = [];

        while (diffs.length) {
            const brickMapDiff = diffs.shift();
            mergedDiffs.push(brickMapDiff);
            brickMap.applyDiff(brickMapDiff);
        }

        return [brickMap, mergedDiffs];
    };

    this.initialize(options);
}

module.exports = LatestVersionStrategy;
