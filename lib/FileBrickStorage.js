const fs = require('fs');
const BarMap = require('./FileBarMap');
//const fileBarMap = require('FileBarMap');

function FileBrickStorage(location){

    let map;
    let barMapPosition = 96;

    this.putBrick = function(brick,callback){
        // fs.stat(location,(err,stat)=>{
        //     if(err){
            if(barMapPosition === 96) {
                fs.open(location, 'r+', (err, fd) => {
                    let tempBuffer = Buffer.alloc(brick.getSize(), brick.getData());
                    //creez un buffer care va contine toate datele din brick-ul care a fost pasat acum functiei
                    fs.write(fd, tempBuffer, 0, tempBuffer.length, 96, (err, wrt, buffer) => {
                        //scrierea continutului buffer-ului, incepand de la pozitia 96
                        console.log('aici');
                        barMapPosition += wrt;
                        if (err)
                            return callback(err);
                        fs.close(fd,(err)=>{
                            if(err)
                                throw err;
                            return callback();
                        });
                    });
                });
            }else{
                fs.appendFile(location,brick.getData(),(err)=>{
                    if(err)
                        return callback(err);
                    barMapPosition += brick.getData().length;
                    return callback();
                });
            }
        //     }else{
        //         console.log(brick.getData().toString());
        //         fs.appendFile(location,brick.getData(),(err)=>{
        //             //se adauga fisiere la arhiva deja scrisa, se pun la final
        //             if(err)
        //                 return callback(err);
        //         });
        //     }
        //     callback();
        // });
    }

    this.putBarMap = function(barMap,callback){
        let map = barMap.toBrick();
        let tempBuffer = Buffer.alloc(map.getData().length,map.getData().toString());
        fs.open(location,'r+',(err,fd)=>{
            if(err)
                return callback(err);
            fs.write(fd,tempBuffer,0,tempBuffer.length,barMapPosition,(err,wrt,buff)=>{
                if(err)
                    return callback(err);
                let newTempBuffer = Buffer.alloc(barMapPosition.toString().length,barMapPosition.toString());
                fs.write(fd,newTempBuffer,0,newTempBuffer.length,0,(err,wrt,buff)=>{
                    console.log('BarMap pus!');
                    if(err) {
                        return callback(err);
                    }
                    fs.close(fd,(err)=>{
                        if(err) {
                            return callback(err);
                        }
                        return callback(undefined);
                    });
                });
            });
        });
        //return callback(undefined);
    }

    this.getBarMap = function(mapDigest,callback){
        if(mapDigest === undefined){
            return callback(undefined,new BarMap());
        }
        fs.open(location,'r+',(err,fd)=>{
            if(err)
                return callback(err);
            fs.stat(location,(err,stat)=>{
                if(err)
                    return callback(err);
                let numberBuffer = Buffer.alloc(64);
                fs.read(fd,numberBuffer,0,numberBuffer.length,0,(err,bytesRead,numberBuffer)=>{
                    if(err) {
                        return callback(err);
                    }
                    numberBuffer = numberBuffer.slice(0,bytesRead);
                    let tempBuffer = Buffer.alloc((stat.size-parseInt(numberBuffer.toString())));
                    fs.read(fd,tempBuffer,0,tempBuffer.length,parseInt(numberBuffer.toString()),(err,bytesRead,tempBuffer)=>{
                        if(err)
                            return callback(err);
                        tempBuffer = tempBuffer.slice(0,bytesRead);
                        let tempMap = JSON.parse(tempBuffer.toString());
                        map = new BarMap(tempMap.positions);
                        map.setListOfBrickPositions(tempMap.indexes);
                        fs.close(fd,(err)=>{
                            if(err){
                                return callback(err);
                            }
                            console.log(map.getFileList());
                            return callback(undefined,map);
                        });
                    });
                });
            });
        });
    }

    // this.getBrick = function(brickIndex,callback){
    //     let tempBuffer = Buffer.alloc(map.getPosition(brickIndex+1)-map.getPosition(brickIndex));
    //     fs.open(location,'r+',(err,fd)=>{
    //         fs.read(fd,tempBuffer,0,map.getPosition(brickIndex+1)-map.getPosition(brickIndex),map.getPosition(brickIndex),(err,bytesRead,tempBuffer)=>{
    //             if(err)
    //                 return callback(err);
    //             tempBuffer = tempBuffer.slice(0,bytesRead);
    //             fs.close(fd,(err)=>{
    //                 if(err)
    //                     return callback(err);
    //                 return callback(undefined,tempBuffer.toString());
    //             });
    //         });
    //     });
    // }

    this.getBrick = function(brickIndex,callback){
        let tempBuffer = undefined;
        let dimension = 0;
        if(brickIndex === 0){
            tempBuffer = Buffer.alloc(map.getPosition(brickIndex) - 96);
            dimension = map.getPosition(brickIndex) - 96;
            console.log(map.getPosition(brickIndex));
        }else{
            tempBuffer = Buffer.alloc(map.getPosition(brickIndex) - map.getPosition(brickIndex - 1));
            dimension = map.getPosition(brickIndex) - map.getPosition(brickIndex-1);
            console.log(map.getPosition(brickIndex));
        }
        fs.open(location,'r+',(err,fd)=>{
            fs.read(fd,tempBuffer,0,dimension,map.getPosition(brickIndex) - dimension,(err,bytesRead,tempBuffer)=>{
                if(err){
                    return callback(err);
                }
                tempBuffer = tempBuffer.slice(0,bytesRead);
                fs.close(fd,(err)=>{
                    if(err){
                        return callback(err);
                    }
                    return callback(undefined,tempBuffer);
                });
            });
        });
    }
}

module.exports = {
    createFileBrickStorage: function (location) {
        return new FileBrickStorage(location);
    }
};