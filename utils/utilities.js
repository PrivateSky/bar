const OFFSET_SIZE = 8;

function getBrickMapOffsetSize() {
    return OFFSET_SIZE;
}

function ensureFileDoesNotExist(filePath, callback) {
    const fs = require('fs');
    fs.access(filePath, (err) => {
        if (!err) {
            fs.unlink(filePath, callback);
        } else {
            return callback();
        }
    });
}

module.exports = {getBrickMapOffsetSize, ensureFileDoesNotExist};