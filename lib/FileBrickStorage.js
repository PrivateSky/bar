const fs = require('fs');
const Map = require('./FileBarMap');
//const fileBarMap = require('FileBarMap');

function FileBrickStorage(location){
    //clasele acestea de storage, nu se mai ocupa de citiri si scrieri acum
    //deci aceste functii pe care le apelez, putBrick si getBrick sunt niste functii intermediare
    //toate procesarile se fac in BarWorker (partea de citire, mapare a header-ului arhivei)
    //si in storage, de exemplu append-ul de date la un Brick
    let map;
    let barMapPosition = 96;
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

    // this.putBrick = function(brick,callback){
    //     barMapPosition += brick.getData().length;
    //     brickSizes[brick.getHash()] = brick.getData().length;
    //     let tempBuffer = Buffer.alloc(brick.getData().length,brick.getData());
    //     fs.open(location,'w',(err,fd)=>{
    //         fs.write(fd,tempBuffer,0,tempBuffer,barMapPosition,(err,wrr,str)=>{
    //             if(err)
    //                 throw err;
    //         });
    //     });
    // }

    this.putBrick = function(brick,callback){
        fs.stat(location,(err,stat)=>{
            if(err){
                fs.open(location,'r+',(err,fd)=>{
                    let tempBuffer = Buffer.alloc(brick.getSize(),brick.getData());
                    fs.write(fd,tempBuffer,0,tempBuffer.length,96,(err,wrt,buffer)=>{
                        if(err)
                            return callback(err);
                    });
                });
            }else{
                fs.appendFile(location,brick.getData(),(err)=>{
                    if(err)
                        return callback(err);
                });
            }
            callback();
        });
    }

    // this.putBarMap = function(barMap,callback){
    //     let map = {};
    //     barMap.getFileList().forEach(file=>{
    //         map[file] = [];
    //         let tempSize = [];
    //         barMap.getHashList(file).forEach(hash=>{
    //             tempSize.push(brickSizes[hash]);
    //         });
    //         map[file] = [barMap.getHashList(file),tempSize];
    //     });
    //     let buffer = JSON.stringify(map);
    //     let bufferNumber = Buffer.alloc(number.toString().length,number.toString());
    //     fs.open(location,'w',(err,fd)=>{
    //         fs.write(fd,bufferNumber,0,bufferNumber.length,0,(err,bytesRead,str)=>{
    //             if(err)
    //                 callback(err);
    //         });
    //         fs.write(fd,buffer,0,buffer.length,barMapPosition,(err,wrt,str)=>{
    //             if(err)
    //                 callback(err);
    //         });
    //     });
    // }

    this.putBarMap = function(callback){
        let map = {};
        // barMap.getFileList().forEach(file=>{
        //     map[file] = [];
        //     let tempSize = [];
        //     barMap.getHashList(file).forEach(hash=>{
        //         tempSize.push(brickSizes[hash]);
        //     });
        //     map[file] = [barMap.getHashList(file),tempSize];
        // });
        // let buffer = JSON.stringify(map);
        // let bufferNumber = Buffer.alloc(number.toString().length,number.toString());
        // fs.open(location,'w',(err,fd)=>{
        //     fs.write(fd,bufferNumber,0,bufferNumber.length,0,(err,bytesRead,str)=>{
        //         if(err)
        //             callback(err);
        //     });
        //     fs.write(fd,buffer,0,buffer.length,barMapPosition,(err,wrt,str)=>{
        //         if(err)
        //             callback(err);
        //     });
        // });
        let tempMap = {};
        map.getFileList().forEach(key=>{
            map.getHashList(key).forEach(el=>{
                tempMap[key] = el;
            });
        });
        let mapToWrite = {};
        mapToWrite.positions = tempMap;
        mapToWrite.indexes = map.getListOfBrickPositions();
        let stringToWrite = JSOn.stringify(mapToWrite);
        let tempBuffer = Buffer.alloc(stringToWrite.length,stringToWrite);
        fs.open(location,'r+',(err,fd)=>{
            if(err)
                return callback(err);
            fs.write(fd,tempBuffer,0,tempBuffer.length,barMapPosition,(err,wrt,buff)=>{
                if(err)
                    return callback(err);
            });
        });
        callback();
    }

    // this.getBarMap = function(callback){
    //     fs.open(location,'r+',(err,fd)=>{
    //         if(err)
    //             return callback(err);
    //         let buffer = Buffer.alloc(128);
    //         fs.read(fd,buffer,0,78,0,(err,bytesRead,buffer)=>{
    //             if(err)
    //                 return callback(err);
    //             let number = ParseInt(buffer.slice(0,bytesRead));
    //             barMapPosition = number;
    //             fs.stat(location,(err,stat)=>{
    //                 let bufferBM = Buffer.alloc(stat.size-number);
    //                 fs.read(fd,bufferBM,0,bufferBM.length,number,(err,bytesRead,buffer)=>{
    //                     let temp = JSON.parse(bufferBM.toString());
    //                     let tempHeader = {};
    //                     Object.keys(temp).forEach(key=>{
    //                         tempHeader[key] = temp[key][0];
    //                         let tempArr = temp[key][1];
    //                         let index = 0;
    //                         tempHeader[key].forEach(element=>{
    //                             brickSizes[element] = tempArr[index];
    //                             index++;
    //                         });
    //                     });
    //                 });
    //             });
    //         });
    //     })
    // }

    // this.getBarMap = function(callback){
    //     fs.open(location,'r+',(err,fd)=>{
    //         if(err)
    //             return callback(err);
    //         let buffer = Buffer.alloc(128);
    //         fs.read(fd,buffer,0,78,0,(err,bytesRead,buffer)=>{
    //             if(err)
    //                 return callback(err);
    //             let number = ParseInt(buffer.slice(0,bytesRead));
    //             barMapPosition = number;
    //             fs.stat(location,(err,stat)=>{
    //                 let bufferBM = Buffer.alloc(stat.size-number);
    //                 fs.read(fd,bufferBM,0,bufferBM.length,number,(err,bytesRead,buffer)=>{
    //                     let temp = JSON.parse(bufferBM.toString());
    //                     let tempHeader = {};
    //                     Object.keys(temp).forEach(key=>{
    //                         tempHeader[key] = temp[key][0];
    //                         let tempArr = temp[key][1];
    //                         let index = 0;
    //                         tempHeader[key].forEach(element=>{
    //                             brickSizes[element] = tempArr[index];
    //                             index++;
    //                         });
    //                     });
    //                 });
    //             });
    //         });
    //     })
    // }

    this.getBarMap = function(callback){
        fs.open(location,'r+',(err,fd)=>{
            if(err)
                return callback(err);
            fs.stat(location,(err,stat)=>{
                if(err)
                    return callback(err);
                let numberBuffer = Buffer.alloc(64);
                fs.read(fd,numberBuffer,0,numberBuffer.length,0,(err,bytesRead,numberBuffer)=>{
                    if(err)
                        return callback(err);
                    numberBuffer = numberBuffer.slice(0,bytesRead);
                    let tempBuffer = Buffer.alloc((stat.size-parseInt(numberBuffer.toString())));
                    fs.read(fd,tempBuffer,0,tempBuffer.length,parseInt(numberBuffer),(err,bytesRead,tempBuffer)=>{
                        if(err)
                            return callback(err);
                        tempBuffer = tempBuffer.slice(0,bytesRead);
                        let tempMap = JSON.parse(tempBuffer.toString());
                        map = new Map(tempMap.positions);
                        map.setListOfBrickPositions(tempMap.indexes);
                        callback(undefined,map);
                    });
                });
            });
        });
    }
    
    // this.getBrick = function(brickHash,callback){
    //     let buffer = Buffer.alloc(brickSizes[brickHash]);
    //     fs.open(location,'r+',(err,fd)=>{
    //         if(err)
    //             return callback(err);
    //
    //         fs.read(fd,buffer,0,buffer.length,relativePosition,(err,bytesRead,buff)=>{
    //             relativePosition += brickSizes[birkHash];
    //             callback(err,buffer.slice(0,bytesRead));
    //         });
    //     });
    // }

    this.getBrick = function(brickIndex,callback){
        let tempBuffer = Buffer.alloc(map.getPosition(brickIndex+1)-map.getPosition(brickIndex));
        fs.open(location,'r+',(err,fd)=>{
            fs.read(fd,tempBuffer,0,map.getPosition(brickIndex+1)-map.getPosition(brickIndex),map.getPosition(brickIndex),(err,bytesRead,tempBuffer)=>{
                if(err)
                    return callback(err);
                tempBuffer = tempBuffer.slice(0,bytesRead);
                callback(undefined,tempBuffer);
            });
        });
    }
}

module.exports = FileBrickStorage;