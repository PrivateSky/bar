const crypto = require("crypto");
const cryptoUtils = require("../../utils/cryptoUtils");

function EncryptionGenerator(config) {
    this.setConfig = (newConfig) => {
        config = newConfig;
    };

    this.getInverseTransformParameters = (transformedData) => {
        let authTagLength = 0;
        const keyLength = cryptoUtils.getKeyLength(config.getEncryptionAlgorithm());
        let aadLength = 0;
        if (cryptoUtils.encryptionIsAuthenticated(config.getEncryptionAlgorithm())) {
            aadLength = keyLength;
            if (!config.getEncryptionOptions() || !config.getAuthTagLength()) {
                authTagLength = 16;
            } else {
                authTagLength = config.getAuthTagLength();
            }
        }

        const tagOffset = transformedData.length - authTagLength;
        const tag = transformedData.slice(tagOffset, transformedData.length);

        const aadOffset = tagOffset - aadLength;
        const aad = transformedData.slice(aadOffset, tagOffset);

        const iv = transformedData.slice(aadOffset - 16, aadOffset);

        return {
            data: transformedData.slice(0, aadOffset - 16),
            params:{iv, aad, tag}
        };
    };

    this.createDirectTransform = (transformParameters) => {
        return getEncryption(transformParameters);
    };

    this.createInverseTransform = (transformParameters) => {
        return getDecryption(transformParameters);
    };

    //--------------------------------------- internal methods ------------------------------------------------------
    function getEncryption(transformParameters) {
        const algorithm = config.getEncryptionAlgorithm();
        if (!algorithm) {
            return;
        }

        const encOptions = config.getEncryptionOptions();
        let key;
        const keyLength = cryptoUtils.getKeyLength(algorithm);
        if(transformParameters && transformParameters.key){
            key = transformParameters.key;
            if (key.length !== keyLength) {
                throw Error("Invalid encryption key.");
            }
        }else{
            key = crypto.randomBytes(keyLength);
        }

        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, key, iv, encOptions);

        const encIsAuth = cryptoUtils.encryptionIsAuthenticated(algorithm);

        let aad;
        if (encIsAuth) {
            aad = crypto.randomBytes(keyLength);
            cipher.setAAD(aad);
        }

        const ret = {
            transformParameters: {
                iv: iv,
                aad: aad,
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

        const encOptions = config.getEncryptionOptions();
        const decipher = crypto.createDecipheriv(algorithm, transformConfig.key, transformConfig.iv, encOptions);

        if (cryptoUtils.encryptionIsAuthenticated(algorithm)) {
            decipher.setAAD(transformConfig.aad);
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