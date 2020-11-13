const openDSU = require("opendsu");
const crypto = openDSU.loadApi("crypto");
const keyssiSpace = openDSU.loadApi("keyssi");

function EncryptionGenerator(keySSI) {
    this.setKeySSI = (newConfig) => {
        keySSI = newConfig;
    };

    this.createDirectTransform = (transformParameters, callback) => {
        createBrickEncryptionTransformation(transformParameters, callback);
    };

    this.createInverseTransform = (transformParameters, callback) => {
        getDecryption(transformParameters, callback);
    };

    //--------------------------------------- internal methods ------------------------------------------------------
    function createBrickEncryptionTransformation(transformParameters, callback) {
        const _createResult = (_keySSI) => {
            //const _keySSI = keyssi.buildTemplateKeySSI(keySSI.getName(), keySSI.getDLDomain(), key, keySSI.getControl(), keySSI.getVn(), keySSI.getHint());
            // _keySSI.load(keySSI.getName(), keySSI.getDLDomain(), key, keySSI.getControl(), keySSI.getVn(), keySSI.getHint());
            return {
                transform(data, callback) {
                    crypto.encrypt(_keySSI, data, callback);
                },
                transformParameters: {
                    key: _keySSI.getIdentifier()
                }
            }
        }
        let seKeySSI;
        if (transformParameters && transformParameters.key) {
            seKeySSI = keyssiSpace.parse(transformParameters.key);
        } else {
            seKeySSI = keyssiSpace.buildSymmetricalEncryptionSSI(keySSI.getDLDomain(), undefined, '', keySSI.getVn());
        }

        callback(undefined, _createResult(seKeySSI));
    }


    function getDecryption(transformParameters, callback) {
        const ret = {
            transform(data, callback) {
                //const _keySSI = keyssi.buildTemplateKeySSI(keySSI.getName(), keySSI.getDLDomain(), transformParameters.key, keySSI.getControl(), keySSI.getVn(), keySSI.getHint());
                // const _keySSI = keySSI.clone();
                // _keySSI.load(keySSI.getName(), keySSI.getDLDomain(), transformParameters.key, keySSI.getControl(), keySSI.getVn(), keySSI.getHint());
                const _keySSI = keyssiSpace.parse(transformParameters.key);
                crypto.decrypt(_keySSI, data, callback);
            }
        }
        callback(undefined, ret);
    }

}

module.exports = EncryptionGenerator;