function Clasa(){
    this.ts = function(){
        return 'Hello';
    }
    this.f = function(){
        console.log(this.ts());
    }
}
function fun(){
    var x;
    this.init = function(v){
        x=v
    }
}
var add3 = new fun();
add3.init(3);