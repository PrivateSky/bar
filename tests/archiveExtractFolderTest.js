const assert = require("double-check").assert;
const path = require("path");
const BarWorker = require("../lib/BarWorker");
const barWorker = new BarWorker();


const Archive = require("../lib/Archive");
const FolderBrickStorage = require("../lib/FolderBrickStorage");

const folderPath = path.resolve("../lib/fld");
const savePath = "./";

const archive = new Archive("testArchive", new FolderBrickStorage(savePath), barWorker);

archive.addFolder(folderPath, (err) => {
    if (err) {
        throw err;
    }

    console.log("saved bricks");

    archive.store((err, mapDigest) => {
        if (err) {
            throw err;
        }

        console.log("Saved bar map", mapDigest);

        archive.getFolder(path.join(savePath, "tests"), mapDigest, (err) => {
            if (err) {
                throw err;
            }

            console.log('Done');
            
        });
    });


});

