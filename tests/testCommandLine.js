const assert = require("double-check").assert;
const CommandHandler = require('../lib/CommandHandler');

let commandLine = [['bar', '-cf', 'name.bar', 'folderName'], ['bar', '-c', '--file=name.bar', "folderName"], ['bar', '-tf', 'name.bar'], ['bar', '-t', '--file=name.bar'], ['bar', '-czf', 'name.bar', 'folderName']];
assert.callback("testCommandLine",(callback)=>{
    let commandHandler = new CommandHandler(commandLine[0]);
    let parameters = commandHandler.getParameters();
    let flags = commandHandler.getFlags();
    let command = commandHandler.getCommand();

    assert.true(parameters[0] === 'name.bar' && parameters[1] === 'folderName', "Wrong parameters");
    assert.true(flags[0].toString() === '-cf', "Wrong flag");
    assert.true(command === 'cf', "Wrong command");

    commandHandler = new CommandHandler(commandLine[1]);
    parameters = commandHandler.getParameters();
    flags = commandHandler.getFlags();
    command = commandHandler.getCommand();

    assert.true(parameters[0] === 'name.bar', "Wrong parameters");
    assert.true(flags[0]=== '-c', "Wrong flags");
    assert.true(command === 'cf', "Wrong command");

    commandHandler = new CommandHandler(commandLine[2]);
    parameters = commandHandler.getParameters();
    flags = commandHandler.getFlags();
    command = commandHandler.getCommand();

    assert.true(parameters[0] === 'name.bar');
    assert.true(flags[0] === '-tf', "Wrong flags");
    assert.true(command === 'tf', "Wrong command");

    commandHandler = new CommandHandler(commandLine[3]);
    parameters = commandHandler.getParameters();
    flags = commandHandler.getFlags();
    command = commandHandler.getCommand();

    assert.true(parameters[0] === 'name.bar');
    assert.true(flags[0] === '-t' && flags[1] === '--file', "Wrong flags");
    assert.true(command === 'tf', "Wrong command");

    commandHandler = new CommandHandler(commandLine[4]);
    parameters = commandHandler.getParameters();
    flags = commandHandler.getFlags();
    command = commandHandler.getCommand();

    assert.true(parameters[0] === 'name.bar' && parameters[1] === 'folderName', "Wrong parameters");
    assert.true(flags[0] === '-czf', "Wrong flags");
    assert.true(command === 'czf', "Wrong command");

    callback();
},1500);
