const CompressionGenerator = require("./CompressionGenerator");
const EncryptionGenerator = require("./EncryptionGenerator");
const CompressionEncryptionGenerator = require("./CompressionEncryptionGenerator");
const BrickTransform = require("./BrickTransform");

function BrickTransformFactory() {
    this.createBrickTransform = (options) => {
        options = options || {};
        let generator;
        if (options.compression === true) {
            generator = new CompressionEncryptionGenerator(options);
        }else{
            generator = new EncryptionGenerator(options);
        }

        return new BrickTransform(generator);
    };

}

module.exports = BrickTransformFactory;

