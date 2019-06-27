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
    // this.save = function(filePath){
    //     fs.writeFile((hash + '.brk'),(filePath + '/' + content),function(err){
    //         if(err)
    //             throw err;
    //     })
    // }
    this.getContent = function(){
        return content;
    }
    this.getHash = function(){
        return hash;
    }
    this.getText = function(){
        return 'Text';
    }
}
module.exports.Brick = Brick;
// var brk = new Brick();
// fs.readFile('test.txt','utf8',function(err,data){
//     brk.load(data.toString());
//     console.log(brk.getHash());
//     brk.save('.');
// })