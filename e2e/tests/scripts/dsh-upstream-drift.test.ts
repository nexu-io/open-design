// The upstream watch exists because the in-repo drift check cannot see the one
// thing that actually went wrong twice: our installers and our agent def
// agreeing with each other while both sat behind what npm serves. These cases
// pin that distinction, plus the parsing that lets the checker read either side
// out of source rather than being told the versions twice.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  buildCard,
  classifyDrift,
  interpretFeishuResponse,
  readAcceptedPattern,
  readListedVersions,
  readPinnedVersion,
} from '../../../.github/scripts/dsh-upstream-drift.ts';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const INSTALLER_SH = `${repoRoot}tools/release/resources/dsh-bootstrap/install-dsh.sh`;
const AGENT_DEF = `${repoRoot}apps/daemon/src/runtimes/defs/deepseek-harness.ts`;
const DRIFT_SCRIPT = `${repoRoot}.github/scripts/dsh-upstream-drift.ts`;
const WORKFLOW = `${repoRoot}.github/workflows/dsh-upstream-drift.yml`;

describe('DeepSeek Harness upstream drift', () => {
  it('reads what we currently ship out of the real files', async () => {
    const [installer, def, script] = await Promise.all([
      readFile(INSTALLER_SH, 'utf8'),
      readFile(AGENT_DEF, 'utf8'),
      readFile(DRIFT_SCRIPT, 'utf8'),
    ]);

    // Canonical product path — not the temporary landing public copies.
    expect(script).toContain(
      'tools/release/resources/dsh-bootstrap/install-dsh.sh',
    );
    expect(script).not.toContain('apps/landing-page/public/install-dsh.sh');

    const pinned = readPinnedVersion(installer);
    expect(pinned).toMatch(/^\d+\.\d+\.\d+/u);

    // Whatever the installer hands a user has to be a version the daemon
    // accepts, or we ship an "untested" warning to anyone who follows our own
    // instructions. The dedicated guard for that pairing is
    // `e2e/tests/dsh-installer-version-policy.test.ts`; this asserts the
    // checker can see both sides, which is what makes its verdict meaningful.
    const pattern = readAcceptedPattern(def);
    const listed = readListedVersions(def);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.includes(pinned) || (pattern?.test(pinned) ?? false)).toBe(true);
  });

  // The state that shipped twice. Both halves of our config agree, so the
  // in-repo check is green, and a user on what npm serves is outside what we
  // support — Settings calls their CLI untested and the peer ranges will not
  // resolve. Anything that reports this as healthy has lost the point.
  it('calls an accepted-nowhere latest unsupported, not merely behind', () => {
    const verdict = classifyDrift({
      accepted: false,
      latest: '0.1.1-rc.2',
      pinned: '0.1.0-rc.8',
    });

    expect(verdict.severity).toBe('unsupported');
    expect(JSON.stringify(buildCard(verdict))).toContain('0.1.1-rc.2');
  });

  it('separates "we ship an older version" from "we do not support theirs"', () => {
    expect(
      classifyDrift({ accepted: true, latest: '0.1.2', pinned: '0.1.1-rc.2' }).severity,
    ).toBe('behind');
    expect(
      classifyDrift({ accepted: true, latest: '0.1.1-rc.2', pinned: '0.1.1-rc.2' }).severity,
    ).toBe('in-sync');
  });

  it('rebuilds the accepted pattern from source rather than restating it', () => {
    const pattern = readAcceptedPattern(
      "    supportedVersionPattern: /^0\\.1\\.\\d+(?:-rc\\.\\d+)?$/u,",
    );

    expect(pattern?.test('0.1.1-rc.2')).toBe(true);
    expect(pattern?.test('0.1.9')).toBe(true);
    expect(pattern?.test('0.2.0-rc.1')).toBe(false);
  });

  it('treats a def with no pattern as accepting only what it lists', () => {
    expect(readAcceptedPattern("    supportedVersions: ['0.1.0-rc.8'],")).toBeNull();
  });


  // Importing the module used to run the CLI: collecting this very file fetched
  // the live registry and, once drift existed, would have tried to post to
  // Feishu before a single assertion ran. A watcher that fires from a test run
  // is worse than no watcher.
  it('does not touch the network when imported', async () => {
    const realFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (input: unknown) => {
      calls.push(String(input));
      throw new Error('the drift script must not fetch on import');
    }) as typeof globalThis.fetch;

    try {
      vi.resetModules();
      await import('../../../.github/scripts/dsh-upstream-drift.ts');
      expect(calls).toEqual([]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  // Feishu answers a rejected webhook with HTTP 200 and a nonzero code, so
  // "2xx means delivered" throws the alert away and reports success doing it.
  it('only counts a Feishu response as delivered when the app-level code says so', () => {
    expect(interpretFeishuResponse({ status: 200, text: '{"code":0}' })).toMatchObject({
      delivered: true,
    });
    expect(interpretFeishuResponse({ status: 200, text: '{"StatusCode":0}' })).toMatchObject({
      delivered: true,
    });
    expect(
      interpretFeishuResponse({ status: 200, text: '{"code":19021,"msg":"sign match fail"}' }),
    ).toMatchObject({ code: 19021, delivered: false, retryable: false });
  });

  it('retries only what is worth retrying', () => {
    expect(interpretFeishuResponse({ status: 429, text: '' }).retryable).toBe(true);
    expect(interpretFeishuResponse({ status: 503, text: '' }).retryable).toBe(true);
    expect(interpretFeishuResponse({ status: 200, text: '{"code":9499}' }).retryable).toBe(true);
    expect(interpretFeishuResponse({ status: 400, text: '{"code":19001}' }).retryable).toBe(false);
  });

  // A watch that only runs on a green PR would never fire, since an upstream
  // release does not touch this repo.
  it('runs on a schedule and stays outside the merge gate', async () => {
    const workflow = await readFile(WORKFLOW, 'utf8');

    expect(workflow).toMatch(/^on:\n\s+schedule:/mu);
    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).toContain('dsh-upstream-drift.ts self-check');
    expect(workflow).not.toContain('pull_request');
  });

  // The webhook and its signing secret are a pair. Selecting the landing bot
  // while signing with the release bot's secret sends a card Feishu rejects,
  // which is a silent loss of the only message this workflow exists to send.
  it('signs with the secret belonging to the webhook it chose', async () => {
    const workflow = await readFile(WORKFLOW, 'utf8');

    expect(workflow).toContain(
      'secrets.FEISHU_LANDING_WEBHOOK || secrets.FEISHU_RELEASE_WEBHOOK',
    );
    expect(workflow).toContain(
      'secrets.FEISHU_LANDING_SIGN_SECRET || secrets.FEISHU_RELEASE_SIGN_SECRET',
    );
  });
});
