const openDSU = require("opendsu");
const crypto = openDSU.loadApi("crypto");

function EncryptionTransformation() {
    this.do = (keySSI, data, callback) => {
        crypto.encrypt(keySSI, data, callback);
    };

    this.undo = (keySSI, data, callback) => {
        crypto.decrypt(keySSI, data, callback);
    };
}

module.exports = EncryptionTransformation;