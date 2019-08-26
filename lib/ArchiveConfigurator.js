const storageProviders = {};
const diskAdapters = {};

function ArchiveConfigurator() {
    const config = {};
    let isZip = false;
    let key;
    let crptAlg;
    let isVerbose = false;

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

    this.setVerbose = function(){
        isVerbose = true;
    };

    this.getVerbose = function(){
        return isVerbose;
    };

    this.setZipFlag = function(){
        isZip = true;
    };

    this.getZipFlag = function(){
        return isZip;
    };

    this.setCrypto = function(cryptoKey,cryptoAlg){
        key = cryptoKey;
        crptAlg = cryptoAlg;
    };

    this.getKey = function(){
        return key;
    };

    this.getUsedAlgorithm = function(){
        return crptAlg;
    };
}

ArchiveConfigurator.prototype.registerStorageProvider = function (storageProviderName, factory) {
    storageProviders[storageProviderName] = factory;
};

ArchiveConfigurator.prototype.registerDiskAdapter = function (diskAdapterName, factory) {
    diskAdapters[diskAdapterName] = factory;
};

module.exports = ArchiveConfigurator;