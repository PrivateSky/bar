const fs = require('fs');

function FsBarWorker(){
    this.readFile = function(filePath,callback){
        let reader = fs.createReadStream(filePath,'utf8');
        reader.on('data',(chunk)=>{
            callback(chunk);
        });
    }
    this.writeFile = function(filePath,data){
        let writer = fs.createWriteStream(filePath);
        writer.write(data);
    }
}
module.exports.FsBarWorker = FsBarWorker;
// let a = new FsBarWorker();
// a.writeFile('odo.txt','Un timp trist!');