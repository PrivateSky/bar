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
    const openDSU = require("opendsu");
    const anchoring = openDSU.loadAPI("anchoring");
    const bricking = openDSU.loadAPI("bricking");
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
            this.brickMapController.createBrickMap(brick, (err, brickMap) => {
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
        bricking.getMultipleBricks(hashes, (err, brickData) => {
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
        anchoring.getAllVersions(keySSI, (err, versionHashes) => {
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

                let result;
                try {
                    result = this.mergeDiffs(dst, this.brickMapState.getDiffsForAnchoring());
                } catch (e) {
                    return callback(e);
                }
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
        this.brickMapState.setAnchoredBrickMap(brickMap);
        this.brickMapState.setLastAnchoredHashLink(brickMapHashLink);
        callback(undefined, brickMapHashLink);
    }

    /**
     * Try and fix an anchoring conflict
     *
     * Merge any "pending anchoring" BrickMapDiff objects in a clone
     * of our anchored BrickMap. If merging fails, call the 'conflictResolutionFn'
     * in order to fix the conflict. If merging succeeds, update the "dirtyBrickMap"
     *
     * If no 'conflictResolutionFn' function was defined
     * The callback will be called with the following error:
     *
     *  error: Error {
     *      message: 'Anchoring conflict error',
     *      conflicts: {
     *          files: {
     *              '/file/path/in/conflict': {
     *                  error: 'LOCAL_OVERWRITE|REMOTE_DELETE|LOCAL_DELETE', // type of conflict
     *                  message: '[User friendly error message]'
     *              },
     *              ...
     *          },
     *          theirHashLinkSSI: '...', // HashLinkSSI of the latest anchored BrickMap
     *          ourHashLinkSSI: '...' // The HashLinkSSI of our version
     *      }
     *  }
     *
     *  Where conflicts.*.error:
     *      LOCAL_OVERWRITE - Our changes will overwrite a newly anchored file/directory
     *      REMOTE_DELETE - The file path we're trying to anchor has been deleted
     *      LOCAL_DELETE - Our changes will delete a newly anchored file/directory
     *
     * If a 'conflictResolutionFn' is defined it will be called with the following arguments:
     *  conflicts - The conflicts object described above
     *  callback
     *
     * @param {BrickMap} theirBrickMap The latest anchored BrickMap
     * @param {KeySSI} ourHashLinkSSI
     * @param {function} callback
     */
    this.reconcile = (theirBrickMap, ourHashLinkSSI, callback) => {
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
                /* @var {BrickMap} */
                const theirChanges = ourAnchoredBrickMap.diff(theirBrickMap);

                // Check if any of our changes conflict with upstream changeset
                const filesInConflict = theirChanges.detectMergeConflicts(state.getDiffsForAnchoring());

                // Call the conflict resolution function if it is defined, or return with error
                if (filesInConflict) {
                    const conflicts = {
                        files: filesInConflict,
                        ourHashLinkSSI: ourHashLinkSSI.getIdentifier(),
                        theirHashLinkSSI: state.getLastAnchoredHashLink().getIdentifier()
                    };
                    if (typeof this.conflictResolutionFunction === 'function') {
                        return this.conflictResolutionFunction(conflicts, (err) => {
                            if (err) {
                                return callback(err);
                            }

                            callback(undefined, {
                                status: false
                            });
                        });
                    }

                    const conflictError = new Error('Anchoring conflict error');
                    conflictError.conflicts = conflicts;
                    return callback(conflictError);
                }

                // No conflicts detected, merge changes
                let ourChanges;
                let mergedDiffs;
                try {
                    const diffsForAnchoring = state.getDiffsForAnchoring();

                    if (diffsForAnchoring.length) {
                        [ourChanges, mergedDiffs] = this.mergeDiffs(ourAnchoredBrickMap, diffsForAnchoring);
                        theirBrickMap.merge(ourChanges);
                    }

                    // Their BrickMap now has our changes
                    // and becomes ours
                    state.setDirtyBrickMap(theirBrickMap);
                } catch (e) {
                    state.rollback(mergedDiffs)
                    return callback(e);
                }
                return callback(undefined, {
                    status: true,
                    brickMap: theirBrickMap
                });
            });
        })
    };

    this.initialize(options);
}

module.exports = LatestVersionStrategy;
