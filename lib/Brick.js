const crypto = require('crypto');
const BrickTransform = require("./BrickTransform");

function Brick(config) {
    let rawData;
    let transformedData;
    let hash;
    let additionalTransformData;
    let transform = new BrickTransform(config);

    this.setConfig = function (newConfig) {
        config = newConfig;
        transform.setConfig(newConfig);
    };

    this.getHash = function () {
        if (!hash) {
            const h = crypto.createHash('sha256');
            h.update(this.getTransformedData());
            hash = h.digest('hex');
        }
        return hash;
    };

    this.setRawData = function (data) {
        rawData = data;
        transformData();
    };

    this.getRawData = function () {
        if (rawData) {
            return rawData;
        }

        if (transformedData) {
            return transform.applyInverseTransform(transformedData, additionalTransformData);
        }

        throw new Error("The brick does not contain any data.");
    };

    this.setTransformedData = function (data) {
        transformedData = data;
    };

    this.getTransformedData = function () {
        if (transformedData) {
            return transformedData;
        }

        if (rawData) {
            return rawData;
        }

        throw new Error("The brick does not contain any data.");
    };

    this.getAdditionalTransformData = function () {
        if (!config.getEncryptionAlgorithm()) {
            return;
        }

        if (additionalTransformData) {
            return additionalTransformData;

        }
    };

    this.setAdditionalTransformData = function (newAddTransformData) {
        additionalTransformData = newAddTransformData;
    };

    this.getRawSize = function () {
        return rawData.length;
    };

    this.getTransformedSize = function () {
        if (!transformedData) {
            return rawData.length;
        }

        return transformedData.length;
    };

    function transformData() {
        const encryptTransform = transform.getTransform();
        if (!encryptTransform) {
            transformedData = rawData;
            return;
        }

        additionalTransformData = encryptTransform.additionalTransformData;
        if(rawData) {
            transformedData = transform.applyTransform(encryptTransform.transform, rawData, additionalTransformData);
        }
    }

}

module.exports = Brick;
