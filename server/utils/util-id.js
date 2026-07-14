let seq = 1;
function getId() {
    return Math.random().toString(36).slice(2)
        + '_'
        + (seq++).toString(36);
}

module.exports = getId;