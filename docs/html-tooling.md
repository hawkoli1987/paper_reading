# HTML deck generation tooling

This workspace generates self-contained `.html` presentation decks from markdown paper summaries (see [`../CLAUDE.md`](../CLAUDE.md) for the full pipeline). This doc covers the tool used for the actual deck-generation step.

## `frontend-slides` Agent Skill (vendored)

- Source: [`github.com/affaan-m/ecc`](https://github.com/affaan-m/ecc) (`skills/frontend-slides`), MIT licensed.
- Vendored in-repo at `.claude/skills/frontend-slides/` — no marketplace install, no user-level dependency, works the same for anyone who clones this repo. The original copyright notice is kept at `.claude/skills/frontend-slides/LICENSE-ecc.txt` per the MIT license's attribution requirement.
- Zero external runtime dependencies: builds a single self-contained `presentation.html` per deck with inline CSS/JS, plus a sibling `assets/` folder only when the deck has images. Nothing to `npm install`, no LibreOffice, no headless Office conversion.

**Content model:** the skill has no source-of-truth file of its own — it authors slide content directly as HTML `<section>` elements from whatever is given to it in the conversation. In this workspace, that input is always `summaries/<slug>.md`; Claude decides per-generation which sections to pull in, at what depth, and how many slides, rather than filling in a template file.

**Hard viewport-fit rules the skill enforces:**
- Every slide is `height: 100vh; height: 100dvh; overflow: hidden;` — exactly one screen, never an internally-scrolling slide.
- Typography and spacing scale via `clamp()`; text never shrinks below a readable size.
- Content that doesn't fit splits across additional slides rather than shrinking indefinitely.
- Validated at 1920×1080, 1280×720, 768×1024, 375×667, and 667×375.

**Style presets:** `.claude/skills/frontend-slides/STYLE_PRESETS.md` lists the built-in visual styles.

### This repo's base CSS overrides the vendored skill's

Use **`templates/deck-base.css`** in place of the vendored skill's own "Mandatory Base CSS" block (`STYLE_PRESETS.md` / `viewport-base.css`) in every generated `presentation.html`. It's the same viewport-fitting contract, with fixes for defects the vendored block still reproduces: `scroll-snap-type` declared on the wrong element (`html` instead of the actual scroll container, so the deck rests between slides instead of snapping), and a heading font-size cap reached at a wider viewport (1600px) than where `.slide-content`'s own `max-width: 1440px` cap engages (1440px) — so a headline that fits at 1280px wraps again at 1920px because the font keeps growing after its container stops. Theme on top of it freely; don't edit the rules themselves.

The full house-style rule set for decks — this base-CSS rule plus seven more (one content measure, one size per heading level, ≤8-word headlines, unbreakable display numbers, `min-height:0` on constrained flex/grid children, no redundant inline styles, run the checker before handoff) — lives in **`.claude/skills/deck-writing/SKILL.md`**, the deck-side counterpart to `summary-writing/SKILL.md`. Apply it every generation and edit.

### Style selection

This repo's default style is **Swiss Modern** (preset #11: Archivo + Nunito, white/black/signal-red, "minimal, precise, data-forward") — established by the first deck generated, `decks/2024-12_deepseekai_deepseek-v3__fp8-pilot/`.

Every deck generation asks a mandatory question before building: stick with the default, or switch to one of two alternate presets picked from `STYLE_PRESETS.md`'s mood-to-preset table because they'd suit this specific paper better (e.g. a systems/infra paper leaning **Neon Cyber**, a narrative/position paper leaning **Paper & Ink**). This replaces the skill's own default flow of generating 3 live single-slide previews and asking the user to look at rendered output — we skip straight to naming presets from the catalog's descriptions, since the catalog itself (vibe, fonts, palette, signature) is usually enough to judge fit without the render round-trip. If the user isn't sure from the description alone, live previews are still available as a fallback — ask for them explicitly.

## Figure extraction

`frontend-slides` includes `scripts/extract-pptx.py` for pulling images out of an existing `.pptx`, which doesn't apply here since we generate straight from markdown, not from a deck.

Figures are pre-extracted once per paper by `scripts/extract-paper.py --figures` (see [`../CLAUDE.md`](../CLAUDE.md)'s "Pipeline" section) into `extracted/<slug>/figures/figure-<N>.png` — cropped from the compiled PDF via `page.get_text("dict")` caption-bbox location + `page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=rect)`, `zoom` ~3.5x. This replaces the old per-deck ad-hoc crop: the PDF is only opened once regardless of how many decks a paper spawns.

**Which figure to pull is decided at authoring time, not ad hoc at deck time.** The summary itself records the pairing via `[viz: Fig. N — <desc>]` / `[viz: Table N — <desc>]` tags on critical-concept bullets (`summary-writing` Requirement 4, added by `summary-tagger`) — deck generation reads those tags rather than re-deciding which figure fits which concept each time. To use a figure in a deck: copy the PNG you need from `extracted/<slug>/figures/` into the deck's own `assets/` folder and reference it by relative path (`assets/figure-name.png`) in the generated HTML — keep the per-deck `assets/` copy (don't reference `extracted/` directly) so each `presentation.html` stays self-contained and portable on its own.

If a figure's crop looks wrong (check `extracted/<slug>/manifest.json`'s `warnings` — a fallback-band crop is flagged there when the script couldn't locate an embedded image block above the caption), re-crop it by hand using the same recipe, or re-run the extractor with `--force`.

**Decorative vs. explanatory imagery.** The vendored `frontend-slides` skill's own guidance ("use abstract shapes, gradients, grids, noise, and geometry rather than illustrations") is about a deck's visual identity/background treatment — it isn't a rule against using the paper's own figures. A `[viz:]`-tagged figure illustrating a critical concept should still be rendered on its slide, within the skill's one-image-per-slide density cap; the abstract-shapes guidance just means don't invent decorative illustrations that aren't grounded in the paper.

## QA

The skill's own QA guidance (in `SKILL.md`) covers content, structure, and visual checks. In this workspace, QA is two steps: an automated screenshot pass, then a manual look at the images it produces.

### Automated: `scripts/qa-screenshot.js`

```bash
cd scripts && npm install   # once, installs puppeteer-core
node qa-screenshot.js ../decks/<slug>__<deck-name>/presentation.html
# or, for a fast pass/fail with no PNGs written (skips the screenshot wait,
# forces .reveal elements to their settled state instead):
node qa-screenshot.js ../decks/<slug>__<deck-name>/presentation.html --check-only
```

Renders every `.slide` at all five of the skill's required breakpoints (1920×1080, 1280×720, 768×1024, 375×667, 667×375) and screenshots each into `decks/<slug>__<deck-name>/qa-screenshots/` (or a custom output dir as a second argument, before `--check-only` if both are passed). On top of the screenshots, it runs six checks and exits non-zero if any fail (see `.claude/skills/deck-writing/SKILL.md` for the house rule each one enforces):

| Check | What it catches |
|---|---|
| outer overflow | `scrollHeight > clientHeight` on the `.slide` itself — the original, single most common defect per the skill's own checklist |
| **A: escape** | a content element's rendered box extends past its `.slide`'s box — catches content clipped by `overflow:hidden` that the outer-overflow check can't see, because the `.slide` box itself never grows even though a descendant (e.g. a grid column whose child lacks `min-height:0`) does (R6) |
| **B: chrome overlap** | a content element visually intersects `.footer-cite`, `.nav-dots`, `.progress-index`, or `.keyboard-hint` (R6) |
| **C: left-edge drift** | `.slide-content`'s content-box left edge isn't uniform across slides at a given breakpoint — the pixel measurement that originally diagnosed a per-slide width band shrink-wrapping instead of stretching (R2) |
| **D: heading/stat wrap** | an `h1`, `h2`, or `.stat-num`-classed element renders on more than one line — hard-fails at the two desktop breakpoints, informational only at tablet/mobile where wrapping is legitimate (R3, R5) |
| **E: headline length** | an `h1`/`h2` exceeds 8 words (R4) |

Findings print grouped by breakpoint (capped per-breakpoint, not globally, so a busy breakpoint can't silently push a different one's findings past a truncation cutoff unnoticed).

**How it works, and why not `chrome --headless --screenshot`:** that CLI flag takes one screenshot immediately after the page's `load` event, with no way to wait for anything after — so a deck using `scroll-behavior: smooth` or staggered `.reveal` animations (both of which `frontend-slides` decks use) gets captured mid-scroll or mid-fade, producing screenshots that look broken even when the deck isn't. `puppeteer-core` drives Chrome over the DevTools Protocol instead of the CLI, which means the script can run real JS in the page (`page.evaluate` — jump straight to a slide via `scrollIntoView`), wait on an actual timer for animations to settle, *then* measure/screenshot — each shot and measurement reflects the deck at rest, the same state a person would see. It's `puppeteer-core` rather than plain `puppeteer` specifically to skip puppeteer's ~300MB bundled Chromium download: `-core` ships only the automation client and drives whatever Chrome is already installed (`executablePath` in `qa-screenshot.js` — auto-detects the standard macOS/Linux/Windows install paths, or set `PUPPETEER_EXECUTABLE_PATH` to override).

These checks still can't catch everything — overlap/escape detection (A/B) is heuristic (leaf DOM elements only, so a bug expressed purely through a non-leaf container's box could slip through), and nothing here checks contrast, figure quality, or genuine interaction. Eyes on the images are still required.

