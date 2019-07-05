//import { fstat } from "fs";

// const fs = require('fs');
// fs.open('Poveste.txt','r+',function(err,fd){
//     var buffer = Buffer.alloc(128);
//     fs.read(fd,buffer,0,buffer.length,0,function(err,bytesRead,buffer){
//         var data = buffer.toString("utf8");
//         //callback(data);
//         console.log(data);
//     });
// });

const fs = require('fs');
const path = require('path');

// function af(err){
//     if(err === undefined)
//         console.log('Everything should be fine!');
//     else
//         console.log('Eh, probably file does not exist or smth!');
// }
// function af2(){
//     console.log('nono!');
// }
// function callOne(callback){
//     fs.readFile('und.txt','utf8',(err)=>{
//         if(err)
//             return callback(err);
//         else
//             callback();
//     });
// }
// callOne(af);
// function caller(err){
//     if(err)
//         console.log('error');
// }

// function walkTree(folderPath,callback){
//     fs.readdir(folderPath,function(err,files){
//         if(err)
//             return callback(err);
//         else{
//             files.forEach(file=>{
//                fs.stat(folderPath + path.sep + file,(err,stat)=>{
//                    if(stat.isDirectory() === true){
//                        walkTree((folderPath + path.sep + file),callback);
//                    }else{
//                        console.log((folderPath + path.sep + file));
//                    }
//                });
//             });
//         }
//         callback();
//     });
// }
// walkTree('fld',caller);

// function getReadStream(){
//     return fs.createReadStream('Poveste.txt',{highWaterMark:128});
// }
// let a = getReadStream();
// a.on('error',()=>{
//     console.log('error!');
// }).on('open',()=>{
//     console.log('Haha!');
// });

// console.log(path.join('ana','mere'));

let a = {};
a['a'] = ['hehe','mehe'];
a['b'] = ['behehe'];

console.log(Object.keys(a));

// a.on('error',function(){
//     console.log('error!');
// })