/**
 * Shared Chrome-binary resolution for puppeteer-core scripts in this repo.
 * No bundled Chromium download — drives whatever Chrome is already
 * installed. See docs/html-tooling.md for why.
 */
const fs = require('fs');

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

module.exports = { findChrome };
