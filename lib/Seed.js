require("../../../psknode/bundles/pskruntime");
require("../../../psknode/bundles/consoleTools");
const crypto = require("pskcrypto");

function Seed(compactSeed, networkId, randomLength = 32) {
    let seed;
    let lseed;

    init();

    this.getCompactForm = () => {
        if (!seed) {
            throw Error("Cannot return seed");
        }

        return generateCompactForm(seed);
    };

    this.getNetworkId = () => {
        if (!seed) {
            throw Error("Cannot get networkId");
        }

        return seed.networkId;
    };

    this.getRandom = () => {
        return seed.random;
    };

    this.getEncryptionKey = (algorithm) => {
      return crypto.deriveKey(algorithm, generateCompactForm(seed));
    };

    this.getLSeed = () => {
        if (!lseed) {
            lseed = crypto.pskHash(generateCompactForm(seed));
        }

        return lseed.toString("hex");
    };

    //--------------------------------------- internal methods --------------------------------------------
    function init() {
        if (!compactSeed) {
            seed = create();
        } else {
            load(compactSeed);
        }
    }

    function create() {
        const localSeed = {};
        localSeed.random = crypto.randomBytes(randomLength);

        if (networkId) {
            localSeed.networkId = networkId;
        }

        return localSeed;
    }

    function generateCompactForm(expandedSeed) {
        if (typeof expandedSeed === "string") {
            return expandedSeed;
        }

        let compactSeed = expandedSeed.random.toString('base64');
        if (expandedSeed.networkId) {
            compactSeed += '|' + Buffer.from(JSON.stringify(expandedSeed.networkId)).toString('base64');
        }
        return Buffer.from(encodeURIComponent(compactSeed));
    }

    function load(compactFormSeed) {
        if (typeof compactFormSeed === "undefined") {
            throw new Error(`Expected type string or Buffer. Received undefined`);
        }

        if (typeof compactFormSeed !== "string") {
            if (typeof compactFormSeed === "object" && !Buffer.isBuffer(compactFormSeed)) {
                compactFormSeed = Buffer.from(compactFormSeed);
            }

            compactFormSeed = compactFormSeed.toString();
        }

        const decodedCompactSeed = decodeURIComponent(compactFormSeed);
        const localSeed = {};
        const splitCompactSeed = decodedCompactSeed.split('|');

        localSeed.random = Buffer.from(splitCompactSeed[0], 'base64');

        if (splitCompactSeed[1] && splitCompactSeed[1].length > 0) {
            localSeed.networkId = JSON.parse(Buffer.from(splitCompactSeed[1], 'base64').toString());
        }

        return localSeed;
    }
}

module.exports = Seed;