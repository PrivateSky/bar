function StorageFolder(){

    this.putBrick = function(bricks){
        //aceasta functie va primi un brick
        //si va apela o fucntie din BarWorker ce se va ocupa de scrierea datelor in fisier
    }
    this.getBrick = function(idBrick,callback){
        //aceasta functie va primi id-ul unui brick
        //va cauta fisierul caruia ii corespunde id-ul
        //il va citi tot prin intermediul BarWorker, printr-o functie
        //il va trimite in callback, unde va fi mai departe, salvat
        //partea de citire va fi facuta prin intermediul functiei 'readFromFile' din BarWorker
    }
}
