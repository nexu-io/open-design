import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * W84 — a CLASS guard for "host infrastructure narrated into the visible reply".
 *
 * This defect has now been fixed three times, each time as a one-off:
 *
 *   1. OPEND-2577  「图片生成服务暂时不可用」   (media)   → media-failure-user-copy.test.ts
 *   2. W81         「桌面渲染服务暂不可用」     (render)  → render-check-user-copy.test.ts
 *   3. W84         research / x-research / video-shortform / last30days
 *
 * The first two guards assert exact historical sentences. A fourth instance in
 * a fourth subsystem sails past both, because neither knows what the CLASS is.
 * That is what this file adds: a scanner over every prompt-bearing source we
 * ship, plus a frozen registry. A new line that pairs a failure condition with
 * an instruction to tell the user goes RED here on the commit that writes it,
 * instead of arriving later as a user screenshot.
 *
 * ── The product rule (not invented here) ──────────────────────────────────
 * OPEND-2577 settled it: operational detail belongs in tool output and daemon
 * logs, and must never be copied into the user-visible assistant reply.
 * The canonical correct phrasing already lives in media-contract.ts:
 *
 *   "If the command fails, retain the command's actual stderr / exit status in
 *    the tool trace and daemon logs. Do not invent a root cause or copy
 *    diagnostic text into the visible assistant reply."
 *
 * ── The distinction this file MUST hold ───────────────────────────────────
 * A keyword ban would be useless: it would flag the remediation sentences too
 * (they necessarily say "daemon logs" and "stderr"), and it would flag the
 * model reporting its own work. So the scanner does not decide — it only
 * FINDS. Every hit must carry a written verdict in REGISTRY below:
 *
 *   'suppression-rule'  the line FORBIDS narration. This is the fix, not the bug.
 *   'user-requested'    the user explicitly asked for the thing that failed, so
 *                       they are owed a next step (the OPEND-2577 carve-out).
 *   'self-report'       the model reporting on its OWN work, not on host state.
 *   'unrelated'         keyword coincidence; nothing to do with host failure.
 *   'pending-ruling'    genuinely contested — needs a product decision, and is
 *                       parked here in the open rather than silently fixed.
 *
 * There is deliberately NO verdict that means "host failure, narrated, and
 * that's fine". Waving a real leak through requires mislabelling it in a diff
 * a reviewer can see.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');

// ── Detector ────────────────────────────────────────────────────────────────
// Two arms, because the three historical leaks did not share a shape.
//
//   Arm A (directive): a failure condition + an instruction to put it in front
//     of the user. This is what W81 looked like — "if the render fails, say so
//     in your reply". Note it names no infrastructure at all, which is exactly
//     why an infra-noun detector missed it (verified in the vacuum test below).
//
//   Arm B (canned copy): localized user-facing copy that names host state.
//     This is what OPEND-2577 looked like — 「图片生成服务暂时不可用」 is a
//     sentence to SAY, not an instruction, so Arm A cannot see it.
const FAILURE = [
  'fails', 'failed', 'failure', 'failing', 'does not succeed', "doesn't succeed",
  "doesn't work", 'cannot', 'can’t', "can't", 'unable', 'error', 'unavailable',
  'not configured', 'timeout', 'timed out', 'broken', 'crash', 'denied',
  'rejected', 'refused', 'missing',
  '失败', '不可用', '未能', '无法',
];
const NARRATE = [
  'say so', 'state that', 'tell the user', 'inform the user', 'let the user know',
  'in your reply', 'in the reply', 'visible reply', 'assistant reply', 'report the', 'report that',
  'report it', 'mention that', 'mention the', 'mention tool', 'not mention',
  'never mention', 'explain why', 'explain that', 'explain the',
  'report .{0,12}verbatim', 'verbatim\\.', 'surface the', 'narrate',
  'announce(?!ment)', 'disclose',
  '告知', '告诉用户',
];
const INFRA = [
  'renderer', 'render service', 'sidecar', 'socket', '\\.sock', 'daemon',
  'dispatcher', 'upstream', 'sandbox', 'ENOENT', 'ECONNREFUSED', 'exit code',
  'exit status', 'stderr', 'error code', 'service', 'provider', 'quota',
  'rate limit',
  '服务', '渲染', '接口',
];

const failRe = new RegExp(`(${FAILURE.join('|')})`, 'i');
const narrateRe = new RegExp(`(${NARRATE.join('|')})`, 'i');
const infraRe = new RegExp(`(${INFRA.join('|')})`, 'i');
const cjkRe = /[一-鿿]/;

