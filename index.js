
const ArchiveConfigurator = require("./lib/ArchiveConfigurator");
const createFolderBrickStorage = require("./lib/obsolete/FolderBrickStorage").createFolderBrickStorage;
const createFileBrickStorage = require("./lib/obsolete/FileBrickStorage").createFileBrickStorage;
const BrickStorageService = require('./lib/BrickStorageService').Service;
const BrickMapController = require('./lib/BrickMapController');

ArchiveConfigurator.prototype.registerStorageProvider("FolderBrickStorage", createFolderBrickStorage);
ArchiveConfigurator.prototype.registerStorageProvider("FileBrickStorage", createFileBrickStorage);

module.exports.ArchiveConfigurator = ArchiveConfigurator;
module.exports.createBrick = (config) => {
    const Brick = require("./lib/Brick");
    return new Brick(config);
};

module.exports.createArchive = (archiveConfigurator) => {
    const Archive = require("./lib/Archive");
    return new Archive(archiveConfigurator);
};
module.exports.createArchiveConfigurator = () => {
    return new ArchiveConfigurator();
};

module.exports.createBrickMap = (header) => {
    const BrickMap = require("./lib/BrickMap");
    return new BrickMap(header);
};

module.exports.isArchive = (archive) => {
    const Archive = require('./lib/Archive');
    return archive instanceof Archive;
}

module.exports.BrickMapDiff = require('./lib/BrickMapDiff');
module.exports.BrickMapStrategyFactory = require('./lib/BrickMapStrategy');
module.exports.BrickMapStrategyMixin = require('./lib/BrickMapStrategy/BrickMapStrategyMixin');
module.exports.createFolderBrickStorage = createFolderBrickStorage;
module.exports.createFileBrickStorage = createFileBrickStorage;

module.exports.createBrickStorageService = (archiveConfigurator, keySSI) => {
    const brickStorageService = new BrickStorageService({
        cache: archiveConfigurator.getCache(),
        bufferSize: archiveConfigurator.getBufferSize(),
        keySSI,

        brickFactoryFunction: (encrypt) => {
            const Brick = require("./lib/Brick");
            encrypt = (typeof encrypt === 'undefined') ? true : !!encrypt;
            // Strip the encryption key from the SeedSSI
            return new Brick({templateKeySSI: keySSI, encrypt});
        },

        brickDataExtractorCallback: (brickMeta, brick, callback) => {
            brick.setTemplateKeySSI(keySSI);

            function extractData() {
                const brickEncryptionKeySSI = brickMapController.getBrickEncryptionKeySSI(brickMeta);
                brick.setKeySSI(brickEncryptionKeySSI);
                brick.getRawData(callback);
            }

            if (refreshInProgress) {
                return waitIfDSUIsRefreshing(() => {
                    extractData();
                })
            }
            extractData();
        },

        fsAdapter: archiveConfigurator.getFsAdapter()
    });
    const brickMapController = new BrickMapController({
        config: archiveConfigurator,
        brickStorageService,
        keySSI
    });

    return brickStorageService;
};