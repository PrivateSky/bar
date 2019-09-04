const assert = require("double-check").assert;
const path = require("path");
const utils = require("./utils/utils");
const Archive = require("../lib/Archive");

const folderPath = path.resolve("fld");

const folders = ["fld/fld2", "dot"];
const files = [
    "fld/a.txt", "fld/fld2/b.txt"
];

const text = ["asta e un text", "asta e un alt text"];
let savePath = "dot";

const createFolderBrickStorage = require("../lib/FolderBrickStorage").createFolderBrickStorage;
const createFsAdapter = require("../lib/FsAdapter").createFsAdapter;
const ArchiveConfigurator = require("../lib/ArchiveConfigurator");

ArchiveConfigurator.prototype.registerStorageProvider("FolderBrickStorage", createFolderBrickStorage, folderPath);
ArchiveConfigurator.prototype.registerFsAdapter("fsAdapter", createFsAdapter);


const archiveConfigurator = new ArchiveConfigurator();
archiveConfigurator.setStorageProvider("FolderBrickStorage", savePath);
archiveConfigurator.setFsAdapter("fsAdapter");
archiveConfigurator.setBufferSize(2);


const archive = new Archive(archiveConfigurator);

assert.callback("ArchiveFolderTest", (callback) => {
    utils.ensureFilesExist(folders, files, text, (err) => {
        assert.true(err === null || typeof err === "undefined", "Failed to create folder hierarchy.");

        utils.computeFoldersHashes([folderPath], (err, initialHashes) => {
            assert.true(err === null || typeof err === "undefined", "Failed to compute folder hashes.");

            archive.addFolder(folderPath, (err, mapDigest) => {
                assert.true(err === null || typeof err === "undefined", "Failed to add folder.");
                assert.true(mapDigest !== null && typeof mapDigest !== "undefined", "Map digest is null or undefined.");

                utils.deleteFolders([folderPath], (err) => {
                    assert.true(err === null || typeof err === "undefined", "Failed to delete folders.");

                    archive.extractFolder(savePath, (err) => {
                        assert.true(err === null || typeof err === "undefined", "Failed to extract folder.");

                        utils.computeFoldersHashes([folderPath], (err, extractionHashes) => {
                            assert.true(err === null || typeof err === "undefined", "Failed to compute folder hashes.");
                            assert.true(utils.hashArraysAreEqual(initialHashes, extractionHashes), "Folder hashes do not coincide.");

                            utils.deleteFolders([folderPath, savePath], (err) => {
                                assert.true(err === null || typeof err === "undefined", "Failed to delete folders.");
                                callback();
                            });
                        });
                    });
                });
            });
        });
    });
}, 1500);

