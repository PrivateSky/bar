const openDSU = require("opendsu");
const crypto = openDSU.loadApi("crypto");

function EncryptionTransformation() {
    this.do = (keySSI, data, callback) => {
        const encrypt = crypto.getCryptoFunctionForKeySSI(keySSI, "encryption");
        let encryptedData;
        try {
            encryptedData = encrypt(data, keySSI.getEncryptionKey());
        } catch (e) {
            return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to encrypt data`, e));
        }
        callback(undefined, encryptedData);
    };

    this.undo = (keySSI, data, callback) => {
        const decrypt = crypto.getCryptoFunctionForKeySSI(keySSI, "decryption");
        let plainData;
        try {
            plainData = decrypt(data, keySSI.getEncryptionKey());
        } catch (e) {
            return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to decrypt data`, e));
        }
        callback(undefined, plainData);
    };
}

module.exports = EncryptionTransformation;