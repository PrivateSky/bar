const crypto = require('crypto');
const BrickTransform = require("./BrickTransform");
const cryptoUtils = require("../utils/cryptoUtils");

function Brick(config) {
    let rawData;
    let transformedData;
    let hash;
    let encryptionKey;
    let transform = new BrickTransform(config);

    this.setConfig = function (newConfig) {
        config = newConfig;
        transform.setConfig(newConfig);
    };

    this.getHash = function () {
        if (!hash) {
            const h = crypto.createHash('sha256');
            h.update(this.getTransformedData());
            hash = h.digest('hex');
        }
        return hash;
    };

    this.setRawData = function (data) {
        rawData = data;
        transformData();
    };

    this.getRawData = function (key) {
        if (rawData) {
            return rawData;
        }

        if (transformedData) {
            if (!config.getEncryptionAlgorithm() && !config.getCompressionAlgorithm()) {
                rawData = transformedData;
                return rawData;
            }


            if (config.getEncryptionAlgorithm() && !key) {
                throw new Error("Data could not be decrypted.");
            }

            if(config.getEncryptionAlgorithm()) {
                let authTagLength = 0;
                let saltLength = 32;
                if (cryptoUtils.encryptionIsAuthenticated(config.getEncryptionAlgorithm())) {
                    saltLength = 64;
                    if (!config.getEncryptionOptions() || !config.getAuthTagLength()) {
                        authTagLength = 16;
                    } else {
                        authTagLength = config.getAuthTagLength();
                    }
                }

                const tagOffset = transformedData.length - authTagLength;
                const tag = transformedData.slice(tagOffset, transformedData.length);
                const salt = transformedData.slice(tagOffset - saltLength, tagOffset);
                const decryptTransform = transform.getReverseTransform({key, salt, tag});
                rawData = decryptTransform(transformedData.slice(0, tagOffset - saltLength));
            }else if(config.getCompressionAlgorithm()) {
                const decompressTransform = transform.getReverseTransform({});
                rawData = decompressTransform(transformedData);
            }

            return rawData;
        }

        throw new Error("The brick does not contain any data.");
    };

    this.setTransformedData = function (data) {
        transformedData = data;
    };

    this.getTransformedData = function () {
        if (transformedData) {
            return transformedData;
        }

        if (rawData) {
            return rawData;
        }

        throw new Error("The brick does not contain any data.");
    };

    this.getEncryptionKey = function () {
        if (!config.getEncryptionAlgorithm()) {
            return;
        }

        if (encryptionKey) {
            return encryptionKey;

        }
    };

    this.getRawSize = function () {
        return rawData.length;
    };

    this.getTransformedSize = function () {

        if (!transformedData) {
            return rawData.length;
        }

        return transformedData.length;
    };

    function transformData() {
        const encryptTransform = transform.getTransform();
        if (!encryptTransform) {
            transformedData = rawData;
            return rawData;
        }
        encryptionKey = encryptTransform.key;

        const transformOperation = encryptTransform.transform(rawData);
        transformedData = transformOperation.transformedData;

        if (encryptTransform.salt) {
            transformedData = Buffer.concat([transformedData, encryptTransform.salt]);
        }

        if (transformOperation.tag) {
            transformedData = Buffer.concat([transformedData, transformOperation.tag])
        }
    }

}

module.exports = Brick;
