const readline = require('readline');
const tty = require('tty');
const handler = require('./CommandHandler');

function Command()
{
    let commandHandler = new handler();
    let i = 0;
    this.readCommand = function(){
        process.stdin.on('keypress',function(ch,key){
            if(key.name === 'up') {
                i++;
                if (i === 1) {
                    process.stdout.write(key.name);
                } else {
                    //readline.clearLine(process.stdout);
                    readline.clearLine(process.stdout, 0);
                    process.stdout.write(key.name);
                }
            }
        });
        const rl = readline.createInterface({
            input:process.stdin,
            output:process.stdout
        });
        rl.question('',(answer)=>{
            console.log(answer);
            rl.close();
            commandHandler.addCommand(answer);
        });
    }
}
let com = new Command();
com.readCommand();