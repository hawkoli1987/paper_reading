#!/usr/bin/env node
/**
 * PostToolUse hook: detects claim-bearing edits to summaries/<slug>.md and
 * records a pending-audit marker for the Stop hook (require-audit.js) to
 * enforce. See CLAUDE.md ("Claim verification is mandatory...") and
 * .claude/agents/claim-verifier.md for the mechanism this feeds.
 *
 * Deliberately dumb: this script makes NO semantic judgement about whether a
 * changed claim is correct, cited, or needs web-vs-PDF checking — that's the
 * coordinator's and claim-verifier's job. It only decides two deterministic
 * things: (a) is this file in scope at all, (b) is this specific diff PURE
 * markdown formatting with no textual change underneath (skip silently), or
 * does it change actual content (record a marker).
 *
 * Never blocks — recording only. Always exits 0.
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

// Strip markdown formatting (bullet markers, headings, emphasis, backticks,
// whitespace) so a pure reformat normalizes identical to its source text.
function normalize(s) {
  return String(s || '')
    .replace(/^[ \t]*[-*+]\s+/gm, '')
    .replace(/^[ \t]*#{1,6}\s+/gm, '')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSummaryFile(repoRoot, filePath) {
  if (!filePath) return false;
  const abs = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
  const rel = path.relative(repoRoot, abs);
  return rel.startsWith('summaries' + path.sep) && rel.endsWith('.md');
}

function slugFromPath(filePath) {
  return path.basename(filePath, '.md');
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
  if (!isSummaryFile(repoRoot, filePath)) process.exit(0);

  const slug = slugFromPath(filePath);

  // Collect hunks depending on tool shape.
  let hunks = []; // [{old, new}]
  let fullOverwrite = false;

  if (toolName === 'Edit') {
    hunks = [{ old: toolInput.old_string, new: toolInput.new_string }];
  } else if (toolName === 'MultiEdit') {
    hunks = (toolInput.edits || []).map((e) => ({ old: e.old_string, new: e.new_string }));
  } else if (toolName === 'Write') {
    // Full-file overwrite — no prior content available to diff against.
    fullOverwrite = true;
  }

  let nonFormatHunks = [];
  if (!fullOverwrite) {
    nonFormatHunks = hunks.filter((h) => normalize(h.old) !== normalize(h.new));
    if (nonFormatHunks.length === 0) {
      // Every hunk was a pure formatting change — nothing to audit.
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
        `# Pending audit: ${slug}\nTarget: summaries/${slug}.md\nSource: papers/${slug}.pdf\n`
      );
    }

    const stamp = new Date().toISOString();
    let entry = `\n## Change recorded ${stamp}\n`;
    if (fullOverwrite) {
      entry +=
        '- Full-document overwrite (Write tool). Scope: full-document (may-be-reformat — could be a full rewrite, a brand-new summary, or a whole-file reformat with no factual change; coordinator must judge which).\n';
    } else {
      for (const h of nonFormatHunks) {
        entry += `- OLD: ${JSON.stringify(String(h.old || '').slice(0, 500))}\n  NEW: ${JSON.stringify(String(h.new || '').slice(0, 500))}\n`;
      }
    }
    fs.appendFileSync(markerPath, entry);
  } catch (err) {
    // Never let a hook bug break the coordinator's flow.
    process.stderr.write(`on-summary-edit hook error: ${err && err.stack}\n`);
  }

  process.exit(0);
}

main();
