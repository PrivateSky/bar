function CommandHandler(argv)
{
    let flagList = [];
    let parametersList = [];
    function __parse(){
        argv.forEach((value,index,arr)=>{
            console.log(value);
            if(index>1){
                if(value[0] === '-') {
                    flagList.push(value.toString());
                }else{
                    parametersList.push(value.toString());
                }
            }
        });
        console.log(flagList);
        console.log(parametersList);
        if(__checkIfValid(flagList,parametersList) === false) {
            console.log(false);
            return undefined;
        }
        else {
            console.log(true);
            return this;
        }
    }
    function __checkIfValid(flagList,parametersList){
        let expectedNumberOfParameters = 0;
        for(let index=0;index<flagList.length;index++){
            for(let scndIndex=1;scndIndex<flagList[index].length;scndIndex++){
                if(CommandHandler.prototype.flags[('-' + flagList[index][scndIndex])][1]()[('-' + flagList[index][scndIndex+1])] === undefined && index<flagList.length-1) {
                    console.log('one');
                    return false;
                }else{
                    if(CommandHandler.prototype.flags[('-' + flagList[index][scndIndex])][0] === 'String') {
                        console.log(flagList[index][scndIndex]);
                        expectedNumberOfParameters++;
                    }
                }
            }
        }
        if(expectedNumberOfParameters>parametersList.length) {
            console.log(expectedNumberOfParameters);
            return false;
        }
        return true;
    }
    this.getFlags = function(){
        return flagList;
    }
    __parse();
}

CommandHandler.prototype.flags = {};
CommandHandler.prototype.aliasList = [];
CommandHandler.prototype.registerFlag = function(aliases,typeName,checkFunction,description){
    aliases.forEach(alias=>{
       //checkFunction = alias[0] === '-' && alias[1] !== '-'? checkFunction:undefined;
       CommandHandler.prototype.flags[alias] = [typeName,checkFunction, description];
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

CommandHandler.prototype.registerFlag(['-A','--catenate','--concatenate'],'String',undefined,'append bar files to an archive');
CommandHandler.prototype.registerFlag(['-c','--create'],'String',checkFunctionCreate,'create a new archive');
CommandHandler.prototype.registerFlag(['-d','--diff','--compare'],'String',undefined,'find differences between archive and file system');
CommandHandler.prototype.registerFlag(['--delete'],'String',undefined,'delete from the archive');
CommandHandler.prototype.registerFlag(['-r','--append'],'String',checkFunctionAppend,'append files to the end of an archive');
CommandHandler.prototype.registerFlag(['-t','--list'],'String',checkFunctionList,'list the contents of an archive');
CommandHandler.prototype.registerFlag(['-u','--update'],'String',checkFunctionUpdate,'only append files newer than copy in archive');
CommandHandler.prototype.registerFlag(['-x','--extract','-get'],'String',checkFunctionExtract,'extract files from an archive');
CommandHandler.prototype.registerFlag(['-C','--directory'],'String',undefined,'change to directory give as parameter');
CommandHandler.prototype.registerFlag(['-f','--file'],'String',checkFunctionFile,'use archive file or device ARCHIVE');
CommandHandler.prototype.registerFlag(['-j','--bzip2'],'boolean',undefined,'filter the archive through bzip2');
CommandHandler.prototype.registerFlag(['-J','--xz'],'boolean',undefined,'filter the archive through xz');
CommandHandler.prototype.registerFlag(['-p','--preserve-permissions'],'String',undefined,'extract information about file permissions');
CommandHandler.prototype.registerFlag(['-z','--gzip'],'boolean',checkFunctionZip,'filter the archive through gzip');
CommandHandler.prototype.registerFlag(['-v','--verbose'],'boolean',checkFunctionVerbose,'display every file name from data flux');
CommandHandler.prototype.registerFlag(['-h','--help'],'boolean',undefined,'provide a list of commands and aliases and descriptions for each');
let comm = new CommandHandler(process.argv);
module.exports = CommandHandler;
