const crypto = require('crypto');
const BrickTransformFactory = require("./transforms/BrickTransformFactory");
const transformFactory = new BrickTransformFactory();

function Brick(config) {
    let rawData;
    let transformedData;
    let hash;
    let transformParameters;
    let transform = transformFactory.createBrickTransform(config);

    this.setConfig = function (newConfig) {
        config = newConfig;
        if (transform) {
            transform.setConfig(newConfig);
        }else{
            transform = transformFactory.createBrickTransform(config);
        }
    };

    this.createNewTransform = function () {
        transform = transformFactory.createBrickTransform(config);
        transformParameters = undefined;
        transformData();
    };

    this.getHash = function () {
        if (!hash) {
            hash = crypto.createHash('sha256').update(this.getTransformedData()).digest('hex');
        }

        return hash;
    };

    this.setRawData = function (data) {
        rawData = data;
        if (!transform) {
            transformedData = rawData;
            return;
        }

        // transformData();
    };

    this.getRawData = function () {
        if (rawData) {
            return rawData;
        }

        if (transformedData) {
            if (!transform) {
                return transformedData;
            }

            rawData = transform.applyInverseTransform(transformedData, transformParameters);
            if (rawData) {
                return rawData;
            }

            return transformedData;
        }

        throw new Error("The brick does not contain any data.");
    };

    this.setTransformedData = function (data) {
        transformedData = data;
    };

    this.getTransformedData = function () {
        if (!transformedData) {
            transformData();
        }

        if (transformedData) {
            return transformedData;
        }

        if (rawData) {
            return rawData;
        }

        throw new Error("The brick does not contain any data.");
    };

    this.getTransformParameters = function () {
        if (!transformedData) {
            transformData();
        }
        return transformParameters;
    };

    this.setTransformParameters = function (newTransformParams) {
        if (!newTransformParams) {
            return;
        }

        if (!transformParameters) {
            transformParameters = newTransformParams;
            return;
        }

        Object.keys(newTransformParams).forEach(key => {
            transformParameters[key] = newTransformParams[key];
        });
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

    this.getDSeed = function () {
        return config.getDSeed();
    };

//----------------------------------------------- internal methods -----------------------------------------------------
    function transformData() {
        if (!transform) {
            throw new Error("transform undefined");
        }

        if (rawData) {
            transformedData = transform.applyDirectTransform(rawData, transformParameters);
            if (!transformedData) {
                transformedData = rawData;
            }
        }

        transformParameters = transform.getTransformParameters();
    }

}

module.exports = Brick;
