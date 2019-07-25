const Node = require('./Node');

function LinkedList(){
    let head;
    let cursor;
    this.insert = function(data){
        if(typeof head === "undefined"){
            head = new Node(data);
            cursor = head;
        }
        else{
            let newNode = new Node(data);
            cursor.setNext(newNode);
            let tempNode = cursor;
            cursor = cursor.getNext();
            cursor.setPrev(tempNode);
        }
    }

    this.insertFirst = function(data){
        let tempNode = new Node(data);
        head.setPrev(tempNode);
        tempNode.setNext(head);
        head = tempNode;
    }

    this.insertLast = function(data){
        let tempNode = new Node(data);
        cursor.setNext(tempNode);
        tempNode.setPrev(cursor);
        cursor = tempNode;
    }

    this.getFirst = function(){
        return head;
    }

    this.getLast = function(){
        return cursor;
    }
}

module.exports = LinkedList;