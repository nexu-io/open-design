// The upstream watch exists because the in-repo drift check cannot see the one
// thing that actually went wrong twice: our installers and our agent def
// agreeing with each other while both sat behind what npm serves. These cases
// pin that distinction, plus the parsing that lets the checker read either side
// out of source rather than being told the versions twice.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  type DriftCard,
  buildCard,
  classifyDrift,
  describePublishedAt,
  interpretFeishuResponse,
  readAcceptedPattern,
  readListedVersions,
  readPinnedVersion,
  readPublishedAt,
} from '../../../.github/scripts/dsh-upstream-drift.ts';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const INSTALLER_SH = `${repoRoot}tools/release/resources/dsh-bootstrap/install-dsh.sh`;
const AGENT_DEF = `${repoRoot}apps/daemon/src/runtimes/defs/deepseek-harness.ts`;
const DRIFT_SCRIPT = `${repoRoot}.github/scripts/dsh-upstream-drift.ts`;
const WORKFLOW = `${repoRoot}.github/workflows/dsh-upstream-drift.yml`;

/** A fixed "now" so the card's relative age is a fact, not a moving target. */
const NOW = new Date('2026-09-07T00:00:00.000Z');
const PUBLISHED_AT = '2026-09-03T06:21:52.107Z';

function headlineOf(card: DriftCard): string {
  return card.header.title.content;
}

