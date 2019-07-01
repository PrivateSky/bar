function StorageFile(){
    //clasele acestea de storage, nu se mai ocupa de citiri si scrieri acum
    //deci aceste functii pe care le apelez, putBrick si getBrick sunt niste functii intermediare
    //toate procesarile se fac in BarWorker (partea de citire, mapare a header-ului arhivei)
    //si in storage, de exemplu append-ul de date la un Brick
    this.putBrick = function(bricks){
        //aceasta functie va primi un brick
        //si va apela o fucntie din BarWorker ce se va ocupa de scrierea datelor in fisier
        //va face append la fisierul .bar, cu datele respective
    }
    this.getBrick = function(idBrick,callback){
        //aceasta functie va primi id-ul unui brick
        //va apela fucntia din intermediul barWorker-ului pentru a citi datele
        //functia din BarWorker va citi header-ul, iar apoi va citi brick-ul in cauza
        //si il va trimite mai departe spre arhiva, care a facut solicitarea
    }
}