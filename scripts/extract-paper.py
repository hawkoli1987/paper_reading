#!/usr/bin/env python3
"""
extract-paper.py — "extract once, reuse everywhere" cache builder for this workspace.

Given papers/<slug>.pdf, writes extracted/<slug>/:
  text.md        PDF-derived text, per-page <!-- p.N --> markers + detected section
                 headings. Page authority; primary grounding for non-arxiv papers.
  latex.md       (with --arxiv) PRIMARY grounding surface when present. Two-tier source:
                 tries arxiv's own LaTeXML HTML render (arxiv.org/html/<id>) first — a full
                 LaTeX compilation with resolved citations/appendix-lettering/equations, done
                 by arxiv itself — and falls back to fetching the raw LaTeX source tarball and
                 hand-flattening it with pylatexenc when the HTML render 404s (LaTeXML can't
                 compile every paper). manifest["source"] records which tier actually ran
                 (arxiv-html:<id> vs arxiv-tarball:<id>) since the two have different tradeoffs
                 — see docs/extraction-sources.md.
  manifest.json  pdf_sha256 (freshness key), page_count, source, section->page map,
                 table/figure caption index, warnings.
  figures/       (with --figures) figure-<N>.png cropped from the compiled PDF.

Usage:
  .venv/bin/python scripts/extract-paper.py papers/<slug>.pdf
  .venv/bin/python scripts/extract-paper.py papers/<slug>.pdf --arxiv 2412.19437 --figures
  .venv/bin/python scripts/extract-paper.py papers/<slug>.pdf --force

See CLAUDE.md ("Pipeline"), docs/html-tooling.md ("Figure extraction"), and
docs/extraction-sources.md (arxiv's PDF/tarball/HTML formats compared) for how this fits
into the rest of the summary/deck workflow.

Dependencies (installed into the project .venv, not tracked by a requirements file —
this workspace installs packages into .venv ad hoc as needed, same as pymupdf/pdfplumber/etc):
  uv pip install pymupdf requests pylatexenc beautifulsoup4 markdownify --python .venv/bin/python
"""

import argparse
import gzip
import hashlib
import io
import json
import re
import statistics
import sys
import tarfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import fitz  # PyMuPDF

GENERATOR_VERSION = "1"

# ---------------------------------------------------------------------------
# Heading detection (PDF side)
# ---------------------------------------------------------------------------

NUMBERED_HEADING_RE = re.compile(
    r"^(\d+(?:\.\d+){0,3})\.?\s+([A-Z][^\n]{0,90})$"
)
NAMED_HEADINGS = {
    "abstract", "references", "acknowledgments", "acknowledgements",
    "appendix", "conclusion", "conclusions", "introduction",
}


def is_named_heading(line):
    stripped = line.strip().rstrip(".:").strip()
    low = stripped.lower()
    if low in NAMED_HEADINGS:
        return stripped
    m = re.match(r"^appendix\s+([A-Z0-9]+)[.:]?\s*(.*)$", stripped, re.IGNORECASE)
    if m:
        return stripped
    return None


CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def sanitize(text):
    """Strip stray control-byte codepoints (PyMuPDF sometimes maps broken math-font
    glyphs to C0/DEL control codes) so the output is plain text — grep/Read-safe,
    not misidentified as binary by shell tooling."""
    return CONTROL_CHARS_RE.sub("", text)


def dehyphenate_join(lines):
    """Join a list of line-strings into one paragraph, undoing line-break hyphens."""
    out = ""
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if out.endswith("-") and out[:-1] and out[-2:-1].isalpha():
            out = out[:-1] + line
        elif out:
            out += " " + line
        else:
            out = line
    return out


# ---------------------------------------------------------------------------
# PDF text extraction -> text.md + sections/tables/figures/warnings
# ---------------------------------------------------------------------------