/** Everything the reader actually reads under the headline. */
function bodyOf(card: DriftCard): string {
  return card.elements.map((element) => element.text?.content ?? '').join('\n');
}

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
      publishedAt: PUBLISHED_AT,
    });

    expect(verdict.severity).toBe('unsupported');
    expect(JSON.stringify(buildCard(verdict, NOW))).toContain('0.1.1-rc.2');
  });

  it('separates "we ship an older version" from "we do not support theirs"', () => {
    expect(
      classifyDrift({
        accepted: true,
        latest: '0.1.2',
        pinned: '0.1.1-rc.2',
        publishedAt: PUBLISHED_AT,
      }).severity,
    ).toBe('behind');
    expect(
      classifyDrift({
        accepted: true,
        latest: '0.1.1-rc.2',
        pinned: '0.1.1-rc.2',
        publishedAt: PUBLISHED_AT,
      }).severity,
    ).toBe('in-sync');
  });

  // The maintainer who received this card could not tell what it was: the
  // headline jumped straight to a verdict, so nothing said "an upstream release
  // was detected" or where the message came from. The check's name belongs in
  // the headline; how bad it is belongs in the header colour, which is the one
  // thing a Feishu card renders before any text.
  it('names the check in the headline instead of announcing a verdict there', () => {
    const blocking = buildCard(
      classifyDrift({
        accepted: false,
        latest: '0.1.2-rc.1',
        pinned: '0.1.1-rc.2',
        publishedAt: PUBLISHED_AT,
      }),
      NOW,
    );
    const behind = buildCard(
      classifyDrift({
        accepted: true,
        latest: '0.1.2',
        pinned: '0.1.1-rc.2',
        publishedAt: PUBLISHED_AT,
      }),
      NOW,
    );

    expect(headlineOf(blocking)).toContain('DeepSeek Harness');
    expect(headlineOf(blocking)).toContain('新版检测');
    // Same check, same name. Severity travels in the template, not the title.
    expect(headlineOf(behind)).toBe(headlineOf(blocking));
    expect(blocking.header.template).toBe('red');
    expect(behind.header.template).toBe('orange');
  });

  // The blocking branch used to be the least informative one: its body never
  // mentioned `pinned` at all, so the most urgent card was the one that hid
  // what we currently ship. Both severities owe the reader the same three
  // facts before any explanation: what upstream released, when, and where we
  // still sit.
  it.each([
    { accepted: false, latest: '0.1.2-rc.1', severity: 'unsupported' },
    { accepted: true, latest: '0.1.2', severity: 'behind' },
  ])('states upstream version, publish date and our pin ($severity)', (scenario) => {
    const verdict = classifyDrift({
      accepted: scenario.accepted,
      latest: scenario.latest,
      pinned: '0.1.1-rc.2',
      publishedAt: PUBLISHED_AT,
    });
    expect(verdict.severity).toBe(scenario.severity);

    const body = bodyOf(buildCard(verdict, NOW));

    expect(body).toContain(scenario.latest);
    expect(body).toContain('0.1.1-rc.2');
    expect(body).toContain('2026-09-03');
    // "Is this fresh, or has it been sitting for two weeks?" is the question a
    // bare timestamp still leaves open.
    expect(body).toContain('4 天前');

    // What happened comes before why it matters: the semver rationale used to
    // be the opening sentence of the card.
    const firstBlock = buildCard(verdict, NOW).elements[0]?.text?.content ?? '';
    expect(firstBlock).toContain(scenario.latest);
    expect(firstBlock).toContain('0.1.1-rc.2');
    expect(firstBlock).not.toContain('semver');

    // The three-file checklist is the useful half of the old card; keep it.
    expect(body).toContain('packages/dsh-runtime/package.json');
  });

  // The publish date is decoration on an alert whose only job is to be sent.
  // A registry response without it must cost the card one sentence, not the
  // whole alert.
  it('drops the publish date rather than the alert when the registry omits it', () => {
    const card = buildCard(
      classifyDrift({
        accepted: false,
        latest: '0.1.2-rc.1',
        pinned: '0.1.1-rc.2',
        publishedAt: null,
      }),
      NOW,
    );
    const body = bodyOf(card);

    expect(headlineOf(card)).toContain('新版检测');
    expect(body).toContain('0.1.2-rc.1');
    expect(body).toContain('0.1.1-rc.2');
    expect(body).not.toContain('null');
    expect(body).not.toContain('Invalid Date');
    expect(body).not.toContain('NaN');
  });

  // The compact packument (`application/vnd.npm.install-v1+json`) carries only
  // name / dist-tags / versions / modified — no `time` map at all — so reading
  // the publish date has to survive every shape short of the full document.
  it('reads the publish date out of a packument, and null out of anything else', () => {
    const full = {
      'dist-tags': { latest: '0.1.2-rc.1' },
      name: '@deepseek-ai/dsh',
      time: {
        '0.1.1-rc.2': '2026-08-21T09:02:11.000Z',
        '0.1.2-rc.1': PUBLISHED_AT,
        created: '2026-01-04T00:00:00.000Z',
        modified: PUBLISHED_AT,
      },
    };

    expect(readPublishedAt(full, '0.1.2-rc.1')).toBe(PUBLISHED_AT);
    expect(readPublishedAt(full, '9.9.9')).toBeNull();
    // The compact packument shape.
    expect(
      readPublishedAt(
        { 'dist-tags': { latest: '0.1.2-rc.1' }, modified: PUBLISHED_AT, name: 'x' },
        '0.1.2-rc.1',
      ),
    ).toBeNull();
    expect(readPublishedAt({ time: { '0.1.2-rc.1': 17 } }, '0.1.2-rc.1')).toBeNull();
    expect(readPublishedAt(null, '0.1.2-rc.1')).toBeNull();
    expect(readPublishedAt('not json', '0.1.2-rc.1')).toBeNull();
  });

  it('turns a publish timestamp into a date plus an age, and garbage into nothing', () => {
    expect(describePublishedAt(PUBLISHED_AT, NOW)).toContain('2026-09-03');
    expect(describePublishedAt(PUBLISHED_AT, NOW)).toContain('4 天前');
    expect(describePublishedAt('2026-09-07T01:00:00.000Z', new Date('2026-09-07T05:00:00Z'))).toBe(
      '2026-09-07（今天）',
    );
    expect(describePublishedAt(null, NOW)).toBeNull();
    expect(describePublishedAt('yesterday-ish', NOW)).toBeNull();
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
