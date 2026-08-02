const { runPipeline } = require("./ingestionService");
async function runWatch() {
    console.log("AI Watch started...");
    await runPipeline();
    console.log("AI Watch finished.");
}
module.exports = {
    runWatch
};