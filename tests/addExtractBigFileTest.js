const assert = require("double-check").assert;
const utils = require("./utils/utils");
const Archive = require("../lib/Archive");
const fs = require("fs");

const filePath = "big.file";
let savePath = "dot";

if (!fs.existsSync(filePath)) {
    const file = fs.createWriteStream(filePath);
    for (let i = 0; i <= 1e6; i++) {
        file.write('Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.\n');
    }

    file.end();
}


const createFileBrickStorage = require("../lib/FileBrickStorage").createFileBrickStorage;
const createFsAdapter = require("../lib/FsAdapter").createFsAdapter;
const ArchiveConfigurator = require("../lib/ArchiveConfigurator");

ArchiveConfigurator.prototype.registerStorageProvider("FileBrickStorage", createFileBrickStorage);
ArchiveConfigurator.prototype.registerFsAdapter("fsAdapter", createFsAdapter);


const archiveConfigurator = new ArchiveConfigurator();
archiveConfigurator.setStorageProvider("FileBrickStorage", savePath);
archiveConfigurator.setFsAdapter("fsAdapter");
archiveConfigurator.setBufferSize(1000000);
archiveConfigurator.setEncryptionAlgorithm("aes-256-gcm");
archiveConfigurator.setCompressionAlgorithm("gzip");

const archive = new Archive(archiveConfigurator);

assert.callback("AddExtractFileTest", (callback) => {
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
                        fs.unlink(savePath, (err) => {
                            assert.true(err === null || typeof err === "undefined", "Failed to delete file " + savePath);
                            fs.unlink(filePath, (err) => {
                                assert.true(err === null || typeof err === "undefined", "Failed to delete file");
                                callback();
                            });
                        });
                    });
                });
            });
        });
    });
}, 2000);

