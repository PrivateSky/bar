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

function deleteFolders(folders, callback){
    const asyncDispatcher = new AsyncDispatcher((errors, results) => {
        callback();
    });

    asyncDispatcher.dispatchEmpty(folders.length);
    folders.forEach(folder => {
        deleteFolderRecursively(folder, (err) => {
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