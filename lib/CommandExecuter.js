#!/usr/bin/env node
process.env.NO_LOGS = "true";
const CommandHandler = require('./CommandHandler');
const Archive = require('./Archive');
const fs = require('fs');

function CommandExecuter(commandObject){
    function __call(){
        if(commandObject.getCommand() === 'czf' || commandObject.getCommand() === 'cf' || commandObject.getCommand() === 'cvf'){
            executeCzf(commandObject.getStorageProvider(),commandObject.getParameters(),commandObject.getConfigurator());
        }
        else if(commandObject.getCommand() === 'xf' || commandObject.getCommand() === 'xzf' || commandObject.getCommand() === 'xvf'){
            executeXvf(commandObject.getStorageProvider(),commandObject.getParameters(),commandObject.getConfigurator());
        }
    }
    __call();
};
let comm;
try {
    comm = new CommandHandler(process.argv);
}catch(err){
    console.log(err.message);
}

function additionalConfigSet(config){
    let actualCommand = comm.getCommand();
    for(let i=0;i<actualCommand.length;i++){
        if(actualCommand[i] === 'v'){
            config.setVerbose();
        }else if(actualCommand[i] === 'z'){
            config.setIsZip();
        }
    }
}

function executeCzf(storageProvider,parameters,config){
    additionalConfigSet(config);
    let archive = new Archive(config);
    if(fs.statSync(parameters[1]).isFile() === true){
        archive.addFile(parameters[1],(err)=>{
            if(err) {
                throw err;
            }
        });
    }else{
        archive.addFolder(parameters[1],(err,mapDigest)=>{
            if(typeof mapDigest !== "undefined") {
                console.log(mapDigest);
            }
            if(err) {
                console.log(err.message);
            }
        });
    }
}

function executeXvf(storageProvider,parameters,config){
    additionalConfigSet(config);
    let archive = new Archive(config,parameters[1]);
    if(storageProvider === 'EDFS')
    {
        archive.extractFolder('.',(err)=>{
            if(err){
                console.log(err);
                throw err;
            }
        });
        return;
    }
    if(fs.statSync(parameters[0]).isFile() === true){
        archive.extractFile(parameters[0],'.',(err)=>{
            if(err){
                throw err;
            }
        });
    }else{
        archive.extractFolder('.',(err)=>{
            if(err){
                throw err;
            }
        });
    }
}

if(typeof comm !== "undefined") {
    CommandExecuter(comm);
}