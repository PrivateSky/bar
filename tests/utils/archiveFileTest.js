const ArchiveConfigurator = require('../../lib/ArchiveConfigurator');
const createFileBrickStorage = require('../../lib/FileBrickStorage').createFileBrickStorage;
const diskAdapter = require('../../lib/FsBarWorker').createFsBarWorker;
const Archive = require('../../lib/Archive');
const fs = require('fs');


function testingFileBrickStorage(){
    ArchiveConfigurator.prototype.registerStorageProvider('FileBrickStorage',createFileBrickStorage);
    ArchiveConfigurator.prototype.registerDiskAdapter('fsBarWorker',diskAdapter);
    let archiveConfigurator = new ArchiveConfigurator();
    archiveConfigurator.setStorageProvider('FileBrickStorage','name.bar');
    archiveConfigurator.setDiskAdapter('fsBarWorker');
    archiveConfigurator.setBufferSize(256);
    let archive = new Archive(archiveConfigurator);
    try{
        fs.statSync('name.bar').isFile();
    }catch(err){
        fs.writeFileSync('name.bar','');
    }
    archive.addFile('folder',(err)=>{
        if(err)
            console.log(err.message);
    });
}
testingFileBrickStorage();