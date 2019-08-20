
function util() {

    const SALT_SIZE = 8;
    this.getSaltSize = function(){
        return SALT_SIZE;
    }
}
module.exports = util;