const ArchiveConfigurator = require('./ArchiveConfigurator');
const Archive = require('./Archive');
const createFolderBrickStorage = require("./FolderBrickStorage").createFolderBrickStorage;
const createFsAdapter = require("./FsBarWorker").createFsBarWorker;
const path = require('path');


function Operations()
{
    const archiveConfigurator = new ArchiveConfigurator();
    
    this.createBar = function(folderName,barName,encryptionKey){
        ArchiveConfigurator.prototype.registerStorageProvider("FolderBrickStorage", createFolderBrickStorage, path.resolve(folderName));
        ArchiveConfigurator.prototype.registerDiskAdapter("fsAdapter", createFsAdapter);
        archiveConfigurator.setBufferSize(256);
        archiveConfigurator.setStorageProvider("FolderBrickStorage", barName);
        archiveConfigurator.setDiskAdapter("fsAdapter");
        const archive = new Archive(archiveConfigurator);
        archive.addFolder(path.resolve(folderName),(err,mapDigest)=>{
            if(err)
                console.log('eroare');
        });
    }
    this.extractFromBar = function(folderName,barName){
        console.log(folderName + '_' + barName);
    }
    this.listBarFiles = function(barName){
        console.log(barName);
    }
}
module.exports = Operations;