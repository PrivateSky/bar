#!/usr/bin/env node
process.env.NO_LOGS="true";
const CommandHandler = require('./CommandHandler');
const Archive = require('./Archive');
const fs = require('fs');

function CommandExecuter(commandObject){
    const selfMap = CommandExecuter.prototype.commandsMap;
    function __call(){
        if(typeof selfMap[commandObject.getCommand().toString()] !== "undefined") {
            selfMap[commandObject.getCommand().toString()](commandObject.getStorageProvider(),commandObject.getParameters(), commandObject.getConfigurator());
        }else{
            console.log("undefined");
        }
    }
    __call();
}

let comm = new CommandHandler(process.argv);
CommandExecuter.prototype.commandsMap = {};
CommandExecuter.prototype.registerCommand = function(command,toExecute){
    CommandExecuter.prototype.commandsMap[command] = toExecute;
};

function executeCzf(storageProvider,parameters,config){
    let archive = new Archive(config);
    if(fs.statSync(parameters[1]).isFile() === true){
        archive.addFile(parameters[1],(err)=>{
            if(err) {
                throw err;
            }
        });
    }else{
        archive.addFolder(parameters[1],(err,mapDigest)=>{
            console.log(mapDigest);
            if(err) {
                console.log(err.message);
            }
        });
    }
};

function executeXvf(storageProvider,parameters,config){
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
        archive.extractFile(parameters[0],'folder22',(err)=>{
            if(err){
                throw err;
            }
        });
    }else{
        archive.extractFolder(parameters[0],(err)=>{
            if(err){
                throw err;
            }
        });
    }
};

CommandExecuter.prototype.registerCommand('cf',executeCzf);
CommandExecuter.prototype.registerCommand('cvf',executeCzf);
CommandExecuter.prototype.registerCommand('czf',executeCzf);
CommandExecuter.prototype.registerCommand('xf',executeXvf);
CommandExecuter.prototype.registerCommand('xvf',executeXvf);
CommandExecuter.prototype.registerCommand('xfv',executeXvf);
CommandExecuter(comm);