def extract_pdf(pdf_path):
    doc = fitz.open(pdf_path)
    page_count = doc.page_count

    # Baseline body font size across the doc, for the font-heuristic heading tier.
    all_sizes = []
    for page in doc:
        d = page.get_text("dict")
        for block in d["blocks"]:
            if block.get("type") != 0:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    if span["text"].strip():
                        all_sizes.append(round(span["size"], 1))
    body_size = statistics.mode(all_sizes) if all_sizes else 10.0

    sections = []
    tables = []
    figures = []
    warnings = []
    md_parts = []

    table_fig_re = re.compile(
        r"^(Table|Figure)\s+([A-Za-z0-9]+)[:.]?\s*(.*)$"
    )

    for page_index, page in enumerate(doc):
        page_num = page_index + 1
        page_width = page.rect.width
        d = page.get_text("dict")

        blocks = [b for b in d["blocks"] if b.get("type") == 0]

        def sort_key(b):
            x0, y0, x1, y1 = b["bbox"]
            col = 0 if x0 < (page_width / 2 - 10) else 1
            return (col, y0)

        blocks.sort(key=sort_key)

        page_md = [f"<!-- p.{page_num} -->"]
        buf = []
        page_char_count = 0

        def flush():
            if buf:
                para = dehyphenate_join(buf)
                if para:
                    page_md.append(para)
                buf.clear()

        for block in blocks:
            for line in block["lines"]:
                text = sanitize("".join(span["text"] for span in line["spans"])).strip()
                if not text:
                    continue
                page_char_count += len(text)
                max_size = max((span["size"] for span in line["spans"]), default=body_size)

                heading_num = None
                heading_title = None
                confidence = None

                m = NUMBERED_HEADING_RE.match(text)
                if m and len(m.group(2).split()) <= 14:
                    heading_num, heading_title = m.group(1), m.group(2).strip()
                    confidence = "numbered"
                else:
                    named = is_named_heading(text)
                    if named:
                        heading_num, heading_title = None, named
                        confidence = "named"
                    elif (
                        max_size >= body_size * 1.25
                        and len(text.split()) <= 12
                        and not text.endswith(".")
                    ):
                        heading_num, heading_title = None, text
                        confidence = "font"

                if confidence:
                    flush()
                    level = 2 if not heading_num else min(2 + heading_num.count("."), 5)
                    label = f"{heading_num} {heading_title}" if heading_num else heading_title
                    page_md.append(f"{'#' * level} {label}")
                    sections.append({
                        "num": heading_num,
                        "title": heading_title,
                        "page": page_num,
                        "heading_confidence": confidence,
                    })
                    continue

                tf = table_fig_re.match(text)
                if tf:
                    kind, num, caption = tf.groups()
                    entry = {"label": f"{kind} {num}", "page": page_num, "caption": caption.strip()}
                    (tables if kind == "Table" else figures).append(entry)

                buf.append(text)
            flush()  # paragraph break at block boundary

        flush()
        if page_char_count < 20:
            warnings.append(
                f"low text-layer density on p.{page_num} — possible scanned page (no OCR in v1)"
            )
        md_parts.append("\n\n".join(page_md))

    text_md_body = "\n\n".join(md_parts)
    return {
        "text_md_body": text_md_body,
        "page_count": page_count,
        "sections": sections,
        "tables": tables,
        "figures": figures,
        "warnings": warnings,
    }


# ---------------------------------------------------------------------------
# Figure cropping (--figures)
# ---------------------------------------------------------------------------

