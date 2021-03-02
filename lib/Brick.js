const openDSU = require("opendsu");
const crypto = openDSU.loadApi("crypto");
const keySSISpace = openDSU.loadApi("keyssi");
const brickTransforms = require("./brick-transforms");

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

            const hashFn = crypto.getCryptoFunctionForKeySSI(options.templateKeySSI, "hash");
            const _hash = hashFn(_transformedData);

            hashLink = keySSISpace.createHashLinkSSI(options.templateKeySSI.getDLDomain(), _hash, options.templateKeySSI.getVn(), options.templateKeySSI.getHint());
            callback(undefined, hashLink);
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
            transform = brickTransforms.createBrickTransformation(options);
            return transform.undo(keySSI, transformedData, (err, _rawData) => {
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

    this.getTransformedSize = () => {
        if (!transformedData) {
            return rawData.length;
        }

        return transformedData.length;
    };

    this.getSummary = (callback) => {
        let keySSIIdentifier = keySSI;
        if (typeof keySSIIdentifier === "object") {
            keySSIIdentifier = keySSI.getIdentifier();
        }
        const summary = {
            encryptionKey: keySSIIdentifier
        };

        this.getHashLink((err, _hashLink) => {
            if (err) {
                return OpenDSUSafeCallback(callback)(createOpenDSUErrorWrapper(`Failed to get hash link`, err));
            }

            summary.hashLink = _hashLink.getIdentifier();
            callback(undefined, summary);
        });
    }

//----------------------------------------------- internal methods -----------------------------------------------------
    function transformData(callback) {
        transform = brickTransforms.createBrickTransformation(options);
        if (rawData) {
            keySSI = generateBrickKeySSI(options);
            if (typeof keySSI === "undefined") {
                transformedData = rawData;
                return callback(undefined, rawData)
            }
            transform.do(keySSI, rawData, (err, _transformedData) => {
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
        if (options.encrypt && !options.brickMap) {
            keySSI = keySSISpace.createTemplateSymmetricalEncryptionSSI(options.templateKeySSI.getDLDomain(), undefined, '', options.templateKeySSI.getVn());
        } else {
            if (options.brickMap && options.encrypt === false) {
                keySSI = keySSISpace.createTemplateSeedSSI(options.templateKeySSI.getDLDomain(), undefined, options.templateKeySSI.getControl(), options.templateKeySSI.getVn());
            } else if (options.brickMap && options.encrypt) {
                keySSI = options.templateKeySSI;
            } else {
                keySSI = undefined;
            }
        }

        return keySSI;
    }
}

module.exports = Brick;
