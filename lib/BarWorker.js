const fsBarWrk = require('./FsBarWorker');
const fs = new fsBarWrk.FsBarWorker();

function BarWorker(){
    this.readFile = function(filePath,callback){
        fs.readFile(filePath,callback);
    }
    this.writeFile = function(filePath){
        fs.writeFile(filePath);
    }
}
module.exports.BarWorker = BarWorker;