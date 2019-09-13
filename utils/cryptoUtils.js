const keySizes = [128, 192, 256];
const authenticationModes = ["ocb", "ccm", "gcm"];

function encryptionIsAuthenticated(algorithm) {
    for (const mode of authenticationModes) {
        if (algorithm.includes(mode)) {
            return true;
        }
    }

    return false;
}

function getKeyLength(algorithm) {
    for (const len of keySizes) {
        if (algorithm.includes(len.toString())) {
            return len / 8;
        }
    }

    throw new Error("Invalid encryption algorithm.");
}

module.exports = {
    encryptionIsAuthenticated,
    getKeyLength
};
