#!/usr/bin/env node
/**
 * PostToolUse hook: detects claim-bearing edits to a deck's presentation.html
 * (decks/<slug-prefixed dir>/presentation.html) and records a pending-audit
 * marker for the Stop hook (require-audit.js) to
 * enforce. Mirrors on-summary-edit.js's mechanism, generalized to HTML decks —
 * see CLAUDE.md ("Claim verification is mandatory here too...").
 *
 * The scoping trick: this script never diffs the whole file. Edit/MultiEdit
 * tool calls already carry old_string/new_string — that pairing IS the new
 * content, so whatever the coordinator just wrote is exactly what gets queued
 * for claim-verifier. No separate "what changed" detection is needed.
 *
 * Deliberately dumb, same as on-summary-edit.js: makes no semantic judgement
 * about correctness — only (a) is this file in scope, (b) is this hunk pure
 * HTML/CSS/JS noise (style tweaks, class/id changes, layout markup) with no
 * underlying text change, or does it carry actual slide content. Never blocks
 * — recording only. Always exits 0.
 */
const fs = require('fs');
const path = require('path');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Strip HTML noise (comments, <style>/<script> blocks, tags/attributes,
// whitespace) so a pure layout/CSS/markup change normalizes identical to its
// source text — only visible slide content survives.
function normalize(s) {
  return String(s || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDeckFile(repoRoot, filePath) {
  if (!filePath) return false;
  const abs = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
  const rel = path.relative(repoRoot, abs);
  const parts = rel.split(path.sep);
  return (
    parts[0] === 'decks' &&
    parts.length === 3 &&
    parts[2] === 'presentation.html'
  );
}

// Deck dirs are `<slug>__<deckname>` or, for a paper's primary deck, just
// `<slug>` (no suffix) — split on the first `__` either way.
function slugFromDeckDir(filePath) {
  const dir = path.basename(path.dirname(filePath));
  return dir.split('__')[0];
}

function main() {
  const repoRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let input;
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    process.exit(0);
  }

  const toolName = input.tool_name;
  const toolInput = input.tool_input || {};
  if (!['Edit', 'Write', 'MultiEdit'].includes(toolName)) process.exit(0);

  const filePath = toolInput.file_path || toolInput.path;
  if (!isDeckFile(repoRoot, filePath)) process.exit(0);

  const slug = slugFromDeckDir(filePath);
  const deckRel = path.relative(repoRoot, filePath);

  let hunks = []; // [{old, new}]
  let fullOverwrite = false;

  if (toolName === 'Edit') {
    hunks = [{ old: toolInput.old_string, new: toolInput.new_string }];
  } else if (toolName === 'MultiEdit') {
    hunks = (toolInput.edits || []).map((e) => ({ old: e.old_string, new: e.new_string }));
  } else if (toolName === 'Write') {
    fullOverwrite = true;
  }

  let nonFormatHunks = [];
  if (!fullOverwrite) {
    nonFormatHunks = hunks.filter((h) => normalize(h.old) !== normalize(h.new));
    if (nonFormatHunks.length === 0) {
      // Every hunk was pure HTML/CSS/JS noise — nothing to audit.
      process.exit(0);
    }
  }

  try {
    const markerDir = path.join(repoRoot, '.claude', '.audit-pending');
    fs.mkdirSync(markerDir, { recursive: true });
    const markerPath = path.join(markerDir, `${slug}.md`);

    if (!fs.existsSync(markerPath)) {
      fs.writeFileSync(
        markerPath,
        `# Pending audit: ${slug}\nChanged: summaries/${slug}.md and/or decks/${slug}*/presentation.html\n`
      );
    }

    const stamp = new Date().toISOString();
    let entry = `\n## Deck change recorded ${stamp} (${deckRel})\n`;
    if (fullOverwrite) {
      entry +=
        '- Full-document overwrite (Write tool). Scope: full-deck (new deck, or whole-file reformat — coordinator must judge which).\n';
    } else {
      for (const h of nonFormatHunks) {
        entry += `- OLD: ${JSON.stringify(String(h.old || '').slice(0, 500))}\n  NEW: ${JSON.stringify(String(h.new || '').slice(0, 500))}\n`;
      }
    }
    fs.appendFileSync(markerPath, entry);
  } catch (err) {
    process.stderr.write(`on-deck-edit hook error: ${err && err.stack}\n`);
  }

  process.exit(0);
}

main();
