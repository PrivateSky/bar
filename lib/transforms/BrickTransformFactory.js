const CompressionGenerator = require("./CompressionGenerator");
const EncryptionGenerator= require("./EncryptionGenerator");
const CompressionEncryptionGenerator = require("./CompressionEncryptionGenerator");
const BrickTransform = require("./BrickTransform");

function BrickTransformFactory() {
    this.createBrickTransform = function (config) {
        if (!config) {
            return;
        }

        const encryption = config.getEncryptionAlgorithm();
        const compression = config.getCompressionAlgorithm();

        let generator;
        if (!encryption && !compression) {
            return;
        }

        if (compression) {
            if (encryption) {
                generator = new CompressionEncryptionGenerator(config);
            } else {
                generator = new CompressionGenerator(config);
            }
        }else{
            generator = new EncryptionGenerator(config);
        }

        return new BrickTransform(generator);
    }
}

module.exports = BrickTransformFactory;

