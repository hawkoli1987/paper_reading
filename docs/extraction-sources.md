# arxiv source formats — what's available, and what `extract-paper.py` does with each

arxiv publishes three independent artifacts per paper. `scripts/extract-paper.py` uses all
three: PDF for `text.md`/page count/figures, and a two-tier `latex.md` pipeline — HTML first,
tarball as fallback — implemented per the evaluation below (see "Implementation" at the bottom).

| Format | URL pattern | What it actually is |
|---|---|---|
| **PDF** | `arxiv.org/pdf/<id>` | The compiled, typeset paper — what a human reads. |
| **Tarball (LaTeX source)** | `arxiv.org/e-print/<id>` | The raw `.tex`/`.bib`/figure files the author submitted, gzipped. |
| **HTML (LaTeXML render)** | `arxiv.org/html/<id>` | arxiv's own compilation of that same LaTeX source through **LaTeXML** (a LaTeX→HTML compiler), published as a regular webpage. Originated as the [ar5iv](https://ar5iv.labs.arxiv.org/) research project; arxiv has since adopted it natively for most recent submissions. Not available for every paper — LaTeXML can't compile custom document classes/packages some papers use. |

`extract-paper.py` reads the **PDF** for `text.md`/page count/figure crops (`extract_pdf()`,
`crop_figures()`) — unchanged by any of this. For `latex.md`, it tries the **HTML** render first
(`fetch_arxiv_html()`), falling back to the **tarball** (`fetch_arxiv_source()` → `flatten_latex()`
→ `expand_custom_macros()` → `parse_latex_sections()` → `pylatexenc`'s `LatexNodes2Text`) only when
the HTML render 404s. `manifest.json`'s `source` field records which tier ran: `arxiv-html:<id>`
or `arxiv-tarball:<id>`.

## Evaluation (2026-07-22/23): strengths and weaknesses of each, as a `latex.md` source

Tested on 5 real papers (Attention Is All You Need, ViT, DPO, Llama 2, DeepSeek-V3) against an
8-dimension rubric, every verdict backed by a concrete grep hit or file inspection. Full scorecards
and evidence in the session transcript; summarized here per source.

### PDF (`extract_pdf()` + `pylatexenc`, and the PDF-native `pymupdf4llm` library tested as an alternative)

Two different tools were tested against the *same* PDF-derived-text approach — the current
hand-rolled `fitz`/PyMuPDF extraction, and the purpose-built `pymupdf4llm` library:

- **Strength**: works on 100% of papers — no dependency on arxiv having a LaTeX source or an
  HTML render at all. This is the only format guaranteed to exist for any PDF, arxiv or not.
- **Strength (pymupdf4llm specifically)**: font-size-based heading detection correctly lettered
  every appendix tested, including deep sub-numbering (Llama-2: `A.4.1`–`A.4.8`), and zero
  false-positive headings — better structural fidelity than the current script's own PDF-side
  heading tier, which mis-detects chart axis labels and survey participant lists as headings.
- **Weakness (current script's PDF path)**: the font-size heading-detection tier produces false
  positives (ViT's "10 M"/"30 M" axis labels, DPO's 25-person participant list detected as
  "sections").
- **Weakness (fatal, both PDF approaches)**: **display equations rendered as vector graphics in
  the PDF are not extractable as text at all** — not garbled, silently *absent*. Confirmed on two
  independent math-bearing papers: DPO's core derivations (Eq. 4–7, including the DPO loss
  itself) are missing entirely from `pymupdf4llm`'s output; Attention's own namesake formula
  `Attention(Q,K,V) = softmax(QK^T/√dk)V` has zero occurrences. This disqualifies any pure
  PDF-text approach as a primary source for math-heavy papers — the current script's tarball
  path still gets these equations right (see below), so `pymupdf4llm` is not a strict upgrade.

### Tarball / LaTeX source (current `latex.md` pipeline: `flatten_latex` + `expand_custom_macros` + `pylatexenc`)

- **Strength**: preserves math. Equations come through as readable text (e.g.
  `π_r(y|x) = 1/Z(x)π_ref(y|x)exp(1/βr(x,y))`) — ugly in places, but present and correct.
- **Strength**: works on any arxiv paper that has a LaTeX source at all (nearly all of them —
  broader coverage than the HTML render).
- **Weakness (gating, systemic)**: `\appendix` is never recognized by the manual section counter
  in `parse_latex_sections()`, so appendix sections silently renumber into the main sequence
  instead of lettering — e.g. DPO's real `Appendix A.5` emits as `## 8.5`. Found on 4/5 papers.
- **Weakness (gating, systemic)**: `\citep`/`\cite`/`\ref` convert to literal, unresolved
  `<cit.>`/`<ref>` placeholder strings via `pylatexenc` — 50–90+ occurrences per paper. Found
  5/5.
- **Weakness**: `expand_custom_macros()` only handles zero-argument `\newcommand`; macros with
  arguments (e.g. `\textsc{Llama 2}\xspace`) leak raw LaTeX into prose.
- **Weakness**: a separate caption-detection regex bug (on the PDF-manifest side, shared
  infrastructure) inflates `tables[]`/`figures[]` counts 20–44% by matching in-text references
  ("as shown in Figure 5") as if they were captions.

### HTML / LaTeXML render (`arxiv.org/html/<id>`, implemented as the primary `latex.md` source via `fetch_arxiv_html()`)

- **Strength**: the only candidate clean on **both** structure and math simultaneously. Appendix
  sections come out correctly lettered with full nesting (DPO: `Appendix A` → `A.1`…`A.5`, all
  real). Every citation and cross-reference resolves to a real number with a working link
  (`[13](#bib.bib13)`, `Eq. [4]`, `Appendix [A.1]` — not placeholders). Display equations render
  intact (DPO's Eq. 4–6 present and correctly numbered, unlike either PDF-based approach).
  Tables come through as genuine structured markdown, not flattened text.
- **Weakness (real, not hypothetical)**: coverage gap. Checked HTML availability for all 5 test
  papers — 4/5 returned HTTP 200, but Llama-2 (2307.09288) returned **404** (checked `v1`/`v2`
  suffixes too, same result) — no LaTeXML render exists for it, likely because it uses a custom
  document class LaTeXML can't compile. ~80% coverage on this sample; a production
  implementation needs a documented fallback for when this 404s.
- **Fixed during implementation**: the quick eval script's HTML-boundary detection was a regex
  (`re.search`) that leaked one stray line. The real implementation (`fetch_arxiv_html()`) uses
  `BeautifulSoup` to select the article body by tag/class instead. It also found and fixed a
  duplication bug not caught by the quick eval: each LaTeXML `<math>` element carries both a
  presentation-MathML rendering and a redundant `<annotation encoding="application/x-tex">` with
  the raw TeX source, which `markdownify` was flattening back-to-back, doubling every equation
  (and re-leaking one stray `\ref{` that lived only inside the annotation's raw TeX). Stripping
  `<annotation>` tags before conversion fixed both.

## Implementation

Implemented in `scripts/extract-paper.py`: **HTML render as the primary source** for `latex.md`
(`fetch_arxiv_html()`), falling back to the **tarball+`pylatexenc` pipeline** (unchanged,
`fetch_arxiv_source()` → `flatten_latex()` → ... → `build_latex_md()`) when the HTML render
404s. `pymupdf4llm` was deliberately **not** used as the fallback despite its structural
strength — its equation-dropping failure mode is worse than the tarball path's `<ref>`
placeholders (a placeholder is visibly a gap; a silently-missing equation looks like normal
prose and would fool a grounding pass). The PDF pipeline for `text.md`, page count, and figure
crops is untouched. `manifest.json`'s `source` field records which tier ran
(`arxiv-html:<id>` / `arxiv-tarball:<id>`) so downstream consumers can tell.

Verified post-implementation on all 5 original test papers. 4/5 hit the HTML tier and are
clean across every gating dimension: DPO — appendices `A`–`D` correctly nested, 0 citation/ref
leaks, Eq. 4–9 all present and correctly numbered, no duplicated equation text; Attention — its
namesake equation `Attention(Q,K,V)=softmax(QKT/√dk)V` present and numbered, real markdown
tables; ViT — appendices `A`–`D` correctly lettered, 0 citation/ref leaks, no false-positive
headings, real markdown tables; DeepSeek-V3 — all 3 appendices (`A`–`C`) present and correctly
lettered (fixing the original eval's bug where they were silently dropped entirely), 0
citation/ref leaks. Llama-2 is the 1/5 whose HTML render still 404s (checked `v1`/`v2` too) —
falls back cleanly to the tarball tier, `source: arxiv-tarball:2307.09288`, no worse off than
before. Caching (`--force`-free reruns skip re-fetch), `--figures`, and the non-arxiv
`pdf-only` path all confirmed unaffected.

The repo's one real tracked paper, `extracted/2024-12_deepseekai_deepseek-v3/`, has since been
regenerated through this pipeline (`--force`) and matches the scratch-copy result above:
`source: arxiv-html:2412.19437`, all 3 appendices correctly lettered.

See `CLAUDE.md`'s "Pipeline" section for how `latex.md` is used downstream by
`summary-tagger`/`claim-verifier`.
