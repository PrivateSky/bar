const assert = require("double-check").assert;
const path = require("path");
const utils = require("./utils/utils");
const Archive = require("../lib/Archive");
const fs = require("fs");

const folderPath = path.resolve("fld");
const filePath = path.resolve("fld/a.txt");
let savePath = "dot";


const folders = ["fld"];
const files = [
    "fld/a.txt", "fld/b.txt", "fld/c.txt"
];

const text = ["asta e un text?", "ana are mere", "hahahaha"];

const createFileBrickStorage = require("../lib/FileBrickStorage").createFileBrickStorage;
const createFsAdapter = require("../lib/FsAdapter").createFsAdapter;
const ArchiveConfigurator = require("../lib/ArchiveConfigurator");

ArchiveConfigurator.prototype.registerStorageProvider("FileBrickStorage", createFileBrickStorage);
ArchiveConfigurator.prototype.registerFsAdapter("fsAdapter", createFsAdapter);


const archiveConfigurator = new ArchiveConfigurator();
archiveConfigurator.setStorageProvider("FileBrickStorage", savePath);
archiveConfigurator.setFsAdapter("fsAdapter");
archiveConfigurator.setBufferSize(2);

const archive = new Archive(archiveConfigurator);

assert.callback("AddFolderExtractFile", (callback) => {
    utils.ensureFilesExist(folders, files, text, (err) => {
        assert.true(err === null || typeof err === "undefined", "Failed to create folder hierarchy.");

        archive.addFolder(folderPath, (err) => {
            assert.true(err === null || typeof err === "undefined", "Failed to archive file.");

            utils.deleteFolders(folders, (err) => {
                assert.true(err === null || typeof err === "undefined", "Failed to delete file");

                archive.extractFile(filePath, (err) => {
                    if (err) {
                        throw err;
                    }
                    assert.true(err === null || typeof err === "undefined", "Failed to extract file.");
                    utils.deleteFolders(folders, (err) => {
                        assert.true(err === null || typeof err === "undefined", "Failed to delete test folders");

                        fs.unlink(savePath, (err) => {
                            assert.true(err === null || typeof err === "undefined", "Failed to delete file " + savePath);

                            callback();
                        });
                    });
                });
            });
        });
    });
}, 1500);

