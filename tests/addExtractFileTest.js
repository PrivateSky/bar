const assert = require("double-check").assert;
const path = require("path");
const utils = require("./utils/utils");
const Archive = require("../lib/Archive");
const fs = require("fs");

const filePath = path.resolve("fld/a.txt");
let savePath = "dot";


const folders = ["fld"];
const files = [
    "fld/a.txt", "fld/b.txt", "fld/c.txt"
];

const text = ["asta e un text", "ana are mere", "hahahaha"];

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

assert.callback("ArchiveFileTest", (callback) => {
    utils.ensureFilesExist(folders, files, text, (err) => {
        assert.true(err === null || typeof err === "undefined", "Failed to create folder hierarchy.");

        utils.computeFileHash(filePath, (err, initialHashes) => {
            assert.true(err === null || typeof err === "undefined", "Received error");

            archive.addFile(filePath, (err) => {
                assert.true(err === null || typeof err === "undefined", "Failed to archive file.");

                fs.unlink(filePath, (err) => {
                    assert.true(err === null || typeof err === "undefined", "Failed to delete file");


                    archive.extractFile(filePath, (err) => {
                     assert.true(err === null || typeof err === "undefined", "Failed to extract file.");

                        utils.computeFileHash(filePath, (err, decompressedHashes) => {
                            assert.true(err === null || typeof err === "undefined", "Failed to compute folders hashes");
                            assert.true(initialHashes === decompressedHashes, "Files are not identical");

                            utils.deleteFolders(folders, (err) => {
                                assert.true(err === null || typeof err === "undefined", "Failed to delete test folders");

                                callback();
                            });
                        });
                    });
                });
            });
        });
    });
}, 1500);

