const openDSU = require("opendsu");
const crypto = openDSU.loadApi("crypto");
const keySSISpace = openDSU.loadApi("keyssi");
const BrickTransformFactory = require("./transforms/BrickTransformFactory");
const transformFactory = new BrickTransformFactory();

// const adler32 = require("adler32");

function Brick(options) {
    options = options || {};
    if (typeof options.encrypt === "undefined") {
        options.encrypt = true;
    }
    let rawData;
    let transformedData;
    let hashLink;
    let transform;
    let keySSI;

    this.setTemplateKeySSI = (templateKeySSI) => {
        options.templateKeySSI = templateKeySSI;
    };

    this.setKeySSI = (_keySSI) => {
        if (typeof _keySSI === "string") {
            _keySSI = keySSISpace.parse(_keySSI);
        }
        keySSI = _keySSI;
    };

    this.getKeySSI = () => {
        if (typeof keySSI !== "undefined") {
            return keySSI;
        }

        return generateBrickKeySSI(options);
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

                hashLink = keySSISpace.buildTemplateHashLinkSSI(keySSI.getDLDomain(), _hash, keySSI.getControl(), keySSI.getVn(), keySSI.getHint());
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

        if (!keySSI) {
            rawData = transformedData;
            return this.getRawData(callback);
        }

        if (transformedData) {
            transform = transformFactory.createBrickTransform(options);
            return transform.applyInverseTransform(transformedData, keySSI, (err, _rawData) => {
                if (err) {
                    throw err;
                }
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

        if (!options.templateKeySSI.getSpecificString()) {
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

    // this.getTransformParameters = (callback) => {
    //     if (!transformedData) {
    //         transformData((err, _transformedData) => {
    //             if (err) {
    //                 return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to transform data`, err));
    //             }
    //
    //             callback(undefined, transformParameters);
    //         });
    //     } else {
    //         callback(undefined, transformParameters);
    //     }
    // };
    //
    // this.setTransformParameters = (newTransformParams) => {
    //     if (!newTransformParams) {
    //         return;
    //     }
    //
    //     if (!transformParameters) {
    //         transformParameters = newTransformParams;
    //         return;
    //     }
    //
    //     Object.keys(newTransformParams).forEach(key => {
    //         transformParameters[key] = newTransformParams[key];
    //     });
    // };

    this.getTransformedSize = () => {
        if (!transformedData) {
            return rawData.length;
        }

        return transformedData.length;
    };

    this.getSummary = (callback) => {
        let keySSIIdentifier = keySSI;
        if (typeof keySSIIdentifier !== "string") {
            keySSIIdentifier = keySSI.getIdentifier();
        }
        const summary = {
            encryptionKey: keySSIIdentifier
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
        // });
    }

//----------------------------------------------- internal methods -----------------------------------------------------
    function transformData(callback) {
        transform = transformFactory.createBrickTransform(options);
        if (rawData) {
            if (typeof keySSI === "undefined") {
                keySSI = generateBrickKeySSI(options);
            }
            transform.applyDirectTransform(rawData, keySSI, (err, _transformedData) => {
                if (err) {
                    return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to apply direct transform`, err));
                }

                if (typeof _transformedData === "undefined") {
                    transformedData = rawData;
                } else {
                    transformedData = _transformedData;
                }

                callback(undefined, transformedData);
            });
        } else {
            callback();
        }
    }

    function generateBrickKeySSI(options) {
        if (typeof options.templateKeySSI === "undefined") {
            throw Error('A template keySSI should be provided when generating a keySSI used for brick encryption.')
        }
        const keySSISpace = require("opendsu").loadAPI("keyssi");
        if (typeof options === "undefined" || !options.brickMap) {
            keySSI = keySSISpace.buildSymmetricalEncryptionSSI(options.templateKeySSI.getDLDomain(), undefined, '', options.templateKeySSI.getVn());
        } else {
            if (options.encrypt === false) {
                keySSI = keySSISpace.buildTemplateSeedSSI(options.templateKeySSI.getDLDomain(), undefined, options.templateKeySSI.getControl(), options.templateKeySSI.getVn());
            } else {
                keySSI = options.templateKeySSI;
            }
        }

        return keySSI;
    }
}

module.exports = Brick;
