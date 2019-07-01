const fs = require('fs');

function BarWorker(){

    this.createBricks = function(data,callback){
        //ati spus sa scoatem functia de creare a brick-urilor din arhiva
        //aceasta este fucntia care se va ocupa de partitionare datelor
        //si construirea brick-urilor
        //functia de callback va fi pentru a putea prelua datele mai departe, adica brick-urile
    }
    this.writeToFile = function(data,location,callback){
        //functia care se va ocupa cu scrierea unui fisier de tip brick
    }
    this.writeBar = function(data,location,callback){
        //functia care se va ocupa de scrierea arhivei, in cazul provider-ului StorageFile
        //va lua datele, adica brick-urile, trimise de archive probabil si va construi
        //fisierul .bar, si se va ocupa si de plasarea header-ului la final si setarea salt-ului
        //la inceput
    }
    this.readBar = function(data,location,callback){
        //functia care se va ocupa de citirea arhivei, in cazul provider-ului StorageFile
        //va citi si mapa arhiva si apoi restul datelor, va crea o lista de brick-uri
    }
    this.readFromFile = function(data,location,callback){
        //functia care se va ocupa de citirea unui fisier de tip brick sau .bar
        //in functie de caz
    }
}