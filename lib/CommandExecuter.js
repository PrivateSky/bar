const ArchiveConfigurator = require('./ArchiveConfigurator');
const FileBrickStorage = require('./FileBrickStorage').createFileBrickStorage;
const FolderBrickStorage = require('./FolderBrickStorage').createFolderBrickStorage;
const diskAdapter = require('./FsBarWorker').createFsBarWorker();
const Archive = require('./Archive');

function commandExecuter(commandPrefixe,commandParameters)
{
    let archiveConfigurator;
    if(commandPrefixe === 'bar -config'){

    }
    if(typeof archiveConfigurator === "undefined"){

    }
    if(commandPrefixe === 'bar -cf'){

    }
    else if(commandPrefixe === 'bar -x'){

    }
    else if(commandPrefixe === 'bar -t'){

    }
    else if(commandPrefixe === 'bar -czf'){

    }
    else if(commandPrefixe === 'bar -help'){
        if(commandParameters.length === 0) {
            executeHelp();
        }
        else{
            executeHelpExample(commandParameters);
        }
    }

    function standardConfig(archiveConfigurator,barName,folderName){
        ArchiveConfigurator.prototype.registerStorageProvider("FolderBrickStorage",FolderBrickStorage,folderName);
        ArchiveConfigurator.prototype.registerDiskAdapter("diskAdapter",diskAdapter);
        archiveConfigurator = new ArchiveConfigurator();
        archiveConfigurator.setStorageProvider("FolderBrickStorage",barName);
        archiveConfigurator.setBufferSize(256);
    }

    function executeConfig(archiveConfigurator,index)
    {

    }

    function executeHelp()
    {
        console.log('============Commands that you cand use==================\n');
        console.log('--> -c to create');
        console.log('--> -cf to create and specify a name for you bar archive');
        console.log('--> -x is to specify where to extract content from bar archive');
        console.log('--> -t is to list all the files from your bar archive');
        console.log('--> -czf is to specify that each brick will be compressed via lzip');
        console.log('--> -config is to specify a StorageProvider and standard Brick size for current archive');
        console.log('--> you can use --key key at the end of a -c type command, to specify that you want to encrypt data');
        console.log('--> you can use bar -help example -c/-cf/-x/-t/-czf/--key to receive an example of command usage');
        console.log('');
        console.log('========================================================');
    }

    function executeHelpExample(commandParameters){
        if(commandParameters[0] === 'example'){
            if(commandParameters[1] === '-c'){
                console.log('--> bar -c folderName');
            }
            else if(commandParameters[1] === '-cf'){
                console.log('--> bar -cf name.bar folderName');
            }
            else if(commandParameters[1] === '-x'){
                console.log('--> bar -x name.bar folderName');
            }
            else if(commandParameters[1] === '-t'){
                console.log('--> bar -t name.bar');
            }
            else if(commandParameters[1] === '-czf'){
                console.log('--> bar -czf name.bar folderName');
            }
            else if(commandParameters[1] === '-config'){
                console.log('--> bar -config StorageProvider BrickSize');
            }
            else if(commandParameters[1] === '--key'){
                console.log('bar -czf/-cf name.bar folderName --key someKey(numeric/string/binary)');
            }
        }
    }


    function executeCF(barName,folderName)
    {

    }

    function executeX(barName,folderName)
    {

    }

    function executeCZF(barName,folderName,key)
    {

    }

    function executeT(barName)
    {

    }


}

module.exports = commandExecuter;