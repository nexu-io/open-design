import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Protocol drift guard for the codex app-server transport.
 *
 * codex ships no protocol changelog and no version negotiation, but it DOES
 * ship a generator: `codex app-server generate-ts --out DIR` emits ~94 TypeScript
 * files that are guaranteed to match the installed binary. This suite runs that
 * generator against whatever codex is on PATH and checks that every method,
 * field, and enum value `codex-app-server/session.ts` and
 * `codex-app-server/normalize.ts` read still exists.
 *
 * Why a contract check instead of vendoring the generated files: the generated
 * tree is ~2.7 MB and describes the codex build of whoever ran the generator,
 * not the codex the user has installed. Compiling against it would buy
 * confidence the runtime cannot honour. What actually protects us is (a) the
 * defensive readers in the normalizer, which is what the rest of these suites
 * cover, and (b) this list — a machine-checked statement of exactly which
 * protocol surface we lean on, which fails loudly the day codex renames one of
 * them. Keep the two in sync: adding a field read in the normalizer without
 * adding it here removes it from the guard.
 *
 * Skipped when codex is not installed, so CI without a codex binary stays green.
 */

function codexAvailable(): boolean {
  try {
    execFileSync('codex', ['--version'], { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/** Requests this transport SENDS. */
const CLIENT_REQUESTS = [
  'initialize',
  'thread/start',
  'thread/resume',
  'turn/start',
  'turn/interrupt',
] as const;

/** Notifications this transport READS. Anything else is ignored at runtime. */
const SERVER_NOTIFICATIONS = [
  'thread/started',
  'turn/started',
  'turn/completed',
  'turn/plan/updated',
  'item/started',
  'item/completed',
  'item/agentMessage/delta',
  'item/reasoning/summaryTextDelta',
  'item/reasoning/summaryPartAdded',
  'item/reasoning/textDelta',
  'thread/tokenUsage/updated',
  'error',
  'warning',
] as const;

/** file (relative to the generated root) -> identifiers/literals we depend on. */
const TYPE_SURFACE: Record<string, string[]> = {
  'InitializeCapabilities.ts': ['experimentalApi', 'requestAttestation'],
  'ClientInfo.ts': ['name', 'title', 'version'],
  'v2/ThreadStartParams.ts': ['cwd', 'sandbox', 'approvalPolicy'],
  'v2/ThreadResumeParams.ts': ['threadId', 'cwd', 'sandbox', 'approvalPolicy'],
  'v2/TurnStartParams.ts': ['threadId', 'input', 'model', 'effort', 'summary', 'serviceTier'],
  'v2/TurnInterruptParams.ts': ['threadId'],
  'v2/SandboxMode.ts': ['"workspace-write"', '"danger-full-access"'],
  'ReasoningSummary.ts': ['"detailed"'],
  'v2/UserInput.ts': ['"text"', 'text_elements', '"localImage"', 'path'],
  'v2/ThreadStartedNotification.ts': ['thread'],
  'v2/Thread.ts': ['id', 'path'],
  'v2/TurnCompletedNotification.ts': ['turn'],
  'v2/Turn.ts': ['id', 'status', 'error'],
  'v2/TurnStatus.ts': ['"completed"', '"failed"', '"interrupted"'],
  'v2/TurnError.ts': ['message'],
  'v2/ErrorNotification.ts': ['error', 'willRetry'],
  'v2/WarningNotification.ts': ['message'],
  'v2/ItemStartedNotification.ts': ['item'],
  'v2/ItemCompletedNotification.ts': ['item'],
  'v2/AgentMessageDeltaNotification.ts': ['itemId', 'delta'],
  'v2/ReasoningSummaryTextDeltaNotification.ts': ['itemId', 'delta', 'summaryIndex'],
  'v2/ReasoningSummaryPartAddedNotification.ts': ['itemId', 'summaryIndex'],
  'v2/ReasoningTextDeltaNotification.ts': ['itemId', 'delta', 'contentIndex'],
  'v2/ThreadTokenUsageUpdatedNotification.ts': ['tokenUsage'],
  'v2/ThreadTokenUsage.ts': ['total', 'last'],
  'v2/TokenUsageBreakdown.ts': [
    'totalTokens',
    'inputTokens',
    'cachedInputTokens',
    'cacheWriteInputTokens',
    'outputTokens',
    'reasoningOutputTokens',
  ],
  'v2/TurnPlanUpdatedNotification.ts': ['plan'],
  'v2/TurnPlanStep.ts': ['step', 'status'],
  'v2/FileUpdateChange.ts': ['path', 'kind'],
  'v2/PatchChangeKind.ts': ['"add"', '"update"', '"delete"'],
  'v2/McpToolCallError.ts': ['message'],
  'v2/ThreadItem.ts': [
    '"agentMessage"',
    '"reasoning"',
    '"commandExecution"',
    '"fileChange"',
    '"mcpToolCall"',
    '"webSearch"',
    'aggregatedOutput',
    'exitCode',
    'changes',
    'server',
    'tool',
    'arguments',
    'summary',
    'content',
  ],
  'WebSearchItem.ts': ['query', 'action'],
  'WebSearchAction.ts': ['"search"'],
};

const describeWithCodex = codexAvailable() ? describe : describe.skip;

describeWithCodex('codex app-server protocol contract', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-codex-appserver-'));
  let generated = false;
  let codexVersion = '';
  try {
    codexVersion = String(
      execFileSync('codex', ['--version'], { encoding: 'utf8', timeout: 10_000 }),
    ).trim();
    execFileSync('codex', ['app-server', 'generate-ts', '--out', outDir], {
      stdio: 'ignore',
      timeout: 120_000,
    });
    generated = true;
  } catch {
    generated = false;
  }

  const read = (rel: string): string | null => {
    try {
      return fs.readFileSync(path.join(outDir, rel), 'utf8');
    } catch {
      return null;
    }
  };

  it(`generated bindings for the installed codex (${codexVersion || 'unknown'})`, () => {
    expect(generated).toBe(true);
  });

  it('still declares every request this transport sends', () => {
    const source = read('ClientRequest.ts') ?? '';
    const missing = CLIENT_REQUESTS.filter((m) => !source.includes(`"method": "${m}"`));
    expect(missing).toEqual([]);
  });

  it('still declares every notification this transport reads', () => {
    const source = read('ServerNotification.ts') ?? '';
    const missing = SERVER_NOTIFICATIONS.filter((m) => !source.includes(`"method": "${m}"`));
    expect(missing).toEqual([]);
  });

  it('still carries every field this transport reads or writes', () => {
    const missing: string[] = [];
    for (const [file, identifiers] of Object.entries(TYPE_SURFACE)) {
      const source = read(file);
      if (source === null) {
        missing.push(`${file} (file is gone)`);
        continue;
      }
      for (const identifier of identifiers) {
        if (!source.includes(identifier)) missing.push(`${file}: ${identifier}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('cleans up the generated tree', () => {
    fs.rmSync(outDir, { recursive: true, force: true });
    expect(fs.existsSync(outDir)).toBe(false);
  });
});
