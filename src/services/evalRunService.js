const {
    saveEvalRun
} = require("../repositories/evalRunRepository")

async function createEvalRun(data) {
    return saveEvalRun(data);
}

module.exports = {
    createEvalRun
};