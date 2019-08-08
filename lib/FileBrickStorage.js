const fs = require('fs');
const BarMap = require('./FileBarMap');
//const fileBarMap = require('FileBarMap');

function FileBrickStorage(location){

    let map;
    let barMapPosition = 96;

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

    this.putBarMap = function(barMap,callback){
        let map = barMap.toBrick();
        let tempBuffer = Buffer.alloc(map.getData().length,map.getData().toString());
        fs.open(location,'r+',(err,fd)=>{
            if(err)
                return callback(err);
            fs.write(fd,tempBuffer,0,tempBuffer.length,barMapPosition,(err,wrt,buff)=>{
                if(err)
                    return callback(err);
            });
        });
        callback(undefined,);
    }

    this.getBarMap = function(mapDigest,callback){
        if(mapDigest === undefined){
            callback(undefined,new BarMap());
        }
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

module.exports = {
    createFileBrickStorage: function (location) {
        return new FileBrickStorage(location);
    }
};