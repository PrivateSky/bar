const CommandHandler = require('./CommandHandler');
const Archive = require('./Archive');
const fs = require('fs');

function CommandExecuter(commandObject){
    const self = CommandExecuter.prototype;
    function __call(){
        self.commands[commandObject.getCommand()](commandObject.getParameters(),commandObject.getConfiguration());
    }
    console.log('So far,so good!');
    //__call();
}
let comm = new CommandHandler(process.argv);
console.log(comm.getCommand(),comm.getParameters(),comm.getFlags(),comm.getStorageProvider(),comm.getConfigurator());
CommandExecuter.prototype.commands = {};
CommandExecuter.prototype.registerCommand = function(command,toExecute){
    CommandExecuter.prototype.commands[command] = toExecute;
}
let fileOrFolder = function(parameter){
    let checker = 0;
    parameter.forEach(el=>{
        if(el === '.'){
            checker = 1;
        }
    });
    return checker;
}
let executeCzf = function(parameters,config){
    let archive = new Archive(config);
    if(fs.statSync(parameters[1]).isFile() === true){
        archive.addFile(parameters[1],(err)=>{
            if(err) {
                throw err;
            }
        });
    }else{
        archive.addFolder(parameters[1],(err)=>{
            if(err) {
                throw err;
            }
        });
    }
}
let executeXvf = function(parameters,config){
    let archive = new Archive(config);
    if(fs.statSync(parameters[0]).isFile() === true){
        archive.extractFile(parameters[0],'./',(err)=>{
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
}
CommandExecuter.prototype.registerCommand('cf',executeCzf);
CommandExecuter.prototype.registerCommand('cvf',executeCzf);
CommandExecuter.prototype.registerCommand('czf',executeCzf);
CommandExecuter.prototype.registerCommand('xf',executeXvf);
CommandExecuter.prototype.registerCommand('xvf',executeXvf);
CommandExecuter.prototype.registerCommand('xfv',executeXvf);
let cex = new CommandExecuter(comm);
