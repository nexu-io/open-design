import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { createFakeAgentRuntimes, type FakeAgentId } from '@/fake-agents';

let root: string | null = null;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = null;
});

const markerKey = 'aabbccddeeff0011';
const currentIdentity = [
  '<recipe_identity strategy_version="2.0.6" applied_snapshot="current-snapshot" task_profile_version="2.0.0" />',
  '<task_type>prototype</task_type>',
  '<task_execution_id>current-task</task_execution_id>',
  `When the plan is ready, emit <od-production-ready key="${markerKey}" />.`,
].join('\n');

it.each(['claude', 'codex', 'opencode'] as const)(
  '%s fake plans and produces with the current marker prompt and no retired package hash', async (agentId) => {
    const run = await fixture(agentId);
    const plan = await run(`${currentIdentity}\nCreate an OD Next active canary artifact`);
    expect(plan).toContain(`<od-production-ready key="${markerKey}" />`);
    expect(plan).not.toMatch(/open-design-(?:plan-contract|runtime-state)|packageHash/);
    const production = await run(
      'This is the production turn. Build the approved plan.',
      agentId === 'opencode' ? 'fake-opencode' : undefined,
    );
    expect(production).toContain('Created od-next-active-canary.html');
    expect(production).not.toMatch(/open-design-(?:plan-contract|runtime-state)|packageHash/);
    expect(await readFile(path.join(root!, 'workspace', 'od-next-active-canary.html'), 'utf8'))
      .toContain('data-od-deck-protocol="1"');
  },
);

it('answers the daemon OpenCode help probe without waiting for generation stdin', async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'od-fake-help-'));
  const runtimes = await createFakeAgentRuntimes({ root, runtimeIds: ['opencode'] });
  const bin = runtimes.opencode.bin;
  const script = bin.endsWith('.cmd') ? bin.slice(0, -4) + '.cjs' : bin;
  const { stdout } = await promisify(execFile)(process.execPath, [script, 'run', '--help'], {
    timeout: 1_000,
  });
  expect(stdout).toContain('--format');
  expect(stdout).toContain('--dir');
  expect(stdout).toContain('--dangerously-skip-permissions');
});

it('keeps the public clarification form and answer-to-planning fixture free of retired model state', async () => {
  const run = await fixture('claude');
  const question = await run(`${currentIdentity}\nCreate an OD Next clarification canary artifact`);
  expect(question).toContain('<question-form id="od-next-canary-platform"');
  expect(question).not.toContain('od-production-ready');
  expect(question).not.toMatch(/open-design-(?:plan-contract|runtime-state)|packageHash/);
  const answer = await run(`${currentIdentity}\n[form answers — od-next-canary-platform]\n- Target platform: Desktop web`);
  expect(answer).toContain(`<od-production-ready key="${markerKey}" />`);
  const production = await run('This is the production turn. Build the answered plan.');
  expect(production).toContain('Created od-next-active-canary.html');
});

it('retains selected legacy deck output across the marker planning and production processes', async () => {
  const run = await fixture('claude');
  const plan = await run(`${currentIdentity}\nCreate a selected-template deck navigation canary\nselected or existing scaffold compatibility\nassets/template.html`);
  expect(plan).toContain(`<od-production-ready key="${markerKey}" />`);
  expect(await run('This is the production turn. Keep the selected template.'))
    .toContain('Created the selected-template legacy deck canary.');
  const html = await readFile(path.join(root!, 'workspace', 'od-next-active-canary.html'), 'utf8');
  expect(html).toContain('Matrix Slide Three');
  expect(html).not.toContain('data-od-deck-protocol="1"');
});

async function fixture(agentId: FakeAgentId): Promise<(prompt: string, resumeSessionId?: string) => Promise<string>> {
  root = await mkdtemp(path.join(os.tmpdir(), 'od-fake-marker-'));
  const cwd = path.join(root, 'workspace');
  await mkdir(cwd);
  const runtimes = await createFakeAgentRuntimes({ root: path.join(root, 'agents'), runtimeIds: [agentId] });
  const bin = runtimes[agentId].bin;
  const script = bin.endsWith('.cmd') ? bin.slice(0, -4) + '.cjs' : bin;
  return (prompt, resumeSessionId) => new Promise((resolve, reject) => {
    const args = agentId === 'codex' ? ['exec', '--json', '-']
      : agentId === 'opencode' ? ['run', '--format', 'json', '--dir', cwd, ...(resumeSessionId ? ['-s', resumeSessionId] : [])]
        : ['-p', '--output-format', 'stream-json'];
    const child = spawn(process.execPath, [script, ...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => {
      try {
        expect(code, stderr).toBe(0);
        const frames = stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
        const text = frames.flatMap(frame => frame.type === 'assistant'
          ? (frame.message?.content ?? []).filter((block: { type: string }) => block.type === 'text').map((block: { text: string }) => block.text)
          : frame.item?.type === 'agent_message' ? [frame.item.text]
            : frame.type === 'text' && frame.part?.type === 'text' ? [frame.part.text] : []);
        resolve(text.join('\n'));
      } catch (error) { reject(error); }
    });
    child.stdin.end(prompt);
  });
}
