const CompressionTransformation = require("./CompressionTransformation");
const EncryptionTransformation = require("./EncryptionTransformation");

const createBrickTransformation = (options) => {
    options = options || {};
    return new EncryptionTransformation();
};


module.exports = {
    createBrickTransformation
};

