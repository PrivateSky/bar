const CommandHandler = require('./CommandHandler');
const Archive = require('./Archive');

function CommandExecuter(commandObject){

}
CommandExecuter.prototype.registerCommand = function(command,toExecute){

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
    if(fileOrFolder(parameters[0]) === 1){
        archive.addFile(parameters[0],(err)=>{

        });
    }else{
        archive.addFolder(parameters[0],(err)={

        });
    }
}
let executeXf = function(parameters,config){
    let archive = new Archive(config);
    if(fileOrFolder(parameters[0]) === 1){
        archive.extractFile(parameters[0],'./',(err)=>{

        });
    }else{
        archive.extractFolder(parameters[0],(err)=>{

        });
    }
}
CommandExecuter.prototype.registerCommand('cf',executeCzf);
let comm = new CommandHandler(process.argv);
