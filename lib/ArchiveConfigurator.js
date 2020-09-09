const storageProviders = {};
const fsAdapters = {};

function ArchiveConfigurator() {
    const config = {};
    let cache;
    let keySSI;

    this.setBufferSize = (bufferSize) => {
        if (bufferSize < 65535) {
            throw Error(`Brick size should be equal to or greater than 65535. The provided brick size is ${bufferSize}`);
        }
        config.bufferSize = bufferSize;
    };

    this.setBootstrapingService = (service) => {
        config.bootstrapingService = service;
    };

    this.getBootstrapingService = () => {
        return config.bootstrapingService;
    }

    this.setKeySSI = (keySSI) => {
        config.keySSI = keySSI;
    };

    this.getKeySSI = (keySSIType, callback) => {
        if (typeof keySSIType === "undefined") {
            return callback(undefined, config.keySSI);
        }
        if (typeof keySSIType === "function") {
            callback = keySSIType;
            return callback(undefined, config.keySSI);
        }

        config.keySSI.getRelatedType(keySSIType, callback);
    }

    this.getFavouriteEndpoint = () => {
        if (!config.keySSI) {
            return;
        }
        keySSI = config.keySSI;
        return keySSI.getHint();
    }

    this.getDLDomain = () => {
        if (!config.keySSI) {
            return;
        }

        keySSI = config.keySSI;
        return keySSI.getDLDomain();
    }

    this.getBufferSize = () => {
        return config.bufferSize;
    };

    this.setIsEncrypted = (flag) => {
        config.isEncrypted = flag;
    };

    this.getIsEncrypted = () => {
        return config.isEncrypted;
    };

    this.setFsAdapter = (fsAdapterName, ...args) => {
        config.fsAdapter = fsAdapters[fsAdapterName](...args);
    };

    this.getFsAdapter = () => {
        return config.fsAdapter;
    };

    this.getBrickMapId = () => {
        if (config.keySSI) {
            return config.keySSI.getAnchorId();
        }
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

    this.setBrickMapStrategy = (strategy) => {
        config.brickMapStrategy = strategy;
    }

    this.getBrickMapStrategy = () => {
        return config.brickMapStrategy;
    }

    this.setValidationRules = (rules) => {
        config.validationRules = rules;
    }

    this.getValidationRules = () => {
        return config.validationRules;
    }

    this.getKey = (key) => {
        if (config.keySSI) {
            return config.keySSI.getKeyHash();
        }

        // @TODO: obsolete
        return this.getSeedKey();
    };

    this.getMapEncryptionKey = () => {
        if (!config.encryption) {
            return;
        }
        if (config.keySSI) {
            return config.keySSI.getEncryptionKey();
        }
    };


    this.setCache = (cacheInstance) => {
        cache = cacheInstance;
    };

    this.getCache = () => {
        return cache;
    };
}

// @TODO: obsolete
ArchiveConfigurator.prototype.registerStorageProvider = (storageProviderName, factory) => {
    storageProviders[storageProviderName] = factory;
};

ArchiveConfigurator.prototype.registerFsAdapter = (fsAdapterName, factory) => {
    fsAdapters[fsAdapterName] = factory;
};

module.exports = ArchiveConfigurator;
