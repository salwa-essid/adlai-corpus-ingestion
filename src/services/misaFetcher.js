const { request } = require("playwright");

const MISA_URL =
    "https://misa.gov.sa/app/uploads/2024/08/Investment-Law.pdf";

async function fetchMisaPdf(url = MISA_URL) {
    const context = await request.newContext();

    try {
        const response = await context.get(url);

        if (!response.ok()) {
            throw new Error(
                `MISA request failed: ${response.status()} ${response.statusText()}`
            );
        }

        const contentType = response.headers()["content-type"] || "";

        if (!contentType.includes("application/pdf")) {
            throw new Error(
                `Expected PDF but received: ${contentType}`
            );
        }

        return await response.body();
    } finally {
        await context.dispose();
    }
}

module.exports = {
    fetchMisaPdf,
    MISA_URL
};
