---
name: deck-writing
description: House-style formatting requirements for generating and editing decks/<slug>__*/presentation.html. The requirement list grows over time — apply every requirement below whenever building or editing a deck with the frontend-slides skill. Use when authoring or editing a decks/*/presentation.html file.
---

# Deck-Writing Style Requirements

This skill accumulates the house-style rules for `decks/<slug>__<deck-name>/presentation.html` files (see [`../../../CLAUDE.md`](../../../CLAUDE.md) for the full pipeline). It complements the vendored `frontend-slides` skill: that skill governs content model, style presets, and its own viewport-fit gate; this one governs the CSS mechanics decks in *this* repo must get right, because the vendored skill's own "Mandatory Base CSS" block reproduces several of them.

Apply every requirement below whenever generating a new deck or editing an existing one. When a new requirement is added, append it as a new numbered section at the end — never remove, renumber, or silently alter an existing requirement.

## Requirement 1: base CSS comes from `templates/deck-base.css`, not the vendored skill

Copy `templates/deck-base.css` verbatim into every generated `presentation.html` in place of the block in `.claude/skills/frontend-slides/STYLE_PRESETS.md` / `viewport-base.css`. Theme on top of it (colors, fonts, decorative motifs) freely — don't edit the rules it sets.

**Why:** the vendored block still declares `scroll-snap-type` on `html` and `--title-size: clamp(1.5rem, 5vw, 4rem)` — both defects this repo already hit and fixed once, in `decks/2024-12_deepseekai_deepseek-v3/presentation.html`. `templates/deck-base.css` is that fix, generalized. Re-copying the vendored block silently reintroduces both bugs in the next deck.

## Requirement 2: one content measure, left-aligned

Every slide's content band shares the same left edge. Don't give individual slides a per-slide `max-width` + `margin-inline: auto` "wide" band — under flexbox, a cross-axis `auto` margin makes the element skip `align-self: stretch` and shrink-wrap to its own content, so the left edge (and therefore the heading's apparent alignment) drifts from slide to slide depending on what's on it.

- A slide that should genuinely be centered (title card, section divider) uses the explicit `.slide-content--centered` class from `templates/deck-base.css`, not an ad hoc margin.
- If a slide needs a narrower reading measure than the full content band, constrain the child element (e.g. a paragraph's `max-width: 60ch`), not `.slide-content` itself.

**Why:** this was reported as "all pages seem to have different spacing on the left/right" and "headers look center-aligned instead of left-aligned" — both were the same root cause (an inconsistently shrink-wrapped `.slide-content`), not two separate bugs.

## Requirement 3: one size per heading level

Every `h1` uses `--title-size`, every `h2` uses `--h2-size`, every `h3` uses `--h3-size` — no exceptions, no per-slide inline `font-size` override, no one-off class that resizes a single slide's heading.

**Why:** a slide with an oversized heading font wraps unnecessarily even when the text itself would otherwise fit on one line at the deck's standard size — this was reported directly ("page 8 uses an excessive large size font, cause the header to wrap unnecessarily"). If a heading doesn't fit at the standard size, the fix is R4 (shorten it), not a bigger box or a smaller font for that one slide.

## Requirement 4: headlines ≤ 8 words

Every `h1` and `h2` is at most 8 words. If the natural phrasing runs long, shorten it *first*, then apply the level's standard size from R3 — don't shrink type to make a long sentence fit, and don't wrap-and-accept.

- Any detail a shortened headline drops must still be present somewhere else on the same slide (a bullet, a stat label, a caption) — a headline compression is a rewording, not a fact removal.
- This is a hard cap from direct user feedback, not a soft guideline: "all headers should be concise, with max 8 words. If the header is a long sentence, shorten it first, and then apply font size consistent to its level."

**Why:** long headlines are what force per-slide font-size overrides (R3) or wrapping in the first place; capping length is what makes a single consistent size actually fit everywhere.

## Requirement 5: display numbers never wrap

Any large standalone number/stat callout (a `.stat-num`-style element) gets `white-space: nowrap`, and its flex container gets `flex: 1 1 auto; min-width: auto` rather than a fixed `min-width` that squeezes neighboring stats.

**Why:** reported directly — "the headline were still wrapped at '20 SMs'" — caused by a fixed `min-width: 140px` on a 3-up stat row squeezing the third column below its content's natural width.

## Requirement 6: `min-height: 0` (and `min-width: 0`) on constrained flex/grid children

Any flex or grid child that sits inside a height-constrained ancestor chain (ultimately bounded by `.slide`'s `height: 100dvh; overflow: hidden`) gets `min-height: 0` explicitly. Without it, the browser's default automatic minimum size lets the child's *intrinsic* content height push past its allotted box — and because a grid's implicit `auto` row (or a flex item without this override) isn't clipped by the parent's own `overflow: hidden` the way you'd expect, the overflowing content escapes visually into whatever sits below it (footer citation, nav dots) instead of being cut off cleanly.

- Applies to `.two-col`/`.fig-stack`-style layout columns and any custom multi-part layout, not just the two named in this rule's origin.
- Pair with `min-width: 0` on the same elements when they're arranged in a row rather than a column.

**Why:** this is the mechanism behind two real bugs in this repo's first deck — `.fig-stack`'s figure column and later `.two-col`'s text column (three stats + two bullets) both overflowed past the slide boundary and visually collided with `.footer-cite`, and `qa-screenshot.js`'s outer-`.slide` overflow check didn't catch either (see Requirement 8 and `docs/html-tooling.md`).

## Requirement 7: no redundant inline styles

Don't add an inline `style=` attribute that just restates a value a class rule already applies (e.g. `style="font-size: var(--body-size)"` on a `<li>` inside `.bullet-list`, which already sets that in CSS). Only use inline styles for a value that is genuinely one-off for that element.

**Why:** redundant inline styles are dead weight that can silently drift out of sync with the class rule if the class is later retuned, and they were found accumulating in this repo's first deck from iterative edits.

## Requirement 8: run the checker, then eyeball what it can't see

Before handing off a generated or edited deck, run:

```bash
node scripts/qa-screenshot.js decks/<slug>__<deck-name>/presentation.html
```

Fix everything it reports (overflow, chrome overlap, left-edge drift, heading/stat-num wrap, over-length headlines — see `docs/html-tooling.md` for the full check list). Then still look at the produced screenshots (or open the file in a browser) for what no automated check catches: contrast, figure quality/cropping, and interaction (keyboard/wheel/touch nav, and — screenshots can't show this at all — that scroll-snap actually lands on a slide rather than resting between two).

**Why:** the checker existed during the defects this skill documents and reported "no overflow" on a slide that was visibly clipped into the footer, because it only tested the outer `.slide` box. It's been extended (R6's bug is now a named check) but it still can't see everything — running it is necessary, not sufficient.
