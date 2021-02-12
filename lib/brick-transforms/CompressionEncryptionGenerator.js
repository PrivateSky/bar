const CompressionGenerator = require("./CompressionTransformation");
const EncryptionGenerator = require("./EncryptionTransformation");

function CompressionEncryptionGenerator(config) {
    let compressionGenerator = new CompressionGenerator(config);
    let encryptionGenerator = new EncryptionGenerator(config);

    this.getInverseTransformParameters = (transformedData) => {
        return encryptionGenerator.getInverseTransformParameters(transformedData);
    };

    this.createDirectTransform = (transformParameters) => {
        const compression = compressionGenerator.createDirectTransform();
        const encryption = encryptionGenerator.createDirectTransform(transformParameters);
        const compressionEncryption = {};
        Object.keys(encryption).forEach(key => {
            compressionEncryption[key] = encryption[key]
        });

        compressionEncryption.transform = (data) => {
            return encryption.transform(compression.transform(data));
        };

        return compressionEncryption;
    };

    this.createInverseTransform = (transformParameters) => {
        const decompression = compressionGenerator.createInverseTransform();
        const decryption = encryptionGenerator.createInverseTransform(transformParameters);
        const compressionEncryption = {};
        Object.keys(decompression).forEach(key => {
            compressionEncryption[key] = decompression[key]
        });
        compressionEncryption.transform = (data) => {
            return decompression.transform(decryption.transform(data));
        };

        return compressionEncryption;
    };
}

module.exports = CompressionEncryptionGenerator;