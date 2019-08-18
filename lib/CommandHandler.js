const ArchiveConfigurator  = require('./ArchiveConfigurator');
const createFolderBrickStorage = require('./FolderBrickStorage').createFolderBrickStorage;
const createFsAdapter = require('./FsBarWorker').createFsBarWorker;
const createFileBrickStorage = require('./FileBrickStorage').createFileBrickStorage;
require("../../../psknode/bundles/pskruntime");
require("../../../psknode/bundles/edfsBar");
const createEDFSBrickStorage = require('../../edfs-brick-storage/EDFSBrickStorage').createEDFSBrickStorage;

const fs = require('fs');

function CommandHandler(argv) {
    let flagList = [];
    let parametersList = [];
    let storageProvider;
    let diskAdapter = 'fsBarWorker';
    let bufferSize = 4096*4*256; //16KB;
    let actualCommand = '';
    let createFunction;
    let archiveConfigurator;
    const flags = CommandHandler.prototype.flags;
    const base = CommandHandler.prototype.baseNames;

    this.getDiskBuff = function(){
        return bufferSize;
    }

    this.getCommand = function () {
        return actualCommand;
    };

    this.getFlags = function () {
        return flagList;
    };

    this.getParameters = function () {
        return parametersList;
    };

    this.getStorageProvider = function(){
        return storageProvider;
    };

    this.getConfigurator = function(){
        return archiveConfigurator;
    }

    function parse() {
        constructList();
        if(checkIfCommandIsValid(flagList, parametersList) === true) {
            constructCommand();
            createConfigurator();
        }
    };

    function setStorageProvider(value){
        let pref = value.slice(0,4);
        let sufx = value.slice(value.length-3);
        if(pref === 'http'){
            storageProvider = 'EDFS';
            createFunction = createEDFSBrickStorage;
        }else if(sufx === 'bar'){
            storageProvider = 'FileBrickStorage';
            try{
                fs.statSync(value).isFile();
            }catch(err){
                fs.writeFileSync(value,'');
            }
            createFunction = createFileBrickStorage;
            //parametersList.push('');
        }else{
            storageProvider = 'FolderBrickStorage';
            try{
                fs.statSync(value).isDirectory();
            }catch(err){
                fs.mkdirSync(value);
            }
            createFunction = createFolderBrickStorage;
        }
    };

    function createConfigurator(){
        let savePath = getSavePath();
        ArchiveConfigurator.prototype.registerStorageProvider(storageProvider,createFunction);
        ArchiveConfigurator.prototype.registerDiskAdapter(diskAdapter,createFsAdapter);
        archiveConfigurator = new ArchiveConfigurator();
        archiveConfigurator.setStorageProvider(storageProvider,savePath);
        archiveConfigurator.setDiskAdapter(diskAdapter);
        archiveConfigurator.setBufferSize(bufferSize);
    }

    function getSavePath(){
        if(actualCommand === 'czf' || actualCommand === 'cf' || actualCommand === 'cfz'){
            return parametersList[0];
        }
        else if(actualCommand === 'xf' || actualCommand === 'xvf'){
            return parametersList[0];
        }
    }

    function constructList() {
        argv.forEach((value, index, arr) => {
            if (index > 1) {
                helperConstructList(value);
            }
        });
    };

    function helperConstructList(value){
        if (value[0] === '-') {
            if (value[1] === '-') {
                situationalConfigurator(value.toString().split('='));
            } else {
                flagList.push(value.toString());
            }
        } else {
            if(parametersList.length === 0) {
                setStorageProvider(value.toString());
            }
            parametersList.push(value.toString());
        }
    }

    function situationalConfigurator(slicedByEqual){
        if (slicedByEqual.length > 1) {
            if (flags[slicedByEqual[0].toString()][0] === 'String') {
                if (slicedByEqual[0] === '--setBufferSize') {
                    bufferSize = parseInt(slicedByEqual[1]);
                }
                flagList.push(slicedByEqual[0].toString());
                if(slicedByEqual[0].toString() === '--file'){
                     setStorageProvider(slicedByEqual[1].toString());
                }
                parametersList.push(slicedByEqual[1].toString());
            } else {
                throw new Error("Number of parameters is more than expected!");
            }
        }
    }

    function constructCommand() {
        flagList.forEach(flag => {
            if (flag[1] === '-') {
                actualCommand += base[flag].slice(1);
            } else {
                actualCommand += flag.slice(1);
            }
        });
    };

    function checkIfCommandIsValid(flagList, parametersList) {
        let expectedNumberOfParameters = 0;
        if (flagList.length === 0)
            throw new Error("Can't form command without flags!");
        for (let index = 0; index < flagList.length; index++) {
            expectedNumberOfParameters += helperCheckIfCommandIsValid(flagList,index);
        }
        if (expectedNumberOfParameters > parametersList.length) {
            throw new Error("Number of parameters is less than expected!");
        }
        return true;
    };

    function helperCheckIfCommandIsValid(flagList,index){
        let number;
        if (flagList[index][1] !== '-') {

            number = checkConcatCommand(flagList[index], '-', flagList[index + 1]);
            if (number === false) {
                throw new Error("Order of flags is not right or flag is not well written!");
            }
        } else {
            number = checkCommand(flagList[index], flagList[index + 1]);
            if (number === false) {
                throw new Error("Order of flags is not right or flag is not well written!");
            }
        }
        return number;
    }

    function checkConcatCommand(flag, prefixe, nextFlag) {
        let expectedNumber = 0;
        let index = 1;
        for (; index < flag.length - 1; index++) {
            let number = checkerConcatCommand((prefixe + flag[index]), (prefixe + flag[index + 1]));
            if (number === false) {
                return false;
            } else {
                expectedNumber += number;
            }
        }
        let newNext = parseNext(nextFlag);
        let number = checkerConcatCommand((prefixe + flag[index]), newNext);
        if (number === false) {
            return false;
        } else {
            expectedNumber += number;
        }
        return expectedNumber;
    };

    function checkerConcatCommand(currFlag, nextFlag) {
        let expectedNumber = 0;
        if (typeof flags[currFlag][1]()[nextFlag] === "undefined" && typeof nextFlag !== "undefined") {
            return false;
        } else {
            if (flags[currFlag][0] === "String") {
                expectedNumber += flags[currFlag][3];
            }
        }
        return expectedNumber;
    };

    function checkCommand(flag, nextFlag) {
        let number = checkerConcatCommand(flag, parseNext(nextFlag));
        if (number === false) {
            return false;
        }
        return number;
    };

    function parseNext(nextFlag) {
        if (typeof nextFlag === "undefined")
            return undefined;
        if (nextFlag[0] === '-' && nextFlag[1] === '-') {
            return nextFlag;
        } else {
            return nextFlag.slice(0, 2);
        }
    };

    parse();
};

