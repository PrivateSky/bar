const fs = require('fs');
const path = require('path');
const AsyncDisptacher = require("../utils/AsyncDispatcher");

function PathAsyncIterator(folderPath) {
    const splitFolderPath = folderPath.split(path.sep);
    const removablePathLen = splitFolderPath.join(path.sep).length;
    const fileList = [];
    const folderList = [folderPath];
    this.next = function (callback) {
        if(fileList.length === 0 && folderList.length === 0){
            return callback();
        }

        if (fileList.length > 0) {
            const fileName = fileList.shift();
            return callback(undefined, fileName);
        }


        walkFolder(folderList.shift(), (err, file) => {
            if (err) {
                return callback(err);
            }

            callback(undefined, file);
        });
    };
    //-----------------------------------------Internal methods-------------------------------------------------------
    function walkFolder(folderPath, callback) {
        const asyncDispatcher = new AsyncDisptacher((errors, results) => {
            if (fileList.length > 0) {
                const fileName = fileList.shift();
                return callback(undefined, fileName);
            }

            if (folderList.length > 0) {
                const folderName = folderList.shift();
                return walkFolder(folderName, callback);
            }

            return callback();
        });

        fs.readdir(folderPath, (err, files) => {
            if (err) {
                return callback(err);
            }

            if (files.length === 0 && folderList.length === 0) {
                return callback();
            }

            if (files.length === 0) {
                walkFolder(folderList.shift(), callback);
            }
            asyncDispatcher.dispatchEmpty(files.length);

            files.forEach(file => {
                let filePath = path.join(folderPath, file);
                isDir(filePath, (err, status) => {
                    if (err) {
                        return callback(err);
                    }

                    if(status){
                        folderList.push(filePath);
                    }else{
                        fileList.push(filePath.substring(removablePathLen));
                    }

                    asyncDispatcher.markOneAsFinished();
                });
            });
        });
    }

    function isDir(filePath, callback){
        fs.stat(filePath, (err, stats) => {
            if (err) {
                return callback(err);
            }

            return callback(undefined, stats.isDirectory());
        });
    }

}

function FsBarWorker(){

    let pathAsyncIterator;

    this.getFileSize = function (filePath, callback) {
        fs.stat(filePath, (err, stats) => {
            if (err) {
                return callback(err);
            }

            callback(undefined, stats.size);
        });
    };

    //readBlockFromFile
    this.readBlockFromFile = function (filePath, blockIndex, bufferSize, callback) {
        fs.open(filePath, 'r+', function (err, fd) {
            if (err) {
                return callback(err);
            }

            let buffer = Buffer.alloc(bufferSize);
            fs.read(fd, buffer, 0, bufferSize, bufferSize * blockIndex, (err, bytesRead, buffer) => {
                callback(err, buffer.slice(0, bytesRead));
            });
        });
    };

    this.getNextFile = function (folderPath, callback) {
        pathAsyncIterator = pathAsyncIterator || new PathAsyncIterator(folderPath);
        pathAsyncIterator.next(callback);
    };

    //appendToFile
    this.appendBlockToFile = function (filePath, data, callback) {
        const pth = constructPath(filePath);
        itExists(pth, (err, status) => {
            if (err) {
                return callback(err);
            }
            if(!status){
                fs.mkdir(pth, {recursive: true}, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    return __append();
                });
            }else{
                __append();
            }
        });

        function __append() {
            fs.appendFile(filePath, data, (err) => {
                callback(err);
            });
        }
    };

    // this.getReadStream = function(filePath,bufferSize){
    //     return fs.createReadStream(filePath,{highWaterMark:bufferSize});
    // }

    // this.getWriteStream = function(filePath){
    //     return fs.createWriteStream(filePath);
    // }
    //-------------------------------------------- Internal methods ----------------------------------------------------
    function isDir(filePath, callback){
        fs.stat(filePath, (err, stats) => {
            if (err) {
                return callback(err);
            }

            return callback(undefined, stats.isDirectory());
        });
    }

    function itExists(filePath, callback){
        fs.access(filePath, (err) => {
            if (err) {
                return callback(undefined, false);
            }

            callback(undefined, true);
        });
    }

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