/** True when a unit of prompt text is a candidate host-failure narration. */
export function flagsHostFailureNarration(unit: string): boolean {
  const armA = failRe.test(unit) && narrateRe.test(unit);
  const armB = cjkRe.test(unit) && failRe.test(unit) && infraRe.test(unit);
  return armA || armB;
}

// ── Corpus ──────────────────────────────────────────────────────────────────
// Directory globs, not a hand-listed set of render functions. A new prompt file
// or a new skill is in scope the moment it lands, which is the property that
// makes this a class guard rather than a fourth instance assertion.
const SCAN_ROOTS: ReadonlyArray<readonly [string, string]> = [
  ['apps/daemon/src/prompts', '.ts'],
  ['packages/contracts/src/prompts', '.ts'],
  // `.md`, not `SKILL.md`: a skill's references/*.md is loaded into the model's
  // context the same way its SKILL.md is, and scanning only the entrypoint left
  // three files unwatched.
  ['design-templates', '.md'],
  ['skills', '.md'],
];

function walk(dir: string, suffix: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules') walk(full, suffix, acc);
    } else if (entry.endsWith(suffix)) {
      acc.push(full);
    }
  }
  return acc;
}

interface Hit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const [root, suffix] of SCAN_ROOTS) {
    for (const file of walk(path.join(REPO, root), suffix)) {
      const rel = path.relative(REPO, file);
      readFileSync(file, 'utf8').split('\n').forEach((raw, index) => {
        const text = raw.trim();
        if (text.length < 15) return;
        // Source comments describe the code; they are not sent to the model.
        if (text.startsWith('//') || text.startsWith('*') || text.startsWith('/*')) return;
        if (flagsHostFailureNarration(text)) hits.push({ file: rel, line: index + 1, text });
      });
    }
  }
  return hits;
}

// ── Registry ────────────────────────────────────────────────────────────────
// Keyed by a distinctive substring so it survives line drift. Every entry needs
// a verdict and a reason. Adding one is the deliberate act this guard exists to
// force; a reviewer sees it in the diff.
type Verdict = 'suppression-rule' | 'user-requested' | 'self-report' | 'unrelated' | 'pending-ruling';

interface Entry {
  readonly file: string;
  readonly match: string;
  /**
   * Sorted lengths of every trimmed line in `file` containing `match`.
   *
   * Substring matching alone has a hole, found while testing this guard: a leak
   * APPENDED to an already-excused line inherits that line's excuse. Pinning the
   * length closes it — any edit to a registered line changes this number and has
   * to be re-justified. These are the lines where the exact wording IS the
   * product rule, so that friction is the feature.
   */
  readonly chars: readonly number[];
  readonly verdict: Verdict;
  readonly why: string;
}

