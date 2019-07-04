const crypto = require('crypto');

function Brick(data){
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
    }
}

module.exports = Brick;