def crop_figures(pdf_path, figures, out_dir):
    doc = fitz.open(pdf_path)
    out_dir.mkdir(parents=True, exist_ok=True)
    zoom = 3.5
    matrix = fitz.Matrix(zoom, zoom)
    crop_warnings = []

    for fig in figures:
        page = doc[fig["page"] - 1]
        label = fig["label"]
        num_match = re.search(r"\d+", label)
        num = num_match.group(0) if num_match else re.sub(r"\W+", "-", label)
        out_path = out_dir / f"figure-{num}.png"

        # Locate the caption block's bbox (docs/html-tooling.md step 1).
        d = page.get_text("dict")
        caption_bbox = None
        for block in d["blocks"]:
            if block.get("type") != 0:
                continue
            for line in block["lines"]:
                text = "".join(s["text"] for s in line["spans"]).strip()
                if text.startswith(label):
                    caption_bbox = fitz.Rect(block["bbox"])
                    break
            if caption_bbox:
                break

        if caption_bbox is None:
            crop_warnings.append(f"{label}: caption not relocated for crop, skipped")
            continue

        # Prefer embedded image blocks directly above the caption (step 2).
        image_blocks = [fitz.Rect(b["bbox"]) for b in d["blocks"] if b.get("type") == 1]
        candidates = [r for r in image_blocks if r.y1 <= caption_bbox.y0 + 5
                      and caption_bbox.y0 - r.y1 < 150]
        if candidates:
            clip = candidates[0]
            for r in candidates[1:]:
                clip |= r
            clip.y1 = min(page.rect.height, clip.y1 + 4)
        else:
            # Fallback: fixed-height band above the caption, full column width.
            clip = fitz.Rect(
                max(0, caption_bbox.x0 - 20), max(0, caption_bbox.y0 - 250),
                min(page.rect.width, caption_bbox.x1 + 20), caption_bbox.y0 + 2,
            )
            crop_warnings.append(f"{label}: no image block found, used fallback band crop — verify visually")

        pix = page.get_pixmap(matrix=matrix, clip=clip)
        pix.save(str(out_path))

    return crop_warnings


# ---------------------------------------------------------------------------
# LaTeX extraction (--arxiv <id>) -> latex.md
#
# Two-tier source, tried in order (see docs/extraction-sources.md for the evaluation
# behind this): arxiv's own LaTeXML HTML render first (resolved citations, lettered
# appendices, intact equations — arxiv already ran a full LaTeX compiler), falling back
# to the raw source tarball + hand-rolled pylatexenc flattening when the HTML render
# 404s (LaTeXML can't compile every paper's document class/packages).
# ---------------------------------------------------------------------------

def fetch_arxiv_html(arxiv_id):
    """Fetch arxiv's own LaTeXML-compiled HTML render (arxiv.org/html/<id>) and convert
    it to markdown. Returns the markdown string, or None if no HTML render exists for
    this paper (arxiv 404s — caller should fall back to the tarball path)."""
    import requests
    from bs4 import BeautifulSoup
    from markdownify import markdownify as html_to_md

    resp = requests.get(
        f"https://arxiv.org/html/{arxiv_id}",
        timeout=60,
        headers={"User-Agent": "Mozilla/5.0"},
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    article = soup.find("article") or soup.find(class_="ltx_document") or soup.body
    if article is None:
        return None

    # Strip elements that aren't part of the paper's own content — nav chrome,
    # arxiv's version-history banner, etc — so they don't leak into latex.md.
    for tag in article.find_all(["nav", "script", "style"]):
        tag.decompose()
    for cls in ("ltx_role_refnum", "package-notice", "banner"):
        for tag in article.find_all(class_=cls):
            tag.decompose()
    # Each LaTeXML <math> element carries BOTH a presentation-MathML rendering (readable
    # unicode) AND a redundant <annotation encoding="application/x-tex"> with the raw TeX
    # source — markdownify flattens both to text back-to-back, doubling every equation.
    # Keep only the presentation rendering.
    for tag in article.find_all("annotation"):
        tag.decompose()

    markdown = html_to_md(str(article), heading_style="ATX")
    markdown = re.sub(r"\n{3,}", "\n\n", markdown).strip()
    return markdown if len(markdown) > 200 else None


def fetch_arxiv_source(arxiv_id, workdir):
    """Download and unpack the e-print for arxiv_id into workdir. Returns True on
    success (source files present), False if no LaTeX source is available."""
    import requests

    url = f"https://arxiv.org/e-print/{arxiv_id}"
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    data = resp.content

    workdir.mkdir(parents=True, exist_ok=True)

    try:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tf:
            tf.extractall(workdir, filter="data")
        return True
    except tarfile.ReadError:
        pass

    try:
        decompressed = gzip.decompress(data)
        if b"\\documentclass" in decompressed or b"\\section" in decompressed:
            (workdir / "main.tex").write_bytes(decompressed)
            return True
    except OSError:
        pass

    if data.startswith(b"%PDF"):
        return False  # arxiv served the compiled PDF back — no LaTeX source for this id

    return False


def find_main_tex(workdir):
    candidates = list(workdir.rglob("*.tex"))
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]

    scored = []
    for c in candidates:
        try:
            content = c.read_text(errors="ignore")
        except OSError:
            continue
        score = 0
        if "\\documentclass" in content:
            score += 10
        if "\\begin{document}" in content:
            score += 10
        score += content.count("\\section")
        scored.append((score, c))
    scored.sort(key=lambda x: -x[0])
    return scored[0][1] if scored else candidates[0]


