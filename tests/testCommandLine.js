const assert = require("double-check").assert;
const CommandHandler = require('../lib/CommandHandler');

CommandHandler.prototype.flags = {};
CommandHandler.prototype.aliasList = [];
CommandHandler.prototype.registerFlag = function(aliases,typeName,checkFunction,description,numberOfParameters){
    aliases.forEach(alias=>{
        //checkFunction = alias[0] === '-' && alias[1] !== '-'? checkFunction:undefined;
        CommandHandler.prototype.flags[alias] = [typeName,checkFunction, description, numberOfParameters];
    });
    CommandHandler.prototype.aliasList.push(aliases);
}

CommandHandler.prototype.provideHelp = function(){
    let helpString = '';
    CommandHandler.prototype.aliasList.forEach(aliases=>{
        helpString += aliases.toString();
        helpString += '\n';
        helpString += ('\t\t\t\t\t' + this.flags[aliases[0]][2] + '\n');
    });
    return helpString;
}

let checkFunctionCreate = () => {let goodBind = {}; fillForEveryArg(['-z','-v','-f'],goodBind); return goodBind;};
let checkFunctionFile = () => {let goodBind = {}; fillForEveryArg(['-x','-v'],goodBind); return goodBind;};
let checkFunctionUpdate = () => {let goodBind = {}; fillForEveryArg(['-f','-v'],goodBind); return goodBind;};
let checkFunctionZip = () => {let goodBind = {}; fillForEveryArg(['-x','-f','-c','-t','-v'],goodBind); return goodBind;};
let checkFunctionVerbose = () => {let goodBind = {}; fillForEveryArg(['-f','-c','-u','-r','-t','-z'],goodBind); return goodBind;};
let checkFunctionExtract = () => {let goodBind = {}; fillForEveryArg(['-v','-f'],goodBind); return goodBind;};
let checkFunctionAppend = () => {let goodBind = {}; fillForEveryArg(['-v','-f'],goodBind); return goodBind;};
let checkFunctionList = () => {let goodBind = {}; fillForEveryArg(['-f','-v','-z'],goodBind); return goodBind;};

CommandHandler.prototype.registerFlag(['-A','--catenate','--concatenate'],'String',undefined,'append bar files to an archive',1);
CommandHandler.prototype.registerFlag(['-c','--create'],'String',checkFunctionCreate,'create a new archive',1);
CommandHandler.prototype.registerFlag(['-d','--diff','--compare'],'String',undefined,'find differences between archive and file system',1);
CommandHandler.prototype.registerFlag(['--delete'],'String',undefined,'delete from the archive',1);
CommandHandler.prototype.registerFlag(['-r','--append'],'String',checkFunctionAppend,'append files to the end of an archive',1);
CommandHandler.prototype.registerFlag(['-t','--list'],'String',checkFunctionList,'list the contents of an archive',1);
CommandHandler.prototype.registerFlag(['-u','--update'],'String',checkFunctionUpdate,'only append files newer than copy in archive',1);
CommandHandler.prototype.registerFlag(['-x','--extract','-get'],'boolean',checkFunctionExtract,'extract files from an archive',0);
CommandHandler.prototype.registerFlag(['-C','--directory'],'String',undefined,'change to directory give as parameter',1);
CommandHandler.prototype.registerFlag(['-f','--file'],'String',checkFunctionFile,'use archive file or device ARCHIVE',1);
CommandHandler.prototype.registerFlag(['-j','--bzip2'],'boolean',undefined,'filter the archive through bzip2',0);
CommandHandler.prototype.registerFlag(['-J','--xz'],'boolean',undefined,'filter the archive through xz',0);
CommandHandler.prototype.registerFlag(['-p','--preserve-permissions'],'String',undefined,'extract information about file permissions',1);
CommandHandler.prototype.registerFlag(['-z','--gzip'],'boolean',checkFunctionZip,'filter the archive through gzip',0);
CommandHandler.prototype.registerFlag(['-v','--verbose'],'boolean',checkFunctionVerbose,'display every file name from data flux',0);
CommandHandler.prototype.registerFlag(['-h','--help'],'boolean',undefined,'provide a list of commands and aliases and descriptions for each',0);

//let commandLine = ['bar -cf name.bar folderName','bar -x name.bar folderName','bar -t name.bar','bar -czf name.bar folderName --key someKey','bar -c folderName --key someKey'];
let commandLine = [['bar','barx','-cf','name.bar','folderName'],['bar','barx','-x','-f','-name.bar'],['bar','barx','-tf','name.bar'],['bar','barx','-czf','name.bar','folderName']];
assert.callback("testCommandLine",(callback)=>{
    let commandHandler = new CommandHandler(commandLine[0]);
    assert.true(commandHandler.getFlags() === ['-cf'] && commandHandler.getParameters() === ['name.bar','folderName']);
    commandHandler = new CommandHandler(commandLine[1]);
    assert.true(commandHandler.getFlags() === ['-x','-f'] && commandHandler.getParameters() === ['name.bar']);
    commandHandler = new CommandHandler(commandLine[2]);
    assert.true(commandHandler.getFlags() === ['-tf'] && commandHandler.getParameters() === ['name.bar']);
    commandHandler = new CommandHandler(commandLine[3]);
    assert.true(commandHandler.getFlags() === ['-czf'] && commandHandler.getParameters() === ['name.bar','folderName']);
},1000);
