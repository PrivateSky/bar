const readline = require('readline');

function Command()
{
    this.readCommand = function(){
        process.stdin.on('keypress',function(ch,key){
            console.log('goot ',key);
        });
        const rl = readline.createInterface({
            input:process.stdin,
            output:process.stdout
        });
        rl.question('',(answer)=>{
            console.log(answer);
            rl.close();
        });
    }
}
let com = new Command();
com.readCommand();