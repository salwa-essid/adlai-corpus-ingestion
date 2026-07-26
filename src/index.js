const { runPipeline } = require("./services/ingestionService")
runPipeline().catch((error) => {
    console.error(error.message)
});