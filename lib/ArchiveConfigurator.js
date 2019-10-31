const storageProviders = {};
const fsAdapters = {};
const crypto = require("crypto");
const Seed = require("./Seed");

function ArchiveConfigurator() {
    const config = {};

    this.setBufferSize = (bufferSize) => {
        config.bufferSize = bufferSize;
    };

    this.getBufferSize = () => {
        return config.bufferSize;
    };

    this.setStorageProvider = (storageProviderName, ...args) => {
        if (!storageProviders[storageProviderName]) {
            throw new Error(storageProviderName + " is not registered! Did you forget to register it?");
        }
        config.storageProvider = storageProviders[storageProviderName](...args);
    };

    this.getStorageProvider = () => {
        return config.storageProvider;
    };

    this.setFsAdapter = (fsAdapterName, ...args) => {
        config.fsAdapter = fsAdapters[fsAdapterName](...args);
    };

    this.getFsAdapter = () => {
        return config.fsAdapter;
    };

    this.setMapDigest = (mapDigest) => {
        config.mapDigest = mapDigest;
    };

    this.getMapDigest = () => {
        return config.mapDigest;
    };

    this.setEncryptionAlgorithm = (algorithm) => {
        if (!config.encryption) {
            config.encryption = {};
        }

        config.encryption.algorithm = algorithm;
    };

    this.getEncryptionAlgorithm = () => {
        if (!config.encryption) {
            return;
        }
        return config.encryption.algorithm;
    };

    this.setEncryptionOptions = (options) => {
        if (!config.encryption) {
            config.encryption = {};
        }

        config.encryption.encOptions = options;
    };

    this.getEncryptionOptions = () => {
        if (!config.encryption) {
            return;
        }
        return config.encryption.encOptions;
    };

    this.setCompressionAlgorithm = (algorithm) => {
        if (!config.compression) {
            config.compression = {};
        }

        config.compression.algorithm = algorithm;
    };

    this.getCompressionAlgorithm = () => {
        if (!config.compression) {
            return;
        }

        return config.compression.algorithm;

    };

    this.setCompressionOptions = (options) => {
        if (!config.compression) {
            config.compression = {};
        }

        config.compression.options = options;
    };

    this.getCompressionOptions = () => {
        if (!config.compression) {
            return;
        }
        return config.compression.options;
    };

    this.setAuthTagLength = (authTagLength = 16) => {
        const encOptions = this.getEncryptionOptions();
        if (!encOptions) {
            config.encryption.encOptions = {};
        }

        config.encryption.encOptions.authTagLength = authTagLength;
    };

    this.getAuthTagLength = () => {
        if (!config.encryption || !config.encryption.encOptions) {
            return;
        }

        return config.encryption.encOptions.authTagLength;
    };

    this.setNetworkId = (networkId) => {
        config.networkId = networkId;
    };

    this.getSeed = () => {
        if (!config.seed && config.encryption) {
            config.seed = new Seed(undefined, config.networkId);
        }

        if (config.seed) {
            return config.seed.getRandom();
        }
    };

    this.getLSeed = () => {
        if (!config.seed) {
            return;
        }

        return config.seed.getLSeed();
    }
}

ArchiveConfigurator.prototype.registerStorageProvider = (storageProviderName, factory) => {
    storageProviders[storageProviderName] = factory;
};

ArchiveConfigurator.prototype.registerFsAdapter = (fsAdapterName, factory) => {
    fsAdapters[fsAdapterName] = factory;
};

module.exports = ArchiveConfigurator;