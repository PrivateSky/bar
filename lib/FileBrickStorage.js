const fs = require('fs');

function FileBrickStorage(location){
    //clasele acestea de storage, nu se mai ocupa de citiri si scrieri acum
    //deci aceste functii pe care le apelez, putBrick si getBrick sunt niste functii intermediare
    //toate procesarile se fac in BarWorker (partea de citire, mapare a header-ului arhivei)
    //si in storage, de exemplu append-ul de date la un Brick
    let header = {};
    let barMapPosition = 0;

    this.putBrick = function(brick,callback){
        barMapPosition += brick.getData().length;
        fs.appendFile(location,brick.getData(),(err)=>{
            if(err)
                callback(err);
            else
                callback();
        });
        //aceasta functie va primi un brick
        //si va apela o fucntie din BarWorker ce se va ocupa de scrierea datelor in fisier
        //va face append la fisierul .bar, cu datele respective
    }

    this.putBarMap = function(barMap,callback){
        let buffer = JSON.stringify(barMap);
        fs.open(location,'w',(err,fd)=>{
            fs.write(fd,barMapPosition.toString(),0,null,(err,bytesRead,str)=>{
                if(err)
                    callback(err);
            });
            fs.write(fd,buffer,barMapPostion,null,(err,wrt,str)=>{
                if(err)
                    callback(err);
            });
        });
    }

    this.getBarMap = function(callback){
        fs.open(location,'r+',(err,fd)=>{
            let buffer = Buffer.alloc(128);
            fs.read(fd,buffer,0,78,0,(err,bytesRead,buffer)=>{
                let number = ParseInt(buffer.slice(0,bytesRead));
                fs.read(fd,buffer,0,buffer.length,number,(err,bytesRead,buffer)=>{

                });
            });
        })
    }

    this.getBrick = function(fileName,idBrick,callback){
        let buffer = Buffer.alloc(header[fileName][idBrick]);
        fs.open(location,'r+',(err,fd)=>{
            fs.read(fd,buffer,0,buffer.length,idBrick*buffer.length,(err,bytesRead,data)=>{
                if(err)
                    callback(err);
                else
                    callback(err,data);
            });
        });
        //aceasta functie va primi id-ul unui brick
        //va apela fucntia din intermediul barWorker-ului pentru a citi datele
        //functia din BarWorker va citi header-ul, iar apoi va citi brick-ul in cauza
        //si il va trimite mai departe spre arhiva, care a facut solicitarea
    }
}