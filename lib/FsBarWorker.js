const fs = require('fs');
const path = require('path');
const AsyncDisptacher = require("../utils/AsyncDispatcher");

function FsBarWorker(){

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

    this.getFilesAndFolders = function (folderPath, callback) {
        isDir(folderPath, (err, status) => {
            if (err) {
                return callback(err);
            }

            if(status) {
                walkFolder(folderPath, callback);
            }else{
                callback(new Error("The provided path is not a folder"));
            }
        });
    };

    //appendToFile
    this.appendBlockToFile = function (filePath, data, callback) {
        const pth = constructPath(filePath);
        itExists(filePath, (err, status) => {
            if (err) {
                return callback(err);
            }

            if(!status){
                fs.mkdir(pth, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    return __append();
                });
            }

            __append();
        });

        function __append() {
            fs.appendFile(filePath, data, err => {
                callback(err);
            });
        }
    };

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

    function walkFolder(folderPath, callback) {

        fs.readdir(folderPath, (err, files) => {
            if (err) {
                return callback(err);
            }

            let listFiles = [];
            let listFolders = [];
            const asyncDispatcher = new AsyncDisptacher(() => {
                callback(undefined, listFolders, listFiles);
            });

            const splitPath = folderPath.split(path.sep);
            splitPath.pop();
            console.log(splitPath);
            const removablePath = splitPath.join("/");
            console.log("removable path ", removablePath);
            const removablePathLength = removablePath.length;

            asyncDispatcher.dispatchEmpty(files.length);

            files.forEach(file => {
                const filePath = path.join(folderPath, file);
                isDir(filePath, (err, status) => {
                    if (err) {
                        return callback(err);
                    }

                    const shortPath = filePath.substring(removablePathLength + 1);
                    if(status){
                        listFolders.push(shortPath);
                    }else{
                        listFiles.push(shortPath);
                    }

                    asyncDispatcher.markOneAsFinished();
                });
            });

        });
    }

    function constructPath(filePath) {
        let slices = filePath.split(path.sep);
        let pth = '';
        for (let i = 0; i < slices.length - 1; i++) {
            pth += slices[i];
        }
        return pth;
    }

}

module.exports = FsBarWorker;