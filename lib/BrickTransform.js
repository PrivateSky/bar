const zlib = require("zlib");
const crypto = require("crypto");
const cryptoUtils = require("../utils/cryptoUtils");

function BrickTransform(config) {

    this.getTransform = () => {
        if (!config || (!config.getEncryptionAlgorithm() && !config.getCompressionAlgorithm())) {
            return;
        }
        const compress = getCompression(true);
        const encryptionObj = getEncryption();
        if (!compress) {
            return encryptionObj;
        }

        if (!encryptionObj) {
            return compress;
        }


        return {
            additionalTransformData: encryptionObj.additionalTransformData,
            transform(data) {
                return encryptionObj.transform(compress.transform(data));
            }
        };
    };

    this.getInverseTransform = (transformConfig) => {
        if (!config || (!config.getEncryptionAlgorithm() && !config.getCompressionAlgorithm())) {
            return;
        }
        const decompress = getCompression();
        const decryptTransform = getDecryption(transformConfig);
        if (!decompress) {
            return decryptTransform;
        }

        if (!decryptTransform) {
            return decompress;
        }

        return (data) => {
            return decompress(decryptTransform(data));
        };
    };

    this.applyTransform = (transform, data, additionalTransformData) => {
        let transformedData = transform(data);

        if (!additionalTransformData) {
            return transformedData;
        }

        if (additionalTransformData.salt) {
            transformedData = Buffer.concat([transformedData, additionalTransformData.salt]);
        }

        if (additionalTransformData.tag) {
            transformedData = Buffer.concat([transformedData, additionalTransformData.tag]);
        }

        return transformedData;
    };

    this.applyInverseTransform = (transformedData, additionalTransformData) => {
        let rawData;
        if (config.getEncryptionAlgorithm()) {
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
            const inverseTransform = this.getInverseTransform({key: additionalTransformData.key, salt, tag});
            rawData = inverseTransform(transformedData.slice(0, tagOffset - saltLength));
        } else if (config.getCompressionAlgorithm()) {
            const decompressTransform = this.getInverseTransform({});
            rawData = decompressTransform(transformedData);
        }

        return rawData;
    };

    this.setConfig = function (newConfig) {
        config = newConfig;
    };


    //---------------------------------------------- internal methods --------------------------------------------------

    function getCompression(isCompression) {
        const algorithm = config.getCompressionAlgorithm();
        switch (algorithm) {
            case "gzip":
                return __createCompress(zlib.gzipSync, zlib.gunzipSync, isCompression);
            case "br":
                return __createCompress(zlib.brotliCompressSync, zlib.brotliDecompressSync, isCompression);
            case "deflate":
                return __createCompress(zlib.deflateSync, zlib.inflateSync, isCompression);
            case "deflateRaw":
                return __createCompress(zlib.deflateRawSync, zlib.inflateRawSync, isCompression);
            default:
                return;
        }
    }

    function getEncryption() {
        const algorithm = config.getEncryptionAlgorithm();
        if (!algorithm) {
            return;
        }

        const kdOptions = config.getKdOptions();
        const encOptions = config.getEncryptionOptions();

        const keyLength = cryptoUtils.getKeyLength(algorithm);
        const key = crypto.randomBytes(keyLength);


        const ivSalt = crypto.randomBytes(keyLength);
        let salt = ivSalt;
        const iv = crypto.scryptSync(key, ivSalt, 16, kdOptions);
        const cipher = crypto.createCipheriv(algorithm, key, iv, encOptions);

        const encIsAuth = cryptoUtils.encryptionIsAuthenticated(algorithm);

        if (encIsAuth) {
            const aadSalt = crypto.randomBytes(keyLength);
            const aad = crypto.scryptSync(key, aadSalt, keyLength, kdOptions);
            salt = Buffer.concat([ivSalt, aadSalt]);
            cipher.setAAD(aad);
        }

        const ret = {
            additionalTransformData: {
                salt: salt,
                key: key,
            },
            transform(data) {
                const encData = Buffer.concat([cipher.update(data), cipher.final()]);
                if (encIsAuth) {
                    ret.additionalTransformData.tag = cipher.getAuthTag();
                }

                return encData;
            }
        };

        return ret;
    }

    function getDecryption(transformConfig) {
        const algorithm = config.getEncryptionAlgorithm();
        if (!algorithm) {
            return;
        }

        const kdOptions = config.getKdOptions();
        const encOptions = config.getEncryptionOptions();

        const keyLen = cryptoUtils.getKeyLength(algorithm);
        const ivSalt = transformConfig.salt.slice(0, keyLen);
        const iv = crypto.scryptSync(transformConfig.key, ivSalt, 16, kdOptions);
        const decipher = crypto.createDecipheriv(algorithm, transformConfig.key, iv, encOptions);

        if (cryptoUtils.encryptionIsAuthenticated(algorithm)) {
            const aadSalt = transformConfig.salt.slice(keyLen);
            const aad = crypto.scryptSync(transformConfig.key, aadSalt, keyLen, kdOptions);
            decipher.setAAD(aad);
            decipher.setAuthTag(transformConfig.tag);
        }

        return (data) => {
            return Buffer.concat([decipher.update(data), decipher.final()]);
        };
    }


    function __createCompress(compress, decompress, isCompression) {
        const options = config.getCompressionOptions();
        if (!isCompression) {
            return (data) => {
                return decompress(data, options);
            };
        }

        return {
            transform(data) {
                return compress(data, options);
            }

        }
    }

}

module.exports = BrickTransform;
