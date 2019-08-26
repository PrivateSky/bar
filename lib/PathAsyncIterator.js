const fs = require('fs');
const path = require('path');
const AsyncDisptacher = require("../utils/AsyncDispatcher");


function PathAsyncIterator(inputPath) {
    let removablePathLen;
    const fileList = [];
    const folderList = [];
    let isFirstCall = true;
    let pathIsFolder;

    this.next = function (callback) {
        if (isFirstCall === true) {
            isDir(inputPath, (err, status) => {
                if (err) {
                    return callback(err);
                }

                isFirstCall = false;
                pathIsFolder = status;
                if (status === true) {
                    const splitInputPath = inputPath.split(path.sep);
                    splitInputPath.pop();
                    removablePathLen = splitInputPath.join(path.sep).length;
                    folderList.push(inputPath);
                    getNextFileFromFolder(callback);
                } else {
                    callback(undefined, inputPath);
                }
            });
        } else if (pathIsFolder) {
            getNextFileFromFolder(callback);
        } else {
            callback();
        }
    };

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

                    if (status) {
                        folderList.push(filePath);
                    } else {
                        fileList.push(filePath.substring(removablePathLen));
                    }

                    asyncDispatcher.markOneAsFinished();
                });
            });
        });
    }

    function isDir(filePath, callback) {
        fs.stat(filePath, (err, stats) => {
            if (err) {
                return callback(err);
            }

            return callback(undefined, stats.isDirectory());
        });
    }

    function getNextFileFromFolder(callback) {
        if (fileList.length === 0 && folderList.length === 0) {
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
    }
}

module.exports = PathAsyncIterator;