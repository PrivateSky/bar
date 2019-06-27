const fs = require('fs');
const brk = require('./brick');
const flag = 200;
function Pair(first,second,third){
    var first = first;
    var second = second;
    var third = third;
    this.getFirst = function(){
        return first;
    }
    this.getSecond = function(){
        return second;
    }
    this.getThird = function(){
        return third;
    }
}
function StorageFolder(){
    var bricks = [];
    var header = {};
    this.putBrick = function(brick,fileName,path){
        if(!fs.existsSync('caramizi/' + path)){
            fs.mkdirSync('caramizi/' + path);
        }
        var h = brick.getHash();
        bricks.push(brick.getHash());
        var a = new Pair(h,'n',path);
        header[fileName] = a;
        // fs.writeFile(('caramizi/' + path + '/' + brick.getHash() + '.brk'),brick.getContent(),function(err){
        //     console.log('sa fiu sigur!');
        //     if(err)
        //         throw err;
        // });
        fs.writeFileSync(('caramizi/' + path + '/' + brick.getHash() + '.brk'),brick.getContent());
    }
    this.putBricks = function(bricks,fileName,path){
        if(!fs.existsSync('caramizi/' + path)){
            fs.mkdirSync('caramizi/' + path);
        }
        var hashes = []; 
        var content = '';
        bricks.forEach(el=>{
             var h = el.getHash();
             bricks.push(el.getHash());
             hashes.push(h);
             content = content + el.getContent();
             fs.writeFileSync(('caramizi/' + path + '/' + el.getHash() + '.brk'),el.getContent());
         });
         var a = new Pair(hashes,'l',path);
         header[fileName] = a;
    }
    this.getFile = function(path,fileName){
        //return header[fileName].getFirst();
        //console.log(fileName);
        var pair = header[fileName];
        //console.log(pair.getFirst());
        if(pair.getSecond() === 'n'){
            var tmpBrick = new brk.Brick();
            var data = fs.readFileSync(('caramizi/' + path + '/' + pair.getFirst() + '.brk'),'utf8');
            tmpBrick.loadExistent(data,pair.getFirst());
            return tmpBrick.getContent();
        }
        else{
            var tmpBrick = new brk.Brick();
            var content = '';
            pair.getFirst().forEach(el=>{
                var data = fs.readFileSync(('caramizi/' + path + '/' + el + '.brk'),'utf8');
                content = content + data.toString();
            })
            return content;
        }
    }
    loadBrick = function(hash,path){
        var tempBrick = new brk.Brick();
        var data = fs.readFileSync(('caramizi/' + path + '/' + hash +'.brk'),'utf8');
        console.log(data.toString());
        tempBrick.loadExistent(data.toString(),hash);
        return tempBrick;
    }
    deleteBrick = function(hash,path){
        try{
            fs.unlinkSync(('caramizi/' + path + '/' + hash + '.brk'));
        }catch(err){
            console.log(err);
        }
    }
    appender = function(data,tempBrick,pair,fileName){
        if((tempBrick.getContent() + data.toString()).length<=flag){
            //aici continuam modificam continutul si updatam brick-ul
            var newTempBrick = new brk.Brick();
            console.log(tempBrick.getContent());
            newTempBrick.load(tempBrick.getContent()+data.toString());
            deleteBrick(tempBrick.getHash(),pair.getThird());
            var newPair = new Pair(newTempBrick.getHash(),'n',pair.getThird());
            // header[fileName] = newPair;
            fs.writeFileSync('caramizi/' + newPair.getThird() + '/' + newPair.getFirst() + '.brk',newTempBrick.getContent());
            return newPair;
        }
        else{
            var brickList = [];
            var listH = [];
            var diff = flag - tempBrick.getContent().length;
            if(tempBrick.getContent().length <= flag){

                var tempData = data.substr(0,diff);
                var newTempBrick = new brk.Brick();
                newTempBrick.load(tempBrick.getContent()+tempData);
                listH.push(newTempBrick.getHash());
                deleteBrick(tempBrick.getHash(),pair.getThird());
                fs.writeFileSync(('caramizi/' + pair.getThird() + '/' + newTempBrick.getHash()+'.brk'),newTempBrick.getContent());
                //brickList.push(tempBrick);
                data = data.substr(diff);
            }
            var tempData;
            while(data.length>flag){
                tempData = data.substr(0,flag);
                var newTempBrick = new brk.Brick();
                console.log(tempData.length);
                newTempBrick.load(tempData);
                listH.push(newTempBrick.getHash());
                fs.writeFileSync(('caramizi/' + pair.getThird() + '/' + newTempBrick.getHash() + '.brk'),newTempBrick.getContent());
                //brickList.push(new brk.Brick().load(tempData));
                data = data.substr(flag);
            }
            if(data.length>0){
                tempData = data.substr(0,data.length);
                var newTempBrick = new brk.Brick();
                newTempBrick.load(tempData);
                listH.push(newTempBrick.getHash());
                fs.writeFileSync(('caramizi/' + pair.getThird() + '/' + newTempBrick.getHash() + '.brk'),newTempBrick.getContent());
            }
            var newPair = new Pair(listH,'l',pair.path);
            //header[fileName] = newPair;
            return newPair;
        }
    }
    this.appendToFile = function(fileName,data){
        var pair = header[fileName];
        if(pair.getSecond() === 'n'){
            var hash = pair.getFirst();
            var tempBrick = loadBrick(hash,pair.getThird());
            header[fileName] = appender(data,tempBrick,pair,fileName);
            console.log(header[fileName].getFirst());
        }else{
            var hashes = pair.getFirst();
            console.log(hashes[hashes.length - 1]);
            var tempBrick = loadBrick(hashes[hashes.length - 1],pair.getThird());
            var tempPair = appender(data,tempBrick,pair,fileName);
            hashes.pop();
            if(tempPair.getSecond() === 'n'){
                hashes.push(tempPair.getFirst());
            }
            else{
                tempPair.getFirst().forEach(el=>{
                    hashes.push(el);
                });
            }
            var newPair = new Pair(hashes,'l',pair.getThird());
            header[fileName] = newPair;
            console.log(header[fileName].getFirst());
        }
    }
    this.replaceFile = function(fileName,data){

    }
}
module.exports.storageFolder = StorageFolder;
//aici am verificat daca functiile merg ok
 
