const fs = require('fs');
const path = require('path');
const PathAsyncIterator = require('./PathAsyncIterator');

function FsAdapter() {

    let pathAsyncIterator;

    this.getFileSize = function (filePath, callback) {
        fs.stat(filePath, (err, stats) => {
            if (err) {
                return callback(err);
            }

            callback(undefined, stats.size);
        });
    };

    this.readBlockFromFile = function (filePath, blockIndex, blockSize, callback) {
        const readStream = fs.createReadStream(filePath, {
            start: blockIndex * blockSize,
            end: (blockIndex + 1) * blockSize - 1
        });
        let data = '';
        readStream.on("data", (chunk) => {
            data += chunk.toString();
        });

        readStream.on("error", (err) => {
            callback(err);
        });

        readStream.on("end", () => {
            callback(undefined, Buffer.from(data));
        });
    };

    this.getNextFile = function (inputPath, callback) {
        pathAsyncIterator = pathAsyncIterator || new PathAsyncIterator(inputPath);
        pathAsyncIterator.next(callback);
    };

    this.appendBlockToFile = function (filePath, data, callback) {
        const pth = constructPath(filePath);
        if (pth !== '') {
            fs.mkdir(pth, {recursive: true}, (err) => {
                if (err && err.code !== "EEXIST") {
                    return callback(err);
                }

                fs.appendFile(filePath, data, callback);
            });
        } else {
            fs.appendFile(filePath, data, callback);
        }
    };

    this.writeBlockToFile = function (filePath, data, position, length, callback) {
        const folderPath = path.dirname(filePath);
        fs.access(folderPath, (err) => {
            if (err) {
                fs.mkdir(folderPath, {recursive: true}, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    __writeBlock();
                });
            } else {
                __writeBlock();
            }
        });

        function __writeBlock() {
            const writeStream = fs.createWriteStream(filePath, {flags: "a+", start: position});

            writeStream.on("error", (err) => {
                return callback(err);
            });

            writeStream.write(data, callback);
        }
    };

    function constructPath(filePath) {
        let slices = filePath.split(path.sep);
        slices.pop();
        return slices.join(path.sep);
    }

}

module.exports = {
    createFsAdapter: function () {
        return new FsAdapter();
    }
};
