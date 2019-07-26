const assert = require("double-check").assert;
const path = require("path");

const utils = require("./utils/utils");
const Archive = require("../lib/Archive");

const filePath = path.resolve("./res/myFile");

const folders = ["res", "dot"];
const files = ["res/myFile"];

const text = ["Ana are mere."];
let savePath = "dot";

const createFolderBrickStorage = require("../lib/FolderBrickStorage").createFolderBrickStorage;
const createFsAdapter = require("../lib/FsBarWorker").createFsBarWorker;
const ArchiveConfigurator = require("../lib/ArchiveConfigurator");

ArchiveConfigurator.prototype.registerStorageProvider("FolderBrickStorage", createFolderBrickStorage, filePath);
ArchiveConfigurator.prototype.registerDiskAdapter("fsAdapter", createFsAdapter);


const archiveConfigurator = new ArchiveConfigurator();
archiveConfigurator.setStorageProvider("FolderBrickStorage", savePath);
archiveConfigurator.setDiskAdapter("fsAdapter");
archiveConfigurator.setBufferSize(256);


const archive = new Archive(archiveConfigurator);
assert.callback("ArchiveFileTest", (callback) => {
    utils.ensureFilesExist(folders, files, text, (err) => {
        assert.true(err === null || typeof err === "undefined");

        archive.addFile(filePath, (err, mapDigest) => {
            assert.true(err === null || typeof err === "undefined");
            assert.true(mapDigest !== null && typeof mapDigest !== "undefined");

            archive.getFile(savePath, (err) => {
                assert.true(err === null || typeof err === "undefined");

                utils.deleteFolders(folders, (err) => {
                    assert.true(err === null || typeof err === "undefined");
                    callback();
                });
            });
        });
    });
}, 1500);