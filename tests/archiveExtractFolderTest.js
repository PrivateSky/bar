const double_check = require("../../../modules/double-check");
const assert = double_check.assert;
const Archive = require("../lib/Archive");
const ArchiveConfigurator = require("../lib/ArchiveConfigurator");
const createFolderBrickStorage = require("../lib/FolderBrickStorage").createFolderBrickStorage;
const createFsAdapter = require("../lib/FsAdapter").createFsAdapter;
ArchiveConfigurator.prototype.registerStorageProvider("FolderBrickStorage", createFolderBrickStorage);
ArchiveConfigurator.prototype.registerFsAdapter("FsAdapter", createFsAdapter);

const crypto = require("crypto");
const pathModule = "path";
const path = require(pathModule);
const testFolder = "./";
double_check.createTestFolder("bar_test_folder", (err, testFolder) => {

    const folderPath = path.join(testFolder, "fld");
    let savePath = path.join(testFolder, "dot");


    const folders = ["fld/fld2", "dot"].map(folder => path.join(testFolder, folder));
    const files = ["fld/a.txt", "fld/fld2/b.txt"].map(file => path.join(testFolder, file));

    const text = ["asta e un text", "asta e un alt text"];

    const archiveConfigurator = new ArchiveConfigurator();
    archiveConfigurator.setStorageProvider("FolderBrickStorage", savePath);
    archiveConfigurator.setFsAdapter("FsAdapter");
    archiveConfigurator.setBufferSize(256);
    // archiveConfigurator.setEncryptionAlgorithm("aes-256-gcm");

    const archive = new Archive(archiveConfigurator);

    assert.callback("ArchiveFolderTest", (callback) => {
        double_check.ensureFilesExist(folders, files, text, (err) => {
            assert.true(err === null || typeof err === "undefined", "Failed to create folder hierarchy.");

            double_check.computeFoldersHashes([folderPath], (err, initialHashes) => {
                assert.true(err === null || typeof err === "undefined", "Failed to compute folder hashes.");

                archive.addFolder(folderPath, (err, seed) => {
                    assert.true(err === null || typeof err === "undefined", "Failed to add folder.");
                    // assert.true(mapDigest !== null && typeof mapDigest !== "undefined", "Map digest is null or undefined.");
                    console.log("seed", seed.toString());
                    double_check.deleteFoldersSync(folderPath);
                    assert.true(err === null || typeof err === "undefined", "Failed to delete folders.");

                    archive.extractFolder((err) => {
                        assert.true(err === null || typeof err === "undefined", "Failed to extract folder.");

                        double_check.computeFoldersHashes(folderPath, (err, extractionHashes) => {
                            assert.true(err === null || typeof err === "undefined", "Failed to compute folder hashes.");
                            assert.true(assert.hashesAreEqual(initialHashes, extractionHashes), "Folder hashes do not coincide.");

                            // double_check.deleteFoldersSync([folderPath, savePath]);
                            // assert.true(err === null || typeof err === "undefined", "Failed to delete folders.");
                            callback();
                        });
                    });
                });
            });
        });
    }, 2000);
});

