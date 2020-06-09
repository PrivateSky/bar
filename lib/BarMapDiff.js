'use strict';

const BarMapMixin = require('./BarMapMixin');

/**
 * Auguments a BarMap with an operations
 * log
 * @param {object} options
 * @param {string} options.prevDiffHash
 */
function BarMapDiff(header) {
    Object.assign(this, BarMapMixin);

    this.initialize = function (header) {
        BarMapMixin.initialize.call(this, header);
        this.load();
        if (!this.header.metadata.log) {
            this.header.metadata.log = [];
        }
    }

    this.setPrevDiffHash = function (hash) {
        this.header.metadata.prevDiffHash = hash;
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

    /**
     * @param {string} path
     */
    this.createFolder = function (path) {
        this.log('createFolder', path);
    }

    this.initialize(header);
}
module.exports = BarMapDiff;
