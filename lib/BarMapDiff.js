'use strict';

const BarMapTrait = require('./BarMapTrait');

/**
 * Auguments a BarMap with an operations
 * log
 */
function BarMapDiff(header) {
    Object.assign(this, BarMapTrait);

    this.initialize = function (header) {
        BarMapTrait.initialize.call(this, header);
        if (!this.header.metadata.log) {
            this.header.metadata.log = [];
        }
    }

    /**
     * @param {string} op
     * @param {string} path
     * @param {object|undefined} data
     */
    this.log = function (op, path, data) {
        const timestamp = this.getTimestamp()
        this.header.metadata.log.push({ op, path, timestamp, data });
    }

    /**
     * @param {string} path
     * @param {Array<object>} bricks
     */
    this.addFileEntry = function (path, bricks) {
        this.log('add', path, bricks);
    }

    /**
     * @param {string} path
     */
    this.emptyList = function (path) {
        this.log('truncate', path);
    }

    /**
     * @param {string} path
     */
    this.delete = function (path) {
        this.log('delete', path);
    }

    /**
     * @param {string} srcPath
     * @param {string} dstPath
     */
    this.copy = function (srcPath, dstPath) {
        this.log('copy', srcPath, dstPath)
    }

    this.initialize();
}
module.exports = BarMapDiff;
