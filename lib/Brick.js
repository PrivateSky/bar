const crypto = require('crypto');
const BrickTransform = require("./BrickTransform");

function Brick(config) {
    let rawData;
    let transformedData;
    let hash;
    let encryptionKey;
    let transform = new BrickTransform(config);

    this.setConfig = function (newConfig) {
        config = newConfig;
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
    };

    this.getRawData = function (key) {
        if (rawData) {
            return rawData;
        }

        if (transformedData) {
            if (!config.encryption && !config.compression) {
                rawData = transformedData;
                return rawData;
            }

            if (!key) {
                throw new Error("Data could not be decrypted.");
            }

            let authTagLength;
            if (!config.encryption.encOptions || config.encryption.encOptions.authTagLength) {
                authTagLength = 16;
            } else {
                authTagLength = config.encryption.encOptions.authTagLength;
            }

            const tagOffset = transformedData.length - authTagLength;
            const tag = transformedData.slice(-authTagLength);
            const salt = transformedData.slice(tagOffset - 64, tagOffset);
            const decryptTransform = transform.getReverseTransform({key, salt, tag});
            rawData = decryptTransform(transformedData.slice(0, tagOffset - 64));

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
            const encryptTransform = transform.getTransform();
            if (!encryptTransform) {
                transformedData = rawData;
                return rawData;
            }
            encryptionKey = encryptTransform.key;

            const transformOperation = encryptTransform.transform(rawData);
            transformedData = transformOperation.encryptedData;
            transformedData = Buffer.concat([transformedData, encryptTransform.salt, transformOperation.tag]);

            return transformedData;
        }

        throw new Error("The brick does not contain any data.");
    };

    this.getEncryptionKey = function () {
        return encryptionKey;
    };

    this.getRawSize = function () {
        return rawData.length;
    };

    this.getTransformedSize = function () {
        return transformedData.length;
    };
}

module.exports = Brick;
