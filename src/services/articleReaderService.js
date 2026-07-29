const fs = require("fs/promises")
const path = require("path")

async function readArticles(sourceName) {
    const filePath = path.join(
        process.cwd(),
        "output",
        `${sourceName}.json`
    )
    const data = await fs.readFile(filePath, "utf8")
    return JSON.parse(data)
}


module.exports = {
    readArticles

};