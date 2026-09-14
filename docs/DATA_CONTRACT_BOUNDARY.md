# Data contract boundary (STORY-100 Phase 2)

This repo (`adlai-corpus-ingestion`) and the main `adlai` platform repo each
verify a different thing, at a different layer. This doc exists so nobody
assumes one script covers what the other one does.

## The two gates

| | This repo (`adlai-corpus-ingestion`) | Main `adlai` repo |
|---|---|---|
| Script | `scripts/verify_prd_gate.js` | `test_golden_set_validator.py` (lives in the `adlai` repo, not here) |
| Checks | Salwa's own ingestion Postgres (port 5433): `sources` / `documents` / `articles` / `article_chunks` / `ingestion_runs` / `source_snapshots` / `cross_references` — i.e. did the ingest pipeline actually run correctly against the internal relational schema | The exported `output/*.json` files, before/after they're embedded into ADLAI's own runtime retrieval store |
| Answers | "Did ingesting a source populate my DB the way the PRD says it should?" | "Is this JSON release safe to embed without regressing ADLAI's citation verifier / vector search?" |
| Runs | Locally / in this repo's CI, against this repo's Postgres | In the `adlai` repo's own pipeline, whenever it pulls a new export from here |

## Where this repo's new local gate fits in

`scripts/lint_corpus_contract.js` (`npm run lint:corpus`) is a **third**,
narrower gate, added for STORY-100: it validates `output/*.json` against
`data/corpus/schema.json` *before* anything leaves this repo. It does not
replace either of the two scripts above — it's a local pre-flight check so
that obviously-broken exports (missing `chunk_hash`, a `null` article number
with no `section_ref`, a malformed `source_url`, etc.) get caught here,
by Salwa, before a push — rather than surfacing later as a mysterious
regression in ADLAI's `test_golden_set_validator.py`, several steps removed
from the actual mistake.

```
git push (this repo)
   -> npm run lint:corpus          <- data/corpus/schema.json, THIS repo, THIS commit
   -> npm run verify:prd-gate      <- Salwa's ingestion Postgres, THIS repo
        ...tagged release / CI artifact...
   -> test_golden_set_validator.py <- adlai repo, checks the exported JSON
   -> run_eval.py                  <- adlai repo, confirms zero retrieval regression
```

## An important open question this doc does NOT resolve

While building the schema/linter (STORY-100 Phase 2), it became clear this
repo's own Postgres schema (`sources` -> `documents` -> `articles` ->
`article_chunks`, with real embeddings, HNSW indexes, hybrid dense+sparse
retrieval, and an eval runner — see this repo's own README) is a full,
working RAG pipeline in its own right, not just a raw-JSON exporter. That's
more than STORY-100's problem statement assumes ("ADLAI operates on a
flattened runtime vector table (`corpus`, 768 rows) populated via Python
`scripts/ingest_real_data.py`", as if this repo only ever produced flat
JSON with no retrieval capability of its own).

Whether the `adlai` (Python/FastAPI) repo's `corpus` table is meant to
stay a separate copy fed by these JSON exports, or whether it should
eventually just query this repo's Postgres directly, is an architecture
decision -- not something this doc or the schema/linter resolve. Flagging
it for Alex rather than guessing.

## What's intentionally *not* in `data/corpus/schema.json`

- **`law_type` is not a per-entry field.** It's derived from the filename
  via the `DOMAIN_MAP` in `scripts/lint_corpus_contract.js` (the same
  8 law_type -> slug(s) grouping `scripts/verify_prd_gate.js` already
  uses for `MANDATORY_DOMAINS`/`LEGACY_DOMAINS`). Stamping it onto every
  one of the ~1,100+ existing entries across all 12 output files would
  just duplicate what the filename already says. If the `adlai` importer
  genuinely needs a per-entry `law_type`, that's worth raising with Alex
  before adding it everywhere.
- **`fetched_at` is not required.** It's `null`/absent today for
  `misa.json`, `sama_banking_control_law.json`, and
  `sama_central_bank_law.json` — a real, pre-existing gap, not something
  to paper over with an invented timestamp. `npm run lint:corpus` does not
  fail on this; it's flagged here so it doesn't get lost.
