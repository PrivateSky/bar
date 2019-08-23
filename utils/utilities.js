const fs = require('fs');
const SALT_SIZE = 8;

function getSaltSize() {
    return SALT_SIZE;
}

function ensureFileDoesNotExists(filePath, callback) {
    fs.access(filePath, (err) => {
        if (!err) {
            fs.unlink(filePath, callback);
        } else {
            return callback();
        }
    });
}

module.exports = {getSaltSize, ensureFileDoesNotExists};