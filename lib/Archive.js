const fs = require('fs');
const brk = require('./Brick');
const barWorker = require('./BarWorker');
var worker = new barWorker.BarWorker();
const flag = 200;

function BarMap(){
    var header = {};
    //header este un map in care vom retine datele intr-un format json
    //vom avea key-ul care va fi filename-ul, si datele care va fi lista de hash-uri
    this.add = function(fileName,hashList){
        //hashList-ul va fi direct lista de hash-uri, pentru ca o putem face pe masura
        //ce ne ocupam de salvarea brick-urilor
        header[fileName] = hashList;
    }
    this.getHash = function(fileName){
        //avem nevoie de hash-uri ca sa putem obtine brick-urile unui fisier
        //un hash este de fapt denumirea unui brick
        //aceasta functie returneaza lista de hash-uri
        return header[fileName];
    }
}
function Archive(name,provider){
    
    var arName = name;
    var arPrv = provider;
    var storagePrv;
    //numele si provider-ul pe care il vom utiliza, provider-ul va fi un string
    //in functie de valoarea acestui string vom crea in variabila storagePrv
    //un obiect de tipul StorageFile sau StorageFolder
    let brick = new brk.Brick();
    walkFiles = function(listFiles){
        let i = 0;
        listFiles.forEach(file=>{
            worker.readFromProvider(file,i,256,createBricks);
        });
    }
    const self = this;
    walkFolders = function(listFolders){
        listFolders.forEach(folder=>{
            worker.getFilesAndFolders(folder,self.extractData);
        });
    }
    this.extractData = function(listFolders,listFiles){
        //process lists
        walkFiles(listFiles);
        walkFolders(listFolders);
    }
    var createBricks = function(data){
        var slice = '_';
        while(slice !== ''){
            slice = data.slice(0,flag);
            brick.load(slice);
            console.log(brick.getHash());
            data = data.slice(flag);
        }
        //console.log(data);
    }
    this.appendToFile = function(fileName,buffer,callback){
        //fileName - numele fisierului in care vrem sa facem append
        //buffer - buffer-ul de citire, vom prelua din el datele
        //callback - aceeasi functie care se ocupa de prelucarea datelor,
        //de creerea de brick-uri si scrierea lor
    }
    this.addFolder = function(folderName,callback){
        //adaugam in arhiva un nou folder
        //functia de callback va fi o functie din abstractizarea BarWorker
        //functia de callback va fi cea care va face salvarea fisierelor .brk(un tip pentru fisierele brick)
        worker.getFilesAndFolders(folderName,callback);
    }
    this.replaceFile = function(fileName,buffer,callback){
        //inlocuim in intregime un fisier
        //inlocuim brick-urile lui cu alte brick-uri
        //rezultate din datele citite dintr-un fisier, prin buffer
        //callback este o functie care se ocupa de scrierea datelor, functie tot din BarWorker?
    }
    this.getFile = function(fileName,callback){
        //functia asta extrage un fisier din arhiva, si foloseste functia de callback
        //pentru a retine datele intr-o lista sau pentru a face o procesare ulterioara
    }
    this.getReadStream = function(fileName){
        //ne va oferi un buffer care sa citeasca dintr-un fisier din arhiva noastra?
    }
    this.getWriteStream = function(fileName){
        //ne va oferi un buffer care sa scrie intr-un fisier din arhiva noastra
    }
    this.store = function(callback){
        //nu imi dau seama ce ar trebui sa faca functia asta
        //ar trebui sa salveze brick-urile in fisiere?
        //si pana nu apelam store, brick-urile sa le tinem in clasa, in ceva ca o lista?
        //dupa ce apelam store, vom salva intr-un brick si header-ul
        //aici difera putin logica, poate sa implementez functia asta la nivelul storage-ului?
        //daca provider-ul este StorageFolder, vom crea un brick pentru header
        //daca provider-ul este StorageFile, vom atasa header-ul fisierului .bar unde tinem toate datele
        //putem face aici logica care decide ce se intampla in functie de provider,
        //iar in acel BarWorker sa ne ocupam de scrierea datelor in functie de provider
        //adica sa avem doua functii, si apelam una din ele in functie de caz
    }
    this.list = function(callback){
        //aceasta functie va lista denumirile fisierelor din arhiva
        //nu inteleg ce ar trebui sa faca functia de callback
    }
}
let a = new Archive();
a.addFolder('fld',a.extractData);