// Checks the RAW output/misa.json file (what's actually on disk right
// now, after the re-scrape) — language tags and whether Arabic
// characters appear anywhere, regardless of tag.
const fs = require("fs");

const data = JSON.parse(fs.readFileSync("./output/misa.json", "utf-8"));
const arabicRe = /[؀-ۿ]/;

console.log(`${data.length} articles in output/misa.json`);
for (const a of data) {
    const hasArabic = arabicRe.test(a.text || "");
    console.log(`--- article ${a.article_number} | tagged language: ${a.language} | contains Arabic chars: ${hasArabic} ---`);
    console.log(JSON.stringify((a.text || "").slice(0, 200)));
    console.log();
}