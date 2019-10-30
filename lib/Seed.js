const crypto = require("pskcrypto");

function Seed(compactSeed, networkId, randomLength = 32) {
    let seed;

    init();

    this.getSeed = () => {
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

    //--------------------------------------- internal methods --------------------------------------------
    function init() {
        if (!compactSeed) {
            if (!networkId) {
                throw new Error("No network id was provided.");
            }

            seed = create();
        }else{
            load(compactSeed);
        }
    }

    function create() {
        const localSeed = {};
        localSeed.random = crypto.randomBytes(randomLength);
        localSeed.networkId = networkId;

        return localSeed;
    }

    function generateCompactForm({random, networkId}) {
        let compactSeed = random.toString('base64');
        if (networkId) {
            compactSeed += '|' + Buffer.from(JSON.stringify(networkId)).toString('base64');
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

        const decodedCompactId = decodeURIComponent(compactFormSeed);
        const id = {};
        const splitCompactId = decodedCompactId.split('|');

        id.tag = decodedCompactId[0];
        id.random = Buffer.from(splitCompactId[0], 'base64');

        if (splitCompactId[1] && splitCompactId[1].length > 0) {
            id.domain = JSON.parse(Buffer.from(splitCompactId[1], 'base64').toString());
        }

        return id;
    }
}

module.exports = Seed;