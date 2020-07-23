'use strict';

const BarMapDiff = require('bar').BarMapDiff;
const BarMapStrategyMixin = require('./BarMapStrategyMixin');

/**
 * @param {object} options
 * @param {callback} options.decisionFn Callback which will decide when to effectively anchor changes
 *                                                              If empty, the changes will be anchored after each operation
 * @param {callback} options.conflictResolutionFn Callback which will handle anchoring conflicts
 *                                                              The default strategy is to reload the BarMap and then apply the new changes
 * @param {callback} options.anchoringCb A callback which is called when the strategy anchors the changes
 * @param {callback} options.signingFn  A function which will sign the new alias
 * @param {callback} callback
 */
function DiffStrategy(options) {
    options = options || {};
    Object.assign(this, BarMapStrategyMixin);

    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////

    /**
     * 
     * @param {Array<BarMapDiff} barMapDiffs 
     * @param {callback} callback 
     */
    const createBarMapFromDiffs = (barMapDiffs, callback) => {
        const barMap = this.barMapController.createNewBarMap();
        try {
            for (const barMapDiff of barMapDiffs) {
                barMap.applyDiff(barMapDiff);
            }
        } catch (e) {
            return callback(e);
        }

        callback(undefined, barMap);
    }

    /**
     * @param {Array<string>} hashes 
     * @return {string}
     */
    const createBricksCacheKey = (hashes) => {
        return hashes.join(':');
    };

    /**
     * @param {Array<Brick>} bricks
     * @return {Array<BarMapDiff}
     */
    const createDiffsFromBricks = (bricks) => {
        const diffs = [];
        for (const brick of bricks) {
            const barMap = this.barMapController.createNewBarMap(brick);
            diffs.push(barMap);
        }

        return diffs;
    }

    /**
     * Get the list of BarMapDiffs either from cache
     * or from Brick storage
     * 
     * @param {Array<string>} hashes 
     * @param {callback} callback 
     */
    const getBarMapDiffs = (hashes, callback) => {
        const cacheKey = createBricksCacheKey(hashes);
        if (this.hasInCache(cacheKey)) {
            const barMapDiffs = this.getFromCache(cacheKey);
            return callback(undefined, barMapDiffs);
        }

        this.barMapController.getMultipleBricks(hashes, (err, bricks) => {
            if (err) {
                return callback(err);
            }

            if (hashes.length !== bricks.length) {
                return callback(new Error('Invalid data received'));
            }

            const barMapDiffs = createDiffsFromBricks(bricks);
            this.storeInCache(cacheKey, barMapDiffs);
            callback(undefined, barMapDiffs);
        });
    }

    /**
     * Assemble a final BarMap from several BarMapDiffs
     * after validating the history
     *
     * @param {Array<string>} hashes
     * @param {callback} callback
     */
    const assembleBarMap = (hashes, callback) => {
        this.lastHash = hashes[hashes.length - 1];
        getBarMapDiffs(hashes, (err, barMapDiffs) => {
            if (err) {
                return callback(err);
            }

            this.validator.validate('barMapHistory', barMapDiffs, (err) => {
                if (err) {
                    return callback(err);
                }

                createBarMapFromDiffs(barMapDiffs, callback);
            });
        })
    }


    ////////////////////////////////////////////////////////////
    // Public methods
    ////////////////////////////////////////////////////////////

    this.load = (alias, callback) => {
        this.barMapController.getAliasVersions(alias, (err, versionHashes) => {
            if (err) {
                return callback(err);
            }

            if (!versionHashes.length) {
                return callback(new Error(`No data found for alias <${alias}>`));
            }

            assembleBarMap(versionHashes, callback);
        })
    }


    /**
     * Compact a list of BarMapDiff objects
     * into a single BarMapDiff object
     * 
     * @param {Array<BarMapDiff} diffsList
     * @return {BarMapDiff}
     */
    this.compactDiffs = (diffsList) => {
        const barMap = diffsList.shift();

        while (diffsList.length) {
            const barMapDiff = diffsList.shift();

            barMap.applyDiff(barMapDiff);
        }

        return barMap;
    }

    /**
     * Merge the `diff` object into the current valid
     * BarMap object
     * 
     * @param {BarMapDiff} diff
     * @param {string} diffHash
     * @param {callback} callback
     */
    this.afterBarMapAnchoring = (diff, diffHash, callback) => {
        const validBarMap = this.barMapController.getValidBarMap();
        try {
            validBarMap.applyDiff(diff);
        } catch (e) {
            return callback(e);
        }
        this.lastHash = diffHash;
        callback(undefined, diffHash);
    }

    /**
     * Call the `conflictResolutionFn` if it exists
     * @param {object} conflictInfo
     * @param {BarMap} conflictInfo.barMap The up to date valid BarMap
     * @param {Array<BarMapDiff} conflictInfo.pendingAnchoringDiffs A list of BarMapDiff that were requested for anchoring or failed to anchor
     * @param {Array<BarMapDiff} conflictInfo.newDiffs A list of BarMapDiff objects that haven't been scheduled for anchoring
     * @param {callback} callback
     */
    this.handleConflict = (conflictInfo, callback) => {
        if (typeof this.conflictResolutionFn !== 'function') {
            return callback(conflictInfo.error);
        }

        this.conflictResolutionFn(this.barMapController, {
            validBarMap: conflictInfo.barMap,
            pendingAnchoringDiffs: conflictInfo.pendingAnchoringDiffs,
            newDiffs: conflictInfo.newDiffs,
            error: conflictInfo.error
        }, callback);
    }

    /**
     * Try and fix an anchoring conflict
     * 
     * Merge any "pending anchoring" BarMapDiff objects in a clone
     * of the valid barMap. If merging fails, call the 'conflictResolutionFn'
     * in order to fix the conflict. If merging succeeds, update the "dirtyBarMap"
     * 
     * @param {BarMap} barMap The up to date valid BarMap
     * @param {Array<BarMapDiff} pendingAnchoringDiffs A list of BarMapDiff that were requested for anchoring or failed to anchor
     * @param {Array<BarMapDiff} newDiffs A list of BarMapDiff objects that haven't been scheduled for anchoring
     * @param {callback} callback
     */
    this.reconcile = (barMap, pendingAnchoringDiffs, newDiffs, callback) => {
        // Try and apply the changes on a barMap copy
        const barMapCopy = barMap.clone();

        try {
            for (let i = 0; i < pendingAnchoringDiffs; i++) {
                barMapCopy.applyDiff(pendingAnchoringDiffs[i]);
            }
        } catch (e) {
            return this.handleConflict({
                barMap,
                pendingAnchoringDiffs,
                newDiffs,
                error: e
            }, callback);
        }

        this.barMapController.setDirtyBarMap(barMapCopy);
        callback();
    }

    this.initialize(options);
}

module.exports = DiffStrategy;