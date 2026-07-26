const fs = require("fs/promises")
const path = require("path")

async function readManifest() {
    const manifestPath = path.join(process.cwd(), "output", "manifest.json")
    const data = await fs.readFile(manifestPath, "utf-8")
    return JSON.parse(data)
}

module.exports = {
    readManifest
};