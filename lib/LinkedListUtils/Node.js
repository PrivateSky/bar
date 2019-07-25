function Node(data,prev=null,next=null){
    this.setPrev = function(newPrev){
        prev = newPrev;
    }
    this.setNext = function(newNext){
        next = newNext;
    }
    this.setData = function(newData){
        data = newData;
    }
    this.getNext = function(){
        return next;
    }
    this.getPrev = function(){
        return prev;
    }
    this.getData = function(){
        return data;
    }
}

module.exports = Node;