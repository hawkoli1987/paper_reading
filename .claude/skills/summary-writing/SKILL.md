---
name: summary-writing
description: House-style requirements for writing and editing paper summaries in summaries/<slug>.md. The requirement list grows over time — apply every requirement below whenever creating a new summary or editing an existing one. Use when authoring a summaries/*.md file or reformatting one to match house style.
---

# Summary-Writing Style Requirements

This skill accumulates the house-style rules for `summaries/<slug>.md` files (see [`../../CLAUDE.md`](../../CLAUDE.md) for the full pipeline and the fixed section-heading contract). The heading structure lives in `templates/summary-template.md`; this skill governs how the *content under those headings* is written.

Apply every requirement below whenever writing a new summary or editing an existing one. When a new requirement is added, append it as a new numbered section at the end — never remove, renumber, or silently alter an existing requirement.

## Requirement 1: Nested-pointer form

All body content (not frontmatter-style metadata lines, tables, or code blocks) must be written as a **hierarchical bullet tree**, not prose paragraphs.

- Every bullet states exactly **one atomic claim**.
- Supporting detail, mechanism, evidence, numbers, or examples for that claim become **child bullets nested beneath it** — never pack multiple independent ideas into one bullet by chaining them with semicolons or "and".
- If a bullet contains more than one independent idea, split it: the shared/umbrella idea becomes the parent, each independent idea becomes a child.
- Nest as deep as the content's logic actually goes (typically 2-3 levels) — don't force artificial nesting onto a genuinely flat, single-level fact.
- This applies everywhere, including sections that read as narrative prose in ordinary writing (TL;DR-style framing, "why this matters" discussion). Convert flowing sentences into a parent claim plus nested support rather than leaving them as paragraphs.
- A one-sentence TL;DR that is already a single atomic claim by design doesn't need children — it's still written as one bullet, just a childless one.
- Section headings (`##`, `###`) are unaffected — only the body content underneath becomes the bullet tree.

**Why:** flat prose and long compound bullets bury the logical structure of an argument, making it slower to skim and harder to map onto slides later. A bullet tree makes the claim/evidence relationship explicit: parent → slide title or headline claim, children → supporting slide bullets.

## Requirement 2: source-reference tags

Every claim lifted **directly** from the paper — a number, a named result, a quote, a method detail, a dataset/model name — gets a trailing inline tag: **`[src: <locator>]`**, e.g. `[src: §4.2]`, `[src: p.7, Table 3]`, `[src: Eq. 12]`, `[src: Fig. 5]`.

- Tag the claim it grounds, not the bullet's parent or a whole section — if a bullet contains one claim, one tag; if a child bullet adds its own directly-extracted number, it gets its own tag.
- **Leave untagged**: synthesis, inference, comparison to other work, personal framing, or anything not read straight off a specific page/section/table/figure of the paper. These are exactly the claims that still need active verification.
- Use a consistent, unambiguous locator — section number, page + table/figure number, or equation number. Don't tag with something unverifiable like "the paper" alone.

**Why:** this tag is the provenance signal the claim-verification pipeline runs on (see `.claude/agents/claim-verifier.md` and `CLAUDE.md`'s mandatory-verification step). A tagged claim is trusted on its citation and logged as accepted without re-checking; an untagged claim is exactly what gets forwarded for active verification against the source PDF or web search. Tagging accurately is what keeps verification effort pointed at the claims that actually need it.

## Requirement 3: `[ref-only]` deck-scope marker

Some detail is worth keeping in the summary for future reference but shouldn't force its way into every deck — a trivial specific, a tangent, a number only a deep-dive audience needs. Mark it with a trailing inline tag: **`[ref-only]`**, placed after any `[src: ...]`/`[viz: ...]` tag already on the same bullet.

- **Default is deck-eligible.** Only tag the exceptions — don't mark the majority of bullets that are perfectly fine to surface on a slide.
- **A marker on a parent bullet covers its entire subtree.** Don't also tag every child underneath it.
- Excluded from decks *by default*, not permanently forbidden: a specific deck generation can still explicitly pull a `[ref-only]` bullet in if that generation's audience wants the depth — same opt-in spirit as the `## Appendix` convention (see `CLAUDE.md`).
- Orthogonal to `[src:]`/`[viz:]` — a bullet can be cited, illustrated, *and* ref-only at once; the tags stack, e.g. `... [src: §3.3] [ref-only]`.
- This tag makes no factual assertion — it's editorial, not a claim — so it is never a verification target for `claim-verifier`.

**Why:** without a persistent marker, every deck generation has to silently re-decide "is this bullet worth showing" from scratch, and that judgment is never recorded anywhere for the next person (or the next generation) to reuse.

## Requirement 4: `[viz:]` visual-aid marker

On each critical-concept bullet — Key Contributions, the core mechanism(s) in Method, headline results — name the single clearest visual that would help someone understand the concept, with a trailing inline tag: **`[viz: <locator> — <short desc>]`**.

- **Paper-internal** (preferred): `[viz: Fig. 6 — mixed-precision FP8 GEMM framework]` / `[viz: Table 3 — ablation results]`. Only use a figure/table that's actually backed by a real crop in `extracted/<slug>/figures/figure-N.png` (or a real table in the paper) — don't point at a figure that doesn't exist or wasn't cropped.
- **External fallback**: `[viz: ext — <url> — <short desc>]`, used only when the paper itself has no figure or table that illustrates the concept well. Requires a real, checkable source URL — never a vague "found online."
- **Paper-first, external fallback.** Try to find a fitting figure in the paper before reaching for an external one.
- This is a *pointer*, not an embed — don't paste an image into the summary markdown. It's the candidate deck generation reads to decide what to copy into a deck's `assets/` folder and render on the corresponding slide.
- Distinct from `[src:]`: `[src:]` says where a claim is grounded; `[viz:]` says what best *illustrates* it. A bullet can carry both, pointing at the same figure or different ones — they don't have to match.
- Not every bullet needs one — only critical concepts. Supporting/incidental bullets don't need a `[viz:]` tag.

**Why:** figures are already extracted and captioned once per paper (`extracted/<slug>/figures/` + `manifest.json`), but until now nothing recorded *which* figure best explains *which* concept — that judgment had to be re-made by hand at every deck generation, and decks defaulted to no illustration at all. A `[viz:]` tag captures the "best visual for this idea" decision once, at authoring time, for every future deck to reuse.