CommandHandler.prototype.flags = {};
CommandHandler.prototype.aliasList = [];
CommandHandler.prototype.baseNames = {};
CommandHandler.prototype.registerFlag = function (aliases, typeName, checkFunction, description, numberOfParameters) {
    aliases.forEach(alias => {
        CommandHandler.prototype.flags[alias] = [typeName, checkFunction, description, numberOfParameters];
    });
    CommandHandler.prototype.aliasList.push(aliases);
};

CommandHandler.prototype.provideHelp = function () {
    let helpString = '';
    CommandHandler.prototype.aliasList.forEach(aliases => {
        helpString += aliases.toString();
        helpString += '\n';
        helpString += ('\t\t\t\t\t' + this.flags[aliases[0]][2] + '\n');
    });
    return helpString;
};

function fillMap(arg, map) {
    CommandHandler.prototype.aliasList.forEach(aliases => {
        if (aliases[0] === arg) {
            aliases.forEach(alias => {
                map[alias] = 1;
                CommandHandler.prototype.baseNames[alias] = aliases[0];
            });
        }
    });
};

function fillForEveryArg(argList, map) {
    argList.forEach(arg => {
        fillMap(arg, map);
    });
};

function createFunction(args){
    return ()=>{
        let arrayOfArgs = args;
        let goodBind = {};
        fillForEveryArg(arrayOfArgs,goodBind);
        return goodBind;
    };
}

CommandHandler.prototype.registerFlag(['-A', '--catenate', '--concatenate'], 'String', undefined, 'append bar files to an archive', 1);
CommandHandler.prototype.registerFlag(['-c', '--create'], 'String', createFunction(['-z', '-v', '-f','-B']), 'create a new archive', 1);
CommandHandler.prototype.registerFlag(['-d', '--diff', '--compare'], 'String', undefined, 'find differences between archive and file system', 1);
CommandHandler.prototype.registerFlag(['--delete'], 'String', undefined, 'delete from the archive', 1);
CommandHandler.prototype.registerFlag(['-r', '--append'], 'String', createFunction(['-v', '-f', '-B']), 'append files to the end of an archive', 1);
CommandHandler.prototype.registerFlag(['-t', '--list'], 'String', createFunction(['-f', '-v', '-z', '-B']), 'list the contents of an archive', 0);
CommandHandler.prototype.registerFlag(['-u', '--update'], 'String', createFunction(['-f', '-v','-B']), 'only append files newer than copy in archive', 1);
CommandHandler.prototype.registerFlag(['-x', '--extract', '--get'], 'String', createFunction(['-v', '-f', '-B']), 'extract files from an archive', 1);
CommandHandler.prototype.registerFlag(['-C', '--directory'], 'String', undefined, 'change to directory give as parameter', 1);
CommandHandler.prototype.registerFlag(['-f', '--file'], 'String', createFunction(['-x', '-v','-B']), 'use archive file or device ARCHIVE', 1);
CommandHandler.prototype.registerFlag(['-j', '--bzip2'], 'boolean', undefined, 'filter the archive through bzip2', 0);
CommandHandler.prototype.registerFlag(['-J', '--xz'], 'boolean', undefined, 'filter the archive through xz', 0);
CommandHandler.prototype.registerFlag(['-p', '--preserve-permissions'], 'String', undefined, 'extract information about file permissions', 1);
CommandHandler.prototype.registerFlag(['-z', '--gzip'], 'boolean', createFunction(['-x', '-f', '-c', '-t', '-v', '-B']), 'filter the archive through gzip', 0);
CommandHandler.prototype.registerFlag(['-v', '--verbose'], 'boolean', createFunction(['-f', '-c', '-u', '-r', '-t', '-z','-B']), 'display every file name from data flux', 0);
CommandHandler.prototype.registerFlag(['-h', '--help'], 'boolean', undefined, 'provide a list of commands and aliases and descriptions for each', 0);
CommandHandler.prototype.registerFlag(['-B', '--setBufferSize'], 'String', createFunction(['-v']), 'allow user to set size of the buffer', 1);
module.exports = CommandHandler;
