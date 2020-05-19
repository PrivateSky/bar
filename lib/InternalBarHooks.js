'use strict';

function InternalBarHooks(options) {
    options = options || {};

    const anchorVerificationStrategy = options.anchorVerificationStrategy

    const registry = {
        beforeWriteFile: null,
        beforeAddFile: null,
        beforeAddFiles: null,
        beforeAppendToFile: null,
        beforeAddFolder: null,
        beforeDelete: null,
    }

    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////

    /**
     * Set hooks handlers
     */
    const initialize = () => {
        registry.beforeWriteFile = beforeWriteFile;
        registry.beforeAddFile = beforeWriteFile;
        registry.beforeAddFiles = beforeAddFiles;
        registry.beforeAppendToFile = beforeWriteFile;
        registry.beforeAddFolder = beforeAddFiles;
        registry.beforeDelete = beforeDelete;
    }

    const beforeWriteFile = (path, bricksSummary, callback) => {
        callback();
    }

    const beforeAddFile = (path, bricksSummary, callback) => {
        beforeWriteFile(path, bricksSummary, callback);
    }

    const beforeAddFiles = (path, files, callback) => {
        callback();
    }

    const beforeAppendToFile = (path, bricksSummary, callback) => {
        beforeWriteFile(path, bricksSummary, callback);
    }

    const beforeAddFolder = (path, files, callback) => {
        beforeAddFiles(path, files, callback);
    }

    const beforeDelete = (path, callback) => {
        callback();
    }

    ////////////////////////////////////////////////////////////
    // Public methods
    ////////////////////////////////////////////////////////////

    /**
     * @param {string} hookName
     * @return {boolean}
     */
    this.hasHandler = (hookName) => {
        return typeof registry[hookName] === 'function';
    }

    /**
     * @param {string} hookName
     * @param {Array} args
     */
    this.executeHandler = (hookName, args) => {
        const handler = registry[hookName];
        handler(...args);
    }

    initialize();
}

module.exports = InternalBarHooks;
