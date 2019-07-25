const assert = require("double-check").assert;
const path = require("path");
const utils = require("./utils/utils");
const Archive = require("../lib/Archive");

const folderPath = path.resolve("fld");

const folders = ["fld/fld2", "dot"];
const files = [
    "fld/a.txt", "fld/fld2/b.txt"
];

const text = ["asta e un text", "asta e un alt text"];
let savePath = "dot";

const createFolderBrickStorage = require("../lib/FolderBrickStorage").createFolderBrickStorage;
const createFsAdapter = require("../lib/FsBarWorker").createFsBarWorker;
const ArchiveConfigurator = require("../lib/ArchiveConfigurator");

ArchiveConfigurator.prototype.registerStorageProvider("FolderBrickStorage", createFolderBrickStorage, folderPath);
ArchiveConfigurator.prototype.registerDiskAdapter("fsAdapter", createFsAdapter);


const archiveConfigurator = new ArchiveConfigurator();
archiveConfigurator.setStorageProvider("FolderBrickStorage", savePath);
archiveConfigurator.setDiskAdapter("fsAdapter");
archiveConfigurator.setBufferSize(256);



const archive = new Archive(archiveConfigurator);

assert.callback("ArchiveFolderTest", (callback) => {
    utils.ensureFilesExist(folders, files, text,(err)=>{
        assert.true(err === null || typeof err === "undefined");
        archive.addFolder(folderPath, (err, mapDigest) => {
            assert.true(err === null || typeof err === "undefined");
            assert.true(mapDigest !== null && typeof mapDigest !== "undefined");
            archive.extractFolder(savePath, (err) => {
                assert.true(err === null || typeof err === "undefined");
                utils.deleteFolders([folderPath, savePath], (err) => {
                    assert.true(err === null || typeof err === "undefined");
                    callback();
                });
            });
        });
    });
}, 1500);

