const openDSU = require("opendsu");
const crypto = openDSU.loadApi("crypto");

function EncryptionTransformation() {
    this.do = (keySSI, data, callback) => {
        const encrypt = crypto.getCryptoFunctionForKeySSI(keySSI, "encryption");
        let encryptedData;
        keySSI.getEncryptionKey((err, encryptionKey) => {
            if (err) {
                return callback(err);
            }
            try {
                encryptedData = encrypt(data, encryptionKey);
            } catch (e) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to encrypt data`, e));
            }
            callback(undefined, encryptedData);
        });
    };

    this.undo = (keySSI, data, callback) => {
        const decrypt = crypto.getCryptoFunctionForKeySSI(keySSI, "decryption");
        let plainData;
        keySSI.getEncryptionKey((err, encryptionKey) => {
            if (err) {
                return callback(err);
            }
            try {
                plainData = decrypt(data, encryptionKey);
            } catch (e) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to decrypt data`, e));
            }
            callback(undefined, plainData);
        });
    };
}

module.exports = EncryptionTransformation;