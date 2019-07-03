const fs = require('fs');

function FsBarWorker(){
    var isDir = function(filePath){
        return fs.statSync(filePath).isDirectory();
    }
    var itExists = function(path){
        return fs.existsSync(path);
    }
    var walkFolder = function(folderName,callback){
        fs.readdir(folderName,function(err,files){
            let listFiles = [];
            let listFolders = [];
            files.forEach(file=>{
                if(isDir((folderName + '/' + file))){
                    listFolders.push((folderName + '/' + file));
                }
                else{
                    listFiles.push((folderName + '/' + file));
                }
            });
            callback(listFolders,listFiles); 
        });
    }
    //readBlockFromFile
    this.readFile = function(filePath,seek,bufferSize,callback){
        fs.open(filePath,'r+',function(err,fd){
            var buffer = Buffer.alloc(bufferSize);
            fs.read(fd,buffer,0,buffer.length,bufferSize*seek,function(err,bytesRead,buffer){
                var data = buffer.toString("utf8");
                callback(data);
            });
        });
    }
    this.listFiles = function(filePath,callback){
        if(isDir(filePath)){
            walkFolder(filePath,callback);
        }else{
            callback([],[filePath]);
        }
    }
    var constructPath = function(filePath){
        let slices = filePath.split('/');
        let pth = '';
        for(let i=0;i<slices.length-1;i++){
            pth+=slices[i]; 
        }
        return pth;
    }
    //appendFile
    this.writeFile = function(filePath,data,buffer){
        pth = constructPath(filePath);
        if(itExists(pth))
            fs.mkdir(pth);
        let writer = fs.createWriteStream(filePath);
        while(data.length>buffer){
            let slice = data.slice(0,buffer);
            writer.write(slice);
            data = data.slice(buffer);
        }
        writer.write(data);
    }
}
// function scream(cont){
//     console.log(cont);
// }
// function prx(list1,list2){
//     list1.forEach(el=>{
//         console.log(el);
//     });
//     list2.forEach(el=>{
//         console.log(el);
//         var el;
//         a.readFile(el,0,1024,scream);
//     });
// }
// var a = new FsBarWorker();
// a.listFiles('fld',prx);
module.exports.FsBarWorker = FsBarWorker;