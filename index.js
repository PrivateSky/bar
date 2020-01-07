
const ArchiveConfigurator = require("./lib/ArchiveConfigurator");
const createFolderBrickStorage = require("./lib/FolderBrickStorage").createFolderBrickStorage;
const createFileBrickStorage = require("./lib/FileBrickStorage").createFileBrickStorage;

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

module.exports.createBarMap = (header) => {
    const BarMap = require("./lib/FolderBarMap");
    return new BarMap(header);
};
module.exports.createFolderBrickStorage = createFolderBrickStorage;
module.exports.createFileBrickStorage = createFileBrickStorage;
