const assert = require("double-check").assert;
const path = require("path");
const BarWorker = require("../lib/BarWorker");
const barWorker = new BarWorker();


const Archive = require("../lib/Archive");
const FolderBrickStorage = require("../lib/FolderBrickStorage");

const folderPath = path.resolve("../lib/fld");
let savePath = "./";

const archive = new Archive("testArchive", new FolderBrickStorage(savePath), barWorker);

assert.callback("archiveFolderTest", (callback) => {
    archive.addFolder(folderPath, (err) => {
        if (err) {
            throw err;
        }

        archive.store((err, mapDigest) => {
            if (err) {
                throw err;
            }

            assert.true(typeof mapDigest !== "undefined" && mapDigest !== null, "mapDigest is null or undefined");

            archive.getFolder(savePath, mapDigest, (err) => {
                if (err) {
                    throw err;
                }

                callback();
            });
        });


    });
}, 1500);

