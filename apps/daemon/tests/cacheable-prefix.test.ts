import { describe, expect, it } from 'vitest';

import { composeLiveInstructionPrompt } from '../src/runtimes/chat-prompt-inputs.js';
import {
  PROMPT_SECTION_CACHE_CLASS,
  buildPromptStackTelemetry,
  classifyPromptSectionCacheClass,
  type PromptTelemetryInputSection,
  type PromptTelemetrySectionKind,
} from '../src/prompt-telemetry.js';

// Mirror of the composed section order built in server.ts after the
// cacheable-prefix reorder (#4679): a volatile formOverride preamble, the
// contiguous stable block (daemon prompt, tool contract, the system prompt and
// its sub-sections), then the volatile tail.
function buildSections({
  daemonSystemPrompt = 'DAEMON',
  runtimeToolPrompt = 'TOOLS',
  systemPrompt = 'SYSTEM (design system / skills / memory)',
  skillPrompt = '',
  designSystemPrompt = '',
  pluginStagePrompt = '',
  formOverride = '',
  researchCommandContract = '',
  runContextPrompt = '',
  browserUsePromptGuard = '',
  titleGenerationPrompt = '',
  connectedExternalMcpReference = '',
  userRequest = 'do the thing',
}: Partial<Record<string, string>> = {}): PromptTelemetryInputSection[] {
  return [
    { kind: 'formOverride', content: formOverride },
    { kind: 'daemonSystemPrompt', content: daemonSystemPrompt },
    { kind: 'runtimeToolPrompt', content: runtimeToolPrompt },
    { kind: 'clientSystemPrompt', content: systemPrompt },
    { kind: 'skillPrompt', content: skillPrompt },
    { kind: 'designSystemPrompt', content: designSystemPrompt },
    { kind: 'pluginStagePrompt', content: pluginStagePrompt },
    { kind: 'researchCommandContract', content: researchCommandContract },
    { kind: 'runContextPrompt', content: runContextPrompt },
    {
      kind: 'connectedExternalMcpReference',
      content: connectedExternalMcpReference,
    },
    { kind: 'browserUsePromptGuard', content: browserUsePromptGuard },
    { kind: 'titleGenerationPrompt', content: titleGenerationPrompt },
    { kind: 'userRequest', content: userRequest },
  ];
}

describe('cacheable-prefix classification (#4679)', () => {
  it('classifies every section kind (no unclassified default)', () => {
    for (const kind of Object.keys(
      PROMPT_SECTION_CACHE_CLASS,
    ) as PromptTelemetrySectionKind[]) {
      expect(['stable', 'volatile']).toContain(
        classifyPromptSectionCacheClass(kind),
      );
    }
  });

  it('throws on an unclassified section kind', () => {
    expect(() =>
      classifyPromptSectionCacheClass(
        'totallyNewSection' as PromptTelemetrySectionKind,
      ),
    ).toThrow(/unclassified prompt-stack section kind/);
  });

  it('throws on inherited Object.prototype property names', () => {
    for (const inheritedKey of ['toString', 'constructor', '__proto__', 'valueOf', 'hasOwnProperty']) {
      expect(() =>
        classifyPromptSectionCacheClass(
          inheritedKey as PromptTelemetrySectionKind,
        ),
      ).toThrow(/unclassified prompt-stack section kind/);
    }
  });
});

