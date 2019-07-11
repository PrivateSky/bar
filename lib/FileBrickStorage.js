const fs = require('fs');
//const fileBarMap = require('FileBarMap');

function FileBrickStorage(location){
    //clasele acestea de storage, nu se mai ocupa de citiri si scrieri acum
    //deci aceste functii pe care le apelez, putBrick si getBrick sunt niste functii intermediare
    //toate procesarile se fac in BarWorker (partea de citire, mapare a header-ului arhivei)
    //si in storage, de exemplu append-ul de date la un Brick
    let brickSizes = {};
    let brickPositions = {};
    let barMapPosition = 78;
    let relativePosition = 78;
    let maximumSize = 0;

    // this.putBrick = function(brick,callback){
    //     barMapPosition += brick.getData().length;
    //     brickSizes[brick.getHash()] = brick.getData().length; 
    //     fs.appendFile(location,brick.getData(),(err)=>{
    //         if(err)
    //             callback(err);
    //         else
    //             callback();
    //     });
    //     //aceasta functie va primi un brick
    //     //si va apela o fucntie din BarWorker ce se va ocupa de scrierea datelor in fisier
    //     //va face append la fisierul .bar, cu datele respective
    // }

    this.putBrick = function(brick,callback){
        barMapPosition += brick.getData().length;
        brickSizes[brick.getHash()] = brick.getData().length;
        let tempBuffer = Buffer.alloc(brick.getData().length,brick.getData());
        fs.open(location,'w',(err,fd)=>{
            fs.write(fd,tempBuffer,0,tempBuffer,barMapPosition,(err,wrr,str)=>{
                if(err)
                    throw err;
            });
        });
    }

    this.putBarMap = function(barMap,callback){
        let map = {};
        barMap.getFileList().forEach(file=>{
            map[file] = [];
            let tempSize = [];
            barMap.getHashList(file).forEach(hash=>{
                tempSize.push(brickSizes[hash]);
            });
            map[file] = [barMap.getHashList(file),tempSize];
        });
        let buffer = JSON.stringify(map);
        let bufferNumber = Buffer.alloc(number.toString().length,number.toString());
        fs.open(location,'w',(err,fd)=>{
            fs.write(fd,bufferNumber,0,bufferNumber.length,0,(err,bytesRead,str)=>{
                if(err)
                    callback(err);
            });
            fs.write(fd,buffer,0,buffer.length,barMapPosition,(err,wrt,str)=>{
                if(err)
                    callback(err);
            });
        });
    }

    this.getBarMap = function(callback){
        fs.open(location,'r+',(err,fd)=>{
            if(err)
                return callback(err);
            let buffer = Buffer.alloc(128);
            fs.read(fd,buffer,0,78,0,(err,bytesRead,buffer)=>{
                if(err)
                    return callback(err);
                let number = ParseInt(buffer.slice(0,bytesRead));
                barMapPosition = number;
                fs.stat(location,(err,stat)=>{
                    let bufferBM = Buffer.alloc(stat.size-number);
                    fs.read(fd,bufferBM,0,bufferBM.length,number,(err,bytesRead,buffer)=>{
                        let temp = JSON.parse(bufferBM.toString());
                        let tempHeader = {};
                        Object.keys(temp).forEach(key=>{
                            tempHeader[key] = temp[key][0];
                            let tempArr = temp[key][1];
                            let index = 0;
                            tempHeader[key].forEach(element=>{
                                brickSizes[element] = tempArr[index];
                                index++;
                            });
                        });
                    });
                });
            });
        })
    }
    
    this.getBrick = function(brickHash,callback){
        let buffer = Buffer.alloc(brickSizes[brickHash]);
        fs.open(location,'r+',(err,fd)=>{
            if(err)
                return callback(err);
            
            fs.read(fd,buffer,0,buffer.length,relativePosition,(err,bytesRead,buff)=>{
                relativePosition += brickSizes[birkHash];
                callback(err,buffer.slice(0,bytesRead));
            });
        });
    }
}

module.exports = FileBrickStorage;