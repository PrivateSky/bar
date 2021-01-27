const openDSU = require("opendsu");
const crypto = openDSU.loadApi("crypto");
const keyssi = openDSU.loadApi("keyssi");
const BrickTransformFactory = require("./transforms/BrickTransformFactory");
const transformFactory = new BrickTransformFactory();
// const adler32 = require("adler32");

function Brick(keySSI) {
    let rawData;
    let transformedData;
    let hashLink;
    let transformParameters;
    let transform;

    this.setKeySSI = (_keySSI) => {
        keySSI = _keySSI;
    };

    this.getHashLink = (callback) => {
        if (typeof hashLink !== "undefined") {
            return callback(undefined, hashLink);
        }

        this.getTransformedData((err, _transformedData) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get transformed data`, err));
            }

            crypto.hash(keySSI, _transformedData, (err, _hash) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to create hash`, err));
                }

                hashLink = keyssi.buildTemplateHashLinkSSI(keySSI.getDLDomain(), _hash, keySSI.getControl(), keySSI.getVn(), keySSI.getHint());
                callback(undefined, hashLink);
            });
        });
    };

    this.getAdler32 = (callback) => {
        this.getTransformedData((err, _transformedData) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get transformed data`, err));
            }

            callback(undefined, adler32.sum(_transformedData));
        });
    };

    this.setRawData = (data) => {
        rawData = data;
    };

    this.getRawData = (callback) => {
        if (typeof rawData !== "undefined") {
            return callback(undefined, rawData);
        }

        if (!transformParameters.key) {
            rawData = transformedData;
            return this.getRawData(callback);
        }

        if (transformedData) {
            transform = transformFactory.createBrickTransform(keySSI);
            return transform.applyInverseTransform(transformedData, transformParameters, (err, _rawData) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to apply inverse transform`, err));
                }

                rawData = _rawData;
                callback(undefined, _rawData);
            });
        }

        callback(Error("The brick does not contain any data."));
    };

    this.setTransformedData = (data) => {
        transformedData = data;
    };

    this.getTransformedData = (callback) => {
        if (typeof transformedData !== "undefined") {
            return callback(undefined, transformedData);
        }

        if (!keySSI.getSpecificString()) {
            transformedData = rawData;
            return this.getTransformedData(callback);
        }

        transformData((err, _transformedData) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to transform data`, err));
            }

            if (typeof transformedData === "undefined") {
                if (typeof rawData !== "undefined") {
                    callback(undefined, rawData);
                } else {
                    callback(Error("The brick does not contain any data."));
                }
            } else {
                callback(undefined, transformedData);
            }
        });
    };

    this.getTransformParameters = (callback) => {
        if (!transformedData) {
            transformData((err, _transformedData) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to transform data`, err));
                }

                callback(undefined, transformParameters);
            });
        } else {
            callback(undefined, transformParameters);
        }
    };

    this.setTransformParameters = (newTransformParams) => {
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

    this.getRawSize = () => {
        return rawData.length;
    };

    this.getTransformedSize = () => {
        if (!transformedData) {
            return rawData.length;
        }

        return transformedData.length;
    };

    this.getSummary = (callback) => {
        let encryptionKey;

        this.getTransformParameters((err, _transformParameters) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get transform parameters`, err));
            }

            if (transformParameters) {
                encryptionKey = transformParameters.key;
            }

            const summary = {
                encryptionKey
            };

            // this.getAdler32((err, adler32) => {
            //     if (err) {
            //         return callback(err);
            //     }
            //
            //     summary.checkSum = adler32;
                this.getHashLink((err, _hashLink) => {
                    if (err) {
                        return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get hash link`, err));
                    }

                    summary.hashLink = _hashLink.getIdentifier();
                    callback(undefined, summary);
                });
            });
        // });
    }

//----------------------------------------------- internal methods -----------------------------------------------------
    function transformData(callback) {
        transform = transformFactory.createBrickTransform(keySSI);
        if (rawData) {
            transform.applyDirectTransform(rawData, transformParameters, (err, _transformedData) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to apply direct transform`, err));
                }

                if (typeof _transformedData === "undefined") {
                    transformedData = rawData;
                } else {
                    transformedData = _transformedData;
                }

                transformParameters = transform.getTransformParameters();
                callback(undefined, transformedData);
            });
        } else {
            transformParameters = transform.getTransformParameters();
            callback();
        }
    }
}

module.exports = Brick;
