
const ArchiveConfigurator = require("./lib/ArchiveConfigurator");
const createFolderBrickStorage = require("./lib/obsolete/FolderBrickStorage").createFolderBrickStorage;
const createFileBrickStorage = require("./lib/obsolete/FileBrickStorage").createFileBrickStorage;

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
