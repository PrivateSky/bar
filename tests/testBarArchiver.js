const CommandHandler = require('../lib/CommandHandler');
const Archive = require('../lib/Archive');

function testArchiver()
{
    let comm = new CommandHandler(['bar','barx','-cf','name','bounder']);
    let comm2 = new CommandHandler(['bar','barx','-cf','name.bar','bounder']);
    let arch = new Archive(comm.getConfigurator());
    let arch2 = new Archive(comm2.getConfigurator());
    arch.addFolder('bounder',(err,mapDigest)=>{
        if(err)
            console.log(err.message);
    });
    arch2.addFile('bounder',(err)=>{
        if(err)
            console.log(err.message);
    })
};
testArchiver();