def strip_latex_comments(text):
    out_lines = []
    for line in text.split("\n"):
        # Drop from an unescaped % to end of line.
        result = []
        i = 0
        while i < len(line):
            if line[i] == "%" and (i == 0 or line[i - 1] != "\\"):
                break
            result.append(line[i])
            i += 1
        out_lines.append("".join(result))
    return "\n".join(out_lines)


INPUT_RE = re.compile(r"\\(?:input|include)\{([^}]+)\}")


def flatten_latex(main_tex_path, _visited=None):
    if _visited is None:
        _visited = set()
    main_tex_path = main_tex_path.resolve()
    if main_tex_path in _visited or not main_tex_path.exists():
        return ""
    _visited.add(main_tex_path)

    content = strip_latex_comments(main_tex_path.read_text(errors="ignore"))

    def replace(m):
        target = m.group(1)
        if not target.endswith(".tex"):
            target += ".tex"
        target_path = (main_tex_path.parent / target)
        return flatten_latex(target_path, _visited)

    return INPUT_RE.sub(replace, content)


BRACE_CMD_RE = re.compile(r"\\(section|subsection|subsubsection|paragraph)(\*?)\{")

# Heading level per LaTeX sectioning command, independent of whether it carries a
# number — \paragraph{} is a bolded run-in header, not a real section boundary, and
# should nest well below \subsubsection so it doesn't read as a top-level heading.
CMD_LEVEL = {"section": 2, "subsection": 3, "subsubsection": 4, "paragraph": 5}

# Simple zero-argument \newcommand{\name}{body} / \newcommand*{...} / \renewcommand{...}
# definitions — covers the common case (a paper-specific shorthand like \dsmoe) without
# implementing full LaTeX macro expansion.
NEWCOMMAND_RE = re.compile(r"\\(?:re)?newcommand\*?\{\\([A-Za-z]+)\}(?:\[0\])?\{")


def extract_braced_arg(text, start):
    """text[start] is the char right after the opening '{'; return (arg, end_index)."""
    depth = 1
    i = start
    while i < len(text) and depth > 0:
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
        i += 1
    return text[start:i - 1], i


def expand_custom_macros(full_source):
    """Find zero-arg \\newcommand definitions anywhere in the (already \\input-flattened)
    source and substitute their invocations throughout, so e.g. \\dsmoe{} reads as
    "DeepSeekMoE" instead of literal LaTeX in latex.md. A few passes handle macros
    defined in terms of other macros; anything with arguments is left alone."""
    macros = {}
    for m in NEWCOMMAND_RE.finditer(full_source):
        name = m.group(1)
        body, _ = extract_braced_arg(full_source, m.end())
        macros[name] = body

    if not macros:
        return full_source

    text = full_source
    for _ in range(3):  # a few passes so macro-referencing-macro chains settle
        for name, body in macros.items():
            replacement = lambda m, body=body: body  # avoid re.sub interpreting \1 etc. in body
            # \name{} or bare \name not followed by a letter (avoid \names matching \name)
            text = re.sub(rf"\\{name}\{{\}}", replacement, text)
            text = re.sub(rf"\\{name}(?![A-Za-z])", replacement, text)
    return text


