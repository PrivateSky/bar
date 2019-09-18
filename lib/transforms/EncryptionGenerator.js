const crypto = require("crypto");
const cryptoUtils = require("../../utils/cryptoUtils");

function EncryptionGenerator(config) {
    this.setConfig = (newConfig) => {
        config = newConfig;
    };

    this.getInverseTransformParameters = (transformedData) => {
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

        return {
            data: transformedData.slice(0, tagOffset - saltLength),
            params:{salt, tag}
        };
    };

    this.createDirectTransform = () => {
        return getEncryption();
    };

    this.createInverseTransform = (transformParameters) => {
        return getDecryption(transformParameters);
    };

    //--------------------------------------- internal methods ------------------------------------------------------
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
            transformParameters: {
                salt: salt,
                key: key,
            },
            transform(data) {
                const encData = Buffer.concat([cipher.update(data), cipher.final()]);
                if (encIsAuth) {
                    ret.transformParameters.tag = cipher.getAuthTag();
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

        return {
            transform(data) {
                return Buffer.concat([decipher.update(data), decipher.final()]);
            }
        }
    }

}

module.exports = EncryptionGenerator;