'use strict';

const swarmutils = require("swarmutils");
const pskPth = swarmutils.path;

function AnchoringService(options) {
    options = options || {};

    const strategy = options.strategy;
    const brickStorageService = options.brickStorageService;
    const barMapId = options.barMapId;

    const changeHandlers = {
        writeFile: null,
        addFile: null,
        addFiles: null,
        appendFile: null,
        addFolder: null,
        delete: null
    };

    let barMap;

    // TODO: uncomment this
    //if (!strategy) {
        //throw new Error('An anchor verification strategy is required');
    //}

    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////
    const initialize = () => {
        changeHandlers.writeFile = applyWriteFileChange;
        changeHandlers.addFile = applyAddFileChange;
        changeHandlers.addFiles = applyAddFilesChange;
        changeHandlers.appendFile = applyAppendFileChange;
        changeHandlers.addFolder = applyAddFolderChange;
        changeHandlers.delete = applyDeleteChange;
    }

    const applyWriteFileChange = (data, callback) => {
        barMap.addFileEntry(data.path, data.bricksData);
        callback();
    }

    const applyAddFileChange = (data, callback) => {
        applyWriteFileChange(data, callback);
    }

    const applyAddFilesChange = (data, callback) => {
        const barPath = data.path;
        const files = data.files;

        for (const filePath in files) {
            const bricks = files[filePath];
            barMap.addFileEntry(pskPth.join(barPath, filePath), bricks);
        }
        callback();
    }

    const applyAppendFileChange = (data, callback) => {
        barMap.appendBricksToEntry(data.path, data.bricksData);
        callback();
    }

    const applyAddFolderChange = (data, callback) => {
        applyAddFilesChange(data, callback);
    }

    const applyDeleteChange = (data, callback) => {
        barMap.delete(data.path);
        callback();
    }

    /**
     * @param {string} alias
     * @param {Brick} brick
     * @param {callback} callback
     */
    function updateAlias(alias, brick, callback) {
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
    function putBarMap(barMap, callback) {
        const alias = barMapId;
        const barMapBrick = barMap.toBrick();
        barMapBrick.setTransformParameters(barMap.getTransformParameters());

        let brickId = barMapBrick.getKey();
        if (!brickId) {
            brickId = barMapBrick.getHash();
            barMapBrick.setKey(brickId);
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

    ////////////////////////////////////////////////////////////
    // Public methods
    ////////////////////////////////////////////////////////////
    this.setBarMap = (map) => {
        barMap = map;
    }

    /**
     * @param {string} changeType
     * @param {object} data
     * @param {callback} callback
     */
    this.applyChange = (changeType, data, callback) => {
        if (typeof changeHandlers[changeType] !== 'function') {
            return callback(new Error(`Unknown change type: ${changeType}`))
        }

        const changeHandler = changeHandlers[changeType];
        changeHandler(data, (err) => {
            if (err) {
                return callback(err);
            }

            putBarMap(barMap, callback);
        });
    };

    initialize();
}

module.exports = AnchoringService;