const REGISTRY: readonly Entry[] = [
  // ---- The two prior fixes. These lines FORBID narration. ----
  {
    file: 'apps/daemon/src/prompts/official-system.ts',
    match: 'The render check is ours, not the user',
    chars: [500],
    verdict: 'suppression-rule',
    why: 'W81 fix. Tells the model to keep a failed render out of the reply.',
  },
  {
    file: 'apps/daemon/src/prompts/core-slim.ts',
    match: 'This check is host infrastructure the user never asked for',
    chars: [539],
    verdict: 'suppression-rule',
    why: 'W81 fix, slim core half of the same change.',
  },
  {
    file: 'apps/daemon/src/prompts/media-contract.ts',
    match: "report it through the failure's",
    chars: [77],
    verdict: 'suppression-rule',
    why: 'OPEND-2577. Routes every media failure through a classified nextStep '
      + 'instead of an outage claim the model cannot prove.',
  },

  {
    file: 'apps/daemon/src/prompts/media-contract.ts',
    match: 'into the visible assistant reply',
    chars: [78, 79],
    verdict: 'suppression-rule',
    why: 'The canonical phrasing this whole class is measured against.',
  },

  // ---- W84's own fix. The other three rewrites no longer trip the detector
  // at all, so they are pinned by name in the instance suite at the bottom
  // rather than carried here as registry entries. ----
  {
    file: 'apps/daemon/src/prompts/research-contract.ts',
    match: 'Do not invent a root cause and do not copy diagnostic text',
    chars: [203],
    verdict: 'suppression-rule',
    why: 'W84. Was "report the actual stderr/error"; the research command is '
      + 'an internal CLI whose stderr is host detail.',
  },

  // ---- Research provenance about a source the USER named. ----
  {
    file: 'design-templates/x-research/SKILL.md',
    match: 'If X/Twitter is unavailable, say so clearly',
    chars: [78],
    verdict: 'user-requested',
    why: 'X/Twitter is the subject of the research, not our infrastructure. A '
      + 'coverage gap in a deliverable the user asked for is owed to them; the '
      + 'line names no host component and pastes no error text.',
  },

  // ---- Rules that already say the right thing. ----
  {
    file: 'apps/daemon/src/prompts/system.ts',
    match: 'Do not mention tool unavailability to the user',
    chars: [245],
    verdict: 'suppression-rule',
    why: 'API mode. The in-repo precedent for this whole class.',
  },
  {
    file: 'packages/contracts/src/prompts/system.ts',
    match: 'Do not mention tool unavailability to the user',
    chars: [245],
    verdict: 'suppression-rule',
    why: 'BYOK/API mirror of the daemon rule above.',
  },
  {
    file: 'apps/daemon/src/prompts/system.ts',
    match: 'Do not narrate TodoWrite availability to the user',
    chars: [388],
    verdict: 'suppression-rule',
    why: 'Same rule for filesystem runs.',
  },
  {
    file: 'packages/contracts/src/prompts/system.ts',
    match: 'Do not narrate TodoWrite availability to the user',
    chars: [388],
    verdict: 'suppression-rule',
    why: 'BYOK/API mirror.',
  },

  // ---- The user asked; they are owed a next step (OPEND-2577 carve-out). ----
  {
    file: 'skills/agent-browser/SKILL.md',
    match: 'stop and tell the user to install it',
    chars: [49],
    verdict: 'user-requested',
    why: 'The user asked for browser automation. A missing local binary is '
      + 'their own machine, not our infrastructure, and the next step is real.',
  },
  {
    file: 'skills/creative-director/SKILL.md',
    match: 'If the best resource is not configured yet, explain why it is needed',
    chars: [75],
    verdict: 'user-requested',
    why: 'User-owned setup with an in-product action, no diagnostics.',
  },

  {
    file: 'design-templates/html-ppt/references/authoring-guide.md',
    match: 'If the managed renderer fails once, report the error and stop',
    chars: [79],
    verdict: 'user-requested',
    why: 'Section 9 is "Export to PNG" — a delivery action the user asked for, '
      + 'which the W81 commit explicitly carved out ("an export explicitly '
      + 'requested by the user ... report that one normally"). The anti-retry '
      + 'half is the real content. "report the error" is loose and could be '
      + 'tightened, but it is inside the carve-out, not outside it.',
  },
  {
    file: 'design-templates/hyperframes/references/transcript-guide.md',
    match: 'tell the user the audio is too noisy for local transcription',
    chars: [144],
    verdict: 'user-requested',
    why: "About the user's own input file, not our infrastructure, and it ends "
      + 'in a suggestion.',
  },

  // ---- The model reporting on its own work. Must survive. ----
  {
    file: 'skills/reference-design-contract/SKILL.md',
    match: 'If evidence is missing, say so',
    chars: [74],
    verdict: 'self-report',
    why: 'About the inputs the model was given, not about host health.',
  },
  {
    file: 'design-templates/live-dashboard/SKILL.md',
    match: 'surface the error via a small grey',
    chars: [66],
    verdict: 'self-report',
    why: "The generated artifact's own error UI, not our reply.",
  },

  // ---- Keyword coincidence. ----
  {
    file: 'design-templates/audio-jingle/SKILL.md',
    match: 'Branch by known values and use them verbatim',
    chars: [78],
    verdict: 'unrelated',
    why: '"verbatim" is about copying metadata values, not error text.',
  },
  {
    file: 'skills/web-clone/references/complex-playbooks.md',
    match: '交易/写入接口只做 mock 成功/失败状态',
    chars: [43],
    verdict: 'unrelated',
    why: 'About mocking endpoints in a cloned site; 接口 + 失败 collide with '
      + "arm B's terms.",
  },
  {
    file: 'skills/hatch-pet/SKILL.md',
    match: 'do not create, draw, tile, warp, mirror, or synthesize pet visuals',
    chars: [716],
    verdict: 'unrelated',
    why: 'Art-generation boundary.',
  },
  {
    file: 'skills/hatch-pet/SKILL.md',
    match: 'Turn the approved poses into the final pet files',
    chars: [269],
    verdict: 'unrelated',
    why: 'Workflow step; "broken parts" refers to the generated sprite.',
  },
  {
    file: 'skills/hatch-pet/SKILL.md',
    match: 'row-strip visual generation must use subagents',
    chars: [511],
    verdict: 'unrelated',
    why: 'Subagent policy.',
  },

  // ---- Parked for a product ruling. Deliberately NOT fixed by W84. ----
  {
    file: 'apps/daemon/src/prompts/system.ts',
    match: 'because the ElevenLabs API key is missing',
    chars: [190],
    verdict: 'pending-ruling',
    why: 'The user asked for speech, so a next step is owed — but this branch '
      + 'also names a provider and a settings route. A deliberate '
      + 'PROMPT_SAFE_HTTP_STATUS_LABELS sanitizer already exists beside it, so '
      + 'tightening further is re-litigating a considered design, not applying '
      + 'OPEND-2577. Needs a ruling.',
  },
  {
    file: 'packages/contracts/src/prompts/system.ts',
    match: 'because the ElevenLabs API key is missing',
    chars: [190],
    verdict: 'pending-ruling',
    why: 'BYOK/API mirror of the daemon branch above. It is a byte-for-byte '
      + 'copy, so the same ruling covers both and they must move together — '
      + 'changing one alone is the drift media-contract-mirror.test.ts exists '
      + 'to catch.',
  },
  {
    file: 'apps/daemon/src/prompts/system.ts',
    match: 'if the runtime cannot call the tool, briefly explain that',
    chars: [166],
    verdict: 'pending-ruling',
    why: 'Host runtime state, but the rule exists to stop the model FABRICATING '
      + 'a tool call, which is worse. Softening it without a replacement '
      + 'anti-fabrication clause is a net risk. Needs a ruling.',
  },
  {
    file: 'apps/daemon/src/prompts/system.ts',
    match: 'clearly tell the user that no project file was written',
    chars: [179],
    verdict: 'pending-ruling',
    why: 'Directly contradicts "Do not mention tool unavailability" 59 lines '
      + 'earlier in the same file. One of the two has to give; which one is a '
      + 'product call, not a sweep decision.',
  },
  {
    file: 'packages/contracts/src/prompts/system.ts',
    match: 'clearly tell the user that no project file was written',
    chars: [179],
    verdict: 'pending-ruling',
    why: 'BYOK/API mirror of the daemon line above, carrying the same internal '
      + 'contradiction with the "do not mention tool unavailability" rule. Both '
      + 'copies have to be resolved by one ruling.',
  },
  {
    file: 'apps/daemon/src/prompts/system.ts',
    match: 'report the exact tool name and error text and stop',
    chars: [233],
    verdict: 'pending-ruling',
    why: 'An MCP server the USER connected, with a real reconnect action — but '
      + '"error text" verbatim is the form OPEND-2577 banned for providers. '
      + 'Needs a ruling on where user-owned integrations sit.',
  },
];

