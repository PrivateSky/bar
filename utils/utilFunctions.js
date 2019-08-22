const fs = require('fs');

function utilFunctions() {
    this.ensureFileDoesNotExists = function (filePath, callback) {
        fs.access(filePath, (err) => {
            if (!err) {
                fs.unlink(filePath, callback);
            } else {
                return callback();
            }
        });
    }
};
module.exports = utilFunctions;