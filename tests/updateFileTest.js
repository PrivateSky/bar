const pathModule = "path";
const path = require(pathModule);

const double_check = require("../../../modules/double-check");
const assert = double_check.assert;
const Archive = require("../lib/Archive");
const ArchiveConfigurator = require("../lib/ArchiveConfigurator");
const createFolderBrickStorage = require("../lib/FolderBrickStorage").createFolderBrickStorage;
const createFsAdapter = require("../lib/FsAdapter").createFsAdapter;
ArchiveConfigurator.prototype.registerStorageProvider("FolderBrickStorage", createFolderBrickStorage);
ArchiveConfigurator.prototype.registerFsAdapter("FsAdapter", createFsAdapter);

const fsModule = "fs";
const fs = require(fsModule);
double_check.createTestFolder("bar_test_folder", (err, testFolder) => {

    let savePath = path.join(testFolder, "dot");


    const folders = ["fld", "dot"].map(folder => path.join(testFolder, folder));
    const files = ["a.txt", "b.txt", "c.txt"].map(file => path.join(testFolder, 'fld', file));

    const text = ["asta e un text?", "ana are mere", "hahahaha"];

    const archiveConfigurator = new ArchiveConfigurator();
    archiveConfigurator.setStorageProvider("FolderBrickStorage", savePath);
    archiveConfigurator.setFsAdapter("FsAdapter");
    archiveConfigurator.setBufferSize(2);

    const archive = new Archive(archiveConfigurator);


    assert.callback("updateFileTest", (callback) => {
        double_check.ensureFilesExist(folders, files, text, (err) => {
            assert.true(err === null || typeof err === "undefined", "Failed to create folder hierarchy.");

            archive.addFolder(folders[0], (err) => {
                assert.true(err === null || typeof err === "undefined", "Failed to archive file.");


                fs.writeFileSync(path.join(testFolder, 'fld','d.txt'), 'Acesta este un test de UPDATE!');

                archive.update(folders[0], (err, digest) => {
                    assert.true(err === null || typeof err === "undefined", "Failed to update archive");

                    double_check.computeFoldersHashes(folders[0], (err, initialHashes) => {
                        assert.true(err === null || typeof err === "undefined", "Received error");

                        double_check.deleteFoldersSync(folders[0]);

                        archive.extractFolder((err) => {
                            if (err) {
                                throw err;
                            }
                            assert.true(err === null || typeof err === "undefined", "Failed to extract file.");

                            double_check.computeFoldersHashes(folders[0], (err, decompressedHashes) => {
                                assert.true(err === null || typeof err === "undefined", "Failed to compute folders hashes");
                                assert.hashesAreEqual(initialHashes, decompressedHashes, "Folders are not identical");

                                double_check.deleteFoldersSync(folders);

                                callback();
                            });
                        });
                    });
                });
            });
        });
    }, 2000);
});



