const BrickMapStrategyMixin = {
    brickMapController: null,
    brickMapState: null,
    anchoringEventListener: null,
    conflictResolutionFunction: null,
    decisionFunction: null,
    signingFunction: null,
    cache: null,
    lastHashLink: null,
    validator: null,
    delay: null,
    anchoringTimeout: null,

    initialize: function (options) {
        if (typeof options.anchoringEventListener === 'function') {
            this.setAnchoringEventListener(options.anchoringEventListener);
        }

        if (typeof options.decisionFn === 'function') {
            this.setDecisionFunction(options.decisionFn);
        }

        if (typeof options.conflictResolutionFn === 'function') {
            this.setConflictResolutionFunction(options.conflictResolutionFn);
        }

        if (typeof options.signingFn === 'function') {
            this.setSigningFunction(options.signingFn);
        }

        if (typeof options.delay !== 'undefined' ) {
            if (!this.anchoringEventListener) {
                throw new Error("An anchoring event listener is required when choosing to delay anchoring");
            }
            this.delay = options.delay;
        }
    },

    /**
     * @param {BrickMapController} controller
     */
    setBrickMapController: function (controller) {
        this.brickMapController = controller;
    },

    /**
     * @param {object} state The BrickMap state
     */
    setBrickMapState: function (state) {
        this.brickMapState = state;
    },

    /**
     * @param {function} callback
     */
    setConflictResolutionFunction: function (fn) {
        this.conflictResolutionFunction = fn;
    },

    /**
     * @return {function}
     */
    getConflictResolutionFunction: function () {
        return this.conflictResolutionFunction;
    },

    /**
     *
     * @param {function} listener
     */
    setAnchoringEventListener: function (listener) {
        this.anchoringEventListener = listener;
    },

    /**
     * @param {function} fn
     */
    setSigningFunction: function (fn) {
        this.signingFunction = fn;
    },

    /**
     * @param {function} fn
     */
    setDecisionFunction: function (fn) {
        this.decisionFunction = fn;
    },

    /**
     * @return {function}
     */
    getDecisionFunction: function () {
        return this.decisionFunction;
    },

    /**
     * @param {object} validator 
     */
    setValidator: function (validator) {
        this.validator = validator;
    },

    /**
     * @param {psk-cache.Cache} cache 
     */
    setCache: function (cache) {
        this.cache = cache;
    },

    /**
     * @param {string} key 
     * @return {boolean}
     */
    hasInCache: function (key) {
        if (!this.cache) {
            return false;
        }

        return this.cache.has(key);
    },

    /**
     * @param {string} key 
     * @return {*}
     */
    getFromCache: function (key) {
        if (!this.cache) {
            return;
        }

        return this.cache.get(key);
    },

    /**
     * @param {string} key 
     * @param {*} value 
     */
    storeInCache: function (key, value) {
        if (!this.cache) {
            return;
        }

        this.cache.set(key, value)
    },

    /**
     *
     * @param {BrickMap} brickMap
     * @param {function} callback
     */
    ifChangesShouldBeAnchored: function (brickMap, callback) {
        if (typeof this.decisionFunction === 'function') {
            return this.decisionFunction(brickMap, callback);
        }

        if (this.delay !== null) {
            clearTimeout(this.anchoringTimeout);
            this.anchoringTimeout = setTimeout(() => {
                const anchoringEventListener = this.getAnchoringEventListener(function(){console.log("Anchoring...")});
                this.brickMapController.anchorChanges(anchoringEventListener);
            }, this.delay);
            return callback(undefined, false);
        }
        return callback(undefined, true);
    },

    /**
     * @return {string|null}
     */
    getLastHashLink: function () {
        return this.lastHashLink;
    },

    afterBrickMapAnchoring: function (diff, diffHash, callback) {
        throw new Error('Unimplemented');
    },

    load: function (alias, callback) {
        throw new Error('Unimplemented');
    },

    /**
     * Merge diffs into a single BrickMap object
     * Handles the case when the list of diffs contains
     * whole BrickMap objects
     *
     * @param {BrickMap} brickMap
     * @param {Array<BrickMapDiff>} diffs
     * @return {BrickMap}
     */
    mergeDiffs: function (brickMap, diffs) {
        if (!brickMap && (!Array.isArray(diffs) || !diffs.length)) {
            throw new Error('A target and a list of diffs is required');
        }

        const mergedDiffs = [];

        while (diffs.length) {
            const brickMapDiff = diffs.shift();
            mergedDiffs.push(brickMapDiff);
            brickMap.applyDiff(brickMapDiff);
        }

        return [brickMap, mergedDiffs];
    },

    /* Detect any merge conflicts
     * @param {BrickMap} theirBrickMap The latest anchored BrickMap
     * @param {BrickMap} ourBrickMap Our anchored brickmap
     * @param {KeySSI} ourHashLinkSSI
     */
    detectMergeConflicts: function (theirBrickMap, ourBrickMap, ourHashLinkSSI) {
        // Detect the upstream changeset
        /* @var {BrickMap} */
        const theirChanges = ourBrickMap.diff(theirBrickMap);

        // Check if any of our changes conflict with upstream changeset
        const filesInConflict = theirChanges.detectMergeConflicts(this.brickMapState.getDiffsForAnchoring());

        let conflicts;

        // Call the conflict resolution function if it is defined, or return with error
        if (filesInConflict) {
            conflicts = {
                files: filesInConflict,
                ourHashLinkSSI: ourHashLinkSSI.getIdentifier(),
                theirHashLinkSSI: this.brickMapState.getLastAnchoredHashLink().getIdentifier()
            };
        }
        return conflicts;
    },

    /**
     * Detect merge conflicts and if any, call the conflict resolution function
     * or call the callback with an error
     * @param {BrickMap} theirBrickMap The latest anchored BrickMap
     * @param {BrickMap} ourBrickMap Our anchored brickmap
     * @param {KeySSI} ourHashLinkSSI
     * @param {function} callback
     * @return {boolean} True if merge conflicts were detected, False otherwise
     */
    mergeConflictsHandled: function (theirBrickMap, ourBrickMap, ourHashLinkSSI, callback) {
        const mergeConflicts = this.detectMergeConflicts(theirBrickMap, ourBrickMap, ourHashLinkSSI);

        if (!mergeConflicts) {
            return false;
        }

        // Call the conflict resolution function if it is defined, or return with error
        if (typeof this.conflictResolutionFunction === 'function') {
            this.conflictResolutionFunction(mergeConflicts, (err) => {
                if (err) {
                    return callback(err);
                }

                callback(undefined, {
                    status: false
                });
            });
            return true;
        }

        const conflictError = new Error('Anchoring conflict error');
        conflictError.conflicts = mergeConflicts;
        callback(conflictError);
        return true;
    },

    /**
     * Merge remote changes. This method is used when subscring to remote changes
     * on this DSU
     * @param {BrickMap} theirBrickMap The latest anchored BrickMap
     * @param {KeySSI} ourHashLinkSSI
     * @param {function} callback
     */
    merge: function (theirBrickMap, ourHashLinkSSI, callback) {
        const state = this.brickMapState;

        const ourAnchoredBrickMap = state.getAnchoredBrickMap();
        state.prepareNewChangesForAnchoring((err) => {
            if (err) {
                return callback(err);
            }

            if (this.mergeConflictsHandled(theirBrickMap, ourAnchoredBrickMap, ourHashLinkSSI, callback)) {
                return;
            }

            theirBrickMap.clone((err, brickMap) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to clone BrickMap`, err));
                }
                const dirtyBrickMap = theirBrickMap;

                // No conflicts detected, merge changes
                try {
                    const diffsForAnchoring = [...state.getDiffsForAnchoring()];
                    if (diffsForAnchoring.length) {
                        this.mergeDiffs(dirtyBrickMap, diffsForAnchoring);
                    }
                } catch (e) {
                    return callback(e);
                }

                state.setDirtyBrickMap(dirtyBrickMap);
                state.setAnchoredBrickMap(brickMap);
                state.setLastAnchoredHashLink(this.getLastHashLink());
                return callback(undefined, {
                    status: true
                });
            })
        });
    },


    /**
     * @param {function} defaultListener
     * @return {function}
     */
    getAnchoringEventListener: function (defaultListener) {
        let anchoringEventListener = this.anchoringEventListener;
        if (typeof anchoringEventListener !== 'function') {
            anchoringEventListener = defaultListener;
        }

        return anchoringEventListener;
    }
}

module.exports = BrickMapStrategyMixin;
