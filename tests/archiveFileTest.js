const assert = require("double-check").assert;
const path = require("path");
const BarWorker = require("../lib/BarWorker");
const barWorker = new BarWorker();


const Archive = require("../lib/Archive");
const FolderBrickStorage = require("../lib/FolderBrickStorage");

const folderPath = path.resolve("any.txt");
let savePath = "dot";

const archive = new Archive("testArchive", new FolderBrickStorage(savePath), barWorker);

assert.callback("archiveFileTest", (callback) => {
    archive.addFolder(folderPath, (err) => {
        assert.true(err === null || typeof err === "undefined");

        archive.store((err, mapDigest) => {
            assert.true(err === null || typeof err === "undefined");
            assert.true(mapDigest !== null && typeof mapDigest !== "undefined");
            archive.getFolder(savePath, mapDigest, (err) => {
                assert.true(err === null || typeof err === "undefined");
                callback();
            });
        });
    });
}, 1500);
