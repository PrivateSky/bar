const FsBarWorker = require('./FsBarWorker');
const fs = new FsBarWorker();

function BarWorker() {
    this.getFilesAndFolders = function (filePath, callback) {
        fs.getFilesAndFolders(filePath, callback);
    };

    this.readBlockFromFile = function (filePath, blockIndex, bufferSize, callback) {
        fs.readBlockFromFile(filePath, blockIndex, bufferSize, callback);
    };

    this.appendBlockToFile = function (filePath, data, callback) {
        fs.appendBlockToFile(filePath, data, callback);
    };

    this.getFileSize = function (filePath, callback) {
        fs.getFileSize(filePath, callback);
    }
}

module.exports = BarWorker;