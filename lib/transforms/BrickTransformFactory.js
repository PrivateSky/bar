const CompressionGenerator = require("./CompressionGenerator");
const EncryptionGenerator = require("./EncryptionGenerator");
const CompressionEncryptionGenerator = require("./CompressionEncryptionGenerator");
const BrickTransform = require("./BrickTransform");

function BrickTransformFactory() {
    this.createBrickTransform = (keySSI) => {
        const generator = new EncryptionGenerator(keySSI);
        return new BrickTransform(generator);
    }
}

module.exports = BrickTransformFactory;

