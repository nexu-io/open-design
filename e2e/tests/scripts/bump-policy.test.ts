import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { eligibleIdentity, nextPatch, validationBlocker } from '../../../.github/scripts/release/bump-policy.ts';

const policy = resolve(import.meta.dirname, '../../../.github/scripts/release/bump-policy.ts');
function fixture(change: (dir: string) => void): { ok: boolean; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'bump-policy-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  const manifest = (version: string) => JSON.stringify({ name: 'fixture', version, scripts: { test: 'original' } }, null, 2) + '\n';
  try {
    git('init', '-q'); git('config', 'user.name', 'test'); git('config', 'user.email', 'test@example.test');
    mkdirSync(join(dir, 'apps/packaged'), { recursive: true });
    for (const path of ['package.json', 'apps/packaged/package.json']) writeFileSync(join(dir, path), manifest('0.25.0'));
    git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
    for (const path of ['package.json', 'apps/packaged/package.json']) writeFileSync(join(dir, path), manifest('0.25.1'));
    change(dir); git('add', '.'); git('commit', '-qm', 'candidate'); const head = git('rev-parse', 'HEAD');
    try {
      const output = execFileSync(process.execPath, ['--input-type=module', '-e', `import {validateBumpTree} from ${JSON.stringify(policy)}; console.log(validateBumpTree('${base}','${head}','0.25.0'));`], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
      return { ok: true, output };
    } catch (error) { return { ok: false, output: String(error) }; }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe('pure version bump approval exemption', () => {
  it('accepts the full synchronized version-only tree', () => expect(fixture(() => {}).ok).toBe(true));
  it.each(['extra-file', 'extra-field', 'missing-bump', 'mode-change', 'wrong-version', 'duplicate-key'])('rejects %s', kind => {
    expect(fixture(dir => {
      const path = join(dir, 'package.json');
      if (kind === 'extra-file') writeFileSync(join(dir, 'unexpected.ts'), 'throw 1');
      if (kind === 'extra-field') writeFileSync(path, readFileSync(path, 'utf8').replace('original', 'unreviewed'));
      if (kind === 'missing-bump') writeFileSync(path, readFileSync(path, 'utf8').replace('0.25.1', '0.25.0'));
      if (kind === 'wrong-version') writeFileSync(path, readFileSync(path, 'utf8').replace('0.25.1', '0.26.0'));
      if (kind === 'duplicate-key') writeFileSync(path, readFileSync(path, 'utf8').replace('"version":', '"version":"9.9.9", "version":'));
      if (kind === 'mode-change') execFileSync('chmod', ['+x', path]);
    }).ok).toBe(false);
  });
  it('binds author, branch, repository, base and hold state', () => {
    const pr = { number: 1, node_id: 'pr1', state: 'open', draft: false, user: { login: 'open-design-release-bot[bot]' },
      head: { sha: 'a'.repeat(40), ref: 'release-bot/bump-main-v0.25.1', repo: { full_name: 'nexu-io/open-design' } },
      base: { sha: 'b'.repeat(40), ref: 'main', repo: { full_name: 'nexu-io/open-design' } }, labels: [] };
    expect(eligibleIdentity(pr, '0.25.0')).toBe(true);
    expect(eligibleIdentity({ ...pr, user: { login: 'someone' } }, '0.25.0')).toBe(false);
    expect(eligibleIdentity({ ...pr, head: { ...pr.head, repo: { full_name: 'fork/open-design' } } }, '0.25.0')).toBe(false);
    expect(eligibleIdentity({ ...pr, labels: [{ name: 'hold' }] }, '0.25.0')).toBe(false);
    expect(nextPatch('1.2.9')).toBe('1.2.10');
    expect(() => nextPatch('1.2.3-beta.1')).toThrow();
  });
  it('keeps CI and review objections mandatory even without an approval', () => {
    const green = { reviewDecision: 'REVIEW_REQUIRED', mergeable: 'MERGEABLE', mergeQueueEntry: null,
      reviewThreads: { nodes: [], pageInfo: { hasNextPage: false } }, commits: { nodes: [{ commit: {
        statusCheckRollup: { contexts: { nodes: [{ name: 'Validate workspace', status: 'COMPLETED', conclusion: 'SUCCESS' }], pageInfo: { hasNextPage: false } } },
      } }] } };
    expect(validationBlocker(green)).toBeNull();
    expect(validationBlocker({ ...green, reviewDecision: 'CHANGES_REQUESTED' })).toMatch(/审查/);
    expect(validationBlocker({ ...green, mergeable: 'CONFLICTING' })).toMatch(/冲突/);
    expect(validationBlocker({ ...green, timelineItems: { nodes: [{ beforeCommit: null, reason: 'removed' }] } })).toMatch(/移出合并队列/);
    const failed = structuredClone(green);
    failed.commits.nodes[0]!.commit.statusCheckRollup.contexts.nodes.push({ name: 'Docker', status: 'COMPLETED', conclusion: 'FAILURE' });
    expect(validationBlocker(failed)).toMatch(/CI/);
    const pending = structuredClone(green);
    pending.commits.nodes[0]!.commit.statusCheckRollup.contexts.nodes[0]!.status = 'IN_PROGRESS';
    expect(validationBlocker(pending)).toMatch(/Validate workspace/);
  });
});
