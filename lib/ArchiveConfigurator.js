const storageProviders = {};
const fsAdapters = {};

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

    this.setFsAdapter = function (fsAdapterName, ...args) {
        config.fsAdapter = fsAdapters[fsAdapterName](...args);
    };

    this.getFsAdapter = function () {
        return config.fsAdapter;
    };
}

ArchiveConfigurator.prototype.registerStorageProvider = function (storageProviderName, factory) {
    storageProviders[storageProviderName] = factory;
};

ArchiveConfigurator.prototype.registerFsAdapter = function (fsAdapterName, factory) {
    fsAdapters[fsAdapterName] = factory;
};

module.exports = ArchiveConfigurator;