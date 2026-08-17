const fs = require("fs/promises");
const { fetchMisaPdf, MISA_URL } = require("../src/services/misaFetcher");

(async () => {
    try {
        const pdf = await fetchMisaPdf(MISA_URL);

        await fs.writeFile("./output/misa-live.pdf", pdf);

        console.log(`MISA PDF downloaded: ${pdf.length} bytes`);
        console.log("Saved: ./output/misa-live.pdf");
    } catch (error) {
        console.error("MISA fetch failed:", error.message);
        process.exit(1);
    }
})();