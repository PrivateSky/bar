const double_check = require("../../double-check");
const assert = double_check.assert;
const Archive = require("../lib/Archive");
const pathModule = "path";
const path = require(pathModule);
const crypto = require("crypto");

const createFileBrickStorage = require("../lib/FileBrickStorage").createFileBrickStorage;
const createInMemoryFsAdapter = require("../lib/InMemoryFsAdapter").createInMemoryFsAdapter;
const ArchiveConfigurator = require("../lib/ArchiveConfigurator");

ArchiveConfigurator.prototype.registerStorageProvider("FileBrickStorage", createFileBrickStorage);
ArchiveConfigurator.prototype.registerFsAdapter("InMemoryFsAdapter", createInMemoryFsAdapter);


double_check.createTestFolder("bar_test_folder", (err, testFolder) => {
    const text = Buffer.from("asta e un text");
    let savePath = path.join(testFolder, "dot");

    const archiveConfigurator = new ArchiveConfigurator();
    archiveConfigurator.setStorageProvider("FileBrickStorage", savePath);
    archiveConfigurator.setFsAdapter("InMemoryFsAdapter");
    archiveConfigurator.setBufferSize(2);
    archiveConfigurator.setMapEncryptionKey(crypto.randomBytes(32));

    const archive = new Archive(archiveConfigurator);

    const destPath = path.join(testFolder, "text");


    assert.callback("AddExtractDataTest", (callback) => {
        archive.writeFile(destPath, text, (err) => {
            assert.true(err === null || typeof err === "undefined", "Failed to add data to archive.");

            archive.readFile(destPath, (err, extractedData) => {
                assert.true(err === null || typeof err === "undefined", "Failed to add data to archive.");
                assert.true(text.compare(extractedData) === 0, "Extracted data is not the same as initial data");

                callback();
            });
        });
    });
});
