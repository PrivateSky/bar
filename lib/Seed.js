const crypto = require("pskcrypto");
const base58 = require("./base58");

function Seed(compactSeed, endpoint, key) {
    let seed;
    const keyLen = 32;
    init();

    this.getCompactForm = () => {
        if (!seed) {
            throw Error("Cannot return seed");
        }

        return generateCompactForm(seed);
    };

    this.getEndpoint = () => {
        if (!seed) {
            throw Error("Cannot retrieve endpoint");
        }

        return seed.endpoint;
    };

    this.getAnchorURL = () => {
        if (!seed.key) {
            return;
        }
        return seed.endpoint + "/" + crypto.pskHash(seed.key, "hex");
    };

    this.getKey = () => {
        return crypto.pskHash(seed.key, "hex");
    };
    this.setKey = (key) => {
        seed.key = key;
    };

    this.getEncryptionKey = (algorithm) => {
        return crypto.deriveKey(algorithm, generateCompactForm(seed));
    };

    //--------------------------------------- internal methods --------------------------------------------
    function init() {
        if (!compactSeed) {
            seed = create();
        } else {
            seed = load(compactSeed);
        }
    }

    function create() {
        const localSeed = {};
        localSeed.key = key;
        if (!key) {
            //Bugfix: randomBytes in browser returns an Uint8Array object that has a wrong constructor and prototype
            //that is why we create a new instance of Buffer/Uint8Array based on the result of randomBytes
            localSeed.key = Buffer.from(crypto.randomBytes(keyLen));
            //TODO: why don't we use ID Generator from swarmutils?
        }

        if (endpoint) {
            localSeed.endpoint = endpoint;
        } else {
            throw Error("The SEED could not be created because an endpoint was not provided.")
        }

        return localSeed;
    }

    function generateCompactForm(expandedSeed) {
        if (typeof expandedSeed === "string") {
            return expandedSeed;
        }

        if (!expandedSeed.key) {
            throw Error("The seed does not contain an id");
        }
        let compactSeed = base58.encode(expandedSeed.key);
        if (expandedSeed.endpoint) {
            compactSeed += '|' + base58.encode(expandedSeed.endpoint);
        }

        return compactSeed;
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

        const localSeed = {};
        const splitCompactSeed = compactFormSeed.split('|');
        localSeed.key = base58.decode(splitCompactSeed[0]);

        if (splitCompactSeed[1] && splitCompactSeed[1].length > 0) {
            localSeed.endpoint = base58.decode(splitCompactSeed[1]).toString();
        } else {
            console.warn('Cannot find endpoint in compact seed')
        }

        return localSeed;
    }
}

module.exports = Seed;

