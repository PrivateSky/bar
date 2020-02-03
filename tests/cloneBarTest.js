require("../../../psknode/bundles/pskruntime");
require("callflow");
const double_check = require("../../../modules/double-check");
const assert = double_check.assert;

const Archive = require("../lib/Archive");
const ArchiveConfigurator = require("../lib/ArchiveConfigurator");
const createFileBrickStorage = require("../lib/FileBrickStorage").createFileBrickStorage;
const createFolderBrickStorage = require("../lib/FolderBrickStorage").createFolderBrickStorage;
const createFsAdapter = require("../lib/FsAdapter").createFsAdapter;
ArchiveConfigurator.prototype.registerStorageProvider("FileBrickStorage", createFileBrickStorage);
ArchiveConfigurator.prototype.registerFsAdapter("FsAdapter", createFsAdapter);

const fsModule = "fs";
const fs = require(fsModule);
const crypto = require("crypto");
const pathModule = "path";
const path = require(pathModule);

let folderPath;
let filePath;
let savePath;
let cloneStoragePath;


let folders;
let files;
const text = ["asta e un text", "asta e un alt text", "ana are mere"];

$$.flows.describe("BarClone", {
    start: function (callback) {
        this.callback = callback;

        double_check.ensureFilesExist(folders, files, text, (err) => {
            assert.true(err === null || typeof err === "undefined", "Failed to create folder hierarchy.");

            double_check.computeFoldersHashes(folderPath, (err, initialHashes) => {
                assert.true(err === null || typeof err === "undefined", "Failed to compute folder hashes.");

                this.initialHashes = initialHashes;
                this.createArchive();
            });
        });

    },

    createArchive: function () {
        this.archiveConfigurator = new ArchiveConfigurator();
        this.archiveConfigurator.setStorageProvider("FileBrickStorage", savePath);
        this.archiveConfigurator.setFsAdapter("FsAdapter");
        this.archiveConfigurator.setBufferSize(2);
        this.archiveConfigurator.setMapEncryptionKey(crypto.randomBytes(32));
        this.archive = new Archive(this.archiveConfigurator);

        this.folderBrickStorage = createFolderBrickStorage(cloneStoragePath);
        this.addFolder();
    },

    addFolder: function () {
        this.archive.addFolder(folderPath, (err, mapDigest) => {
            assert.true(err === null || typeof err === "undefined", "Failed to add folder.");

            double_check.deleteFoldersSync(folderPath);
            this.cloneBar();
        });
    },

    cloneBar: function () {
        this.archive.clone(this.folderBrickStorage, true, (err, mapDigest) => {
            assert.true(err === null || typeof err === "undefined", `Failed to delete file ${filePath}`);
            assert.true(mapDigest !== null && typeof mapDigest !== "undefined", "Map digest is null or undefined");

            this.extractFolder();
        });
    },

    extractFolder: function () {
        this.archive.extractFolder((err) => {
            assert.true(err === null || typeof err === "undefined", `Failed to extract folder from file ${savePath}`);

            double_check.computeFoldersHashes(folderPath, (err, newHashes) => {
                assert.true(err === null || typeof err === "undefined", "Failed to compute folder hashes.");
                assert.hashesAreEqual(this.initialHashes, newHashes, "The extracted files are not te same as the initial ones");

                double_check.deleteFoldersSync([folderPath, cloneStoragePath]);
                fs.unlinkSync(savePath);
                this.callback();
            });
        });
    }
});

double_check.createTestFolder("bar_test_folder", (err, testFolder) => {

    folderPath = path.join(testFolder, "fld");
    savePath = path.join(testFolder, "dot");
    cloneStoragePath = path.join(testFolder, "aux");

    folders = [folderPath, cloneStoragePath];
    files = ["fld/a.txt", "fld/b.txt", "fld/c.txt"].map(file => path.join(testFolder, file));

    assert.callback("Bar clone test", (callback) => {
        $$.flows.start("BarClone", "start", callback);
    }, 3000);
});