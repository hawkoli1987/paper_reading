#!/usr/bin/env node
/**
 * Headless-Chrome slide renderer for frontend-slides decks.
 *
 * Sibling of qa-screenshot.js, stripped to just the render loop (scroll each
 * `.slide` into view, let scroll-snap + staggered `.reveal` animations
 * settle, screenshot) with none of the layout-check machinery — this script
 * has no pass/fail contract, it just produces PNGs. Used by
 * scripts/export-pptx.py as the render stage of the HTML -> pptx pipeline
 * (see docs/html-tooling.md).
 *
 * Usage:
 *   node render-deck.js <path-to-presentation.html> <output-dir>
 *       [--viewport WxH] [--hide-chrome]
 *
 * --viewport defaults to 1920x1080 (16:9, matches the pptx export's slide
 * aspect ratio so pictures never need distorting to fill the slide).
 * --hide-chrome hides .keyboard-hint/.nav-dots/.progress-index (meaningless
 * once slides leave the browser) while leaving .footer-cite visible.
 *
 * Requires Google Chrome installed locally — see lib/find-chrome.js.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { findChrome } = require('./lib/find-chrome');

function parseArgs(argv) {
  const hideChrome = argv.includes('--hide-chrome');
  const positional = [];
  let viewport = [1920, 1080];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--viewport') {
      const m = /^(\d+)x(\d+)$/.exec(argv[i + 1] || '');
      if (!m) throw new Error(`--viewport expects WxH, got "${argv[i + 1]}"`);
      viewport = [Number(m[1]), Number(m[2])];
      i++;
    } else if (argv[i] === '--hide-chrome') {
      // handled above
    } else {
      positional.push(argv[i]);
    }
  }
  return { positional, viewport, hideChrome };
}

async function main() {
  const { positional, viewport, hideChrome } = parseArgs(process.argv.slice(2));
  const [inputArg, outDirArg] = positional;
  if (!inputArg || !outDirArg) {
    console.error('Usage: node render-deck.js <path-to-presentation.html> <output-dir> [--viewport WxH] [--hide-chrome]');
    process.exit(1);
  }
  const filePath = path.resolve(inputArg);
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }
  const outDir = path.resolve(outDirArg);
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: viewport[0], height: viewport[1] });
  await page.goto('file://' + filePath, { waitUntil: 'networkidle0' });
  await page.evaluateHandle(() => document.fonts.ready);

  if (hideChrome) {
    await page.addStyleTag({
      content: `.keyboard-hint, .nav-dots, .progress-index { display: none !important; }`,
    });
  }

  const slideCount = await page.evaluate(() => document.querySelectorAll('.slide').length);
  if (slideCount === 0) {
    console.error('No elements with class "slide" found — is this a frontend-slides deck?');
    await browser.close();
    process.exit(1);
  }

  const pad = String(slideCount).length;
  for (let i = 1; i <= slideCount; i++) {
    await page.evaluate((n) => {
      const el = document.querySelectorAll('.slide')[n - 1];
      if (el) el.scrollIntoView({ block: 'start', behavior: 'auto' });
    }, i);
    // Same settle budget qa-screenshot.js uses in full-screenshot mode —
    // long enough for scroll-snap plus staggered .reveal to finish.
    await new Promise((r) => setTimeout(r, 900));

    const outPath = path.join(outDir, `slide-${String(i).padStart(pad, '0')}.png`);
    await page.screenshot({ path: outPath });
  }

  await browser.close();
  console.log(`Rendered ${slideCount} slides to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
