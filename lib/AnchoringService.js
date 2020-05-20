'use strict';

const swarmutils = require("swarmutils");
const pskPth = swarmutils.path;

function AnchoringService(options) {
    options = options || {};

    const bar = options.bar;

    if (!bar) {
        throw new Error('Bar is required!');
    }

    const strategy = bar.getAnchorVerificationStrategy();
    const brickStorageService = bar.getBrickStorageService();
    let sessionBarMap;

    const changeHandlers = {
        writeFile: null,
        addFile: null,
        addFiles: null,
        appendFile: null,
        addFolder: null,
        delete: null
    };

    if (!strategy) {
        throw new Error('An anchor verification strategy is required');
    }

    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////
    const initialize = () => {
        // Initialize change handlers
        changeHandlers.writeFile = applyWriteFileChange;
        changeHandlers.addFile = applyAddFileChange;
        changeHandlers.addFiles = applyAddFilesChange;
        changeHandlers.appendFile = applyAppendFileChange;
        changeHandlers.addFolder = applyAddFolderChange;
        changeHandlers.delete = applyDeleteChange;

        strategy.setAnchoringExecutor(saveChanges);
    }

    /**
     * @param {BarMap} barMap
     * @param {object} data
     * @param {string} data.path
     * @param {Array} data.bricksSummary
     * @param {callback} callback
     */
    const applyWriteFileChange = (barMap, data, callback) => {
        strategy.validatePreWrite(data.path, { bricksSummary: data.bricksSummary }, (err) => {
            if (err) {
                return callback(err);
            }

            barMap.addFileEntry(data.path, data.bricksSummary);
            callback();
        });
    }

    /**
     * @param {BarMap} barMap
     * @param {object} data
     * @param {string} data.path
     * @param {Array} data.bricksSummary
     * @param {callback} callback
     */
    const applyAddFileChange = (barMap, data, callback) => {
        applyWriteFileChange(barMap, data, callback);
    }

    /**
     * @param {BarMap} barMap
     * @param {object} data
     * @param {string} data.path
     * @param {Array} data.files
     * @param {callback} callback
     */
    const applyAddFilesChange = (barMap, data, callback) => {
        const barPath = data.path;
        const files = data.files;

        strategy.validatePreWrite(barPath, { files }, (err) => {
            if (err) {
                return callback(err);
            }

            for (const filePath in files) {
                const bricks = files[filePath];
                barMap.addFileEntry(pskPth.join(barPath, filePath), bricks);
            }
            callback();
        });
    }

    /**
     * @param {BarMap} barMap
     * @param {object} data
     * @param {string} data.path
     * @param {Array} data.bricksSummary
     * @param {callback} callback
     */
    const applyAppendFileChange = (barMap, data, callback) => {
        strategy.validatePreWrite(data.path, { bricksSummary: data.bricksSummary }, (err) => {
            if (err) {
                return callback(err);
            }

            barMap.appendBricksToEntry(data.path, data.bricksSummary);
            callback();
        });
    }

    /**
     * @param {BarMap} barMap
     * @param {object} data
     * @param {string} data.path
     * @param {Array} data.files
     * @param {callback} callback
     */
    const applyAddFolderChange = (barMap, data, callback) => {
        applyAddFilesChange(barMap, data, callback);
    }

    /**
     * @param {BarMap} barMap
     * @param {object} data
     * @param {string} data.path
     * @param {callback} callback
     */
    const applyDeleteChange = (barMap, data, callback) => {
        strategy.validatePreWrite(data.path, (err) => {
            if (err) {
                return callback(err);
            }

            barMap.delete(data.path);
            callback();
        })
    }

    /**
     * Creates or returns a session BarMap
     * @return {BarMap}
     */
    const getSessionBarMap = () => {
        if (strategy.sessionIsStarted()) {
            return sessionBarMap;
        }

        strategy.beginSession(bar);

        // In order to handle file "deletes" a clone is necessary
        // TODO: discuss about this
        sessionBarMap = bar.getBarMap().clone();
        return sessionBarMap;
    }

    /**
     * Calls the strategy's doAnchoring() method
     * @param {callback} callback
     */
    const anchorChange = (callback) => {
        strategy.doAnchoring((err, result) => {
            if (err) {
                return callback(err);
            }

            if (result.status) {
                // Changes was anchored, reset the session
                sessionBarMap = null;
            } // else, session is still going

            callback(undefined, result.hash);
        });
    }

    /**
     * @param {string} alias
     * @param {Brick} brick
     * @param {callback} callback
     */
    const updateAlias = (alias, brick, callback) => {
        brickStorageService.updateAlias(alias, brick.getHash(), (err) => {
            if (err) {
                return callback(err);
            }

            brickStorageService.putBrick(brick, callback);
        })
    }

    /**
     * @param {BarMap} barMap
     * @param {callback} callback
     */
    const saveSessionBarMap = (barMap, callback) => {
        const barMapBrick = barMap.toBrick();
        barMapBrick.setTransformParameters(barMap.getTransformParameters());
        brickStorageService.putBrick(barMapBrick, callback);
    };

    /**
     * @param {string} alias
     * @param {BarMap} barMap
     * @param {callback} callback
     */
    const saveBarMap = (alias, barMap, callback) => {
        const barMapBrick = barMap.toBrick();
        barMapBrick.setTransformParameters(barMap.getTransformParameters());

        let brickId = barMapBrick.getKey();
        if (!brickId) {
            brickId = barMapBrick.getHash();
            barMapBrick.setKey(brickId);
        }

        // @TODO: remove this after switching completely to psk-did-resolver
        if (!alias) {
            alias = brickId;
        }

        brickStorageService.getAliasVersions(alias, (err, hashesList) => {
            if (err) {
                return callback(err);
            }

            if (!hashesList.length) {
                return updateAlias(alias, barMapBrick, callback);
            }

            const barMapHash = hashesList[hashesList.length - 1];
            if (barMapHash !== barMapBrick.getHash()) {
                return updateAlias(alias, barMapBrick, callback);
            }

            callback();
        })
    }

    /**
     * Save changes to bar map
     * @param {callback} callback
     */
    const saveChanges = (callback) => {
        saveSessionBarMap(sessionBarMap, (err, hash) => {
            if (err) {
                return callback(err);
            }

            const barMapId = bar.getBarMapId();
            const barMap = bar.getBarMap();

            barMap.applyDiff(sessionBarMap);

            // Anchor
            saveBarMap(barMapId, barMap, (err, hash) => {
                if (err) {
                    return callback(err);
                }

                const result = {
                    diffBarMap: sessionBarMap,
                    hash
                };

                return callback(undefined, result);
            });
        });
    }

    ////////////////////////////////////////////////////////////
    // Public methods
    ////////////////////////////////////////////////////////////
    /**
     * Call the appropriate change handler and try to anchor
     * the change
     *
     * @param {string} changeType
     * @param {object} data
     * @param {callback} callback
     */
    this.applyChange = (changeType, data, callback) => {
        if (typeof changeHandlers[changeType] !== 'function') {
            return callback(new Error(`Unknown change type: ${changeType}`))
        }

        const changeHandler = changeHandlers[changeType];
        const sessionBarMap = getSessionBarMap();

        changeHandler(sessionBarMap, data, (err) => {
            if (err) {
                return callback(err);
            }

            anchorChange(callback);
        });
    };

    initialize();
}

module.exports = AnchoringService;
