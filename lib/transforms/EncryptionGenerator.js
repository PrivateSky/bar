const crypto = require("pskcrypto");

function EncryptionGenerator(config) {
    let key;
    const pskEncryption = crypto.createPskEncryption(config.getEncryptionAlgorithm());
    this.setConfig = (newConfig) => {
        config = newConfig;
    };

    this.getInverseTransformParameters = (transformedData) => {
        let decryptionParameters = pskEncryption.getDecryptionParameters(transformedData);
        const data = decryptionParameters.data;
        delete decryptionParameters.data;
        return {
            data: data,
            params:decryptionParameters
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
        if(transformParameters && transformParameters.key){
            key = transformParameters.key;
        }else{
            key = pskEncryption.generateEncryptionKey(algorithm);
        }


        const ret = {
            transform(data) {
                const encData = pskEncryption.encrypt(data, key, encOptions);
                ret.transformParameters = pskEncryption.getEncryptionParameters();
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
        let authTagLength = 0;
        if (!config.getEncryptionOptions() || !config.getAuthTagLength()) {
            authTagLength = 16;
        } else {
            authTagLength = config.getAuthTagLength();
        }

        return {
            transform(data) {
                return pskEncryption.decrypt(data, transformConfig.key, authTagLength, encOptions);
            }
        }
    }

}

module.exports = EncryptionGenerator;