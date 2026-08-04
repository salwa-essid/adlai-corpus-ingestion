// Re-extract a source document straight from its PDF, replacing the
// output/<source>.json the ingestion pipeline reads from.
//
// WHY THIS EXISTS: readArticles() (src/services/articleReaderService.js)
// only ever reads output/<source>.json — there is no fetch/parse step
// anywhere in this repo (spec 6.2 stages "Fetch"/"Parse" are not
// implemented). Those JSON files were produced once, outside this repo,
// by a tool we don't have. zatca_vat_agreement.json came out of that
// process corrupted (confirmed: 78/134 articles have runs of repeated
// characters, e.g. "الأساسي" -> "الأساساسي"; 47 occurrences of "وفقا"
// reversed into "اقفو"). This script is a real replacement for that
// missing step, using pdfjs-dist (Mozilla's PDF.js) instead of
// whatever produced the corruption.
//
// WHAT WE LEARNED BUILDING THIS (worth knowing before you trust its
// output): the corruption is very likely a kashida/justification
// artifact baked into how the source PDF itself encodes text, not a
// bug in any particular extraction library. Reproduced it directly:
// generated a test PDF with justified Arabic text (text-align:
// justify) and pdfjs-dist extraction inserted garbage at every
// stretch point; the exact same file with text-align: right (no
// justification) extracted perfectly clean. We don't control how
// ZATCA generated their PDF, so we can't just "turn off justification"
// — which means this script's output for a justified source still
// needs the sanity check below, and a human glancing at the flagged
// spots, before it's trusted for a legal citation.
//
// Usage:
//   node scripts/extract-pdf.js --source ZATCA_VAT_AGREEMENT --url "https://..." --out zatca_vat_agreement
//   node scripts/extract-pdf.js --file ./local.pdf --out zatca_vat_agreement
//
// Does NOT touch the database and does NOT overwrite output/<out>.json
// automatically — it writes output/<out>.extracted.json plus a report,
// so you can diff against the current file before swapping it in.

const fs = require("fs/promises");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "..", "output");

function parseArgs() {
    const args = process.argv.slice(2);
    const opts = { source: null, url: null, file: null, out: null };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--source") opts.source = args[++i];
        else if (args[i] === "--url") opts.url = args[++i];
        else if (args[i] === "--file") opts.file = args[++i];
        else if (args[i] === "--out") opts.out = args[++i];
    }
    if (!opts.url && !opts.file) {
        throw new Error("Need --url <pdf url> or --file <local pdf path>");
    }
    if (!opts.out) {
        throw new Error("Need --out <name> (writes output/<name>.extracted.json)");
    }
    return opts;
}

async function loadPdfBytes({ url, file }) {
    if (file) {
        return new Uint8Array(await fs.readFile(file));
    }
    console.log(`[extract-pdf] Fetching ${url} ...`);
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch PDF: HTTP ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
}

// Text items from pdf.js come back in content-stream order, which for a
// text-based (non-scanned) PDF is normally the order the text was
// written — i.e. logical reading order, not glyph-visual order. Join
// items on the same line with a space, and start a new line when the
// y-position jumps (pdf.js gives each item's transform matrix; index 5
// is the y translation).
function pageTextInReadingOrder(textContent) {
    const lines = [];
    let currentY = null;
    let currentLine = [];
    for (const item of textContent.items) {
        const y = Math.round(item.transform[5]);
        if (currentY === null || Math.abs(y - currentY) > 2) {
            if (currentLine.length) lines.push(currentLine.join(""));
            currentLine = [];
            currentY = y;
        }
        currentLine.push(item.str);
        if (item.hasEOL) {
            lines.push(currentLine.join(""));
            currentLine = [];
            currentY = null;
        }
    }
    if (currentLine.length) lines.push(currentLine.join(""));
    return lines.join("\n");
}

async function extractFullText(pdfBytes) {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // Without these, pdf.js in Node (no browser/fetch context for its
    // bundled font/cmap assets) silently falls back to guessed glyph
    // mappings for any text using standard/non-embedded fonts or CID
    // character maps — "TT: undefined function" / "standardFontDataUrl"
    // warnings are that fallback happening. That's a SEPARATE failure
    // mode from the kashida/justification corruption; pointing these at
    // pdf.js's own bundled data files fixes it and removes that noise
    // from the sanity-check results, so what's left over is actually
    // just the source-PDF corruption, not our own misconfiguration.
    // Two failed attempts before this one, both worth knowing about if
    // this breaks again on a future pdfjs-dist version:
    //   1. A raw filesystem path with the OS's own separator
    //      (path.join()+path.sep) gives "C:\...\cmaps\" on Windows —
    //      pdf.js's own trailing-slash check requires a literal "/",
    //      so it rejected that as "Invalid factory url".
    //   2. A real file:// URL (via pathToFileURL) satisfies that check,
    //      but pdf.js then hands it to fetch() to load each font file —
    //      and Node's built-in fetch does not support the file: scheme
    //      at all, so every font "loaded" as a request failure
    //      ("Unable to load font data"), silently falling back to the
    //      same broken glyph guessing as having no config at all.
    // What actually works: a plain path string using forward slashes
    // (not a URL, no file:// prefix) — pdf.js's isNodeJS check then
    // reads it directly via fs instead of routing through fetch.
    const pdfjsPath = path.dirname(require.resolve("pdfjs-dist/package.json"));
    const toDirPath = (...segments) =>
        (path.join(pdfjsPath, ...segments) + path.sep).split(path.sep).join("/");
    const doc = await pdfjsLib.getDocument({
        data: pdfBytes,
        disableFontFace: true,
        standardFontDataUrl: toDirPath("standard_fonts"),
        cMapUrl: toDirPath("cmaps"),
        cMapPacked: true
    }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        pages.push(pageTextInReadingOrder(content));
    }
    return pages.join("\n");
}

