process.env.NO_LOGS = "true";
const CommandHandler = require('./CommandHandler');
const Archive = require('./Archive');
const fs = require('fs');

function CommandExecuter(commandObject) {
    if (['czf', 'cf', 'cvf', 'cfK', 'cfK', 'czfK', 'cvfK'].includes(commandObject.getCommand())) {
        createArchive(commandObject.getStorageProvider(), commandObject.getParameters(), commandObject.getConfigurator());
    } else if (['x', 'xf', 'xzf', 'xvf', 'xK', 'xfK', 'xzfK', 'xvfK'].includes(commandObject.getCommand())) {
        extractArchive(commandObject.getStorageProvider(), commandObject.getParameters(), commandObject.getConfigurator());
    }
}

let comm;
try {
    comm = new CommandHandler(process.argv);
} catch (err) {
    console.log(err.message);
}

function additionalConfigSet(config) {
    let actualCommand = comm.getCommand();
    for (let i = 0; i < actualCommand.length; i++) {
        if (actualCommand[i] === 'z') {
            config.setCompressionAlgorithm('gzip');
        }
    }

    // if (comm.getEncryptionKey()) {
    //     config.setEncryptionAlgorithm("aes-256-gcm");
    // }
}

function createArchive(storageProvider, parameters, config) {
    additionalConfigSet(config);
    let archive = new Archive(config);
    if (fs.statSync(parameters[1]).isFile() === true) {
        archive.addFile(parameters[1], (err) => {
            if (err) {
                throw err;
            }

        });
    } else {
        archive.addFolder(parameters[1], (err, mapDigest) => {
            if (typeof mapDigest !== "undefined") {
                console.log(mapDigest);
            }
            if (err) {
                console.log(err.message);
            }
        });
    }
}

function extractArchive(storageProvider, parameters, config) {
    additionalConfigSet(config);
    // config.setMapDigest(Buffer.from(parameters[1], 'hex'));
    if (storageProvider === "EDFSBrickStorage" || storageProvider === "FolderBrickStorage") {
        if (!parameters[2]) {
            console.log("The bar map digest was not provided.");
            return;
        }

        config.setMapDigest(parameters[2]);
    }
    let archive = new Archive(config);

    archive.extractFolder(parameters[1], (err) => {
        if (err) {
            throw err;
        }

        console.log(`The archive ${parameters[0]} was successfully extracted in ${parameters[1]}`);
    });

}

if (typeof comm !== "undefined") {
    CommandExecuter(comm);
}