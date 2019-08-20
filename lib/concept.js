// const fs = require('fs');
//
// let number = 1142121312312123121;
//
// let buff = Buffer.alloc(8);
// //buff.writeBigInt64LE(BigInt(number),0);
// buff.writeBigInt64LE(BigInt(number),0);
// fs.open('diad.txt','w+',(err,fd)=>{
//     fs.write(fd,buff,0,buff.length,0,(err,wrt,buff)=>{
//         if(err)
//             console.log(err.message);
//        console.log('clout');
//        let nBuff = Buffer.alloc(8);
//        fs.read(fd,nBuff,0,nBuff.length,0,(err,bts,nBuff)=>{
//            nBuff = nBuff.slice(0,bts);
//            console.log(parseInt(nBuff.readBigInt64LE(0).toString()) + 1);
//            //val = val.slice(0,val.length);
//
//        });
//     });
// });
//
// let number2 = new Number(114212131231212312);
// console.log(number2);

// let pos = 0;
// let ind = 0;
// while(ind<10000000){
//     pos += 123123;
//     ind++;
// }
// console.log(pos);

let a = 123123123123123;
console.log(123123123123140 - parseInt(BigInt(a)));