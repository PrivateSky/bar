const fs = require('fs');
const BarMap = require('./FileBarMap');
const utils = require('../utils/utilities');
const ensuresFileDoesNotExists = utils.ensureFileDoesNotExists;

function FileBrickStorage(location){

    let brickIsFirst = true;
    let map;

    function firstWriteToFile(fd,brick,callback){
        let tempBuffer = Buffer.alloc(brick.getSize(), brick.getData());
        fs.write(fd, tempBuffer, 0, tempBuffer.length, utils.getSaltSize(), (err, wrt, buffer) => {
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
    }


    this.putBrick = function(brick,callback){
            if(brickIsFirst === true ) {
                ensuresFileDoesNotExists(location,(err)=>{
                    fs.open(location, 'w+', (err, fd) => {
                        if(err) {
                            throw err;
                        }
                        firstWriteToFile(fd,brick,callback);
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

    function putSalt(fd,position,callback){
        let newTempBuffer = Buffer.alloc(8);
        newTempBuffer.writeBigInt64LE(BigInt(position),0);
        fs.write(fd,newTempBuffer,0,newTempBuffer.length,0,(err,wrt,buff)=>{
            if(err){
                return callback(err);
            }
            fs.close(fd,(err)=>{
                if(err) {
                    return callback(err);
                }
                return callback(undefined);
            });
        });
    }

    this.putBarMap = function(barMap,callback){
        let map = barMap.toBrick();
        let tempBuffer = Buffer.alloc(map.getData().length,map.getData().toString());
        fs.open(location,'r+',(err,fd)=>{
            if(err) {
                return callback(err);
            }
            fs.write(fd,tempBuffer,0,tempBuffer.length,barMap.getPosition(),(err,wrt,buff)=>{
                if(err) {
                    return callback(err);
                }
                putSalt(fd,barMap.getPosition(),callback);
            });
        });
    };

    function getSalt(fd,callback){
        let numberBuffer = Buffer.alloc(utils.getSaltSize());
        fs.read(fd,numberBuffer,0,numberBuffer.length,0,(err,bytesRead,numberBuffer)=>{
            if(err) {
                return callback(err);
            }
        });
        return callback(undefined,parseInt(numberBuffer.readBigInt64LE(0)));
    }

    function getMap(fd,stat,bigNumber,callback){
        let tempBuffer = Buffer.alloc((stat.size-bigNumber));
        fs.read(fd,tempBuffer,0,tempBuffer.length,bigNumber,(err,bytesRead,tempBuffer)=>{
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
                return callback(undefined,map);
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
                if(err) {
                    return callback(err);
                }
                getSalt(fd,(err,bigNumber)=>{
                    if(err){
                        return callback(err);
                    }
                    getMap(fd,stat,bigNumber,callback);
                });
            });
        });
    };

    function readBrick(fd,tempBuffer,brickIndex,callback){
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
    }

    this.getBrick = function(brickIndex,callback){
        let tempBuffer = undefined;
        if(brickIndex === 0){
            tempBuffer = Buffer.alloc(map.getPosition(brickIndex) - utils.getSaltSize());
        }else{
            tempBuffer = Buffer.alloc(map.getPosition(brickIndex) - map.getPosition(brickIndex - 1));
        }
        fs.open(location,'r+',(err,fd)=>{
            if(err){
                return callback(err);
            }
            readBrick(fd,tempBuffer,brickIndex,callback);
        });
    };
}

module.exports = {
    createFileBrickStorage: function (location) {
        return new FileBrickStorage(location);
    }
};