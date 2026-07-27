# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This workspace is for reading AI research papers, writing structured summaries, and generating HTML presentation decks from them. It is not a software codebase — there is no build/lint/test tooling. All summaries and decks are written in **English**.

## Pipeline

```
papers/<slug>.pdf
      │  scripts/extract-paper.py (once per paper) →
      │  extracted/<slug>/{latex.md, text.md, manifest.json[, figures/]}
      ▼
summaries/<slug>.md          ← the single source of truth
      │  authored from extracted/<slug>/latex.md or text.md
      │  (raw PDF only for layout-sensitive edge cases)
      │  claim-verifier checks every claim against the cache →
      │  audit/<slug>.md (mandatory after write/edit)
      │
      │  at generation time: pick which sections/depth to include,
      │  a purpose (talk/pitch/teaching/exec skim), a length, and a
      │  frontend-slides style preset — decided conversationally,
      │  no template file. Style is a mandatory question every time:
      │  default (Swiss Modern) vs. two alternates suited to this paper.
      ▼
decks/<slug>__<deck-name>/
      ├── presentation.html   ← self-contained deck (inline CSS/JS)
      └── assets/              ← figures copied from extracted/<slug>/figures/
      │  hook-scoped to just the new/changed slide hunks →
      │  claim-verifier checks those against the summary →
      │  audit/<slug>.md (enforced by hook after generate/edit)
```

