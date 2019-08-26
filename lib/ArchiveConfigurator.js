const storageProviders = {};
const diskAdapters = {};

function ArchiveConfigurator() {
    const config = {};

    this.setBufferSize = function (bufferSize) {
        config.bufferSize = bufferSize;
    };

    this.getBufferSize = function () {
        return config.bufferSize;
    };

    this.setStorageProvider = function (storageProviderName, ...args) {
        if(!storageProviders[storageProviderName]){
            throw new Error(storageProviderName + " is not registered! Did you forgot to register it?");
        }
        config.storageProvider = storageProviders[storageProviderName](...args);
    };

    this.getStorageProvider = function () {
        return config.storageProvider;
    };

    this.setDiskAdapter = function (diskAdapterName, ...args) {
        config.diskAdapter = diskAdapters[diskAdapterName](...args);
    };

    this.getDiskAdapter = function () {
        return config.diskAdapter;
    };
}

ArchiveConfigurator.prototype.registerStorageProvider = function (storageProviderName, factory) {
    storageProviders[storageProviderName] = factory;
};

ArchiveConfigurator.prototype.registerDiskAdapter = function (diskAdapterName, factory) {
    diskAdapters[diskAdapterName] = factory;
};

module.exports = ArchiveConfigurator;