const storageProviders = {};
const fsAdapters = {};
const crypto = require("crypto");

function ArchiveConfigurator() {
    const config = {};
    let lseed;

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

    this.setMapEncryptionKey = (encryptionKey) => {
        config.mapEncryptionKey = encryptionKey;
    };

    this.getMapEncryptionKey = () => {
        return config.mapEncryptionKey;
    };

    this.setSeed = (seed) => {
        config.seed = seed;
        this.setMapEncryptionKey(seed);
    };

    this.getSeed = () => {
        return config.seed;
    };

    this.getLSeed = function () {
        if (!config.seed) {
            return;
        }

        if (!lseed) {
            lseed = crypto.createHash("sha256").update(config.seed).digest("hex");
        }

        return lseed;
    }
}

ArchiveConfigurator.prototype.registerStorageProvider = function (storageProviderName, factory) {
    storageProviders[storageProviderName] = factory;
};

ArchiveConfigurator.prototype.registerFsAdapter = function (fsAdapterName, factory) {
    fsAdapters[fsAdapterName] = factory;
};

module.exports = ArchiveConfigurator;