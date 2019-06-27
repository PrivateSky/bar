const fs = require('fs');
const cripto = require('crypto');
const assert = require('assert');
function Brick(){
    var content;
    var hash;
    this.loadExistent = function(continut,hashed){
        content = continut;
        hash = hashed;
    }
    this.load = function(continut){
        content = continut;
        var hasher = cripto.createHash('sha256');
        hasher.update(content);
        hash = hasher.digest('hex');
    }
    // this.save = function(fileName,filePath){
    //     fs.writeFileSync(fileName,(filePath + '/' + content));
    // }
    this.getContent = function(){
        return content;
    }
    this.getHash = function(){
        return hash;
    }
}
module.exports.Brick = Brick;
// var brk = new Brick();
// fs.readFile('test.txt','utf8',function(err,data){
//     brk.load(data.toString());
//     console.log(brk.getHash());
//     brk.save('.');
// })