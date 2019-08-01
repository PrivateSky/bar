function CommandHandler(argv)
{
    let flagList = [];
    let parametersList = [];
    let actualCommand = '';
    const flags = CommandHandler.prototype.flags;
    const base = CommandHandler.prototype.baseNames;

    this.getCommand = function(){
        return actualCommand;
    }

    this.getFlags = function(){
        return flagList;
    }

    this.getParameters = function(){
        return parametersList;
    }

    function __parse(){
        __constructList();
        if(__checkIfValid(flagList,parametersList) === false) {
            parametersList = flagList = undefined;
        }else{
            __constructCommand();
        }
    }

    function __constructList(){
        argv.forEach((value,index,arr)=>{
            if(index>1){
                if(value[0] === '-') {
                    if(value[1] === '-'){
                        let slicedByEqual = value.toString().split('=');
                        if(slicedByEqual.length > 1){
                            flagList.push(slicedByEqual[0].toString());
                            parametersList.push(slicedByEqual[1].toString());
                        }
                    }
                    else {
                        flagList.push(value.toString());
                    }
                }else{
                    parametersList.push(value.toString());
                }
            }
        });
    }

    function __constructCommand(){
        flagList.forEach(flag=>{
            if(flag[1] === '-'){
                actualCommand += base[flag].slice(1);
            }else{
                actualCommand += flag.slice(1);
            }
        });
    }

    function __checkIfValid(flagList,parametersList){
        let expectedNumberOfParameters = 0;
        if(flagList.length === 0)
            return false;
        for(let index=0;index<flagList.length;index++){
            if(flagList[index][1] !== '-'){

                let number = __checkConcatCommand(flagList[index],'-',flagList[index+1]);
                if(number === false){
                    return false;
                }else{
                    expectedNumberOfParameters += number;
                }
            }else{
                let number = __checkCommand(flagList[index],flagList[index+1]);
                if(number === false){
                    return false;
                }else{
                    expectedNumberOfParameters += number;
                }
            }
        }
        if(expectedNumberOfParameters < parametersList.length) {
            return false;
        }
        return true;
    }

    function __checkConcatCommand(flag,prefixe,nextFlag){
        let expectedNumber = 0;
        let index = 1;
        for(; index<flag.length-1; index++){
            let number = __checkerConcatCommand((prefixe + flag[index]),(prefixe+flag[index+1]));
            if(number === false) {
                return false;
            }
            else {
                expectedNumber += number;
            }
        }
        let newNext = __parseNext(nextFlag);
        let number = __checkerConcatCommand((prefixe + flag[index]),newNext);
        if(number === false){
            return false;
        }else{
            expectedNumber += number;
        }
        return expectedNumber;
    }

    function __checkerConcatCommand(currFlag,nextFlag){
        let expectedNumber = 0;
        //console.log(currFlag,flags[currFlag]);
        if(typeof flags[currFlag][1]()[nextFlag] === "undefined" && typeof nextFlag !== "undefined"){
            return false;
        }else{
            if(flags[currFlag][0] === "String"){
                expectedNumber += flags[currFlag][3];
            }
        }
        return expectedNumber;
    }

    function __checkCommand(flag,nextFlag){
        let number = __checkerConcatCommand(flag,__parseNext(nextFlag));
        if(number === false){
            return false;
        }
        return number;
    }

    function __parseNext(nextFlag){
        if(typeof nextFlag === "undefined")
            return undefined;
        if(nextFlag[0] === '-' && nextFlag[1] === '-'){
            return nextFlag;
        }else{
            return nextFlag.slice(0,2);
        }
    }

    __parse();
}

CommandHandler.prototype.flags = {};
CommandHandler.prototype.aliasList = [];
CommandHandler.prototype.baseNames = {};
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

function fillMap(arg,map){
    CommandHandler.prototype.aliasList.forEach(aliases=>{
        if(aliases[0] === arg){
            aliases.forEach(alias=>{
                map[alias] = 1;
                CommandHandler.prototype.baseNames[alias] = aliases[0];
            });
        }
    });
}

function fillForEveryArg(argList,map){
    argList.forEach(arg=>{
        fillMap(arg,map);
    });
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
//let comm = new CommandHandler(process.argv);
let comm = new CommandHandler(['bar','barx','-cz','--file=name.bar','folderName']);
//console.log(comm.getCommand());
module.exports = CommandHandler;