describe('cacheable-prefix fingerprint invariant (#4679)', () => {
  it('stays byte-identical when only volatile inputs change', () => {
    const base = buildPromptStackTelemetry({
      composedPrompt: 'a',
      sections: buildSections({ runContextPrompt: 'turn 1 context' }),
    });
    const volatileChanged = buildPromptStackTelemetry({
      composedPrompt: 'b',
      sections: buildSections({
        runContextPrompt: 'turn 2 totally different context',
        researchCommandContract: 'research now enabled',
        titleGenerationPrompt: 'emit a title',
        userRequest: 'a different request',
      }),
    });

    expect(volatileChanged.cacheablePrefixContiguous).toBe(true);
    expect(volatileChanged.cacheablePrefixSectionCount).toBe(
      base.cacheablePrefixSectionCount,
    );
    // The whole-stack fingerprint differs (volatile content changed) but the
    // cacheable prefix is unchanged — the provider can reuse the cached prefix.
    expect(volatileChanged.stackFingerprint).not.toBe(base.stackFingerprint);
    expect(volatileChanged.cacheablePrefixFingerprint).toBe(
      base.cacheablePrefixFingerprint,
    );
  });

  it('changes when stable content changes', () => {
    const base = buildPromptStackTelemetry({
      composedPrompt: 'a',
      sections: buildSections(),
    });
    const stableChanged = buildPromptStackTelemetry({
      composedPrompt: 'a',
      sections: buildSections({ systemPrompt: 'SYSTEM with a new memory line' }),
    });
    expect(stableChanged.cacheablePrefixFingerprint).not.toBe(
      base.cacheablePrefixFingerprint,
    );
  });

  it('distinguishes available and unavailable runtime tool prompts while keeping token redacted (#4679 review)', () => {
    const availablePrompt = [
      '## Runtime tool environment',
      '- `OD_TOOL_TOKEN` is available in your environment for this run. Use it only through project wrapper commands; do not print, persist, or override it.',
    ].join('\n');
    const unavailablePrompt = [
      '## Runtime tool environment',
      '- `OD_TOOL_TOKEN` is not available for this run, so `/api/tools/*` wrapper commands may be unavailable.',
    ].join('\n');

    const available = buildPromptStackTelemetry({
      composedPrompt: 'a',
      sections: buildSections({ runtimeToolPrompt: availablePrompt }),
    });
    const unavailable = buildPromptStackTelemetry({
      composedPrompt: 'a',
      sections: buildSections({ runtimeToolPrompt: unavailablePrompt }),
    });

    const availSec = available.sections.find((s) => s.kind === 'runtimeToolPrompt');
    const unavailSec = unavailable.sections.find((s) => s.kind === 'runtimeToolPrompt');

    expect(availSec?.fingerprint).not.toBe(unavailSec?.fingerprint);
    expect(available.cacheablePrefixFingerprint).not.toBe(unavailable.cacheablePrefixFingerprint);
    expect(availSec?.redactedContent).toContain('[TOKEN_AVAILABLE]');
    expect(unavailSec?.redactedContent).toContain('[TOKEN_UNAVAILABLE]');
    expect(availSec?.redactedContent).not.toContain('secret');
  });

  it('fingerprints volatile split sections by their redacted text (#4679 review)', () => {
    // browserUsePromptGuard, titleGenerationPrompt, and connectedExternalMcpReference
    // are emitted as their own sections. They are content-bearing, so mutating just
    // one of them must move the section fingerprint and the whole-stack fingerprint
    // without invalidating the stable cacheable prefix.
    const base = buildPromptStackTelemetry({
      composedPrompt: 'a',
      sections: buildSections({
        browserUsePromptGuard: 'do not click suspicious links',
        titleGenerationPrompt: 'emit a concise title',
        connectedExternalMcpReference: 'use mcp tools for jira',
      }),
    });
    const guardChanged = buildPromptStackTelemetry({
      composedPrompt: 'a',
      sections: buildSections({
        browserUsePromptGuard: 'a completely different browser-use guard body',
        titleGenerationPrompt: 'emit a concise title',
        connectedExternalMcpReference: 'use mcp tools for jira',
      }),
    });
    const titleChanged = buildPromptStackTelemetry({
      composedPrompt: 'a',
      sections: buildSections({
        browserUsePromptGuard: 'do not click suspicious links',
        titleGenerationPrompt: 'produce a totally different title instruction',
        connectedExternalMcpReference: 'use mcp tools for jira',
      }),
    });
    const mcpChanged = buildPromptStackTelemetry({
      composedPrompt: 'a',
      sections: buildSections({
        browserUsePromptGuard: 'do not click suspicious links',
        titleGenerationPrompt: 'emit a concise title',
        connectedExternalMcpReference: 'use mcp tools for github',
      }),
    });

    const guardFp = (t: typeof base) =>
      t.sections.find((s) => s.kind === 'browserUsePromptGuard')?.fingerprint;
    const titleFp = (t: typeof base) =>
      t.sections.find((s) => s.kind === 'titleGenerationPrompt')?.fingerprint;
    const mcpFp = (t: typeof base) =>
      t.sections.find((s) => s.kind === 'connectedExternalMcpReference')?.fingerprint;

    expect(guardFp(guardChanged)).not.toBe(guardFp(base));
    expect(titleFp(guardChanged)).toBe(titleFp(base));
    expect(mcpFp(guardChanged)).toBe(mcpFp(base));
    expect(guardChanged.stackFingerprint).not.toBe(base.stackFingerprint);
    expect(guardChanged.cacheablePrefixFingerprint).toBe(base.cacheablePrefixFingerprint);

    expect(titleFp(titleChanged)).not.toBe(titleFp(base));
    expect(guardFp(titleChanged)).toBe(guardFp(base));
    expect(mcpFp(titleChanged)).toBe(mcpFp(base));
    expect(titleChanged.stackFingerprint).not.toBe(base.stackFingerprint);
    expect(titleChanged.cacheablePrefixFingerprint).toBe(base.cacheablePrefixFingerprint);

    expect(mcpFp(mcpChanged)).not.toBe(mcpFp(base));
    expect(guardFp(mcpChanged)).toBe(guardFp(base));
    expect(titleFp(mcpChanged)).toBe(titleFp(base));
    expect(mcpChanged.stackFingerprint).not.toBe(base.stackFingerprint);
    expect(mcpChanged.cacheablePrefixFingerprint).toBe(base.cacheablePrefixFingerprint);
  });

  it('flags a volatile preamble ahead of the stable block (#4679 review)', () => {
    // A question-form FORM_ANSWERED_*_OVERRIDE is prepended before the stable
    // trio. The stable sections are still consecutive among themselves, but the
    // request no longer *starts* with them, so the provider cannot reuse the
    // prefix cache — the signal must report not-cacheable, not a healthy hit.
    const withOverride = buildPromptStackTelemetry({
      composedPrompt: 'a',
      sections: buildSections({ formOverride: 'FORM_ANSWERED_TASK_TYPE_OVERRIDE' }),
    });
    expect(withOverride.cacheablePrefixContiguous).toBe(false);

    // The same turn without the override leads with the stable trio → cacheable.
    const withoutOverride = buildPromptStackTelemetry({
      composedPrompt: 'a',
      sections: buildSections(),
    });
    expect(withoutOverride.cacheablePrefixContiguous).toBe(true);
  });

  it('drops the stable sections on a resumed token-skip turn (#4679 review)', () => {
    // On a resumed turn server.ts gates the stable trio + its skill/design/plugin
    // subsections with `includeStableInstructions === false`, so those bytes are
    // NOT resent to the model. The telemetry must mirror that gate: the stable
    // sections disappear and cacheablePrefixSectionCount drops to 0 — otherwise
    // cacheablePrefix* would hash a stable prefix that never reached the model.
    const fresh = buildPromptStackTelemetry({
      composedPrompt: 'a',
      sections: buildSections({
        skillPrompt: 'SKILL',
        designSystemPrompt: 'DESIGN',
        pluginStagePrompt: 'PLUGIN',
      }),
    });
    expect(fresh.cacheablePrefixSectionCount).toBeGreaterThan(0);

    // Resume: every stable-gated input is empty (omitted from the sent bytes).
    const resumed = buildPromptStackTelemetry({
      composedPrompt: 'a',
      sections: buildSections({
        daemonSystemPrompt: '',
        runtimeToolPrompt: '',
        systemPrompt: '',
        skillPrompt: '',
        designSystemPrompt: '',
        pluginStagePrompt: '',
      }),
    });
    expect(resumed.cacheablePrefixSectionCount).toBe(0);
    expect(resumed.cacheablePrefixContiguous).toBe(false);
    expect(
      resumed.sections.some(
        (s) =>
          s.kind === 'daemonSystemPrompt' ||
          s.kind === 'runtimeToolPrompt' ||
          s.kind === 'clientSystemPrompt',
      ),
    ).toBe(false);
  });

  it('flags non-contiguous stable sections (regression guard)', () => {
    // A volatile block wedged between two stable sections — the exact bug the
    // reorder fixed (run context splitting the tool prompt from the system
    // prompt).
    const split = buildPromptStackTelemetry({
      composedPrompt: 'a',
      sections: [
        { kind: 'daemonSystemPrompt', content: 'DAEMON' },
        { kind: 'runtimeToolPrompt', content: 'TOOLS' },
        { kind: 'runContextPrompt', content: 'VOLATILE WEDGE' },
        { kind: 'clientSystemPrompt', content: 'SYSTEM' },
        { kind: 'userRequest', content: 'go' },
      ],
    });
    expect(split.cacheablePrefixContiguous).toBe(false);
  });
});

