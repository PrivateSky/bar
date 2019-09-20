const assert = require("double-check").assert;
const utils = require("./utils/utils");
const Archive = require("../lib/Archive");
const fs = require("fs");

const filePath = "fld/a.txt";
let savePath = "dot";


const folders = ["fld"];
const files = [
    "fld/a.txt", "fld/b.txt", "fld/c.txt"
];

const text = ["asta e un text", "ana are mere", "hahahaha"];
const encryptionKey = require("crypto").randomBytes(32);

const createFileBrickStorage = require("../lib/FileBrickStorage").createFileBrickStorage;
const createFsAdapter = require("../lib/FsAdapter").createFsAdapter;
const ArchiveConfigurator = require("../lib/ArchiveConfigurator");

ArchiveConfigurator.prototype.registerStorageProvider("FileBrickStorage", createFileBrickStorage);
ArchiveConfigurator.prototype.registerFsAdapter("fsAdapter", createFsAdapter);


const archiveConfigurator = new ArchiveConfigurator();
archiveConfigurator.setStorageProvider("FileBrickStorage", savePath);
archiveConfigurator.setFsAdapter("fsAdapter");
archiveConfigurator.setBufferSize(2);
archiveConfigurator.setEncryptionAlgorithm("aes-256-gcm");
archiveConfigurator.setCompressionAlgorithm("gzip");

const archive = new Archive(archiveConfigurator, encryptionKey);

assert.callback("AddExtractFileTest", (callback) => {
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

                                fs.unlink(savePath, (err) => {
                                    assert.true(err === null || typeof err === "undefined", "Failed to delete file " + savePath);

                                    callback();
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}, 2000);

