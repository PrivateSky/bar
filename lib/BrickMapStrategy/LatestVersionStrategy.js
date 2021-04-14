'use strict';

const BrickMapDiff = require('../BrickMapDiff');
const BrickMap = require('../BrickMap');
const BrickMapStrategyMixin = require('./BrickMapStrategyMixin');
const Brick = require("../../lib/Brick");

/**
 * @param {object} options
 * @param {callback} options.decisionFn Callback which will decide when to effectively anchor changes
 *                                                              If empty, the changes will be anchored after each operation
 * @param {callback} options.anchoringCb A callback which is called when the strategy anchors the changes
 * @param {callback} options.signingFn  A function which will sign the new alias
 * @param {callback} callback
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
                return setTimeout(() => {
                    callback(undefined, brickMaps);
                }, 0)
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
     * @param {callback} callback
     */
    const createBrickMapsFromHistory = (hashes, callback) => {
        const cacheKey = createBricksCacheKey(hashes);
        if (this.hasInCache(cacheKey)) {
            const brickMaps = this.getFromCache(cacheKey);
            return setTimeout(() => {
                callback(undefined, brickMaps);
            }, 0)
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
     * @param {callback} callback
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
     * @param {Array<BrickMapDiff>} diffsList
     * @return {BrickMapDiff}
     */
    this.compactDiffs = (diffsList, callback) => {
        if (diffsList[0].constructor === BrickMap) {
            const brickMap = this.mergeDiffs(diffsList);
            return setTimeout(() => {
                callback(undefined, brickMap);
            }, 0)
        }

        this.brickMapController.getValidBrickMap().clone((err, validBrickMapClone) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to clone valid BrickMap`, err));
            }
            const brickMap = this.mergeDiffs(validBrickMapClone, diffsList);
            callback(undefined, brickMap);
        })
    }

    /**
     * Tell the BrickMapController to use the newly anchored
     * BrickMap as a valid one
     *
     * @param {BrickMap} diff
     * @param {string} brickMapHashLink
     * @param {callback} callback
     */
    this.afterBrickMapAnchoring = (brickMap, brickMapHashLink, callback) => {
        //console.log('==============', JSON.stringify(brickMap.header, undefined, 2));
        this.brickMapController.setValidBrickMap(brickMap)
        this.lastHashLink = brickMapHashLink;
        this.lastAnchorTimestamp = new Date().getTime();

        setTimeout(() => {
            callback(undefined, brickMapHashLink);
        }, 0)
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
            return setTimeout(() => {
                // This function must use the conflictInfo object to fix
                // the merging conflicts, apply the new changes from the pendingAnchoringDiffs and newDiffs and update the valid bar map and the dirty bar map clone
                // using the brickMapController, then call the callback to resume the anchoring process

                // If fixing the conflict fails, the `callback` must be called with an error
                // to abort the anchoring process.
                console.log(conflictInfo);
                //callback(conflictInfo.error);
            }, 0)
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
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to clone BrickMap`, err));
            }

            const theirChanges = this.brickMapController.getValidBrickMap().diff(brickMap);
            const ourChanges = this.mergeDiffs([...pendingAnchoringDiffs]); // TODO: this array shouldn't be mutated here

            // TODO: compute the intersection of theirChanges with ourChanges
            //       if common keys found, throw conflict error

            console.log(JSON.stringify(theirChanges.header, null, 2));
            console.log(JSON.stringify(ourChanges.header, null, 2));
            process.exit(1);
            //try {
                // create a copy of the pending diffs array because the merge function
                // empties the array, and we need it intact in case conflict resolution
                // is needed
                //const pendingAnchoringDiffsCopy = pendingAnchoringDiffs.map((diff) => diff);
                //brickMapCopy = this.mergeDiffs(brickMapCopy, pendingAnchoringDiffsCopy);
            //} catch (e) {
                //return this.handleConflict({
                    //brickMap,
                    //pendingAnchoringDiffs,
                    //newDiffs,
                    //error: e
                //}, callback);
            //}

            this.brickMapController.setDirtyBrickMap(brickMapCopy);
            callback();
        });
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
        if (typeof diffs === 'undefined') {
            diffs = brickMap;
            brickMap = undefined;
        }

        if (!Array.isArray(diffs)) {
            diffs = [diffs];
        }

        if (!brickMap && (!Array.isArray(diffs) || !diffs.length)) {
            throw new Error('A target and a list of diffs is required');
        }

        if (!brickMap) {
            brickMap = diffs.shift();
        }

        if (brickMap.constructor !== BrickMap) {
            throw new Error('The target brick map instance is invalid');
        }

        while (diffs.length) {
            const brickMapDiff = diffs.shift();
            brickMap.applyDiff(brickMapDiff);
        }

        return brickMap;
    };

    this.initialize(options);
}

module.exports = LatestVersionStrategy;
