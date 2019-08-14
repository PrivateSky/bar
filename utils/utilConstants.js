
function util() {

    const SALT_SIZE = 64;
    this.getSaltSize = function(){
        return SALT_SIZE;
    }
}
module.exports = util;