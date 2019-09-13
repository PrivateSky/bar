const zlib = require("zlib");
const crypto = require("crypto");
const cryptoUtils = require("../utils/cryptoUtils");

function BrickTransform(config) {
    this.getTransform = function () {
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
            key: encryptionObj.key,
            salt: encryptionObj.salt,
            transform(data) {
                return encryptionObj.transform(compress.transform(data).transformedData);
            }
        };
    };

    this.getReverseTransform = function ({key, salt, tag}) {
        if (!config || (!config.getEncryptionAlgorithm() && !config.getCompressionAlgorithm())) {
            return;
        }
        const decompress = getCompression();
        const decryptTransform = getDecryption({key, salt, tag});
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

        return {
            salt: salt,
            key: key,
            transform(data) {
                const encData = Buffer.concat([cipher.update(data), cipher.final()]);
                const retObj = {
                    transformedData: encData
                };
                if (encIsAuth) {
                    retObj.tag = cipher.getAuthTag();
                }

                return retObj;
            }
        };

    }

    function getDecryption({key, salt, tag}) {
        const algorithm = config.getEncryptionAlgorithm();
        if (!algorithm) {
            return;
        }

        const kdOptions = config.getKdOptions();
        const encOptions = config.getEncryptionOptions();

        const keyLen = cryptoUtils.getKeyLength(algorithm);
        const ivSalt = salt.slice(0, keyLen);
        const iv = crypto.scryptSync(key, ivSalt, 16, kdOptions);
        const decipher = crypto.createDecipheriv(algorithm, key, iv, encOptions);

        if (cryptoUtils.encryptionIsAuthenticated(algorithm)) {
            const aadSalt = salt.slice(keyLen);
            const aad = crypto.scryptSync(key, aadSalt, keyLen, kdOptions);
            decipher.setAAD(aad);
            decipher.setAuthTag(tag);
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
                return {
                    transformedData: compress(data, options)
                };
            }
        }
    }

}

module.exports = BrickTransform;
