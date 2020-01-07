require("../../../psknode/bundles/pskruntime");
require("../../../psknode/bundles/psknode");
require("../../../psknode/bundles/consoleTools");
require("../../../psknode/bundles/edfsBar");

const double_check = require("../../../modules/double-check");
const assert = double_check.assert;
const Archive = require("../lib/Archive");
const ArchiveConfigurator = require("../lib/ArchiveConfigurator");
const createFileBrickStorage = require("../lib/FileBrickStorage").createFileBrickStorage;
const createFsAdapter = require("bar-fs-adapter").createFsAdapter;
ArchiveConfigurator.prototype.registerStorageProvider("FileBrickStorage", createFileBrickStorage);
ArchiveConfigurator.prototype.registerFsAdapter("FsAdapter", createFsAdapter);



const archiveConfigurator = new ArchiveConfigurator();
archiveConfigurator.setStorageProvider("FolderBrickStorage", savePath);
archiveConfigurator.setFsAdapter("fsAdapter");
archiveConfigurator.setEncryptionAlgorithm("aes-256-gcm");
archiveConfigurator.setBufferSize(256);


const archive = new Archive(archiveConfigurator);
assert.callback("ArchiveFileTest", (callback) => {
    double_check.ensureFilesExist(folders, files, text, (err) => {
        assert.true(err === null || typeof err === "undefined");

        archive.addFile(filePath, (err, mapDigest) => {
            assert.true(err === null || typeof err === "undefined");
            assert.true(mapDigest !== null && typeof mapDigest !== "undefined");
            assert.true(archive.getSeed() !== null && typeof archive.getSeed() !== "undefined");
            callback();
        });
    });
}, 1500);