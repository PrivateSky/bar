const assert = require("double-check").assert;
const CommandHandler = require('../lib/CommandHandler');

let commandLine = [['bar','barx','-cf','name.bar','folderName'],['bar','barx','-x','--file=name.bar'],['bar','barx','-tf','name.bar'],['bar','barx','-czf','name.bar','folderName'],['bar','barx','-cxf','a','b']];
assert.callback("testCommandLine",(callback)=>{
    let commandHandler = new CommandHandler(commandLine[0]);
    let parameters = commandHandler.getParameters();
    let flags = commandHandler.getFlags();
    assert.true(parameters.length === 2 && flags[0].toString() === '-cf' && parameters[0].toString() === 'name.bar' && parameters[1].toString() === 'folderName' && flags.length === 1);
    commandHandler = new CommandHandler(commandLine[1]);
    parameters = commandHandler.getParameters();
    flags = commandHandler.getFlags();
    assert.true(parameters.length === 1 && flags.length === 2 && flags[0].toString() === '-x' && flags[1].toString() === '--file' && parameters[0].toString() === 'name.bar');
    commandHandler = new CommandHandler(commandLine[2]);
    parameters = commandHandler.getParameters();
    flags = commandHandler.getFlags();
    assert.true(parameters.length === 1 && flags.length === 1 && flags[0].toString() === '-tf' && parameters[0].toString() === 'name.bar');
    commandHandler = new CommandHandler(commandLine[3]);
    parameters = commandHandler.getParameters();
    flags = commandHandler.getFlags();
    assert.true(parameters.length === 2 && flags.length === 1 && flags[0].toString() === '-czf' && parameters[0].toString() === 'name.bar' && parameters[1].toString() === 'folderName');
    commandHandler = new CommandHandler(commandLine[4]);
    parameters = commandHandler.getParameters();
    flags = commandHandler.getFlags();
    assert.true(typeof parameters === "undefined" && typeof flags === "undefined");
    callback();
},1500);
