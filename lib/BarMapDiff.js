'use strict';

const nodeUtils = require('util');
const BarMap = require('./BarMap')

/**
 * Auguments a BarMap with an operations
 * log
 */
function BarMapDiff(header) {
    BarMap.call(this, header);

    if (!this.header.metadata.log) {
        this.header.metadata.log = [];
    }
}
nodeUtils.inherits(BarMapDiff, BarMap);

/**
 * @param {string} op
 * @param {string} path
 * @param {object|undefined} data
 */
BarMapDiff.prototype.log = function (op, path, data) {
    const timestamp = this.getTimestamp()
    this.header.metadata.log.push({ op, path, timestamp, data });
}

/**
 * @param {string} path
 * @param {Array<object>} bricks
 */
BarMapDiff.prototype.addFileEntry = function (path, bricks) {
    this.log('add', path);
    BarMap.prototype.addFileEntry.call(this, path, bricks);
}

/**
 * @param {string} path
 */
BarMapDiff.prototype.emptyList = function (path) {
    this.log('truncate', path);
    BarMap.prototype.emptyList.call(this, path);
}

/**
 * @param {string} path
 */
BarMapDiff.prototype.delete = function (path) {
    this.log('delete', path);
}

/**
 * @param {string} srcPath
 * @param {string} dstPath
 */
BarMapDiff.prototype.copy = function (srcPath, dstPath) {
    this.log('copy', srcPath, dstPath)
}

module.exports = BarMapDiff;
