#!/usr/bin/env node
/**
 * Stop hook: blocks turn-end while any summary edit recorded by
 * on-summary-edit.js hasn't been resolved by a claim-verifier run.
 *
 * A marker at .claude/.audit-pending/<slug>.md is "resolved" once
 * audit/<slug>.md has been written (or re-written) AFTER the marker — i.e.
 * its mtime is newer. claim-verifier always appends a run section on every
 * invocation (even an all-ACCEPTED-CITED one), so that's what releases the
 * block. The coordinator's other escape hatch is deleting the marker itself
 * (`rm .claude/.audit-pending/<slug>.md`) when a change is judged to be a
 * pure reformat/reword with no claim to verify.
 *
 * Loop-guarded via stop_hook_active — never blocks twice in a row.
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

function main() {
  const repoRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let input;
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    input = {};
  }

  // Already blocked once this stop cycle — let it end rather than loop.
  if (input.stop_hook_active === true) process.exit(0);

  const markerDir = path.join(repoRoot, '.claude', '.audit-pending');
  if (!fs.existsSync(markerDir)) process.exit(0);

  const markers = fs
    .readdirSync(markerDir)
    .filter((f) => f.endsWith('.md'));

  const unresolved = [];

  for (const file of markers) {
    const slug = path.basename(file, '.md');
    const markerPath = path.join(markerDir, file);
    const auditPath = path.join(repoRoot, 'audit', `${slug}.md`);

    const markerStat = fs.statSync(markerPath);
    const auditStat = fs.existsSync(auditPath) ? fs.statSync(auditPath) : null;

    if (auditStat && auditStat.mtimeMs > markerStat.mtimeMs) {
      // Resolved — a claim-verifier run happened after this change.
      fs.unlinkSync(markerPath);
      continue;
    }

    unresolved.push({ slug, content: fs.readFileSync(markerPath, 'utf8') });
  }

  if (unresolved.length === 0) process.exit(0);

  const parts = unresolved.map(
    ({ slug, content }) =>
      `--- summaries/${slug}.md ---\n${content.trim()}`
  );

  const reason =
    `${unresolved.length} summary edit(s) are pending claim verification before this turn can end.\n\n` +
    parts.join('\n\n') +
    `\n\nFor each summary above: split the changed claims into (a) those tagged ` +
    `[src: ...] — provenance-grounded, hand them to claim-verifier to log as ` +
    `ACCEPTED-CITED (no re-check needed), and (b) untagged claims — forward these ` +
    `to claim-verifier to actively verify against papers/<slug>.pdf or web search. ` +
    `claim-verifier always appends a run to audit/<slug>.md, which is what clears ` +
    `the block. If a change altered no claim at all (pure reformat/rewording), ` +
    `clear it directly instead: rm .claude/.audit-pending/<slug>.md. ` +
    `Do not end the turn until every summary above is either audited or cleared.`;

  console.log(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

main();
