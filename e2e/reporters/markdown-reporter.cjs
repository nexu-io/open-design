const fs = require('node:fs');
const path = require('node:path');
const caseMetadata = require('../cases/report-metadata.cjs');

class MarkdownReporter {
  constructor(options = {}) {
    this.options = options;
    this.rootSuite = null;
    this.startedAt = null;
  }

  onBegin(_config, suite) {
    this.rootSuite = suite;
    this.startedAt = new Date();
  }

  async onEnd() {
    if (!this.rootSuite) return;

    const rows = [];
    visitSuite(this.rootSuite, rows);
    rows.sort((a, b) => a.caseId.localeCompare(b.caseId));

    const summary = summarize(rows);
    const startedAt = this.startedAt ?? new Date();
    const finishedAt = new Date();
    const outputFile = this.options.outputFile || './reports/latest.md';
    const resolvedOutput = path.resolve(process.cwd(), outputFile);

    fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    fs.writeFileSync(
      resolvedOutput,
      buildMarkdown({
        startedAt,
        finishedAt,
        summary,
        rows,
        outputFile,
      }),
      'utf8',
    );
  }
}

function visitSuite(suite, rows) {
  for (const child of suite.suites || []) {
    visitSuite(child, rows);
  }
  for (const test of suite.tests || []) {
    const finalResult = test.results[test.results.length - 1];
    if (!finalResult) continue;
    const parsed = parseCaseTitle(test.title);
    rows.push({
      caseId: parsed.caseId,
      title: parsed.title,
      module: caseMetadata[parsed.caseId]?.module || 'Uncategorized',
      assertions: caseMetadata[parsed.caseId]?.assertions || [],
      status: normalizeStatus(finalResult.status, test.outcome && test.outcome()),
      durationMs: finalResult.duration ?? 0,
      retries: Math.max(0, test.results.length - 1),
      file: test.location?.file ?? '',
      line: test.location?.line ?? null,
      attachments: (finalResult.attachments || [])
        .map((entry) => ({
          name: entry.name || '',
          contentType: entry.contentType || '',
          path: entry.path ? toRelative(entry.path) : null,
        }))
        .filter((entry) => entry.path),
      error: compactError(finalResult.error),
    });
  }
}

function parseCaseTitle(title) {
  const idx = title.indexOf(': ');
  if (idx === -1) {
    return { caseId: title, title };
  }
  return {
    caseId: title.slice(0, idx).trim(),
    title: title.slice(idx + 2).trim(),
  };
}

function normalizeStatus(status, outcome) {
  if (outcome === 'flaky') return 'flaky';
  return status || 'unknown';
}

function compactError(error) {
  if (!error) return null;
  const raw = [error.message, error.value, error.stack]
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!raw) return null;
  return raw.split('\n').slice(0, 8).join('\n');
}

function summarize(rows) {
  const summary = {
    total: rows.length,
    passed: 0,
    failed: 0,
    flaky: 0,
    skipped: 0,
    timedOut: 0,
    interrupted: 0,
    durationMs: rows.reduce((sum, row) => sum + row.durationMs, 0),
  };

  for (const row of rows) {
    if (row.status === 'passed') summary.passed += 1;
    else if (row.status === 'failed') summary.failed += 1;
    else if (row.status === 'flaky') summary.flaky += 1;
    else if (row.status === 'skipped') summary.skipped += 1;
    else if (row.status === 'timedOut') summary.timedOut += 1;
    else if (row.status === 'interrupted') summary.interrupted += 1;
  }

  return summary;
}

function buildMarkdown({ startedAt, finishedAt, summary, rows, outputFile }) {
  const lines = [];
  lines.push('# UI Automation Test Report');
  lines.push('');
  lines.push(`- Generated: ${finishedAt.toISOString()}`);
  lines.push(`- Started: ${startedAt.toISOString()}`);
  lines.push(`- Finished: ${finishedAt.toISOString()}`);
  lines.push(`- Report file: \`${outputFile}\``);
  lines.push(`- Result: ${summary.failed === 0 && summary.timedOut === 0 ? 'passed' : 'failed'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total cases: ${summary.total}`);
  lines.push(`- Passed: ${summary.passed}`);
  lines.push(`- Failed: ${summary.failed}`);
  lines.push(`- Flaky: ${summary.flaky}`);
  lines.push(`- Skipped: ${summary.skipped}`);
  lines.push(`- Timed out: ${summary.timedOut}`);
  lines.push(`- Interrupted: ${summary.interrupted}`);
  lines.push(`- Total duration: ${formatDuration(summary.durationMs)}`);
  lines.push('');
  lines.push('## Case Results');
  lines.push('');
  lines.push('| Case ID | Module | Title | Status | Duration | Retries |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    lines.push(
      `| \`${escapeCell(row.caseId)}\` | ${escapeCell(row.module)} | ${escapeCell(row.title)} | ${statusLabel(row.status)} | ${formatDuration(row.durationMs)} | ${row.retries} |`,
    );
  }

  lines.push('');
  lines.push('## Key Assertions');
  lines.push('');
  for (const row of rows) {
    lines.push(`### ${row.caseId}`);
    lines.push('');
    lines.push(`- Module: ${row.module}`);
    lines.push(`- Title: ${row.title}`);
    lines.push(`- Status: ${statusLabel(row.status)}`);
    if (row.assertions.length > 0) {
      lines.push('- Verified points:');
      for (const assertion of row.assertions) {
        lines.push(`  - ${assertion}`);
      }
    } else {
      lines.push('- Verified points: not configured');
    }
    lines.push('');
  }

  const problematic = rows.filter((row) => row.status !== 'passed');
  if (problematic.length > 0) {
    lines.push('');
    lines.push('## Failure Details');
    lines.push('');
    for (const row of problematic) {
      lines.push(`### ${row.caseId}`);
      lines.push('');
      lines.push(`- Title: ${row.title}`);
      lines.push(`- Status: ${statusLabel(row.status)}`);
      lines.push(`- Location: \`${toRelative(row.file)}${row.line ? `:${row.line}` : ''}\``);
      if (row.error) {
        lines.push('- Error:');
        lines.push('```text');
        lines.push(row.error);
        lines.push('```');
      }
      if (row.attachments.length > 0) {
        lines.push('- Attachments:');
        for (const attachment of row.attachments) {
          lines.push(`  - \`${attachment.name}\` - \`${attachment.path}\``);
        }
      }
      lines.push('');
    }
  }

  lines.push('## Raw Artifacts');
  lines.push('');
  lines.push('- HTML report entry: `e2e/reports/ui-test-report.html`');
  lines.push('- Playwright HTML directory: `e2e/reports/playwright-html-report/`');
  lines.push('- JSON results: `e2e/reports/results.json`');
  lines.push('- JUnit results: `e2e/reports/junit.xml`');
  lines.push('- Playwright attachments: `e2e/reports/test-results/`');
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- This report records the UI automation cases that ran in this execution.');
  lines.push('- Case design comes from `e2e/cases/` and the related module documents.');
  lines.push('- If a case fails, start with the attachment paths and the HTML report listed above.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusLabel(status) {
  if (status === 'passed') return 'passed';
  if (status === 'failed') return 'failed';
  if (status === 'flaky') return 'flaky';
  if (status === 'skipped') return 'skipped';
  if (status === 'timedOut') return 'timedOut';
  if (status === 'interrupted') return 'interrupted';
  return status;
}

function toRelative(filePath) {
  if (!filePath) return '';
  return path.relative(process.cwd(), filePath) || filePath;
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|');
}

module.exports = MarkdownReporter;
