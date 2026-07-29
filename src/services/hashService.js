const crypto = require("crypto");

function generateContentHash(data) {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify(data))
        .digest("hex");
}

module.exports = {
    generateContentHash
};