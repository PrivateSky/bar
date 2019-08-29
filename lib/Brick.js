const crypto = require('crypto');

function Brick(data){
    if (typeof data === "string") {
        data = Buffer.from(data);
    }

    if(!Buffer.isBuffer(data)){
        throw Error("data should be a Buffer");
    }

    let hash;
    this.getHash = function () {
        if (typeof hash === "undefined") {
            const h = crypto.createHash('sha256');
            h.update(data);
            hash = h.digest('hex');
        }
        return hash;
    };

    this.getData = function(){
        return data;
    };

    this.getSize = function(){
        return data.length;
    }
}

module.exports = Brick;