def parse_latex_sections(body):
    """Split body (between \\begin{document} and \\end{document}) into headed segments."""
    doc_start = body.find("\\begin{document}")
    doc_end = body.rfind("\\end{document}")
    if doc_start != -1:
        body = body[doc_start + len("\\begin{document}"):doc_end if doc_end != -1 else None]

    matches = list(BRACE_CMD_RE.finditer(body))
    if not matches:
        return [(None, None, None, body)]

    counters = [0, 0, 0]  # section, subsection, subsubsection
    level_index = {"section": 0, "subsection": 1, "subsubsection": 2}
    segments = []

    # Preamble-ish leading text before the first heading (often just \maketitle etc.)
    if matches[0].start() > 0:
        segments.append((None, None, None, body[:matches[0].start()]))

    for idx, m in enumerate(matches):
        cmd, star = m.group(1), m.group(2)
        title, after = extract_braced_arg(body, m.end())

        num = None
        if not star and cmd in level_index:
            li = level_index[cmd]
            counters[li] += 1
            for j in range(li + 1, 3):
                counters[j] = 0
            num = ".".join(str(c) for c in counters[:li + 1])

        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(body)
        section_body = body[after:end]
        segments.append((num, title.strip(), cmd, section_body))

    return segments


def latex_to_text(segment):
    from pylatexenc.latex2text import LatexNodes2Text
    try:
        return sanitize(LatexNodes2Text(math_mode="text").latex_to_text(segment)).strip()
    except Exception as e:
        return f"[extraction note: pylatexenc failed on this segment ({e}); raw LaTeX below]\n\n{sanitize(segment).strip()}"


def build_latex_md(segments):
    parts = []
    for num, title, cmd, section_body in segments:
        if title is not None:
            level = CMD_LEVEL.get(cmd, 2)
            label = f"{num} {title}" if num else title
            parts.append(f"{'#' * level} {label}")
        text = latex_to_text(section_body)
        if text:
            parts.append(text)
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def sha256_of(path):
    h = hashlib.sha256()
    h.update(Path(path).read_bytes())
    return h.hexdigest()


