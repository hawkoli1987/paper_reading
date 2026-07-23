#!/usr/bin/env node
/**
 * QA driver for frontend-slides decks.
 *
 * Renders every `.slide` in a presentation.html at each of the skill's
 * required validation breakpoints, waits for scroll + reveal animations to
 * settle, screenshots each, and flags any slide whose content overflows its
 * viewport box (the single most common defect per the skill's QA checklist).
 *
 * Usage:
 *   node qa-screenshot.js <path-to-presentation.html> [output-dir]
 *
 * Requires Google Chrome installed locally (no bundled Chromium download —
 * see docs/html-tooling.md for why).
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const BREAKPOINTS = [
  [1920, 1080, 'desktop-hd'],
  [1280, 720, 'desktop'],
  [768, 1024, 'tablet-portrait'],
  [375, 667, 'mobile'],
  [667, 375, 'mobile-landscape'],
];

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

function findChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  for (const candidate of CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'No Chrome install found. Set PUPPETEER_EXECUTABLE_PATH to your Chrome/Chromium binary.'
  );
}

async function main() {
  const inputArg = process.argv[2];
  if (!inputArg) {
    console.error('Usage: node qa-screenshot.js <path-to-presentation.html> [output-dir]');
    process.exit(1);
  }
  const filePath = path.resolve(inputArg);
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }
  const outDir = path.resolve(process.argv[3] || path.join(path.dirname(filePath), 'qa-screenshots'));
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.goto('file://' + filePath, { waitUntil: 'networkidle0' });

  const slideCount = await page.evaluate(() => document.querySelectorAll('.slide').length);
  if (slideCount === 0) {
    console.error('No elements with class "slide" found — is this a frontend-slides deck?');
    await browser.close();
    process.exit(1);
  }
  console.log(`Found ${slideCount} slides. Testing ${BREAKPOINTS.length} breakpoints...\n`);

  const overflows = [];

  for (const [width, height, label] of BREAKPOINTS) {
    await page.setViewport({ width, height });
    for (let i = 1; i <= slideCount; i++) {
      const { scrolled, overflowed } = await page.evaluate((n) => {
        const slides = document.querySelectorAll('.slide');
        const el = slides[n - 1];
        if (!el) return { scrolled: false, overflowed: false };
        el.scrollIntoView({ block: 'start', behavior: 'auto' });
        const EPSILON = 2; // px tolerance for sub-pixel layout rounding
        return { scrolled: true, overflowed: el.scrollHeight > el.clientHeight + EPSILON };
      }, i);
      if (!scrolled) continue;

      // Let scroll-snap settle and staggered .reveal transitions finish
      // (transition-delay up to ~0.24s + 0.6s duration in the skill's default CSS).
      await new Promise((r) => setTimeout(r, 900));

      const outPath = path.join(outDir, `${label}-slide-${i}.png`);
      await page.screenshot({ path: outPath });

      if (overflowed) {
        overflows.push({ label, slide: i });
        console.log(`  [OVERFLOW] ${label} slide ${i} — content exceeds viewport, see ${outPath}`);
      }
    }
    console.log(`${label} (${width}x${height}): ${slideCount} slides captured`);
  }

  await browser.close();

  console.log(`\nScreenshots written to ${outDir}`);
  if (overflows.length) {
    console.log(`\n${overflows.length} overflow(s) detected — inspect the flagged images above.`);
    console.log('This only catches vertical overflow; still eyeball every image for overlap,');
    console.log('spacing, contrast, and horizontal collisions (see docs/html-tooling.md QA checklist).');
    process.exitCode = 1;
  } else {
    console.log('\nNo automated overflow detected at any breakpoint.');
    console.log('Still eyeball every image — this check only catches vertical overflow, not');
    console.log('overlap, spacing, contrast, or horizontal collisions.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
