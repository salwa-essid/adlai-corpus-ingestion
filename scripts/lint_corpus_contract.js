#!/usr/bin/env node
/**
 * STORY-100 Phase 2 gate: "Add pre-export linter in Salwa's repo ensuring
 * no null article numbers without a populated section_ref" (and, more
 * generally, that every output/<slug>.json file satisfies the corpus
 * export contract in data/corpus/schema.json).
 *
 * Usage:
 *   node scripts/lint_corpus_contract.js            # lint every output/*.json
 *   node scripts/lint_corpus_contract.js companies   # lint just output/companies.json
 *   npm run lint:corpus
 *
 * Exit code 0 = every file conforms. Exit code 1 = at least one violation
 * (message printed to stderr) -- meant to be wired into CI (.gitlab-ci.yml)
 * and run by hand before a push, same spirit as scripts/verify_prd_gate.js
 * (which checks the *ingested* Postgres side; this checks the *exported
 * JSON* side -- see docs/DATA_CONTRACT_BOUNDARY.md for the split).
 */
"use strict";

const fs = require("fs");
const path = require("path");
// data/corpus/schema.json is written against the 2020-12 meta-schema
// (draft/2020-12), so we need Ajv's 2020 build specifically -- the
// default `require("ajv")` export only understands draft-07.
const Ajv2020 = require("ajv/dist/2020").default;
const addFormats = require("ajv-formats");

const REPO_ROOT = path.join(__dirname, "..");
const OUTPUT_DIR = path.join(REPO_ROOT, "output");
const SCHEMA_PATH = path.join(REPO_ROOT, "data", "corpus", "schema.json");

// Same 8 law_type groupings as scripts/verify_prd_gate.js's
// MANDATORY_DOMAINS + LEGACY_DOMAINS. Kept as a separate copy here
// (rather than a shared import) so this lint script has zero dependency
// on the DB-facing script -- it only touches files, never Postgres.
// If this list and verify_prd_gate.js's ever drift apart, that's a bug;
// there are only 8, so keeping them in sync by eye is cheap.
//
// Used two ways now: to report a friendlier label next to each file below,
// and (since 2026-09) to cross-check that the literal `law_type` field
// schema.json now requires on every entry actually matches the file it's
// sitting in -- see the per-entry check in the loop below.
const DOMAIN_MAP = {
  ZATCA: ["zatca_einvoicing_regulation", "zatca_implementation_resolution", "zatca_guidelines", "zatca_vat_agreement"],
  PDPL: ["pdpl"],
  SAMA: ["sama_banking_control_law", "sama_central_bank_law"],
  CMA: ["cma"],
  NCA: ["nca"],
  MISA: ["misa"],
  COMPANIES: ["companies"],
  LABOR: ["labor"],
};

const KNOWN_SLUGS = new Set(Object.values(DOMAIN_MAP).flat());

function slugToLawType(slug) {
  for (const [lawType, slugs] of Object.entries(DOMAIN_MAP)) {
    if (slugs.includes(slug)) return lawType;
  }
  return null;
}

function loadSchema() {
  const raw = fs.readFileSync(SCHEMA_PATH, "utf-8");
  return JSON.parse(raw);
}

function discoverOutputFiles(explicitSlug) {
  if (explicitSlug) {
    return [`${explicitSlug}.json`];
  }
  return fs
    .readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => f !== "manifest.json");
}

function main() {
  const explicitSlug = process.argv[2];
  const schema = loadSchema();
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  const files = discoverOutputFiles(explicitSlug);
  if (files.length === 0) {
    console.error(`No matching output files found in ${OUTPUT_DIR}`);
    process.exit(1);
  }

  let anyFailed = false;
  let anyUnknownSlug = false;
  const summary = [];

  for (const file of files) {
    const slug = file.replace(/\.json$/, "");
    const lawType = slugToLawType(slug);
    if (!lawType) anyUnknownSlug = true;

    const fullPath = path.join(OUTPUT_DIR, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
    } catch (err) {
      console.error(`❌ ${file}: could not read/parse (${err.message})`);
      anyFailed = true;
      summary.push({ file, ok: false, entries: 0 });
      continue;
    }

    let valid = validate(data);
    const schemaErrors = valid ? [] : [...validate.errors];
    const entries = Array.isArray(data) ? data.length : 0;

    // Cross-check: the literal law_type field on every entry should match
    // the file it's sitting in (per DOMAIN_MAP). Schema validation alone
    // only confirms it's one of the 8 known values -- not that it's the
    // *right* one for this file.
    const lawTypeMismatches = [];
    if (lawType && Array.isArray(data)) {
      data.forEach((entry, idx) => {
        if (entry && entry.law_type && entry.law_type !== lawType) {
          lawTypeMismatches.push({ idx, found: entry.law_type });
        }
      });
    }
    if (lawTypeMismatches.length > 0) valid = false;

    if (valid) {
      console.log(`✅ ${file} (${lawType || "UNKNOWN law_type"}): ${entries} entries, contract OK`);
      summary.push({ file, ok: true, entries });
    } else {
      anyFailed = true;
      const violationCount = schemaErrors.length + lawTypeMismatches.length;
      console.error(`❌ ${file} (${lawType || "UNKNOWN law_type"}): ${entries} entries, ${violationCount} violation(s)`);
      const shown = schemaErrors.slice(0, 10);
      for (const err of shown) {
        // instancePath looks like "/178/section_ref" -> entry index 178
        const idxMatch = err.instancePath.match(/^\/(\d+)/);
        const idx = idxMatch ? idxMatch[1] : "?";
        console.error(`   - entry[${idx}] ${err.instancePath || "(root)"} ${err.message}`);
      }
      if (schemaErrors.length > shown.length) {
        console.error(`   ... and ${schemaErrors.length - shown.length} more schema violation(s)`);
      }
      for (const { idx, found } of lawTypeMismatches.slice(0, 10)) {
        console.error(`   - entry[${idx}] law_type is "${found}", expected "${lawType}" for this file`);
      }
      if (lawTypeMismatches.length > 10) {
        console.error(`   ... and ${lawTypeMismatches.length - 10} more law_type mismatch(es)`);
      }
      summary.push({ file, ok: false, entries });
    }
  }

  console.log("");
  console.log("=== summary ===");
  const okCount = summary.filter((s) => s.ok).length;
  console.log(`${okCount}/${summary.length} files pass the corpus export contract.`);
  if (anyUnknownSlug) {
    console.log(
      "⚠️  One or more files have no matching entry in DOMAIN_MAP above -- add it there (and to verify_prd_gate.js's MANDATORY/LEGACY_DOMAINS if it's meant to be ingested)."
    );
  }
  for (const slug of KNOWN_SLUGS) {
    if (!files.includes(`${slug}.json`) && !explicitSlug) {
      console.log(`⚠️  ${slug}.json is a known domain but was not found in ${OUTPUT_DIR}.`);
    }
  }

  process.exit(anyFailed ? 1 : 0);
}

main();
