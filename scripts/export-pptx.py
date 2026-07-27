#!/usr/bin/env python3
"""
Export a frontend-slides presentation.html to a PowerPoint deck.

Two-stage pipeline (see docs/html-tooling.md "Export to PPTX"):
  1. node render-deck.js screenshots every `.slide` at 1920x1080 (16:9) into
     a temp dir, in DOM order, with --hide-chrome (keyboard hints / nav dots
     / progress index don't mean anything once the deck leaves the browser).
  2. This script assembles those PNGs into a .pptx, one full-bleed picture
     per 16:9 slide, via python-pptx.

Fidelity: image-per-slide. Pixel-identical to the browser; text is not
editable in PowerPoint. Two known caveats, not fixed here:
  - assets/*.gif flattens to whatever frame is showing after the 900ms
    render settle.
  - Google Fonts (fonts.googleapis.com) need network access at export time;
    offline, Chrome silently substitutes a fallback font and the export
    will not match what you see in a browser with a live connection.

Usage:
    .venv/bin/python scripts/export-pptx.py <path-to-presentation.html> \
        [output.pptx] [--jpeg] [--keep-pngs DIR]

Requires: python-pptx, Pillow (only for --jpeg) — both already in .venv.
"""
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

from pptx import Presentation
from pptx.util import Inches

REPO_ROOT = Path(__file__).resolve().parent.parent
RENDER_SCRIPT = Path(__file__).resolve().parent / "render-deck.js"

SLIDE_WIDTH_IN = 13.333
SLIDE_HEIGHT_IN = 7.5


def render_slides(html_path: Path, out_dir: Path) -> list[Path]:
    cmd = ["node", str(RENDER_SCRIPT), str(html_path), str(out_dir), "--hide-chrome"]
    result = subprocess.run(cmd, cwd=REPO_ROOT)
    if result.returncode != 0:
        raise SystemExit(f"render-deck.js failed (exit {result.returncode})")
    pngs = sorted(out_dir.glob("slide-*.png"))
    if not pngs:
        raise SystemExit(f"render-deck.js produced no slide-*.png files in {out_dir}")
    return pngs


def to_jpeg(pngs: list[Path], work_dir: Path) -> list[Path]:
    from PIL import Image

    jpegs = []
    for png in pngs:
        jpeg_path = work_dir / (png.stem + ".jpg")
        with Image.open(png) as im:
            im.convert("RGB").save(jpeg_path, "JPEG", quality=88)
        jpegs.append(jpeg_path)
    return jpegs


def build_pptx(images: list[Path], out_path: Path) -> None:
    prs = Presentation()
    prs.slide_width = Inches(SLIDE_WIDTH_IN)
    prs.slide_height = Inches(SLIDE_HEIGHT_IN)
    blank_layout = prs.slide_layouts[6]

    for img in images:
        slide = prs.slides.add_slide(blank_layout)
        slide.shapes.add_picture(
            str(img), 0, 0, width=prs.slide_width, height=prs.slide_height
        )

    prs.save(str(out_path))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("html", help="Path to a deck's presentation.html")
    parser.add_argument("output", nargs="?", help="Output .pptx path (default: presentation.pptx beside the html)")
    parser.add_argument("--jpeg", action="store_true", help="Compress slide images as JPEG (quality 88) before embedding, to shrink file size")
    parser.add_argument("--keep-pngs", metavar="DIR", help="Render into DIR instead of a temp dir, and keep the PNGs afterwards")
    args = parser.parse_args()

    html_path = Path(args.html).resolve()
    if not html_path.exists():
        raise SystemExit(f"File not found: {html_path}")

    out_path = Path(args.output).resolve() if args.output else html_path.with_name("presentation.pptx")

    def _run(render_dir: Path) -> None:
        print(f"Rendering slides from {html_path} ...")
        pngs = render_slides(html_path, render_dir)
        print(f"Rendered {len(pngs)} slides.")

        images = pngs
        if args.jpeg:
            print("Converting to JPEG (quality 88)...")
            images = to_jpeg(pngs, render_dir)

        print(f"Assembling {out_path} ...")
        build_pptx(images, out_path)

    if args.keep_pngs:
        render_dir = Path(args.keep_pngs).resolve()
        render_dir.mkdir(parents=True, exist_ok=True)
        _run(render_dir)
    else:
        with tempfile.TemporaryDirectory(prefix="export-pptx-") as tmp:
            _run(Path(tmp))

    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"\nWrote {out_path} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
