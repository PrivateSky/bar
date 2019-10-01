const createFsAdapter = require("./lib/FsAdapter").createFsAdapter;

const ArchiveConfigurator = require("./lib/ArchiveConfigurator");
const createFolderBrickStorage = require("./lib/FolderBrickStorage").createFolderBrickStorage;
const createFileBrickStorage = require("./lib/FileBrickStorage").createFileBrickStorage;

ArchiveConfigurator.prototype.registerStorageProvider("FolderBrickStorage", createFolderBrickStorage);
ArchiveConfigurator.prototype.registerStorageProvider("FileBrickStorage", createFileBrickStorage);
ArchiveConfigurator.prototype.registerFsAdapter("FsAdapter", createFsAdapter);

module.exports.ArchiveConfigurator = ArchiveConfigurator;
module.exports.Brick = require("./lib/Brick");
module.exports.Archive = require("./lib/Archive");
module.exports.FolderBarMap = require("./lib/FolderBarMap");
module.exports.createFolderBrickStorage = createFolderBrickStorage;
module.exports.createFileBrickStorage = createFileBrickStorage;
module.exports.createFsAdapter = createFsAdapter;
