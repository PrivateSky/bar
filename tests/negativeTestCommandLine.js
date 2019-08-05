const assert = require("double-check").assert;
const CommandHandler = require('../lib/CommandHandler');

let errMessages = ["Can't form command without flags!","Order of flags is not right or flag is not well written!","Number of parameters is more than expected!"];
let commandLine = [['bar','barx','folderName'],['bar','barx','name.bar','folderName'],['bar','barx','-cxf','name.bar','folderName'],['bar','barx','-xt','name.bar'],['bar','barx','-cf'],['bar','barx','-c','--file=out.bar'],['bar','barx','--file=out.bar','-c'],['bar','barx','-ux','name.bar']];
assert.callback("negativeTestCommandLine",(callback)=>{
    try{
        new CommandHandler(commandLine[0]);
    }catch(err){
        assert.true(err.message === errMessages[0]);
    }
    try{
        new CommandHandler(commandLine[1]);
    }catch(err){
        assert.true(err.message === errMessages[0]);
    }
    try{
        new CommandHandler(commandLine[2]);
    }catch(err){
        assert.true(err.message === errMessages[1]);
    }
    try{
        new CommandHandler(commandLine[3]);
    }catch(err){
        assert.true(err.message === errMessages[1]);
    }
    try{
        new CommandHandler(commandLine[4]);
    }catch(err){
        assert.true(err.message === errMessages[2]);
    }

    try{
        new CommandHandler(commandLine[5]);
    }catch(err){
        assert.true(err.message === errMessages[2]);
    }

    try{
        new CommandHandler(commandLine[6]);
    }catch(err) {
        assert.true(err.message === errMessages[1]);
    }
    try{
        new CommandHandler(commandLine[7]);
    }catch(err){
        assert.true(err.message === errMessages[1]);
    }
    callback();
},1500);
