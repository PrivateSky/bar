const ArchiveConfigurator = require('./ArchiveConfigurator');
const createFolderBrickStorage = require('./FolderBrickStorage').createFolderBrickStorage;
const createFsAdapter = require('./FsAdapter').createFsAdapter;
const createFileBrickStorage = require('./FileBrickStorage').createFileBrickStorage;

const fsModule = "fs";
const fs = require(fsModule);
const pathModule = "path";
const path = require(pathModule);

function CommandHandler(argv) {

    let flagList = [];
    let parametersList = [];
    let storageProvider;
    let fsAdapter = 'FsAdapter';
    let bufferSize = 4096 * 4 * 256; //16KB;
    let actualCommand = '';
    let createFunction;
    let archiveConfigurator;
    let encryptionKey;
    const flags = CommandHandler.prototype.flags;
    const base = CommandHandler.prototype.baseNames;

    parse();

    this.getBufferSize = () => {
        return bufferSize;
    };

    this.getCommand = () => {
        return actualCommand;
    };

    this.getFlags = () => {
        return flagList;
    };

    this.getParameters = () => {
        return parametersList;
    };

    this.getStorageProvider = () => {
        return storageProvider;
    };

    this.getConfigurator = () => {
        return archiveConfigurator;
    };

    this.getEncryptionKey = () => {
        return encryptionKey;
    };

    //---------------------------------------------- internal methods --------------------------------------------------
    function parse() {
        constructList();

        if (checkIfCommandIsValid(flagList, parametersList)) {
            constructCommand();
            createConfigurator();
        }
    }

    function setStorageProvider(fileName) {
        let ext = path.extname(fileName);
        if (ext === '.bar') {
            storageProvider = 'FileBrickStorage';
            createFunction = createFileBrickStorage;
        } else {
            storageProvider = 'FolderBrickStorage';
            try {
                fs.statSync(fileName);
            } catch (err) {
                fs.mkdirSync(fileName);
            }
            createFunction = createFolderBrickStorage;
        }
    }

    function createConfigurator() {
        let savePath = getSavePath();
        ArchiveConfigurator.prototype.registerStorageProvider(storageProvider, createFunction);
        ArchiveConfigurator.prototype.registerFsAdapter(fsAdapter, createFsAdapter);
        archiveConfigurator = new ArchiveConfigurator();
        archiveConfigurator.setStorageProvider(storageProvider, savePath);
        archiveConfigurator.setFsAdapter(fsAdapter);
        archiveConfigurator.setBufferSize(bufferSize);
    }

    function getSavePath() {
        if (['czf', 'cf', 'cvf', 'cfK', 'cfK', 'czfK', 'cvfK'].includes(actualCommand)) {
            return parametersList[0];
        }

        if (['x', 'xf', 'xzf', 'xvf', 'xK', 'xfK', 'xzfK', 'xvfK'].includes(actualCommand)) {
            return parametersList[0];
        }
    }

    function constructList() {
        argv.forEach((arg, index, arr) => {
            if (index > 1) {
                helperConstructList(arg);
            }
        });
    }

    function helperConstructList(arg) {
        if (arg[0] === '-') {
            if (arg[1] === '-') {
                situationalConfigurator(arg.split('='));
            } else {
                flagList.push(arg);
            }
        } else {
            if (parametersList.length === 0) {
                setStorageProvider(arg);
            }
            parametersList.push(arg);
        }
    }

    function situationalConfigurator(splitConfig) {
        if (splitConfig.length > 1) {
            if (flags[splitConfig[0]][0] === 'String') {
                if (splitConfig[0] === '--setBufferSize') {
                    bufferSize = parseInt(splitConfig[1]);
                }

                flagList.push(splitConfig[0]);
                if (splitConfig[0] === "--seed") {
                    encryptionKey = Buffer.from(splitConfig[1], 'hex');
                }
                if (splitConfig[0] === '--file') {
                    setStorageProvider(splitConfig[1]);
                }
                parametersList.push(splitConfig[1]);
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
    }

    function checkIfCommandIsValid(flagList, parametersList) {
        let expectedNumberOfParameters = 0;
        if (flagList.length === 0) {
            throw new Error("Can't form command without flags!Try -h or -help, to see a list of all available flags!");
        }
        for (let index = 0; index < flagList.length; index++) {
            expectedNumberOfParameters += helperCheckIfCommandIsValid(flagList, index);
        }
        if (expectedNumberOfParameters > parametersList.length) {
            throw new Error("Number of parameters is less than expected!");
        }
        return true;
    }

    function helperCheckIfCommandIsValid(flagList, index) {
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

    function checkConcatCommand(flag, prefix, nextFlag) {
        let expectedNumber = 0;
        let index = 1;
        for (; index < flag.length - 1; index++) {
            let number = checkerConcatCommand((prefix + flag[index]), (prefix + flag[index + 1]));
            if (number === false) {
                return false;
            } else {
                expectedNumber += number;
            }
        }
        let newNext = parseNext(nextFlag);
        let number = checkerConcatCommand((prefix + flag[index]), newNext);
        if (number === false) {
            return false;
        } else {
            expectedNumber += number;
        }
        return expectedNumber;
    }

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
    }

    function checkCommand(flag, nextFlag) {
        let number = checkerConcatCommand(flag, parseNext(nextFlag));
        if (number === false) {
            return false;
        }
        return number;
    }

    function parseNext(nextFlag) {
        if (typeof nextFlag === "undefined")
            return undefined;
        if (nextFlag[0] === '-' && nextFlag[1] === '-') {
            return nextFlag;
        } else {
            return nextFlag.slice(0, 2);
        }
    }
}

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
    let maxLen = 0;
    CommandHandler.prototype.aliasList.forEach(aliases => {
        if (maxLen < aliases.length) {
            maxLen = aliases.length;
        }
    });
    CommandHandler.prototype.aliasList.forEach(aliases => {
        let tempAliases = aliases;
        while (tempAliases.length < maxLen + 3) {
            tempAliases += ' ';
        }
        helpString += tempAliases;
        helpString += ('\t\t\t' + this.flags[aliases[0]][2] + '\n\n');
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
}

function fillForEveryArg(argList, map) {
    argList.forEach(arg => {
        fillMap(arg, map);
    });
}

function createFunction(args) {
    return () => {
        let arrayOfArgs = args;
        let goodBind = {};
        fillForEveryArg(arrayOfArgs, goodBind);
        return goodBind;
    };
}

function createHelp() {
    console.log(CommandHandler.prototype.provideHelp());
    process.exit();
}

CommandHandler.prototype.registerFlag(['-A', '--catenate', '--concatenate'], 'String', undefined, 'append bar files to an archive', 1);
CommandHandler.prototype.registerFlag(['-c', '--create'], 'String', createFunction(['-z', '-v', '-f', '-B', '-S']), 'create a new archive', 1);
CommandHandler.prototype.registerFlag(['-d', '--diff', '--compare'], 'String', undefined, 'find differences between archive and file system', 1);
CommandHandler.prototype.registerFlag(['--delete'], 'String', undefined, 'delete from the archive', 1);
CommandHandler.prototype.registerFlag(['-r', '--append'], 'String', createFunction(['-v', '-f', '-B']), 'append files to the end of an archive', 1);
CommandHandler.prototype.registerFlag(['-t', '--list'], 'String', createFunction(['-f', '-v', '-z', '-B']), 'list the contents of an archive', 0);
CommandHandler.prototype.registerFlag(['-u', '--update'], 'String', createFunction(['-f', '-v', '-B', '-S']), 'only append files newer than copy in archive', 1);
CommandHandler.prototype.registerFlag(['-x', '--extract', '--get'], 'String', createFunction(['-z', '-v', '-f', '-B', '-S']), 'extract files from an archive', 1);
CommandHandler.prototype.registerFlag(['-C', '--directory'], 'String', undefined, 'change to directory give as parameter', 1);
CommandHandler.prototype.registerFlag(['-f', '--file'], 'String', createFunction(['-z', '-x', '-v', '-B', '-S']), 'use archive file or device ARCHIVE', 1);
CommandHandler.prototype.registerFlag(['-j', '--bzip2'], 'boolean', undefined, 'filter the archive through bzip2', 0);
CommandHandler.prototype.registerFlag(['-J', '--xz'], 'boolean', undefined, 'filter the archive through xz', 0);
CommandHandler.prototype.registerFlag(['-p', '--preserve-permissions'], 'String', undefined, 'extract information about file permissions', 1);
CommandHandler.prototype.registerFlag(['-z', '--gzip'], 'boolean', createFunction(['-x', '-f', '-c', '-t', '-v', '-B', '-S']), 'filter the archive through gzip', 0);
CommandHandler.prototype.registerFlag(['-v'], 'boolean', createFunction(['-f', '-c', '-u', '-r', '-t', '-z', '-B', '-S']), 'display every file  name from data flux', 0);
CommandHandler.prototype.registerFlag(['-h'], 'boolean', createHelp, 'provide a list of commands and aliases and descriptions for each', 0);
CommandHandler.prototype.registerFlag(['-B', '--setBufferSize'], 'String', createFunction([]), 'allow user to set size of the buffer', 1);
CommandHandler.prototype.registerFlag(['-S', '--seed'], 'String', createFunction([]), 'allows user to encrypt the archive with the specified seed', 1);
module.exports = CommandHandler;
