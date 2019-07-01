//brick
//momentan sunt implementate cateva functii de baza
const crpt = require('crypto');

function Brick(dataType){
    var hash;
    var content;
    this.load = function(data){
        //momentan stocam datele si facem hash-ul pentru a identifica brick-ul
        //insa in functie de dataType, pe care il specificam din constructor
        //vom compresa datele folosind zlib daca dataType este 'zlib'
        //vom pastra datele asa cum sunt, daca primim 'normal'
        //vom encriptiona datele daca primi orice alta valoare pentru dataType, si vom folosi valoarea din dataType pentru a encriptiona
        content = data;
        const h = crpt.createHash('sha256');
        h.update(data);
        hash = h.digest('hex');
    }
    this.getHash = function(){
        return hash;
    }
    this.getContent = function(){
        return content;
    }
}
var a = new Brick();
console.log(a.getHash());