def header_comment(pdf_path, sha256):
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return (
        f"<!-- extracted from {pdf_path} sha256:{sha256} "
        f"by extract-paper.py v{GENERATOR_VERSION} on {stamp} -->\n"
    )


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", help="Path to papers/<slug>.pdf")
    ap.add_argument("--arxiv", metavar="ID", help="arxiv id (e.g. 2412.19437) to fetch LaTeX source for latex.md")
    ap.add_argument("--figures", action="store_true", help="also crop figures/ from the compiled PDF")
    ap.add_argument("--force", action="store_true", help="ignore sha256 freshness, rebuild everything requested")
    args = ap.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        sys.exit(f"error: {pdf_path} not found")

    slug = pdf_path.stem
    out_dir = Path("extracted") / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest_path = out_dir / "manifest.json"
    current_sha = sha256_of(pdf_path)

    existing_manifest = None
    if manifest_path.exists():
        try:
            existing_manifest = json.loads(manifest_path.read_text())
        except (json.JSONDecodeError, OSError):
            existing_manifest = None

    fresh = (
        existing_manifest is not None
        and existing_manifest.get("pdf_sha256") == current_sha
        and not args.force
    )

    text_md_path = out_dir / "text.md"
    latex_md_path = out_dir / "latex.md"
    figures_dir = out_dir / "figures"

    manifest = existing_manifest if fresh else {}
    manifest["slug"] = slug
    manifest["generator_version"] = GENERATOR_VERSION
    manifest["source_pdf"] = str(pdf_path)
    manifest["pdf_sha256"] = current_sha
    manifest["pdf_bytes"] = pdf_path.stat().st_size

    need_pdf_extract = args.force or not fresh or not text_md_path.exists()

    if need_pdf_extract:
        print(f"[extract-paper] extracting PDF text: {pdf_path}")
        result = extract_pdf(pdf_path)
        text_md_path.write_text(
            header_comment(pdf_path, current_sha) + "\n" + result["text_md_body"] + "\n"
        )
        manifest["page_count"] = result["page_count"]
        manifest["sections"] = result["sections"]
        manifest["tables"] = result["tables"]
        manifest["figures"] = result["figures"]
        manifest["warnings"] = result["warnings"]
    else:
        print(f"[extract-paper] text.md up to date (sha256 matches), skipping PDF re-extraction")

    if args.arxiv:
        if fresh and latex_md_path.exists() and not args.force:
            print(f"[extract-paper] latex.md up to date, skipping arxiv fetch")
            manifest["source"] = manifest.get("source", f"arxiv:{args.arxiv}")
        else:
            print(f"[extract-paper] fetching arxiv HTML render for {args.arxiv}")
            html_md = None
            try:
                html_md = fetch_arxiv_html(args.arxiv)
            except Exception as e:
                print(f"[extract-paper] warning: HTML render fetch failed ({e}); trying tarball")

            if html_md:
                latex_md_path.write_text(
                    header_comment(pdf_path, current_sha) + "\n" + html_md + "\n"
                )
                manifest["source"] = f"arxiv-html:{args.arxiv}"
                print(f"[extract-paper] wrote {latex_md_path} (source: arxiv HTML render)")
                ok = None  # HTML tier succeeded; skip the tarball tier entirely below
            else:
                print(f"[extract-paper] no HTML render available; falling back to tarball")
                print(f"[extract-paper] fetching arxiv e-print {args.arxiv}")
                import tempfile
                with tempfile.TemporaryDirectory() as tmp:
                    tmp_path = Path(tmp)
                    try:
                        ok = fetch_arxiv_source(args.arxiv, tmp_path)
                    except Exception as e:
                        ok = False
                        print(f"[extract-paper] warning: arxiv fetch failed ({e}); skipping latex.md")

                    if ok:
                        main_tex = find_main_tex(tmp_path)
                        if main_tex is None:
                            print("[extract-paper] warning: no .tex file found in e-print; skipping latex.md")
                            ok = False
                        else:
                            flattened = flatten_latex(main_tex)
                            flattened = expand_custom_macros(flattened)
                            segments = parse_latex_sections(flattened)
                            latex_md = build_latex_md(segments)
                            latex_md_path.write_text(
                                header_comment(pdf_path, current_sha) + "\n" + latex_md + "\n"
                            )
                            manifest["source"] = f"arxiv-tarball:{args.arxiv}"
                            print(f"[extract-paper] wrote {latex_md_path} (source: arxiv tarball fallback)")

            if html_md is None and not ok:
                print("[extract-paper] no LaTeX source available (neither HTML render nor tarball); PDF-only")
                manifest.setdefault("source", "pdf-only")
                manifest.setdefault("warnings", []).append(
                    f"arxiv:{args.arxiv} has no retrievable HTML render or LaTeX tarball — latex.md not generated"
                )
    else:
        manifest.setdefault("source", "pdf-only")

    if args.figures:
        figs = manifest.get("figures", [])
        if not figs:
            print("[extract-paper] no figures detected to crop")
        elif fresh and figures_dir.exists() and not args.force:
            print("[extract-paper] figures/ up to date, skipping crop")
        else:
            print(f"[extract-paper] cropping {len(figs)} figure(s)")
            crop_warnings = crop_figures(pdf_path, figs, figures_dir)
            for w in crop_warnings:
                print(f"[extract-paper] warning: {w}")
            manifest.setdefault("warnings", []).extend(crop_warnings)

    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"[extract-paper] wrote {manifest_path}")


if __name__ == "__main__":
    main()
