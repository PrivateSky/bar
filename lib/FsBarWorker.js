const fs = require('fs');
const path = require('path');
const PathAsyncIterator = require('./PathAsyncIterator');

function FsBarWorker() {

    let pathAsyncIterator;

    this.getFileSize = function (filePath, callback) {
        fs.stat(filePath, (err, stats) => {
            if (err) {
                return callback(err);
            }

            callback(undefined, stats.size);
        });
    };

    this.readBlockFromFile = function (filePath, blockIndex, bufferSize, callback) {
        fs.open(filePath, 'r+', function (err, fd) {
            if (err) {
                return callback(err);
            }

            let buffer = Buffer.alloc(bufferSize);
            fs.read(fd, buffer, 0, bufferSize, bufferSize * blockIndex, (err, bytesRead, buffer) => {
                if (err) {
                    return callback(err);
                }

                fs.close(fd, (err) => {
                    callback(err, buffer.slice(0, bytesRead));
                });
            });
        });
    };

    this.getNextFile = function (inputPath, callback) {
        pathAsyncIterator = pathAsyncIterator || new PathAsyncIterator(inputPath);
        pathAsyncIterator.next(callback);
    };

    this.appendBlockToFile = function (filePath, data, callback) {
        const pth = constructPath(filePath);
        if(pth !== '') {
            fs.mkdir(pth, {recursive: true}, (err) => {
                if (err && err.code !== "EEXIST") {
                    return callback(err);
                }

                fs.appendFile(filePath, data, callback);
            });
        }else{
            fs.appendFile(filePath,data,callback);
        }
    };

    function constructPath(filePath) {
        let slices = filePath.split(path.sep);
        slices.pop();
        return slices.join(path.sep);
    }

}

module.exports = {
    createFsBarWorker: function () {
        return new FsBarWorker();
    }
};