### Manual

Look at every screenshot the script produces (or open `presentation.html` directly in a browser) and check:
- No text overflow or clipping, or overlapping/crowding elements (should already be caught above, but verify — especially anything the checker can't see, like a bug expressed only through a container's own box).
- Figures load correctly from `assets/` and aren't stretched or low-contrast.
- Consistent spacing and alignment slide-to-slide, and general contrast/legibility.
- Keyboard, wheel/trackpad, and touch navigation all work, and **scroll-snap actually lands on a slide rather than resting between two** — open the file directly for this, screenshots can't verify interaction.

`scripts/export-pdf.sh` (from the vendored skill) needs Playwright, which this repo doesn't install (it standardized on `puppeteer-core` instead — see below and the "How it works" note above). Use `scripts/export-pptx.py` for a PDF-adjacent snapshot; it needs no extra dependency.

## Export to PPTX

```bash
.venv/bin/python scripts/export-pptx.py decks/<slug>__<deck-name>/presentation.html
# writes presentation.pptx beside the html
```

Two-stage pipeline: `scripts/render-deck.js` (a `puppeteer-core` sibling of `qa-screenshot.js`, sharing its Chrome-detection via `scripts/lib/find-chrome.js`) screenshots every `.slide` at 1440×810 in DOM order with `.keyboard-hint`/`.nav-dots`/`.progress-index` hidden (meaningless once slides leave the browser — `.footer-cite` stays); `scripts/export-pptx.py` then assembles those PNGs into a 16:9 `.pptx` via `python-pptx` (already in `.venv`), one full-bleed picture per slide.

