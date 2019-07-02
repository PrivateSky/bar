const fsBarWrk = require('./FsBarWorker');
const fs = new fsBarWrk.FsBarWorker();

function BarWorker(){
    this.getFilesAndFolders = function(filePath,callback){
        fs.listFiles(filePath,callback);
    }
    this.readFromProvider = function(filePath,seek,bufferSize,callback){
        fs.readFile(filePath,seek,bufferSize,callback);
    }
    this.writeToProvider = function(filePath,data,buffer){
        fs.writeFile(filePath,data,buffer);
    }
}
module.exports.BarWorker = BarWorker;