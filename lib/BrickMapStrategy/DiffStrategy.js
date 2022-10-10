'use strict';

const BrickMapDiff = require('../../lib/BrickMapDiff');
const BrickMap = require('../BrickMap');
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
    const openDSU = require("opendsu")
    const anchoring = openDSU.loadAPI("anchoring");
    const anchoringx = anchoring.getAnchoringX();
    const bricking = openDSU.loadAPI("bricking");
    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////


    /**
     *
     * @param {Array<BrickMapDiff>} brickMapDiffs
     * @param {callback} callback
     */
    const createBrickMapFromDiffs = (brickMapDiffs, callback) => {
        this.brickMapController.createBrickMap((err, brickMap) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to create a new BrickMap`, err));
            }

            try {
                for (const brickMapDiff of brickMapDiffs) {
                    brickMap.applyDiff(brickMapDiff);
                }
            } catch (e) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to apply diffs on brickMap`, e));
            }

            callback(undefined, brickMap);

        });
    }

    /**
     * @param {Array<string>} hashLinks
     * @return {string}
     */
    const createBricksCacheKey = (hashLinks) => {
        return hashLinks.map(hashLink => {
            return hashLink.getIdentifier();
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
            this.brickMapController.createBrickMapDiff(brick, (err, brickMap) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to create diffs from bricks`, err));
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
     * @param {Array<string>} hashLinks
     * @param {callback} callback
     */
    const getBrickMapDiffs = (hashLinks, callback) => {
        const cacheKey = createBricksCacheKey(hashLinks);
        if (this.hasInCache(cacheKey)) {
            const brickMapDiffs = this.getFromCache(cacheKey);
            return callback(undefined, brickMapDiffs);
        }

        const TaskCounter = require("swarmutils").TaskCounter;
        const bricks = [];
        const taskCounter = new TaskCounter(() => {
            createDiffsFromBricks(bricks, (err, brickMapDiffs) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to create diffs from bricks`, err));
                }

                this.storeInCache(cacheKey, brickMapDiffs);
                callback(undefined, brickMapDiffs);
            });
        });
        taskCounter.increment(hashLinks.length);
        bricking.getMultipleBricks(hashLinks, (err, brickData) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to retrieve multiple bricks`, err));
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
     * @param {Array<string>} hashLinks
     * @param {callback} callback
     */
    const assembleBrickMap = (hashLinks, callback) => {
        this.currentHashLink = hashLinks[hashLinks.length - 1];
        getBrickMapDiffs(hashLinks, (err, brickMapDiffs) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to retrieve brickMap diffs`, err));
            }

            this.validator.validate('brickMapHistory', brickMapDiffs, (err) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to validate brickMapDiffs`, err));
                }

                createBrickMapFromDiffs(brickMapDiffs, callback);
            });
        })
    }


    ////////////////////////////////////////////////////////////
    // Public methods
    ////////////////////////////////////////////////////////////

    this.load = (keySSI, callback) => {
        keySSI.getAnchorId((err, anchorId) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get anchorId for keySSI ${keySSI.getIdentifier()}`, err));
            }
            anchoringx.getAllVersions(keySSI, (err, hashLinks) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to retrieve versions for anchor ${anchorId}`, err));
                }

                if (!hashLinks.length) {
                    return callback(new Error(`No data found for anchor <${anchorId}>`));
                }

                assembleBrickMap(hashLinks, callback);
            });
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
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to prepare diffs for anchoring`, err));
            }

            const mergedDiffs = (dstBrickMap, callback) => {
                const diffsForAnchoring = this.brickMapState.getDiffsForAnchoring();
                let result;
                let error;
                try {
                    result = this.mergeDiffs(dstBrickMap, diffsForAnchoring);
                } catch (e) {
                    error = e;
                }
                callback(error, result);
            }

            if (!dstBrickMap) {
                return this.brickMapController.createBrickMapDiff((err, dstBrickMap) => {
                    if (err) {
                        return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to create empty BrickMapDiff`, err));
                    }

                    mergedDiffs(dstBrickMap, callback);
                })

            }

            mergedDiffs(dstBrickMap, callback);
        })
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
        const anchoredBrickMap = this.brickMapState.getAnchoredBrickMap();
        try {
            anchoredBrickMap.applyDiff(diff);
        } catch (e) {
            return callback(e);
        }
        this.currentHashLink = diffHash;
        this.lastAnchorTimestamp = new Date().getTime();
        this.brickMapState.setCurrentAnchoredHashLink(diffHash);
        callback(undefined, diffHash);
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

        const ourAnchoredBrickMap = state.getAnchoredBrickMap();
        state.prepareNewChangesForAnchoring((err) => {
            if (err) {
                return callback(err);
            }

            if (this.mergeConflictsHandled(theirBrickMap, ourAnchoredBrickMap, ourHashLinkSSI, callback)) {
                return;
            }

            // We only need to update the dirty brick map
            // The BrickMapController will compact our diffs and try to anchor them again
            try {
                this.mergeDiffs(theirBrickMap, [...state.getDiffsForAnchoring()]);
                state.setDirtyBrickMap(theirBrickMap);
            } catch (e) {
                return callback(e);
            }
            callback(undefined, {
                status: true
            });
        });
    }

    this.initialize(options);
}

module.exports = DiffStrategy;
