const fs = require('fs');
fs.open('Poveste.txt','r+',function(err,fd){
    var buffer = Buffer.alloc(128);
    fs.read(fd,buffer,0,buffer.length,0,function(err,bytesRead,buffer){
        var data = buffer.toString("utf8");
        //callback(data);
        console.log(data);
    });
});