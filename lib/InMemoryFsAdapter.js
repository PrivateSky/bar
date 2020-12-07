function InMemoryFsAdapter() {

    let buff = $$.Buffer.alloc(0);

    this.readBlockFromFile = (buffer, blockIndex, blockSize, callback) => {
        if ((blockIndex + 1) * blockSize - 1 > buffer.length) {
            callback(undefined, buffer.slice(blockIndex * blockSize));
        }else{
            callback(undefined, buffer.slice(blockIndex * blockSize, (blockIndex + 1) * blockSize));
        }
    };

    this.appendBlockToFile = (buffer, blockData, callback) => {
        if (!$$.Buffer.isBuffer(blockData)) {
            try {
                blockData = $$.Buffer.from(blockData);
            } catch (err){
                return callback(err);
            }
        }

        buff = $$.Buffer.concat([buff, blockData]);
        callback(undefined, buff);
    };

    this.getFileSize = (buffer, callback) => {
        callback(undefined, buffer.length);
    };
}

module.exports = {
    createInMemoryFsAdapter() {
        return new InMemoryFsAdapter();
    }
};
