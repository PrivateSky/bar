const readline = require('readline');
const Operations = require('./Operations');

function Command()
{
    const executor = new Operations(); 
    this.readCommand = function(){
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question('What do you think of Node.js\n',(answer)=>{
            console.log('Your answer:' + answer);
            rl.close();
            if(answer.toLocaleLowerCase() === 'exit'){
                return;
            }
            if(answer[0] === 'b' && answer[1] === 'a' && answer[2] === 'r'){
                if(answer[4] === '-'){
                    if(answer[5] === 'c' && answer[6] === 'f'){
                        let slice = answer.substring(8,answer.length);
                        let tempArr = slice.split(' ');
                        executor.createBar(tempArr[1],tempArr[0]);
                    }
                    else
                    if(answer[5] === 'x'){
                        let slice = answer.substring(7,answer.length);
                        let tempArr = slice.split(' ');
                        executor.extractFromBar(tempArr[1],tempArr[0]);
                    }
                    else
                    if(answer[5] === 't'){
                        let slice = answer.substring(7,answer.length);
                        executor.listBarFiles(slice);
                    }
                    else
                    if(answer[5] === 'c' && answer[6] === 'f' && answer[7] === 'z'){
                        let slice = answer.substring(9,answer.length);
                        let tempArr = slice.split(' ');
                        if(tempArr[2].toLocaleLowerCase === '--key'){
                            executor.createBar(tempArr[1],tempArr[0],tempArr[3]);
                        }
                    }
                    else{
                        console.log('Wrong command!\n');
                        this.readCommand();
                    }
                }
                else{
                    console.log('Wrong command!\n');
                    this.readCommand();
                }
            }else{
                console.log('Wrong command!\n');
                this.readCommand();
            }
        });
    }
}
let com = new Command();
com.readCommand();