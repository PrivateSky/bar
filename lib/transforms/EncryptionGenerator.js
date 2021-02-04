const openDSU = require("opendsu");
const crypto = openDSU.loadApi("crypto");
const keySSISpace = openDSU.loadApi("keyssi");

function EncryptionGenerator() {
    this.createDirectTransform = (keySSI) => {
        return (data, callback) => {
            crypto.encrypt(keySSI, data, callback);
        };
    };

    this.createInverseTransform = (keySSI) => {
        return (data, callback) => {
            crypto.decrypt(keySSI, data, callback);
        }
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
            seKeySSI = keySSISpace.parse(transformParameters.key);
        } else {
            seKeySSI = keySSISpace.buildSymmetricalEncryptionSSI(keySSI.getDLDomain(), undefined, '', keySSI.getVn());
        }

        callback(undefined, _createResult(seKeySSI));
    }


    function getDecryption(transformParameters, callback) {
        const ret = {
            transform(data, callback) {
                //const _keySSI = keyssi.buildTemplateKeySSI(keySSI.getName(), keySSI.getDLDomain(), transformParameters.key, keySSI.getControl(), keySSI.getVn(), keySSI.getHint());
                // const _keySSI = keySSI.clone();
                // _keySSI.load(keySSI.getName(), keySSI.getDLDomain(), transformParameters.key, keySSI.getControl(), keySSI.getVn(), keySSI.getHint());
                const _keySSI = keySSISpace.parse(transformParameters.key);
                crypto.decrypt(_keySSI, data, callback);
            }
        }
        callback(undefined, ret);
    }

}

module.exports = EncryptionGenerator;