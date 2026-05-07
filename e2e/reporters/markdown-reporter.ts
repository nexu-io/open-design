import fs from 'node:fs';
import path from 'node:path';
import type { FullConfig, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import caseMetadata from '../cases/report-metadata.ts';

interface MarkdownReporterOptions {
  outputFile?: string;
}

interface CaseRow {
  caseId: string;
  title: string;
  module: string;
  assertions: string[];
  status: string;
  durationMs: number;
  retries: number;
  file: string;
  line: number | null;
  attachments: Array<{ name: string; contentType: string; path: string }>;
  error: string | null;
}

interface Summary {
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  timedOut: number;
  interrupted: number;
  durationMs: number;
}

interface MarkdownInput {
  startedAt: Date;
  finishedAt: Date;
  summary: Summary;
  rows: CaseRow[];
  outputFile: string;
}

class MarkdownReporter implements Reporter {
  private rootSuite: Suite | null = null;
  private startedAt: Date | null = null;
  private readonly options: MarkdownReporterOptions;

  constructor(options: MarkdownReporterOptions = {}) {
    this.options = options;
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.rootSuite = suite;
    this.startedAt = new Date();
  }

  async onEnd(): Promise<void> {
    if (!this.rootSuite) return;

    const rows: CaseRow[] = [];
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

function visitSuite(suite: Suite, rows: CaseRow[]): void {
  for (const child of suite.suites || []) {
    visitSuite(child, rows);
  }
  for (const test of suite.tests || []) {
    const finalResult = test.results[test.results.length - 1];
    if (!finalResult) continue;
    rows.push(buildCaseRow(test, finalResult));
  }
}

function buildCaseRow(test: TestCase, finalResult: TestResult): CaseRow {
  const parsed = parseCaseTitle(test.title);
  const metadata = caseMetadata[parsed.caseId];
  return {
    caseId: parsed.caseId,
    title: parsed.title,
    module: metadata?.module || '未分组',
    assertions: metadata?.assertions || [],
    status: normalizeStatus(finalResult.status, test.outcome?.()),
    durationMs: finalResult.duration ?? 0,
    retries: Math.max(0, test.results.length - 1),
    file: test.location?.file ?? '',
    line: test.location?.line ?? null,
    attachments: (finalResult.attachments || [])
      .map((entry) => ({
        name: entry.name || '',
        contentType: entry.contentType || '',
        path: entry.path ? toRelative(entry.path) : '',
      }))
      .filter((entry) => entry.path.length > 0),
    error: compactError(finalResult.error),
  };
}

function parseCaseTitle(title: string): { caseId: string; title: string } {
  const idx = title.indexOf(': ');
  if (idx === -1) {
    return { caseId: title, title };
  }
  return {
    caseId: title.slice(0, idx).trim(),
    title: title.slice(idx + 2).trim(),
  };
}

function normalizeStatus(status: string | undefined, outcome: string | undefined): string {
  if (outcome === 'flaky') return 'flaky';
  return status || 'unknown';
}

function compactError(error: TestResult['error']): string | null {
  if (!error) return null;
  const raw = [error.message, error.value, error.stack]
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!raw) return null;
  return raw.split('\n').slice(0, 8).join('\n');
}

function summarize(rows: CaseRow[]): Summary {
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

function buildMarkdown({ startedAt, finishedAt, summary, rows, outputFile }: MarkdownInput): string {
  const lines: string[] = [];
  lines.push('# UI 自动化测试报告');
  lines.push('');
  lines.push(`- 生成时间：${finishedAt.toISOString()}`);
  lines.push(`- 开始时间：${startedAt.toISOString()}`);
  lines.push(`- 结束时间：${finishedAt.toISOString()}`);
  lines.push(`- 报告文件：\`${outputFile}\``);
  lines.push(`- 执行结果：${summary.failed === 0 && summary.timedOut === 0 ? '通过' : '失败'}`);
  lines.push('');
  lines.push('## 汇总');
  lines.push('');
  lines.push(`- 总用例：${summary.total}`);
  lines.push(`- 通过：${summary.passed}`);
  lines.push(`- 失败：${summary.failed}`);
  lines.push(`- Flaky：${summary.flaky}`);
  lines.push(`- 跳过：${summary.skipped}`);
  lines.push(`- 超时：${summary.timedOut}`);
  lines.push(`- 中断：${summary.interrupted}`);
  lines.push(`- 总耗时：${formatDuration(summary.durationMs)}`);
  lines.push('');
  lines.push('## 用例结果');
  lines.push('');
  lines.push('| Case ID | 模块 | 标题 | 状态 | 耗时 | 重试 |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    lines.push(
      `| \`${escapeCell(row.caseId)}\` | ${escapeCell(row.module)} | ${escapeCell(row.title)} | ${statusLabel(row.status)} | ${formatDuration(row.durationMs)} | ${row.retries} |`,
    );
  }

  lines.push('');
  lines.push('## 关键断言');
  lines.push('');
  for (const row of rows) {
    lines.push(`### ${row.caseId}`);
    lines.push('');
    lines.push(`- 模块：${row.module}`);
    lines.push(`- 标题：${row.title}`);
    lines.push(`- 状态：${statusLabel(row.status)}`);
    if (row.assertions.length > 0) {
      lines.push('- 本次验证点：');
      for (const assertion of row.assertions) {
        lines.push(`  - ${assertion}`);
      }
    } else {
      lines.push('- 本次验证点：未配置');
    }
    lines.push('');
  }

  const problematic = rows.filter((row) => row.status !== 'passed');
  if (problematic.length > 0) {
    lines.push('');
    lines.push('## 异常详情');
    lines.push('');
    for (const row of problematic) {
      lines.push(`### ${row.caseId}`);
      lines.push('');
      lines.push(`- 标题：${row.title}`);
      lines.push(`- 状态：${statusLabel(row.status)}`);
      lines.push(`- 位置：\`${toRelative(row.file)}${row.line ? `:${row.line}` : ''}\``);
      if (row.error) {
        lines.push('- 错误：');
        lines.push('```text');
        lines.push(row.error);
        lines.push('```');
      }
      if (row.attachments.length > 0) {
        lines.push('- 附件：');
        for (const attachment of row.attachments) {
          lines.push(`  - \`${attachment.name}\` · \`${attachment.path}\``);
        }
      }
      lines.push('');
    }
  }

  lines.push('## 原始产物');
  lines.push('');
  lines.push('- HTML 报告入口：`e2e/reports/ui-test-report.html`');
  lines.push('- Playwright HTML 底层目录：`e2e/reports/playwright-html-report/`');
  lines.push('- JSON 结果：`e2e/reports/results.json`');
  lines.push('- JUnit 结果：`e2e/reports/junit.xml`');
  lines.push('- Playwright 附件：`e2e/reports/test-results/`');
  lines.push('');
  lines.push('## 说明');
  lines.push('');
  lines.push('- 这份报告记录的是本次实际执行到的 UI 自动化用例。');
  lines.push('- 用例设计来源见 `e2e/cases/` 以及各模块文档。');
  lines.push('- 如果用例失败，优先查看本报告中的附件路径和 HTML 报告。');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusLabel(status: string): string {
  if (status === 'passed') return 'passed';
  if (status === 'failed') return 'failed';
  if (status === 'flaky') return 'flaky';
  if (status === 'skipped') return 'skipped';
  if (status === 'timedOut') return 'timedOut';
  if (status === 'interrupted') return 'interrupted';
  return status;
}

function toRelative(filePath: string): string {
  if (!filePath) return '';
  return path.relative(process.cwd(), filePath) || filePath;
}

function escapeCell(value: string): string {
  return String(value).replace(/\|/g, '\\|');
}

export default MarkdownReporter;