// Article headers in this corpus look like "المادة(3)", "المادة (10)",
// "المادة الأولى" etc. We only split on the numeric form here — it's
// what this document actually uses (spot-checked against the existing
// corrupted output/zatca_vat_agreement.json, e.g. "المادة(3)"،
// "المادة (10)", "المادة (11)"). The preamble before the first match
// becomes article 0.
const ARTICLE_HEADER = /الماد[ةه]\s*\(\s*(\d+)\s*\)/g;

function splitIntoArticles(fullText, sourceUrl) {
    const matches = [...fullText.matchAll(ARTICLE_HEADER)];
    const articles = [];
    const fetchedAt = new Date().toISOString();

    if (matches.length === 0) {
        return [{
            article_number: 1,
            language: "ar",
            text: fullText.trim(),
            source_url: sourceUrl,
            fetched_at: fetchedAt
        }];
    }

    if (matches[0].index > 0) {
        const preamble = fullText.slice(0, matches[0].index).trim();
        if (preamble) {
            articles.push({
                article_number: 0,
                language: "ar",
                text: preamble,
                source_url: sourceUrl,
                fetched_at: fetchedAt
            });
        }
    }

    for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index;
        const end = i + 1 < matches.length ? matches[i + 1].index : fullText.length;
        articles.push({
            article_number: parseInt(matches[i][1], 10),
            language: "ar",
            text: fullText.slice(start, end).trim(),
            source_url: sourceUrl,
            fetched_at: fetchedAt
        });
    }
    return articles;
}

// Best-effort only — do NOT treat "nothing flagged" as "definitely
// clean". Built against exactly the corruption patterns we've actually
// seen; a different PDF/font can corrupt text in a shape none of these
// patterns catch (we proved that ourselves: our own test fixture's
// corruption showed up as stray Latin letters and a raw control
// character, which an earlier version of this check — tuned only to
// the real corpus's repeated-Arabic-letter pattern — missed entirely).
// A human still needs to skim the output, especially for a legal
// document; this just narrows down where to look.
const PATTERNS = [
    // 1. 3+ identical Arabic letters in a row — what the real
    //    zatca_vat_agreement.json corruption looks like. Standard
    //    Arabic essentially never repeats a letter this many times.
    { name: "repeated Arabic letter", re: /([؀-ۿ])\1{2,}/g },
    // 2. A lone Latin letter (or short run) glued directly onto Arabic
    //    text with no space — legal Arabic text has no reason to
    //    contain stray Latin characters mid-word. Caught our fixture's
    //    "CC" artifact.
    { name: "Latin letters embedded in Arabic text", re: /[؀-ۿ][A-Za-z]+[؀-ۿ]|[؀-ۿ][A-Za-z]+(?=\s|$)|(?:^|\s)[A-Za-z]+[؀-ۿ]/g },
    // 3. Non-printable / control characters — should never appear in
    //    extracted text; caught a stray  in our fixture.
    { name: "control character", re: /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g }
];

function sanityCheck(articles) {
    const flagged = [];
    for (const a of articles) {
        const hits = [];
        for (const { name, re } of PATTERNS) {
            const matches = [...a.text.matchAll(new RegExp(re))];
            for (const m of matches) {
                hits.push({ name, index: m.index, match: m[0] });
            }
        }
        if (hits.length > 0) {
            flagged.push({
                article_number: a.article_number,
                occurrences: hits.length,
                samples: hits.slice(0, 5).map((h) => {
                    const i = h.index;
                    const snippet = a.text.slice(Math.max(0, i - 15), i + 15);
                    return `[${h.name}] ...${snippet}...`;
                })
            });
        }
    }
    return flagged;
}

async function main() {
    const opts = parseArgs();
    const pdfBytes = await loadPdfBytes(opts);
    console.log(`[extract-pdf] Loaded ${pdfBytes.length} bytes, extracting text...`);
    const fullText = await extractFullText(pdfBytes);
    const articles = splitIntoArticles(fullText, opts.url || opts.file);

    const outPath = path.join(OUTPUT_DIR, `${opts.out}.extracted.json`);
    await fs.writeFile(outPath, JSON.stringify(articles, null, 2));

    console.log(`[extract-pdf] Wrote ${articles.length} articles to ${outPath}`);

    const flagged = sanityCheck(articles);
    if (flagged.length === 0) {
        console.log("[extract-pdf] Sanity check: no suspicious repeated-character runs found. Looks clean.");
    } else {
        console.log(`[extract-pdf] Sanity check: ${flagged.length} article(s) still show suspicious repeats — inspect before trusting:`);
        for (const f of flagged) {
            console.log(`  article ${f.article_number}: ${f.occurrences} occurrence(s)`);
            for (const s of f.samples) console.log(`    ...${s}...`);
        }
        console.log(
            "[extract-pdf] This matches the kashida/justification artifact pattern we reproduced " +
            "in testing — the source PDF itself may encode text this way. Re-run is not guaranteed " +
            "to fix it; treat flagged articles as needing manual verification against the PDF, not " +
            "as safe to ship as-is."
        );
    }

    console.log(
        `\n[extract-pdf] Nothing was overwritten automatically. Compare ` +
        `output/${opts.out}.extracted.json against output/${opts.out}.json yourself, ` +
        `and only replace the original once you're satisfied.`
    );
}

main().catch((err) => {
    console.error("[extract-pdf] FAILED:", err);
    process.exit(1);
});