const fs = require('fs');
const BarMap = require('./FileBarMap');

function FileBrickStorage(location){

    let brickIsFirst = true;
    let map;

    this.putBrick = function(brick,callback){
            if(brickIsFirst === true ) {
                fs.open(location, 'r+', (err, fd) => {
                    let tempBuffer = Buffer.alloc(brick.getSize(), brick.getData());
                    fs.write(fd, tempBuffer, 0, tempBuffer.length, 64, (err, wrt, buffer) => {
                        if (err) {
                            return callback(err);
                        }
                        fs.close(fd,(err)=>{
                            if (err) {
                                return callback(err);
                            }
                            brickIsFirst = false;
                            return callback();
                        });
                    });
                });
            }else{
                fs.appendFile(location,brick.getData(),(err)=>{
                    if(err)
                        return callback(err);
                    return callback();
                });
            }
    };

    function __putSalt(fd,position,callback){
        let newTempBuffer = Buffer.alloc(position.toString().length,position.toString());
        fs.write(fd,newTempBuffer,0,newTempBuffer.length,0,(err,wrt,buff)=>{
            if(err){
                return callback(err);
            }
            fs.close(fd,(err)=>{
                if(err)
                    return callback(err);
                return callback(undefined);
            });
        });
    };

    this.putBarMap = function(barMap,callback){
        let map = barMap.toBrick();
        let tempBuffer = Buffer.alloc(map.getData().length,map.getData().toString());
        fs.open(location,'r+',(err,fd)=>{
            if(err)
                return callback(err);
                console.log(map.getData().toString());
                fs.write(fd,tempBuffer,0,tempBuffer.length,barMap.getPosition(),(err,wrt,buff)=>{
                    if(err)
                        return callback(err);
                    __putSalt(fd,barMap.getPosition(),callback);
                });
            });
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

    this.getBrick = function(brickIndex,callback){
        let tempBuffer = undefined;
        let dimension = 0;
        console.log(brickIndex,map.getPosition(brickIndex));
        if(brickIndex === 0){
            tempBuffer = Buffer.alloc(map.getPosition(brickIndex) - 64);
        }else{
            tempBuffer = Buffer.alloc(map.getPosition(brickIndex) - map.getPosition(brickIndex - 1));
        }
        fs.open(location,'r+',(err,fd)=>{
            fs.read(fd,tempBuffer,0,tempBuffer.length,map.getPosition(brickIndex)-tempBuffer.length,(err,bytesRead,tempBuffer)=>{
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