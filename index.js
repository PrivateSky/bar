module.exports.Brick = require("./lib/Brick");
module.exports.Archive = require("./lib/Archive");
module.exports.FolderBarMap = require("./lib/FolderBarMap");
const createFsBarWorker = require("./lib/FsAdapter").createFsAdapter;
module.exports.createFsBarWorker = createFsBarWorker;
const ArchiveConfigurator = require("./lib/ArchiveConfigurator");
const createFolderBrickStorage = require("./lib/FolderBrickStorage").createFolderBrickStorage;
const createFileBrickStorage = require("./lib/FileBrickStorage").createFileBrickStorage;
ArchiveConfigurator.prototype.registerStorageProvider("FolderBrickStorage", createFolderBrickStorage);
ArchiveConfigurator.prototype.registerStorageProvider("FileBrickStorage", createFileBrickStorage);
ArchiveConfigurator.prototype.registerFsAdapter("FsAdapter", createFsBarWorker);
module.exports.ArchiveConfigurator = ArchiveConfigurator;

