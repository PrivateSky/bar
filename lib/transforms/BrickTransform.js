function BrickTransform(transformGenerator) {
    let directTransform;
    let inverseTransform;

    this.applyDirectTransform = (data, keySSI, callback) => {
        if (!directTransform) {
            directTransform = transformGenerator.createDirectTransform(keySSI);
        }

        directTransform(data, callback);
    };

    this.applyInverseTransform = (data, keySSI, callback) => {
        if (!inverseTransform) {
            inverseTransform = transformGenerator.createInverseTransform(keySSI);
        }

        inverseTransform(data, callback);
    };
}

module.exports = BrickTransform;