// var st = new StorageFolder();
// var a = new brk.Brick();

// fs.readFile('test41.txt','utf8',function(err,data){
//     a.load(data.toString());
//     st.putBrick(a,'test3.txt','');
//     st.appendToFile('test3.txt','\n inca niste text, nu mult, si mai mult text, mult mai mult text, aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, cred ca ne apropiem de 100 de caractere in curand, dar nu sunt 100% sigur, am deja multe caractere, aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, ar trebui sa fie 100 aici, speeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeer, \n gata, acum singur sunt 100 de caractere, cel putin ! ');
// })

// var data1 = fs.readFileSync('test41.txt','utf8');
// var data2 = fs.readFileSync('test42.txt','utf8');
// var data3 = fs.readFileSync('test43.txt','utf8');
// var b = new brk.Brick();
// var c = new brk.Brick();
// a.load(data1.toString());
// b.load(data2.toString());
// c.load(data3.toString());
// var lbr = [];
// lbr.push(a);
// lbr.push(b);
// lbr.push(c);
// st.putBricks(lbr,'test4.txt','');
// st.appendToFile('test4.txt','\n inca putin text aici!');

//console.log(st.loadBrick('13fff0bb61517ef91ec301181a57180c15403f77c1e994e1c6f53cb25bcaa5a4').getContent());
//var b = StorageFolder();
// var list = [];
// var a = new brk.Brick();
// var b = new brk.Brick();
// var store = new StorageFolder();
// fs.readFile('test.txt','utf8',function(err,data){
//     a.load(data.toString());
//     // store.putBrick(a,'test.txt','');
//     // store.getFile('test.txt');
//     fs.readFile('test2.txt','utf8',function(err2,data2){
//         b.load(data2.toString());
//         list.push(a);
//         list.push(b);
//         store.putBricks(list,'test.txt','');
//         console.log(store.getFile('test.txt'));
//     });
//     // console.log(brk.getHash());
//     // brk.save('.');
// })
