const assert = require("double-check").assert;
const pathModule = "path";
const path = require(pathModule);

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

const data = "Who do you think you are?";
const archive = new Archive(archiveConfigurator);
assert.callback("ArchiveFileTest", (callback) => {
    utils.ensureFilesExist(folders, files, text, (err) => {
        assert.true(err === null || typeof err === "undefined");

        archive.appendToFile(files[0], Buffer.from(data), (err, firstDigest) => {
            assert.true(err === null || typeof err === "undefined", "Failed to append to file");

            archive.appendToFile(files[0], Buffer.from("Hello hello"), (err, mapDigest) => {
                assert.true(err === null || typeof err === "undefined", "Failed to append to file");

                archive.getFile(savePath, (err) => {
                    assert.true(err === null || typeof err === "undefined", "Failed to get file");

                    utils.deleteFolders(folders, (err) => {
                        assert.true(err === null || typeof err === "undefined", "Failed to delete folders");

                        callback();
                    });
                });
            });
        });
    });
}, 1500);