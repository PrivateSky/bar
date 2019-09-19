const storageProviders = {};
const fsAdapters = {};

function ArchiveConfigurator(config) {
    config = config || {};

    this.setBufferSize = function (bufferSize) {
        config.bufferSize = bufferSize;
    };

    this.getBufferSize = function () {
        return config.bufferSize;
    };

    this.setStorageProvider = function (storageProviderName, ...args) {
        if (!storageProviders[storageProviderName]) {
            throw new Error(storageProviderName + " is not registered! Did you forget to register it?");
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

    this.setEncryptionAlgorithm = function (algorithm) {
        if (!config.encryption) {
            config.encryption = {};
        }

        config.encryption.algorithm = algorithm;
    };

    this.getEncryptionAlgorithm = function () {
        if (!config.encryption) {
            return;
        }
        return config.encryption.algorithm;
    };

    this.setEncryptionOptions = function (options) {
        if (!config.encryption) {
            config.encryption = {};
        }

        config.encryption.encOptions = options;
    };

    this.getEncryptionOptions = function () {
        if (!config.encryption) {
            return;
        }
        return config.encryption.encOptions;
    };

    this.setKdOptions = function (kdOptions) {
        if (!config.encryption) {
            config.encryption = {};
        }

        config.encryption.kdOptions = kdOptions;
    };

    this.getKdOptions = function () {
        if (!config.encryption) {
            return;
        }
        return config.encryption.kdOptions;
    };

    this.setCompressionAlgorithm = function (algorithm) {
        if (!config.compression) {
            config.compression = {};
        }

        config.compression.algorithm = algorithm;
    };

    this.getCompressionAlgorithm = function () {
        if (!config.compression) {
            return;
        }

        return config.compression.algorithm;

    };

    this.setCompressionOptions = function (options) {
        if (!config.compression) {
            config.compression = {};
        }

        config.compression.options = options;
    };

    this.getCompressionOptions = function () {
        if (!config.compression) {
            return;
        }
        return config.compression.options;
    };

    this.setAuthTagLength = function (authTagLength = 16) {
        const encOptions = this.getEncryptionOptions();
        if (!encOptions) {
            config.encryption.encOptions = {};
        }

        config.encryption.encOptions.authTagLength = authTagLength;
    };

    this.getAuthTagLength = function () {
        if (!config.encryption || !config.encryption.encOptions) {
            return;
        }

        return config.encryption.encOptions.authTagLength;
    };
}

ArchiveConfigurator.prototype.registerStorageProvider = function (storageProviderName, factory) {
    storageProviders[storageProviderName] = factory;
};

ArchiveConfigurator.prototype.registerFsAdapter = function (fsAdapterName, factory) {
    fsAdapters[fsAdapterName] = factory;
};

module.exports = ArchiveConfigurator;