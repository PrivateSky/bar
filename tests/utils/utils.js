const fs = require("fs");
const path = require("path");
const AsyncDispatcher = require("../../utils/AsyncDispatcher");

function ensureFolderHierarchy(folders, callback){
    const asyncDispatcher = new AsyncDispatcher(() => {
        callback();
    });

    if (folders.length === 0) {
        return callback();
    }

    asyncDispatcher.dispatchEmpty(folders.length);
    folders.forEach(folder => {
        fs.access(folder, (err) => {
            if (err) {
                fs.mkdir(folder, {recursive: true}, (err) => {
                    if (err) {
                        return callback(err);
                    }

                    asyncDispatcher.markOneAsFinished();
                });
            }else{
                asyncDispatcher.markOneAsFinished();
            }
        });
    });

}

function ensureFilesExist(folders, files, text, callback){
    ensureFolderHierarchy(folders, (err) => {
        if (err) {
            return callback(err);
        }

        if (files.length === 0) {
            return callback();
        }

        files.forEach((file, i) => {
            const stream = fs.createWriteStream(file);
            stream.write(text[i]);
            if (i === files.length - 1) {
                return callback();
            }
        });
    });
}

function deleteFolderRecursively(inputPath, callback) {

    fs.stat(inputPath, function (err, stats) {
        if (err) {
            callback(err, stats);
            return;
        }
        if (stats.isFile()) {
            fs.unlink(inputPath, function (err) {
                if (err) {
                    callback(err, null);
                } else {
                    callback(null, true);
                }
            });
        } else if (stats.isDirectory()) {
            fs.readdir(inputPath, function (err, files) {
                if (err) {
                    callback(err, null);
                    return;
                }
                const f_length = files.length;
                let f_delete_index = 0;

                const checkStatus = function () {
                    if (f_length === f_delete_index) {
                        fs.rmdir(inputPath, function (err) {
                            if (err) {
                                callback(err, null);
                            } else {
                                callback(null, true);
                            }
                        });
                        return true;
                    }
                    return false;
                };
                if (!checkStatus()) {
                    files.forEach(function (file) {
                        const tempPath = path.join(inputPath, file);
                        deleteFolderRecursively(tempPath, function removeRecursiveCB(err, status) {
                            if (!err) {
                                f_delete_index++;
                                checkStatus();
                            } else {
                                callback(err, null);
                            }
                        });
                    });
                }
            });
        }
    });
}

function deleteFiles(listFiles, index, callback) {
    if (index === listFiles.length) {
        return callback();
    }

    fs.unlink(listFiles[index], (err) => {
        if (err) {
            return callback(err);
        }

        deleteFiles(listFiles, index + 1, callback);
    });
}

function collectFilesAndFolders(folderList = [], fileList = [], folderIndex, callback) {
    if (folderIndex === folderList.length) {
        return callback(undefined, folderList, fileList);
    }

    const folderPath = folderList[folderIndex];
    fs.readdir(folderPath, (err, files) => {
        if (err) {
            return callback(err);
        }

        files = files.map(file => path.join(folderPath, file));
        files.forEach((file, i) => {
            fs.stat(file, (err, stats) => {
                if (err) {
                    return callback(err);
                }

                if (stats.isFile()) {
                    fileList.push(file);
                }else{
                    folderList.push(file);
                }
                if (i === files.length - 1) {
                    collectFilesAndFolders(folderList, fileList, folderIndex + 1, callback);
                }
            });
        });

    });
}

function __removeFolders(listFolders, index, callback) {
    if (index === listFolders.length) {
        return callback();
    }

    fs.rmdir(listFolders[index], (err) => {
        if (err) {
            return callback(err);
        }

        __removeFolders(listFolders, index + 1, callback);
    });
}



function deleteFolder(folderPath, callback) {
    collectFilesAndFolders([folderPath], [], 0, (err, listFolders, listFiles) => {
        if (err) {
            return callback(err);
        }

        deleteFiles(listFiles, 0, (err) => {
            if (err) {
                return callback(err);
            }
            listFolders.sort((a, b) => {
                const splitA = a.split(path.sep);
                const splitB = b.split(path.sep);
                return splitB.length - splitA.length;
            });

            __removeFolders(listFolders, 0, callback);
        });
    });
}

function deleteFolders(folders, callback){
    const asyncDispatcher = new AsyncDispatcher((errors, results) => {
        callback();
    });

    if (folders.length === 0) {
        return callback();
    }
    asyncDispatcher.dispatchEmpty(folders.length);
    folders.forEach(folder => {
        deleteFolder(folder, (err) => {
            if (err) {
                return callback(err);
            }
            asyncDispatcher.markOneAsFinished();
        });
    });
}

module.exports = {
    ensureFilesExist,
    deleteFolders
};