function findEntry(hit: Hit): Entry | undefined {
  return REGISTRY.find((e) => e.file === hit.file && hit.text.includes(e.match));
}

describe('host-failure narration — class guard', () => {
  it('the detector can actually see all three historical leaks', () => {
    // Anti-vacuum. A green reading from a detector that has never been shown a
    // real defect is not evidence. These are the exact sentences that shipped.
    //
    // The first two name NO infrastructure — which is why an "infra noun +
    // tell the user" detector scored zero on them during development, and why
    // Arm A keys on the failure CONDITION instead.
    const HISTORICAL: ReadonlyArray<readonly [string, string]> = [
      [
        'W81 classic core',
        "If the first wrapper render doesn't work, say so in your reply and move on"
        + ' — a working artifact you reasoned about statically beats three failed'
        + ' screenshot attempts.',
      ],
      [
        'W81 slim core',
        'If rendering still does not succeed, state that clearly and deliver based'
        + ' on the static verification.',
      ],
      // Canned copy, not a directive: only Arm B sees this one.
      ['OPEND-2577 media', '图片生成服务暂时不可用，请稍后重试。'],
      // The W84 instances, in their pre-fix form.
      [
        'W84 research',
        'If the command fails, report the actual stderr/error instead of inventing a cause.',
      ],
      [
        'W84 video-shortform',
        'When the underlying model fails (NSFW filter, content policy, timeout),'
        + ' report the error verbatim.',
      ],
      [
        'W84 last30days',
        'If Python, credentials, or source access are missing, report the real'
        + ' missing requirement.',
      ],
    ];
    for (const [label, sentence] of HISTORICAL) {
      expect(flagsHostFailureNarration(sentence), `${label} must be visible to the detector`).toBe(true);
    }
  });

  it('the detector does NOT fire on the model reporting its own work', () => {
    // Reverse control. The whole risk of a class guard is that it bullies the
    // next author into deleting legitimate self-reporting to get to green.
    const LEGITIMATE = [
      '静态检查已通过，未发现结构性问题。',
      'Static self-check (always, free). Re-read the file you wrote in your own context.',
      'I could not understand which of the two screens you meant.',
      'That function is not present in this file.',
      'Report the static checks you ran; that is your own work.',
      'Ask 1–3 questions in most cases, with a maximum of 5.',
    ];
    for (const sentence of LEGITIMATE) {
      expect(flagsHostFailureNarration(sentence), sentence).toBe(false);
    }
  });

  it('every flagged line carries a written verdict', () => {
    const hits = scan();
    const unregistered = hits.filter((h) => !findEntry(h));
    const report = unregistered
      .map((h) => `\n  ${h.file}:${h.line}\n    ${h.text.slice(0, 200)}`)
      .join('');
    expect(
      unregistered,
      'Unregistered host-failure narration. Each line below pairs a failure '
      + 'condition with an instruction to put it in front of the user.\n\n'
      + 'If it is host/infrastructure state the user never asked about, DELETE '
      + 'it — see media-contract.ts for the correct phrasing. If it is one of '
      + 'the legitimate cases (the user asked for the thing that failed, or the '
      + 'model is reporting its own work), add it to REGISTRY in this file with '
      + 'a verdict and a reason.\n'
      + report,
    ).toEqual([]);
  });

  it('no registered line has been edited since it was excused', () => {
    // Closes the append-a-leak-to-an-excused-line hole. Verified by reintroducing
    // W81's slim-core sentence INTO its own suppression rule: substring matching
    // waved it through, this does not.
    const drifted: string[] = [];
    for (const entry of REGISTRY) {
      const actual = readFileSync(path.join(REPO, entry.file), 'utf8')
        .split('\n')
        .map((raw) => raw.trim())
        .filter((text) => text.includes(entry.match))
        .map((text) => text.length)
        .sort((a, b) => a - b);
      if (JSON.stringify(actual) !== JSON.stringify([...entry.chars])) {
        drifted.push(`${entry.file} :: ${entry.match}\n    was ${JSON.stringify(entry.chars)}, now ${JSON.stringify(actual)}`);
      }
    }
    expect(
      drifted,
      'A line carrying a written verdict changed. Re-read it: if it still earns '
      + 'its verdict, update `chars`. If the edit added narration, remove it.\n  '
      + drifted.join('\n  '),
    ).toEqual([]);
  });

  it('the registry has no stale entries', () => {
    // A registry that outlives the line it excuses is how a guard rots into a
    // rubber stamp: the next leak lands on a substring some dead entry matches.
    const hits = scan();
    const stale = REGISTRY.filter(
      (e) => !hits.some((h) => h.file === e.file && h.text.includes(e.match)),
    );
    expect(
      stale.map((e) => `${e.file} :: ${e.match}`),
      'REGISTRY entries that no longer match any line. Delete them.',
    ).toEqual([]);
  });

  it('pins the three W84 rewrites the detector can no longer see', () => {
    // Once a leak is rewritten correctly it stops matching the scanner, so the
    // registry cannot hold it. Without these, someone could restore the old
    // wording in a form the scanner also misses. Each negative is paired with a
    // positive: a bare "does not contain" passes just as happily against a file
    // that lost the whole rule.
    const read = (rel: string) => readFileSync(path.join(REPO, rel), 'utf8');

    const research = read('apps/daemon/src/prompts/research-contract.ts');
    expect(research).not.toContain('report the actual stderr/error');
    expect(research).toContain('tool trace and daemon logs');
    // The user asked for a search, so the fallback disclosure is still owed.
    expect(research).toContain('Label the fallback clearly');

    const video = read('design-templates/video-shortform/SKILL.md');
    expect(video).not.toContain('report the error verbatim');
    expect(video).toContain('Never\n  paste upstream error text into the reply');
    // The anti-retry rule shares those lines and must survive the rewrite.
    expect(video).toContain("Don't silently retry");

    const last30 = read('design-templates/last30days/SKILL.md');
    expect(last30).not.toContain('report the real missing\nrequirement');
    expect(last30).not.toContain('unavailable because credentials were not configured');
    // Source coverage is research provenance and stays.
    expect(last30).toContain('report which sources were and were not checked');
  });

  it('parks contested cases in the open instead of silently fixing them', () => {
    // W84 deliberately did not rule on these. Keeping the count asserted means
    // the list cannot quietly grow into a dumping ground.
    const pending = REGISTRY.filter((e) => e.verdict === 'pending-ruling');
    expect(pending).toHaveLength(6);
    for (const entry of pending) {
      expect(entry.why.length, `${entry.match} needs a real reason`).toBeGreaterThan(80);
    }
  });
});
