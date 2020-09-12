const openDSU = require("opendsu");
const crypto = openDSU.loadApi("crypto");
const keyssi = openDSU.loadApi("keyssi");

function EncryptionGenerator(keySSI) {
    let key;
    this.setKeySSI = (newConfig) => {
        keySSI = newConfig;
    };

    this.getInverseTransformParameters = (transformedData) => {
        let decryptionParameters = pskEncryption.getDecryptionParameters(transformedData);
        const data = decryptionParameters.data;
        delete decryptionParameters.data;
        return {
            data: data,
            params: decryptionParameters
        };
    };

    this.createDirectTransform = (transformParameters, callback) => {
        getEncryption(transformParameters, callback);
    };

    this.createInverseTransform = (transformParameters, callback) => {
        getDecryption(transformParameters, callback);
    };

    //--------------------------------------- internal methods ------------------------------------------------------
    function getEncryption(transformParameters, callback) {
        const _createResult = (key) => {
            const _keySSI = keyssi.buildTemplateKeySSI(keySSI.getName(), keySSI.getDLDomain(), key, keySSI.getControl(), keySSI.getVn(), keySSI.getHint());
            return {
                transform(data, callback) {
                    crypto.encrypt(_keySSI, data, callback);
                },
                transformParameters: {
                    key
                }
            }
        }

        if (transformParameters && transformParameters.key) {
            key = transformParameters.key;
            callback(undefined, _createResult(key));
        } else {
            crypto.generateEncryptionKey(keySSI, (err, encryptionKey) => {
                if (err) {
                    return callback(err);
                }

                key = encryptionKey;
                callback(undefined, _createResult(key));
            });
        }
    }


    function getDecryption(transformParameters, callback) {
        const ret = {
            transform(data, callback){
                const _keySSI = keyssi.buildTemplateKeySSI(keySSI.getName(), keySSI.getDLDomain(), transformParameters.key, keySSI.getControl(), keySSI.getVn(), keySSI.getHint());
                crypto.decrypt(_keySSI, data, callback);
            }
        }
        callback(undefined, ret);
    }

}

module.exports = EncryptionGenerator;