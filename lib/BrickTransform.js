const zlib = require("zlib");
const crypto = require("crypto");

function BrickTransform(config) {
    const keySizes = [128, 192, 256];
    const authenticationModes = ["ocb", "ccm", "gcm"];


    this.getTransform = function () {
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
            transform: (data) => {
                return encryptionObj.transform(compress(data));
            }
        };
    };

    this.getReverseTransform = function (transformParameters) {
        const decompress = getCompression();
        const decryptTransform = getDecryption(transformParameters);
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

        const keyLength = __getKeyLength(algorithm);
        const key = crypto.randomBytes(keyLength);


        const ivSalt = crypto.randomBytes(keyLength);
        let salt = ivSalt;
        const iv = crypto.scryptSync(key, ivSalt, 12, kdOptions);
        const cipher = crypto.createCipheriv(algorithm, key, iv, encOptions);

        if (__encryptionIsAuthenticated(algorithm)) {
            const aadSalt = crypto.randomBytes(keyLength);
            const aad = crypto.scryptSync(key, aadSalt, keyLength, kdOptions);
            salt = Buffer.concat([ivSalt, aadSalt]);
            cipher.setAAD(aad);
        }

        return {
            salt: salt,
            key: key,
            transform: (data) => {
                cipher.update(data);
                return {
                    encryptedData: cipher.final(),
                    tag: cipher.getAuthTag()
                };
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

        const keyLen = __getKeyLength(algorithm);
        const ivSalt = salt[0];
        const iv = crypto.scryptSync(key, ivSalt, 12, kdOptions);
        const decipher = crypto.createDecipheriv(algorithm, key, iv, encOptions);

        if (__encryptionIsAuthenticated(algorithm)) {
            const aadSalt = salt[1];
            const aad = crypto.scryptSync(key, aadSalt, keyLen, kdOptions);
            decipher.setAAD(aad);
            decipher.setAuthTag(tag);
        }

        return (data) => {
            decipher.update(data);
            return decipher.final();
        };
    }

    function __encryptionIsAuthenticated(algorithm){
        for (const mode of authenticationModes) {
            if (algorithm.includes(mode)) {
                return true;
            }
        }

        return false;
    }

    function __getKeyLength(algorithm) {
        for (const len of keySizes) {
            if (algorithm.includes(len.toString())) {
                return len / 8;
            }
        }

        throw new Error("Invalid encryption algorithm.");
    }

    function __createCompress(compress, decompress, isCompression) {
        const options = config.getCompressionOptions();
        if (!isCompression) {
            return (data) => {
                return decompress(data, options);
            };
        }

        return (data) => {
            return compress(data, options);
        };
    }

}

module.exports = BrickTransform;
