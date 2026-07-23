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

### Style selection

This repo's default style is **Swiss Modern** (preset #11: Archivo + Nunito, white/black/signal-red, "minimal, precise, data-forward") — established by the first deck generated, `decks/2024-12_deepseekai_deepseek-v3__fp8-pilot/`.

Every deck generation asks a mandatory question before building: stick with the default, or switch to one of two alternate presets picked from `STYLE_PRESETS.md`'s mood-to-preset table because they'd suit this specific paper better (e.g. a systems/infra paper leaning **Neon Cyber**, a narrative/position paper leaning **Paper & Ink**). This replaces the skill's own default flow of generating 3 live single-slide previews and asking the user to look at rendered output — we skip straight to naming presets from the catalog's descriptions, since the catalog itself (vibe, fonts, palette, signature) is usually enough to judge fit without the render round-trip. If the user isn't sure from the description alone, live previews are still available as a fallback — ask for them explicitly.

## Figure extraction

`frontend-slides` includes `scripts/extract-pptx.py` for pulling images out of an existing `.pptx`, which doesn't apply here since we generate straight from markdown, not from a deck.

Figures are pre-extracted once per paper by `scripts/extract-paper.py --figures` (see [`../CLAUDE.md`](../CLAUDE.md)'s "Pipeline" section) into `extracted/<slug>/figures/figure-<N>.png` — cropped from the compiled PDF via `page.get_text("dict")` caption-bbox location + `page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=rect)`, `zoom` ~3.5x. This replaces the old per-deck ad-hoc crop: the PDF is only opened once regardless of how many decks a paper spawns.

To use a figure in a deck: copy the PNG you need from `extracted/<slug>/figures/` into the deck's own `assets/` folder and reference it by relative path (`assets/figure-name.png`) in the generated HTML — keep the per-deck `assets/` copy (don't reference `extracted/` directly) so each `presentation.html` stays self-contained and portable on its own.

If a figure's crop looks wrong (check `extracted/<slug>/manifest.json`'s `warnings` — a fallback-band crop is flagged there when the script couldn't locate an embedded image block above the caption), re-crop it by hand using the same recipe, or re-run the extractor with `--force`.

## QA

The skill's own QA guidance (in `SKILL.md`) covers content, structure, and visual checks. In this workspace, QA is two steps: an automated screenshot pass, then a manual look at the images it produces.

### Automated: `scripts/qa-screenshot.js`

```bash
cd scripts && npm install   # once, installs puppeteer-core
node qa-screenshot.js ../decks/<slug>__<deck-name>/presentation.html
```

Renders every `.slide` at all five of the skill's required breakpoints (1920×1080, 1280×720, 768×1024, 375×667, 667×375), screenshots each into `decks/<slug>__<deck-name>/qa-screenshots/` (or a custom output dir as a second argument), and flags any slide whose content is taller than its viewport box (`scrollHeight > clientHeight`) — the single most common defect per the skill's own checklist. Exits non-zero if it finds one.

**How it works, and why not `chrome --headless --screenshot`:** that CLI flag takes one screenshot immediately after the page's `load` event, with no way to wait for anything after — so a deck using `scroll-behavior: smooth` or staggered `.reveal` animations (both of which `frontend-slides` decks use) gets captured mid-scroll or mid-fade, producing screenshots that look broken even when the deck isn't. `puppeteer-core` drives Chrome over the DevTools Protocol instead of the CLI, which means the script can run real JS in the page (`page.evaluate` — jump straight to a slide via `scrollIntoView`), wait on an actual timer for animations to settle, *then* screenshot — each shot reflects the deck at rest, the same state a person would see. It's `puppeteer-core` rather than plain `puppeteer` specifically to skip puppeteer's ~300MB bundled Chromium download: `-core` ships only the automation client and drives whatever Chrome is already installed (`executablePath` in `qa-screenshot.js` — auto-detects the standard macOS/Linux/Windows install paths, or set `PUPPETEER_EXECUTABLE_PATH` to override).

This check only catches vertical overflow. It will not catch overlapping elements, uneven spacing, low contrast, or horizontal collisions (e.g. two side-by-side elements crowding into each other without either one overflowing its own box) — those still need eyes on the images.

### Manual

Look at every screenshot the script produces (or open `presentation.html` directly in a browser) and check:
- No text overflow or clipping (should already be caught above, but verify).
- Overlapping elements, or elements crowding each other (< 0.3" / ~24px gaps).
- Figures load correctly from `assets/` and aren't stretched or low-contrast.
- Consistent spacing and alignment slide-to-slide.
- Keyboard, wheel/trackpad, and touch navigation all work (open the file directly for this — screenshots can't verify interaction).

`scripts/export-pdf.sh` (from the vendored skill) is also available if a PDF snapshot is wanted instead of PNGs.

## Retired: PPTX workflow

This workspace previously generated `.pptx` decks via the Anthropic `pptx` Agent Skill. That workflow has been retired in favor of HTML decks; see git history for the prior `docs/ppt-tooling.md` if the old approach is ever needed again.
