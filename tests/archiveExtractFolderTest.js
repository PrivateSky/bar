const assert = require("double-check").assert;
const path = require("path");
const BarWorker = require("../lib/BarWorker");
const barWorker = new BarWorker();


const Archive = require("../lib/Archive");
const FolderBrickStorage = require("../lib/FolderBrickStorage");

const folderPath = path.resolve("fld");
let savePath = "dot";

const archive = new Archive("testArchive", new FolderBrickStorage(savePath), barWorker);

assert.callback("archiveFolderTest", (callback) => {
    archive.addFolder(folderPath, (err) => {
        if (err) {
            throw err;
        }

        let a = archive.getReadStream('any.txt');
        archive.appendToFile(path.join(folderPath,'a.txt'),a,(err)=>{
            console.log('done');
            if(err)
                console.log('Something happened!');
                    archive.store((err, mapDigest) => {
                        if (err) {
                            throw err;
                        }        
                        assert.true(typeof mapDigest !== "undefined" && mapDigest !== null, "mapDigest is null or undefined");
                        
                        archive.getFolder(savePath, mapDigest, (err) => {
                            if (err) {
                                throw err;
                            }
                            // archive.replaceFile(path.join(path.join(folderPath,'fld2'),'b.txt'),archive.getReadStream('any.txt'),(err)=>{
                            //     if(err){
                            //         console.log('ERROR!');
                            //     }                            
                            archive.getFile(path.join(path.join(folderPath,'fld2'),'b.txt'),savePath,(err)=>{
                                if(err)
                                    throw err;
                            });
                            callback();
                        });
                        archive.list((err,keys)=>{
                            if(err)
                                throw err;
                            console.log('List is:\n');
                            keys.forEach(fp=>{
                                console.log(fp);
                            });
                        });
                    });
                //});
        });

    });
}, 1500);
