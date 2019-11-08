const double_check = require("../../../modules/double-check");
const assert = double_check.assert;
const Archive = require("../lib/Archive");
const ArchiveConfigurator = require("../lib/ArchiveConfigurator");
const createFileBrickStorage = require("../lib/FileBrickStorage").createFileBrickStorage;
const createFolderBrickStorage = require("../lib/FolderBrickStorage").createFolderBrickStorage;
const createFsAdapter = require("../lib/FsAdapter").createFsAdapter;
ArchiveConfigurator.prototype.registerStorageProvider("FolderBrickStorage", createFolderBrickStorage);
ArchiveConfigurator.prototype.registerFsAdapter("FsAdapter", createFsAdapter);

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

//double_check.createTestFolder("bar_test_folder", (err, testFolder) => {

    const folderPath =  "fld";
    let savePath =  "dot";


    const folders = ["fld","dot"];
    const files = [path.join('fld','a.txt'), path.join('fld','b.txt'), path.join('fld','c.txt')];

    const text = ["asta e un text?", "ana are mere", "hahahaha"];

    const archiveConfigurator = new ArchiveConfigurator();
    archiveConfigurator.setStorageProvider("FolderBrickStorage", savePath);
    archiveConfigurator.setFsAdapter("FsAdapter");
    archiveConfigurator.setBufferSize(3);
    const archive = new Archive(archiveConfigurator);


    assert.callback("AddFolderExtractFile", (callback) => {
        double_check.ensureFilesExist(folders, files, text, (err) => {
            assert.true(err === null || typeof err === "undefined", "Failed to create folder hierarchy.");
            archive.addFolder(folderPath, (err) => {
                assert.true(err === null || typeof err === "undefined", "Failed to archive file.");

                fs.writeFileSync(path.join('fld','d.txt'),'asta este un test de UPDATE!xoxox');
                archive.update(folderPath,(err)=>{
                    if(err){
                        throw err;
                    }
                    console.log('DAN');
                    callback();
                });
            });
        });
    }, 1500);


