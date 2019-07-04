const fs = require("fs");

const filePath = "../lib/fld/a.txt";

fs.open(filePath, "r", (err, fd) => {
    if (err) {
        throw err;
    }
    let buffer = Buffer.alloc(50);
    fs.read(fd, buffer, 0, buffer.length, 0, (err, bytesRead, buffer) => {
        if (err) {
            throw err;
        }

        console.log(buffer.slice(0, bytesRead).toString(), bytesRead);
    });
});