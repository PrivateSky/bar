const ArchiveConfigurator = require('./ArchiveConfigurator');
const LinkedList = require('./LinkedListUtils/LinkedList');
const CommandExecuter = require('./CommandExecuter');

function CommandHandler()
{
    const commands = {};
    const commandsCache = new LinkedList();

    function extractParameters(commandArr){
        let commandParameters = [];
        for(let index=2;index<commandArr.length;index++)
        {
            commandParameters.push(commandArr[index]);
        }
        return commandParameters;
    }

    this.addCommand = function(answer){
        let commandArr = answer.split(' ');
        let commandPrefixe = commandArr[0] + ' ' + commandArr[1];
        if(typeof commands[commandPrefixe] === "undefined")
            commands[commandPrefixe] = [];
        commands[commandPrefixe].push(extractParameters(commandArr));
        runCommand(commandPrefixe,commands[commandPrefixe].length-1);
    }

    function runCommand(commandPrefixe,commandIndex){
        commandsCache.insert([commandPrefixe,commandIndex]);
        CommandExecuter(commandPrefixe,commands[commandPrefixe][commandIndex]);
    }
}

module.exports = CommandHandler;