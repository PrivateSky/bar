const openDSU = require("opendsu");
const crypto = openDSU.loadApi("crypto");

function EncryptionTransformation() {
    this.do = (keySSI, data, callback) => {
        const encrypt = crypto.getCryptoFunctionForKeySSI(keySSI, "encryption");
        callback(undefined, encrypt(data, keySSI.getEncryptionKey()));
    };

    this.undo = (keySSI, data, callback) => {
        const decrypt = crypto.getCryptoFunctionForKeySSI(keySSI, "decryption");
        callback(undefined, decrypt(data, keySSI.getEncryptionKey()));
    };
}

module.exports = EncryptionTransformation;