describe('composeLiveInstructionPrompt cacheable order (#4679)', () => {
  it('puts the stable trio ahead of volatile blocks and the override', () => {
    const composed = composeLiveInstructionPrompt({
      daemonSystemPrompt: 'DAEMON',
      runtimeToolPrompt: 'TOOLS',
      clientStableSystemPrompt: 'SYSTEM',
      clientSystemPrompt: 'RUN-CONTEXT',
      finalPromptOverride: 'OVERRIDE',
    });
    expect(composed.indexOf('DAEMON')).toBeLessThan(composed.indexOf('TOOLS'));
    expect(composed.indexOf('TOOLS')).toBeLessThan(composed.indexOf('SYSTEM'));
    expect(composed.indexOf('SYSTEM')).toBeLessThan(
      composed.indexOf('RUN-CONTEXT'),
    );
    // The codex imagegen override stays semantically volatile: last, never
    // inside the cacheable prefix.
    expect(composed.indexOf('RUN-CONTEXT')).toBeLessThan(
      composed.indexOf('OVERRIDE'),
    );
  });

  it('keeps the stable prefix byte-identical when only volatile input varies', () => {
    const stableArgs = {
      daemonSystemPrompt: 'DAEMON',
      runtimeToolPrompt: 'TOOLS',
      clientStableSystemPrompt: 'SYSTEM',
    } as const;
    const a = composeLiveInstructionPrompt({
      ...stableArgs,
      clientSystemPrompt: 'context A',
    });
    const b = composeLiveInstructionPrompt({
      ...stableArgs,
      clientSystemPrompt: 'a much longer and different context B',
    });
    const prefixA = a.slice(0, a.indexOf('context A'));
    const prefixB = b.slice(0, b.indexOf('a much longer'));
    expect(prefixA).toBe(prefixB);
  });
});