**Renders at 1440×810, not 1920×1080.** Decks cap `.slide-content` at `max-width: 1440px` (`templates/deck-base.css`); rendering wider than that leaves the cap's slack as dead space on the right of every slide once it's stretched to fill a 16:9 pptx slide. 1440×810 keeps 16:9 while landing exactly on that cap, so content fills the frame. Override with `render-deck.js`'s own `--viewport WxH` flag if a deck's content intentionally doesn't fill 1440 (e.g. a centered title card) — `export-pptx.py` doesn't currently expose this flag itself.

**Fidelity is image-per-slide, not native text.** Pixel-identical to the browser — every layout, color, figure, and grid survives — but slide text isn't selectable/editable in PowerPoint. Rebuilding native text boxes was considered and rejected: it's a second renderer to maintain, and Swiss Modern's asymmetric grid layouts wouldn't survive a text-box reflow.

Options: `--jpeg` re-encodes each slide as JPEG (quality 88) before embedding to shrink the file — worthwhile on decks with large photographic figures, but on a mostly-flat-color/white deck like this one PNG already compresses well and the saving is closer to ~10% than a dramatic cut. `--keep-pngs DIR` renders into `DIR` instead of a temp dir if the intermediate frames are also wanted.

Two caveats inherent to any static, browser-rendered export, not fixed by this tooling:
- Any `assets/*.gif` flattens to whichever frame is showing after the render's settle wait.
- The deck's Google Fonts (`fonts.googleapis.com`) need network access at export time; offline, Chrome silently substitutes a fallback font and the export won't match what a live-network browser shows.

## Retired: PPTX workflow (pre-HTML-deck era)

This workspace previously generated `.pptx` decks directly via the Anthropic `pptx` Agent Skill, before the pipeline moved to HTML decks as the primary artifact. That generation path is retired — see git history for the prior `docs/ppt-tooling.md` if it's ever needed again. The `.pptx` *export* above is unrelated: it's a rendering of an HTML deck, not an alternative source format.
