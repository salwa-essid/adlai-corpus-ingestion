const {
    saveEvalQuestion
} = require("../repositories/evalQuestionRepository");
async function createEvalQuestion(data) {
    return saveEvalQuestion(data);
}
module.exports = {
    createEvalQuestion
}