const crypto = require("pskcrypto");

function Seed(compactSeed, id, endpoint, usedForEncryption  = true, randomLength = 32) {
    let seed;

    init();

    this.getCompactForm = () => {
        if (!seed) {
            throw Error("Cannot return seed");
        }

        return generateCompactForm(seed);
    };

    this.getLocation = () => {
        if (!seed) {
            throw Error("Cannot retrieve location");
        }

        return seed.endpoint + "/" + seed.id.toString("hex");
    };

    this.getEndpoint = () => {
        if (!seed) {
            throw Error("Cannot retrieve endpoint");
        }

        return seed.endpoint.toString();
    };

    this.getId = () => {
        if (!seed.id) {
            return;
        }
        return seed.id.toString("hex");
    };

    this.setId = (localId) => {
        seed.id = localId;
    };

    this.getEncryptionKey = (algorithm) => {
        if (seed.tag === 'r') {
            return;
        }

        return crypto.deriveKey(algorithm, generateCompactForm(seed));
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
        localSeed.id = id;
        if (!id && usedForEncryption) {
            localSeed.id = crypto.randomBytes(randomLength);
        }

        if (endpoint) {
            localSeed.endpoint = endpoint;
        }else{
            throw Error("The SEED could not be created because an endpoint was not provided.")
        }

        if (usedForEncryption === true) {
            localSeed.flag = 'e';
        }else{
            localSeed.flag = 'r';
        }

        return localSeed;
    }

    function generateCompactForm(expandedSeed) {
        if (typeof expandedSeed === "string") {
            return expandedSeed;
        }

        if(!expandedSeed.id){
            throw Error("The seed does not contain an id");
        }
        let compactSeed = expandedSeed.id.toString('base64');
        if (expandedSeed.endpoint) {
            compactSeed += '|' + Buffer.from(JSON.stringify(expandedSeed.endpoint)).toString('base64');
        }

        compactSeed += expandedSeed.flag;
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

        localSeed.flag = splitCompactSeed[splitCompactSeed.length - 1];
        localSeed.id = Buffer.from(splitCompactSeed[0], 'base64');

        if (splitCompactSeed[1] && splitCompactSeed[1].length > 0) {
            localSeed.endpoint = JSON.parse(Buffer.from(splitCompactSeed[1], 'base64').toString());
        }

        return localSeed;
    }
}

module.exports = Seed;