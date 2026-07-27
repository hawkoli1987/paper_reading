#!/usr/bin/env node
/**
 * QA driver for frontend-slides decks.
 *
 * Renders every `.slide` in a presentation.html at each of the skill's
 * required validation breakpoints, waits for scroll + reveal animations to
 * settle, screenshots each, and runs a battery of layout checks against the
 * deck-writing SKILL.md requirements (see ../.claude/skills/deck-writing/):
 *
 *   [outer overflow] el.scrollHeight > el.clientHeight on the .slide itself
 *   [A: escape]       a content element's rendered box extends past its
 *                      .slide's box (R6) — catches content clipped by
 *                      overflow:hidden that the outer-overflow check above
 *                      can't see, since the .slide box itself never grows.
 *   [B: chrome overlap] a content element visually intersects .footer-cite,
 *                      .nav-dots, .progress-index, or .keyboard-hint (R6)
 *   [C: left-edge drift] .slide-content's content-box left edge is not
 *                      uniform across slides at a given breakpoint (R2)
 *   [D: heading/stat wrap] an h1, h2, or .stat-num renders on more than one
 *                      line at a desktop breakpoint (R3, R5)
 *   [E: headline length] an h1 or h2 exceeds 8 words (R4)
 *
 * Usage:
 *   node qa-screenshot.js <path-to-presentation.html> [output-dir] [--check-only]
 *
 * --check-only skips writing screenshots (and disables reveal animations
 * instead of waiting for them) for a fast pass/fail run with no PNGs — useful
 * as a quick re-check after an edit. Without it, the full screenshot set is
 * still produced exactly as before, with the same checks layered on top.
 *
 * Requires Google Chrome installed locally (no bundled Chromium download —
 * see docs/html-tooling.md for why).
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { findChrome } = require('./lib/find-chrome');

const BREAKPOINTS = [
  [1920, 1080, 'desktop-hd'],
  [1280, 720, 'desktop'],
  [768, 1024, 'tablet-portrait'],
  [375, 667, 'mobile'],
  [667, 375, 'mobile-landscape'],
];
const DESKTOP_LABELS = new Set(['desktop-hd', 'desktop']);

// Runs in-page via page.evaluate. Measures slide `n` (1-indexed) against the
// deck-writing checks. Kept as a single evaluate call per slide so all
// measurements share one settled layout pass.
function measureSlide(n) {
  const EPSILON = 2; // px tolerance for sub-pixel layout rounding
  const MIN_OVERLAP = 3; // px, avoids border-touch false positives on B
  const WRAP_SLACK = 1.4; // multiplier on line-height before calling it 2 lines

  const slides = document.querySelectorAll('.slide');
  const el = slides[n - 1];
  if (!el) return null;
  el.scrollIntoView({ block: 'start', behavior: 'auto' });

  const slideRect = el.getBoundingClientRect();
  const overflowed = el.scrollHeight > el.clientHeight + EPSILON;

  const isVisible = (node) => {
    const cs = getComputedStyle(node);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  };

  // Leaf content elements: no element children (text/IMG terminals), inside
  // .slide but outside chrome/decorative subtrees. This is what actually
  // renders visible content, so it's a tighter signal than every ancestor div.
  const CHROME_SELECTOR = '.footer-cite, .grid-backdrop, .keyboard-hint, .nav-dots, .progress-index, .decorative';
  const leaves = Array.from(el.querySelectorAll('*')).filter((node) => {
    if (node.children.length !== 0) return false;
    if (node.closest(CHROME_SELECTOR)) return false;
    if (!isVisible(node)) return false;
    const r = node.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    return true;
  });

  // A: escape — leaf's box extends past its own .slide's box.
  const escapes = [];
  for (const node of leaves) {
    const r = node.getBoundingClientRect();
    const over =
      r.bottom > slideRect.bottom + EPSILON ||
      r.right > slideRect.right + EPSILON ||
      r.top < slideRect.top - EPSILON ||
      r.left < slideRect.left - EPSILON;
    if (over) {
      escapes.push({
        tag: node.tagName.toLowerCase(),
        cls: node.className && typeof node.className === 'string' ? node.className : '',
        text: (node.textContent || '').trim().slice(0, 40),
        overBy: Math.round(Math.max(0, r.bottom - slideRect.bottom, r.right - slideRect.right)),
      });
    }
  }

  // B: chrome overlap — leaf visually intersects a chrome element's box.
  const overlaps = [];
  const chromeEls = [
    el.querySelector('.footer-cite'),
    document.querySelector('.nav-dots'),
    document.querySelector('.progress-index'),
    el.querySelector('.keyboard-hint'),
  ].filter((c) => c && isVisible(c));
  for (const chrome of chromeEls) {
    const cRect = chrome.getBoundingClientRect();
    if (cRect.width === 0 && cRect.height === 0) continue;
    for (const node of leaves) {
      const r = node.getBoundingClientRect();
      const overlapW = Math.min(r.right, cRect.right) - Math.max(r.left, cRect.left);
      const overlapH = Math.min(r.bottom, cRect.bottom) - Math.max(r.top, cRect.top);
      if (overlapW > MIN_OVERLAP && overlapH > MIN_OVERLAP) {
        overlaps.push({
          tag: node.tagName.toLowerCase(),
          text: (node.textContent || '').trim().slice(0, 40),
          chrome: chrome.className || chrome.tagName.toLowerCase(),
        });
      }
    }
  }

  // C: left-edge — content-box left of .slide-content, unless it opts out
  // via .slide-content--centered.
  let contentLeft = null;
  const contentEl = el.querySelector('.slide-content');
  if (contentEl && !contentEl.classList.contains('slide-content--centered')) {
    const cs = getComputedStyle(contentEl);
    const r = contentEl.getBoundingClientRect();
    contentLeft = Math.round(r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft));
  }

  // D: heading / stat-num wrap.
  const wraps = [];
  for (const node of el.querySelectorAll('h1, h2, [class*="stat-num"]')) {
    if (!isVisible(node)) continue;
    const r = node.getBoundingClientRect();
    if (r.height === 0) continue;
    const cs = getComputedStyle(node);
    let lh = parseFloat(cs.lineHeight);
    if (Number.isNaN(lh)) lh = parseFloat(cs.fontSize) * 1.2;
    const lines = r.height / lh;
    if (lines > WRAP_SLACK) {
      wraps.push({
        tag: node.tagName.toLowerCase(),
        text: (node.textContent || '').trim().slice(0, 60),
        lines: Math.round(lines),
      });
    }
  }

  // E: headline word count (breakpoint-independent, but cheap to recompute).
  const longHeadlines = [];
  for (const node of el.querySelectorAll('h1, h2')) {
    const text = (node.textContent || '').trim();
    // A standalone em/en-dash used as punctuation (" — ") is its own
    // whitespace-delimited token but isn't a word a human would count.
    const words = text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
    if (words > 8) longHeadlines.push({ tag: node.tagName.toLowerCase(), text, words });
  }

  return { overflowed, escapes, overlaps, contentLeft, wraps, longHeadlines };
}

// Prints findings grouped by breakpoint label, capped per-label (not
// globally) so a busy breakpoint can't silently push a different
// breakpoint's findings past a global truncation cutoff with no trace.
function printGrouped(findings, formatOne, perLabelCap = 8) {
  const byLabel = new Map();
  for (const f of findings) {
    if (!byLabel.has(f.label)) byLabel.set(f.label, []);
    byLabel.get(f.label).push(f);
  }
  for (const [label, items] of byLabel) {
    for (const f of items.slice(0, perLabelCap)) {
      console.log(`  ${label} slide ${f.slide}: ${formatOne(f)}`);
    }
    if (items.length > perLabelCap) {
      console.log(`  ...and ${items.length - perLabelCap} more at ${label}`);
    }
  }
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const checkOnly = rawArgs.includes('--check-only');
  const positional = rawArgs.filter((a) => a !== '--check-only');
  const inputArg = positional[0];
  if (!inputArg) {
    console.error('Usage: node qa-screenshot.js <path-to-presentation.html> [output-dir] [--check-only]');
    process.exit(1);
  }
  const filePath = path.resolve(inputArg);
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }
  const outDir = path.resolve(positional[1] || path.join(path.dirname(filePath), 'qa-screenshots'));
  if (!checkOnly) fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.goto('file://' + filePath, { waitUntil: 'networkidle0' });
  await page.evaluateHandle(() => document.fonts.ready);

  if (checkOnly) {
    // Force reveal/transition states to their settled end state instead of
    // waiting out the real animation — same rendered layout, much faster.
    await page.addStyleTag({
      content: `.reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
                 *, *::before, *::after { animation: none !important; transition: none !important; }`,
    });
  }

  const slideCount = await page.evaluate(() => document.querySelectorAll('.slide').length);
  if (slideCount === 0) {
    console.error('No elements with class "slide" found — is this a frontend-slides deck?');
    await browser.close();
    process.exit(1);
  }
  console.log(`Found ${slideCount} slides. Testing ${BREAKPOINTS.length} breakpoints...\n`);

  const overflows = [];
  const escapeFindings = [];
  const overlapFindings = [];
  const leftEdgeFindings = [];
  const wrapFindings = [];
  const headlineFindings = [];
  const seenHeadlineSlides = new Set();

  for (const [width, height, label] of BREAKPOINTS) {
    await page.setViewport({ width, height });
    const leftEdgesThisBreakpoint = [];

    for (let i = 1; i <= slideCount; i++) {
      const settleMs = checkOnly ? 60 : 900; // let scroll-snap settle + staggered .reveal finish
      // Scroll first so layout is stable before the settle wait.
      await page.evaluate((n) => {
        const el = document.querySelectorAll('.slide')[n - 1];
        if (el) el.scrollIntoView({ block: 'start', behavior: 'auto' });
      }, i);
      await new Promise((r) => setTimeout(r, settleMs));

      const result = await page.evaluate(measureSlide, i);
      if (!result) continue;

      if (!checkOnly) {
        const outPath = path.join(outDir, `${label}-slide-${i}.png`);
        await page.screenshot({ path: outPath });
      }

      if (result.overflowed) {
        overflows.push({ label, slide: i });
        console.log(`  [OVERFLOW] ${label} slide ${i} — content exceeds viewport`);
      }
      for (const esc of result.escapes.slice(0, 3)) {
        escapeFindings.push({ label, slide: i, ...esc });
      }
      for (const ov of result.overlaps.slice(0, 3)) {
        overlapFindings.push({ label, slide: i, ...ov });
      }
      if (result.contentLeft !== null) {
        leftEdgesThisBreakpoint.push({ slide: i, left: result.contentLeft });
      }
      if (DESKTOP_LABELS.has(label)) {
        for (const w of result.wraps) wrapFindings.push({ label, slide: i, ...w });
      }
      if (!seenHeadlineSlides.has(i)) {
        seenHeadlineSlides.add(i);
        for (const h of result.longHeadlines) headlineFindings.push({ slide: i, ...h });
      }
    }

    // C: left-edge drift within this breakpoint.
    if (leftEdgesThisBreakpoint.length > 1) {
      const values = leftEdgesThisBreakpoint.map((e) => e.left);
      const spread = Math.max(...values) - Math.min(...values);
      if (spread > 2) {
        leftEdgeFindings.push({ label, spread, samples: leftEdgesThisBreakpoint });
      }
    }

    console.log(`${label} (${width}x${height}): ${slideCount} slides captured`);
  }

  await browser.close();

  let failed = overflows.length > 0;
  console.log();

  if (!checkOnly) console.log(`Screenshots written to ${outDir}`);

  if (overflows.length) {
    console.log(`\n[overflow] ${overflows.length} slide(s) exceed their viewport box (outer .slide check).`);
  }

  if (escapeFindings.length) {
    failed = true;
    console.log(`\n[A: escape] ${escapeFindings.length} element(s) render outside their .slide's box (clipped by overflow:hidden, invisible in a naive check — see deck-writing SKILL.md R6):`);
    printGrouped(escapeFindings, (f) => `<${f.tag} class="${f.cls}"> "${f.text}" — over by ${f.overBy}px`);
  }

  if (overlapFindings.length) {
    failed = true;
    console.log(`\n[B: chrome overlap] ${overlapFindings.length} element(s) visually collide with footer/nav chrome:`);
    printGrouped(overlapFindings, (f) => `<${f.tag}> "${f.text}" overlaps ${f.chrome}`);
  }

  if (leftEdgeFindings.length) {
    failed = true;
    console.log(`\n[C: left-edge drift] .slide-content's left edge is not uniform (see deck-writing SKILL.md R2):`);
    for (const f of leftEdgeFindings) {
      const uniq = [...new Set(f.samples.map((s) => s.left))].sort((a, b) => a - b);
      console.log(`  ${f.label}: spread ${f.spread}px across values [${uniq.join(', ')}]`);
    }
  }

  if (wrapFindings.length) {
    failed = true;
    console.log(`\n[D: heading/stat wrap] ${wrapFindings.length} element(s) render on more than one line at a desktop breakpoint (see deck-writing SKILL.md R3/R5):`);
    printGrouped(wrapFindings, (f) => `<${f.tag}> "${f.text}" — ~${f.lines} lines`);
  }

  if (headlineFindings.length) {
    failed = true;
    console.log(`\n[E: headline length] heading exceeds 8 words (see deck-writing SKILL.md R4):`);
    for (const f of headlineFindings) {
      console.log(`  slide ${f.slide}: <${f.tag}> (${f.words} words) "${f.text}"`);
    }
  }

  if (!failed) {
    console.log('\nAll automated checks passed at every breakpoint (overflow, escape, chrome overlap, left-edge, heading/stat wrap, headline length).');
  }
  console.log('\nStill eyeball every image — automated checks cannot see contrast, figure quality,');
  console.log('or interaction (keyboard/wheel/touch nav, or whether scroll-snap actually lands on a slide).');

  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
