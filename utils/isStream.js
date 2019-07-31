function isStream(stream){
    return stream !== null && typeof stream === 'object' && typeof stream.pipe === 'function';
}

function isWritable(stream) {
    return isStream(stream) &&
        stream.writable !== false &&
        typeof stream._write === 'function' &&
        typeof stream._writableState === 'object';

}

function isReadable(stream) {
    return isStream(stream) &&
        stream.readable !== false &&
        typeof stream._read === 'function' &&
        typeof stream._readableState === 'object';
}

function isDuplex(stream){
    return isWritable(stream) &&
        isReadable(stream);
}

module.exports = {
    isStream,
    isReadable,
    isWritable,
    isDuplex
};
