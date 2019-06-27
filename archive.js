const fs = require('fs');
const brk = require('./brick');
const assert = require('assert');
const storage = require('./storageFolder');
const flag = 200;
function Archive(){
    var list = [];
    var fileNames = {};
    var storagePrv = new storage.storageFolder();
    replaceAll = function(str){
        var num = 0;
        for(let i=0;i<str.length;i++){
            if(str.charAt(i) === '/')
                num++;
        }
        while(num>0){
            str = str.replace('/','@');
            num--;
        }
        return str;
    }
    generateBricks = function(str,fileName,folder){
        var lst = [];
        while(str.length>flag){
            var tempData = str.substr(0,flag);
            var tempBrick = new brk.Brick();
            tempBrick.load(tempData);
            lst.push(tempBrick);
            str = str.substr(flag);
        }
        if(str.length>0){
            var tempBrick = new brk.Brick();
            tempBrick.load(str);
            lst.push(tempBrick);
        }
        if(lst.length === 1)
            storagePrv.putBrick(lst[0],fileName,folder);
        else
            storagePrv.putBricks(lst,fileName,folder);
    }
    walkDirectory = function(folderName){
        fs.readdirSync(folderName).forEach(file=>{
              if(fs.statSync((folderName + '/' + file)).isDirectory() === true){
                  walkDirectory((folderName + '/' + file));
              }else{
                  var flName = replaceAll((folderName + '/' + file));
                  list.push((folderName + '/' + file));
                  fileNames[(folderName + '/' + file)] = flName;
                  var data = fs.readFileSync((folderName + '/' +file),'utf8');
                  generateBricks(data.toString(),flName,'arhiva');
              }
        })
    }
    this.addFolder = function(folderName){
        walkDirectory(folderName);
    }
    this.addFile = function(fileName){

    }
    this.getFile = function(path){
        return storagePrv.getFile('arhiva',fileNames[path]);
    }
    this.extractFile = function(path){
        var content = storagePrv.getFile('arhiva',fileNames[path]);
        var slices = path.split('/');
        fs.writeFileSync(slices[slices.length-1],content);
    }
    this.extractAll = function(){
        list.sort(function(a,b){
            //str.match(new RegExp("/","g")).length
            return a.match(new RegExp("/","g")).length - b.match(new RegExp("/","g")).length;
        })
        list.forEach(el=>{
            var tempL = el.split('/');
            var cale = '';
            var cale2 = '';
            for(let i=0;i<tempL.length-2;i++){
                cale = cale + ((tempL[i] + '2') + '/');
                cale2 = cale2 + (tempL[i] + '/');
            }
            cale = cale + ((tempL[tempL.length - 2]) + '2');
            cale2 = cale2 + (tempL[tempL.length - 2]);
            if(!fs.existsSync(cale)){
                fs.mkdirSync(cale);
            }
            cale2 = cale2 + ('/' + tempL[tempL.length - 1]);
            cale = cale + ('/' + tempL[tempL.length - 1]);
            var content = storagePrv.getFile('arhiva',fileNames[cale2]);
            fs.writeFileSync(cale,content);
        })
    }
}
var ar = new Archive();
ar.addFolder('testFolder');
console.log(ar.extractFile('testFolder/file3.txt'));
ar.extractAll();