1. **Drop the source PDF in `papers/`, then extract it once.** Run `scripts/extract-paper.py papers/<slug>.pdf [--arxiv <id>] [--figures]` (via the project `.venv`) to build `extracted/<slug>/` — this is the shared cache every later step reads instead of each independently re-parsing the PDF. Pass `--arxiv <id>` whenever the paper is on arxiv (the common case): it produces `latex.md`, a cleaner grounding surface than PDF text for the section/equation/table locators this repo actually uses (`text.md`, PDF-derived, stays the page-number authority and the fallback for non-arxiv papers). `latex.md` itself has two tiers, tried in order: arxiv's own LaTeXML-compiled HTML render (`arxiv.org/html/<id>` — resolved citations, correctly lettered appendices, intact equations, since arxiv already ran a full LaTeX compiler), falling back to fetching the raw LaTeX source tarball and hand-flattening it when the HTML render 404s (LaTeXML can't compile every paper). `manifest.json`'s `source` field records which tier actually ran (`arxiv-html:<id>` vs `arxiv-tarball:<id>`) — see `docs/extraction-sources.md` for the evaluation behind this and each tier's tradeoffs. Pass `--figures` to also pre-crop figures once for reuse across every deck the paper spawns. Re-run (any Bash-capable step can) if you ever replace `papers/<slug>.pdf` — consumers compare its sha256 against `extracted/<slug>/manifest.json` and rebuild on mismatch, except `claim-verifier` (no `Bash`), which trusts the cache as-is.
2. **Write the summary** in `summaries/<slug>.md`, following `templates/summary-template.md` exactly (same section headings every time — this is what makes step 3 mechanical). Author from `extracted/<slug>/latex.md`/`text.md`, not the raw PDF. The summary is hand-curated / corrected by the user and is what gets reused, searched, and referenced later.
   - **Tagging is delegated to the `summary-tagger` subagent** (`.claude/agents/summary-tagger.md`), not done by the coordinator directly. Give it the target file/scope and it grounds `[src: <locator>]` reference tags (per `summary-writing` skill, Requirement 2) against `extracted/<slug>/`, tagging every claim the report itself states and leaving synthesis/inference/external/framing claims untagged — then hands back the referenced/unreferenced split for the coordinator to pass straight to `claim-verifier`. Invoke it whenever writing a new summary or retrofitting tags onto an untagged one.
   - **The same pass also attaches `[viz: <locator> — <desc>]` visual-aid pointers** (Requirement 4) to critical-concept bullets — Key Contributions, core Method mechanisms, headline results — choosing the best-matching paper figure/table from `extracted/<slug>/manifest.json`. It hands back a third list, **visual candidates/gaps**: concepts it found no fitting paper figure for. For each gap, dispatch an Explore agent to search externally for a clarifying diagram (paper-first, external fallback, every critical concept) and add `[viz: ext — <url> — <desc>]` yourself. `[ref-only]` (Requirement 3) marks a bullet-and-subtree as reference-only — kept in the summary, excluded from decks by default — and is set by whoever authors the bullet (coordinator or user), not by `summary-tagger`.
   - **Claim verification is enforced by a hook, not just convention.** Untagged claims are what get actively checked. A `PostToolUse` hook (`scripts/hooks/on-summary-edit.js`) watches every `summaries/*.md` write/edit: pure-formatting diffs are skipped silently, anything else records a pending-audit marker at `.claude/.audit-pending/<slug>.md`. A `Stop` hook (`scripts/hooks/require-audit.js`) then **blocks turn-end** while any marker is unresolved.
     - To resolve: split the changed claims into **referenced** (hand to `claim-verifier` to log as `ACCEPTED-CITED`, no re-check) and **unreferenced** (hand to `claim-verifier` to actively verify against `extracted/<slug>/` or web search). It always appends a run to `audit/<slug>.md`, whose timestamp is what clears the block.
     - If a change altered no claim at all (pure reformat/rewording the hook's normalizer didn't catch) — clear it directly: `rm .claude/.audit-pending/<slug>.md`.
     - Fix anything flagged INCORRECT; use judgement on UNCERTAIN (reword, dig further, or ask the user if it's a genuine judgment call) — either way, don't silently wave off a flag.
3. **Generate a deck** by reading the summary and invoking the `frontend-slides` skill. Decide per-generation which summary sections to include, at what depth — the skill asks for purpose, length, and content-state conversationally; there is no deck template file to fill in.
   - **Base CSS comes from `templates/deck-base.css`, not the vendored skill's own block.** Copy it into the generated `presentation.html` in place of `.claude/skills/frontend-slides/STYLE_PRESETS.md`/`viewport-base.css`'s "Mandatory Base CSS" — the vendored block still has bugs this repo hit and fixed once (scroll-snap on the wrong element, a font-size cap reached at a wider viewport than the content container's own max-width cap). Theme on top of it freely; don't edit the rules themselves. The full house-style rule set (this one plus seven others — one content measure, one size per heading level, ≤8-word headlines, unbreakable display numbers, `min-height:0` on constrained flex/grid children, no redundant inline styles, run the checker before handoff) lives in **`.claude/skills/deck-writing/SKILL.md`** — apply it every generation and edit, the same way `summary-writing` governs summary content.
   - **`[ref-only]`-marked bullets (and their subtrees) are excluded by default.** Treat the marker as a standing "skip this in decks" default that complements the conversational content decision each generation — still pull one in explicitly if that generation's audience specifically wants the depth.
   - **`[viz: ...]`-marked bullets get their figure rendered on the corresponding slide**, within the skill's one-image-per-slide density cap: for a paper-internal locator, copy `extracted/<slug>/figures/figure-N.png` into the deck's `assets/`; for `[viz: ext — <url> — ...]`, fetch/embed the external image the same way. The `frontend-slides` skill's "use abstract shapes... rather than illustrations" guidance governs *decorative/identity* imagery only — explanatory `[viz:]` figures for critical concepts are encouraged, not overridden by that rule.
   - **All markers (`[src:]`, `[viz:]`, `[ref-only]`) are authoring-layer only** — never let their literal tag text leak onto rendered slide content.
   - **Style is a mandatory question, every generation.** This repo's default style is **Swiss Modern** (`STYLE_PRESETS.md` preset #11 — Archivo + Nunito, white/black/signal-red; established by the first deck, `decks/2024-12_deepseekai_deepseek-v3__fp8-pilot/`). Before building, ask the user via a 3-option question: stick with the default, or pick one of two alternate presets you select from `STYLE_PRESETS.md`'s mood-to-preset table based on what would suit *this* paper's content/tone better than the default would. No live preview generation — the question is judged from the preset catalog's descriptions, not rendered slides.
   - Save output to `decks/<slug>__<deck-name>/presentation.html` with its `assets/` folder. Figures come from `extracted/<slug>/figures/` (pre-cropped by `scripts/extract-paper.py --figures`, see `docs/html-tooling.md`) — copy the ones you need into the deck's own `assets/` so the deck stays self-contained; don't reference `extracted/` directly from the HTML.
   - **Before handoff, run `node scripts/qa-screenshot.js decks/<slug>__<deck-name>/presentation.html` and fix everything it reports** (deck-writing SKILL.md Requirement 8) — it's convention, not hook-enforced, so this only happens if you actually run it. See `docs/html-tooling.md`'s QA section for what it checks and what still needs a human eye.
   - **Claim verification is hook-enforced here too**, not just convention — same mechanism as step 2. A `PostToolUse` hook (`scripts/hooks/on-deck-edit.js`) watches every `decks/*/presentation.html` write/edit: pure HTML/CSS/JS-noise diffs (style tweaks, class/id churn, layout markup) are skipped silently, anything that changes visible slide content records a pending-audit marker at `.claude/.audit-pending/<slug>.md` (shared with step 2's marker for the same paper). The same `Stop` hook (`scripts/hooks/require-audit.js`) blocks turn-end until it's resolved.
     - The scope handed to `claim-verifier` is never the whole deck — it's exactly the new/changed hunks the hook recorded (an `Edit`/`MultiEdit` call's `old_string`/`new_string` pairing, or the full file only on a from-scratch `Write`). A deck edit that only touches 7 new slides gets `claim-verifier` scoped to those 7 slides, not a full re-verification of the whole deck.
     - Resolve by checking those hunks against `summaries/<slug>.md`, not the PDF (the deck's job is faithful transcription of an already-verified summary, not re-deriving facts) — `claim-verifier` appends the run to `audit/<slug>.md`, same file step 2 writes to.
     - If a change altered no visible claim at all (pure reformat the hook's normalizer didn't catch) — clear it directly: `rm .claude/.audit-pending/<slug>.md`.
   - **A finished deck can be exported to `.pptx`** via `.venv/bin/python scripts/export-pptx.py decks/<slug>__<deck-name>/presentation.html` — one full-bleed screenshot per slide (image fidelity, not editable text); see `docs/html-tooling.md`'s "Export to PPTX" section.

### Key principle: one summary → many decks

The markdown summary is the only thing that should be hand-edited for content. Note the summary file itself is a **convention of this repo**, not a requirement of the `frontend-slides` skill — the skill takes content from whatever is pasted into the conversation and has no source-of-truth format of its own. We keep `summaries/<slug>.md` because it gives us a hand-curated, searchable, reusable record across many decks.

Each deck generation applies a layer of *decisions* on top of the summary:

- **Content decisions**: which summary sections to include, in what order, at what depth, and how many slides. Made conversationally each time (e.g. "10-slide conference talk" vs. "20-slide deep dive" vs. "4-slide exec skim") — complemented by the summary's own `[ref-only]` markers, a persistent default-exclude signal set once at authoring time rather than re-decided per generation (see the marker legend at the top of `templates/summary-template.md` and `summary-writing` Requirements 3–4).
- **Formatting decisions**: which `frontend-slides` style preset to use (see `.claude/skills/frontend-slides/STYLE_PRESETS.md`) — asked as a mandatory default-vs-2-alternates question at generation time, not silently chosen.

This means the same `summaries/<slug>.md` can produce `decks/<slug>__talk/` (a ~10-slide conference talk), `decks/<slug>__deepdive/` (a ~20-25 slide technical review), and `decks/<slug>__exec/` (a 3-4 slide skim) without re-reading the paper or duplicating notes.

If a summary needs to change, edit the markdown — don't hand-edit a generated `presentation.html` and let it drift out of sync with the source of truth. Regenerate the deck instead.

### Optional deep-dive content: the Appendix convention

Some material is worth capturing in the summary but shouldn't force its way into every deck — e.g. a deeper unpacking of one bullet that only some audiences need. Handle this with an **Appendix**, not by inlining extra depth into the section it came from and not by splitting it into a separate file (that would fragment the single source of truth the rest of this pipeline depends on):

- **In the summary**: expanded content goes in a `## Appendix` section at the end of `summaries/<slug>.md` (after Citation) — the one sanctioned addition to the otherwise-fixed template (see "Summary template contract" below). The originating section gets a markdown anchor link back to it (e.g. `[deeper on X →](#appendix-x)`). Same tagging/verification flow as any other summary content — `summary-tagger` then `claim-verifier`, hook fires normally.
- **In the deck**: if a given generation pulls in an appendix entry, it becomes a slide appended after the main flow (not spliced into the middle), with a small jump control on the originating main slide (`onclick="presentation.goTo(<idx>)"` or equivalent) and a "back" control on the appendix slide returning to it. The first time a deck gets an appendix slide, also exclude appendix slides from the progress counter / nav-dot count (the controller's `updateProgress()`/slide-count logic) so the main flow still reads as self-contained — a one-time controller tweak, not repeated per slide added later.
- **Still opt-in per generation**: an Appendix entry existing in the summary doesn't mean it ships in every deck. Whether to pull a given entry in as a slide is the same kind of conversational content decision as any other section/depth choice.

## Naming convention

- Paper slug: `<YYYY-MM>_<first-author>_<short-title-slug>` (e.g. `2017-06_vaswani_attention-is-all-you-need`), shared across `papers/` and `summaries/`.
- Deck output: `decks/<slug>__<deck-name>/presentation.html` (e.g. `decks/2017-06_vaswani_attention-is-all-you-need__talk/presentation.html`), with any extracted figures in a sibling `assets/` folder. `<deck-name>` is a free-form label chosen at generation time (e.g. `talk`, `deepdive`, `exec`).

## Directory structure

- `papers/` — source PDFs.
- `extracted/` — cached per-paper extraction (`latex.md`, `text.md`, `manifest.json`, optionally `figures/`), the shared grounding source for authoring, tagging, and verification. Built/refreshed by `scripts/extract-paper.py`; regenerate (or let a Bash-capable step auto-rebuild on sha256 mismatch) whenever a `papers/<slug>.pdf` changes. `latex.md`/`text.md`/`manifest.json` are committed (small, diffable, a greppable full-text corpus); `figures/` is gitignored (regenerable binaries).
- `summaries/` — one markdown summary per paper, the source of truth (see `templates/summary-template.md` for structure).
- `decks/` — generated HTML deck outputs, one directory per deck (`presentation.html` + `assets/`).
- `audit/` — one append-only claim-verification log per paper (`audit/<slug>.md`), written by the `claim-verifier` subagent (`.claude/agents/claim-verifier.md`).
- `.claude/agents/summary-tagger.md` — subagent that adds `[src: <locator>]` tags to a summary's directly-sourced claims and `[viz: <locator> — <desc>]` paper-figure pointers to critical-concept bullets, returning the referenced/unreferenced split (for `claim-verifier`) plus a visual-candidates/gaps list; see step 2 above.
- `templates/` — the summary template (`summary-template.md`) and `deck-base.css`, the repo-owned corrected viewport-fitting base every deck's inline CSS copies in place of the vendored skill's own block (see `docs/html-tooling.md`).
- `docs/html-tooling.md` — HTML deck generation tooling notes.
- `.claude/skills/frontend-slides/` — vendored Agent Skill that builds the decks (from [`affaan-m/ecc`](https://github.com/affaan-m/ecc), MIT licensed — see `LICENSE-ecc.txt` in that folder).
- `.claude/skills/deck-writing/` — this repo's house-style formatting requirements for `decks/*/presentation.html`, the deck-side counterpart to `summary-writing`.
- `scripts/` — repo-owned tooling: `extract-paper.py` (the extraction cache builder — see the "Pipeline" section above), `qa-screenshot.js` (automated viewport-overflow check across breakpoints via `puppeteer-core`; see `docs/html-tooling.md`), and `hooks/` (`on-summary-edit.js` + `require-audit.js`, the claim-verification enforcement hooks — see the mandatory-verification step above and `.claude/settings.local.json`).
- `.claude/.audit-pending/` — transient, gitignored markers for summary edits awaiting a `claim-verifier` run; written and cleared by the hooks above, never hand-edited except to `rm` a marker judged to be a non-claim change.

## HTML generation tooling

Decks are generated using the vendored **`frontend-slides` Agent Skill** (`.claude/skills/frontend-slides/`). Claude reads the summary, decides which sections to include and at what depth for the requested deck style, then drives the skill to build a self-contained `presentation.html` (inline CSS/JS, no external runtime dependencies) plus an `assets/` folder for any embedded figures. The skill enforces viewport-fit slides (each slide is exactly one screen, no internal scrolling) and includes its own visual-QA guidance, backed by `scripts/qa-screenshot.js` for automated overflow checks.

See [`docs/html-tooling.md`](docs/html-tooling.md) for tooling details, figure-extraction notes, and the QA checklist.

## Summary template contract

Every file in `summaries/` follows the same fixed headings (see `templates/summary-template.md`):

Title/Authors/Venue/Year/Link/Code → TL;DR → Problem & Motivation → Key Contributions → Method → Experiments & Results → Limitations & Open Questions → Personal Takeaways → Citation (BibTeX).

Keeping this fixed is what lets any deck generation map from it without needing paper-specific instructions each time. The one sanctioned addition is an optional `## Appendix` section at the end for deep-dive content that shouldn't force its way into the core narrative — see the Appendix convention above.

Content style *within* those headings (not the headings themselves) is governed by the `summary-writing` skill (`.claude/skills/summary-writing/`), an incrementally-growing list of house-style requirements — e.g. nested-pointer form (hierarchical bullet trees instead of prose paragraphs).
