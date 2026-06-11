import { describe, expect, it } from 'vitest';

import {
  PROMPT_STACK_PATH_MARKER,
  buildPromptStackFlatMetadata,
  buildPromptStackTelemetry,
  promptStackWithoutContent,
  redactLocalPaths,
} from '../src/prompt-telemetry.js';

describe('prompt telemetry builder', () => {
  it('redacts local paths and secrets before hashing or content capture', () => {
    const telemetry = buildPromptStackTelemetry({
      composedPrompt:
        'Use /Users/alice/work/repo/index.html with sk-test-1234567890123456789012.',
      sections: [
        {
          kind: 'daemonSystemPrompt',
          content:
            'Read /Users/alice/work/repo/index.html and token sk-test-1234567890123456789012.',
        },
      ],
    });

    const section = telemetry.sections[0]!;
    expect(section.redactedContent).toContain(PROMPT_STACK_PATH_MARKER);
    expect(section.redactedContent).toContain('[REDACTED:sk_key]');
    expect(section.redactedContent).not.toContain('/Users/alice');
    expect(section.redactedContent).not.toContain('sk-test-');
    expect(section.fingerprint).toMatch(/^sha256:/);
    expect(telemetry.promptFingerprint).toMatch(/^sha256:/);
  });

  it('normalizes different local paths to the same prompt fingerprint', () => {
    const first = buildPromptStackTelemetry({
      composedPrompt: 'Open /Users/alice/project/src/App.tsx',
      sections: [{ kind: 'userRequest', content: 'Open /Users/alice/project/src/App.tsx' }],
    });
    const second = buildPromptStackTelemetry({
      composedPrompt: 'Open /Users/bob/other/src/App.tsx',
      sections: [{ kind: 'userRequest', content: 'Open /Users/bob/other/src/App.tsx' }],
    });

    expect(first.promptFingerprint).toBe(second.promptFingerprint);
    expect(first.sections[0]!.fingerprint).toBe(second.sections[0]!.fingerprint);
  });

  it('redacts macOS private var folders and root session paths before fingerprinting', () => {
    const first = buildPromptStackTelemetry({
      composedPrompt:
        'open /private/var/folders/aa/token/T/render.png and /root/project/file.ts',
      sections: [
        {
          kind: 'userRequest',
          content:
            'open /private/var/folders/aa/token/T/render.png and /root/project/file.ts',
        },
      ],
    });
    const second = buildPromptStackTelemetry({
      composedPrompt:
        'open /private/var/folders/bb/other/T/render.png and /root/other/file.ts',
      sections: [
        {
          kind: 'userRequest',
          content:
            'open /private/var/folders/bb/other/T/render.png and /root/other/file.ts',
        },
      ],
    });

    expect(first.sections[0]!.redactedContent).toBe(
      `open ${PROMPT_STACK_PATH_MARKER} and ${PROMPT_STACK_PATH_MARKER}`,
    );
    expect(first.sections[0]!.redactedContent).not.toContain('/private/var/folders');
    expect(first.sections[0]!.redactedContent).not.toContain('/root/project');
    expect(first.promptFingerprint).toBe(second.promptFingerprint);
    expect(first.sections[0]!.fingerprint).toBe(second.sections[0]!.fingerprint);
  });

  it('normalizes dev-container workspace roots before fingerprinting', () => {
    const first = buildPromptStackTelemetry({
      composedPrompt: 'open /workspace/open-design/src/App.tsx',
      sections: [
        { kind: 'userRequest', content: 'open /workspace/open-design/src/App.tsx' },
      ],
    });
    const second = buildPromptStackTelemetry({
      composedPrompt: 'open /workspaces/open-design/src/App.tsx',
      sections: [
        { kind: 'userRequest', content: 'open /workspaces/open-design/src/App.tsx' },
      ],
    });

    expect(first.sections[0]!.redactedContent).toBe(`open ${PROMPT_STACK_PATH_MARKER}`);
    expect(second.sections[0]!.redactedContent).toBe(`open ${PROMPT_STACK_PATH_MARKER}`);
    expect(second.sections[0]!.redactedContent).not.toContain('/workspaces');
    expect(first.promptFingerprint).toBe(second.promptFingerprint);
    expect(first.sections[0]!.fingerprint).toBe(second.sections[0]!.fingerprint);
  });

  it('normalizes app project roots before fingerprinting', () => {
    const first = buildPromptStackTelemetry({
      composedPrompt: 'Your working directory: /app/project',
      sections: [
        { kind: 'daemonSystemPrompt', content: 'Your working directory: /app/project' },
      ],
    });
    const second = buildPromptStackTelemetry({
      composedPrompt: 'Your working directory: /app/other',
      sections: [
        { kind: 'daemonSystemPrompt', content: 'Your working directory: /app/other' },
      ],
    });

    expect(first.sections[0]!.redactedContent).toBe(
      `Your working directory: ${PROMPT_STACK_PATH_MARKER}`,
    );
    expect(second.sections[0]!.redactedContent).toBe(
      `Your working directory: ${PROMPT_STACK_PATH_MARKER}`,
    );
    expect(first.sections[0]!.redactedContent).not.toContain('/app/project');
    expect(second.sections[0]!.redactedContent).not.toContain('/app/other');
    expect(first.promptFingerprint).toBe(second.promptFingerprint);
    expect(first.sections[0]!.fingerprint).toBe(second.sections[0]!.fingerprint);
  });

  it('redacts non-home Linux project and attachment roots before fingerprinting', () => {
    const first = buildPromptStackTelemetry({
      composedPrompt:
        'cwd /media/william/disk/project, service /srv/open-design, image @/media/william/disk/screenshot.png',
      sections: [
        {
          kind: 'daemonSystemPrompt',
          content:
            'cwd /media/william/disk/project, service /srv/open-design, image @/media/william/disk/screenshot.png',
        },
      ],
    });
    const second = buildPromptStackTelemetry({
      composedPrompt:
        'cwd /media/other/disk/project, service /srv/other-design, image @/media/other/disk/screenshot.png',
      sections: [
        {
          kind: 'daemonSystemPrompt',
          content:
            'cwd /media/other/disk/project, service /srv/other-design, image @/media/other/disk/screenshot.png',
        },
      ],
    });

    expect(first.sections[0]!.redactedContent).toBe(
      `cwd ${PROMPT_STACK_PATH_MARKER}, service ${PROMPT_STACK_PATH_MARKER}, image @${PROMPT_STACK_PATH_MARKER}`,
    );
    expect(first.sections[0]!.redactedContent).not.toContain('/media/william');
    expect(first.sections[0]!.redactedContent).not.toContain('/srv/open-design');
    expect(first.promptFingerprint).toBe(second.promptFingerprint);
    expect(first.sections[0]!.fingerprint).toBe(second.sections[0]!.fingerprint);
  });

  it('redacts opt, usr-local, and macOS var-tmp project roots before fingerprinting', () => {
    const first = buildPromptStackTelemetry({
      composedPrompt:
        'cwd /opt/project, src /usr/local/src/app, temp /var/tmp/project, private temp /private/var/tmp/open-design, route /foo/bar',
      sections: [
        {
          kind: 'daemonSystemPrompt',
          content:
            'cwd /opt/project, src /usr/local/src/app, temp /var/tmp/project, private temp /private/var/tmp/open-design, route /foo/bar',
        },
      ],
    });
    const second = buildPromptStackTelemetry({
      composedPrompt:
        'cwd /opt/other, src /usr/local/src/other, temp /var/tmp/other, private temp /private/var/tmp/other, route /foo/bar',
      sections: [
        {
          kind: 'daemonSystemPrompt',
          content:
            'cwd /opt/other, src /usr/local/src/other, temp /var/tmp/other, private temp /private/var/tmp/other, route /foo/bar',
        },
      ],
    });

    expect(first.sections[0]!.redactedContent).toBe(
      `cwd ${PROMPT_STACK_PATH_MARKER}, src ${PROMPT_STACK_PATH_MARKER}, temp ${PROMPT_STACK_PATH_MARKER}, private temp ${PROMPT_STACK_PATH_MARKER}, route /foo/bar`,
    );
    expect(first.sections[0]!.redactedContent).not.toContain('/opt/project');
    expect(first.sections[0]!.redactedContent).not.toContain('/usr/local/src/app');
    expect(first.sections[0]!.redactedContent).not.toContain('/var/tmp/project');
    expect(first.sections[0]!.redactedContent).not.toContain(
      '/private/var/tmp/open-design',
    );
    expect(first.sections[0]!.redactedContent).toContain('/foo/bar');
    expect(first.promptFingerprint).toBe(second.promptFingerprint);
    expect(first.sections[0]!.fingerprint).toBe(second.sections[0]!.fingerprint);
  });

  it('preserves semantic slash-prefixed prompt tokens', () => {
    const telemetry = buildPromptStackTelemetry({
      composedPrompt:
        'POST /api/runs/:id/cancel, match /foo/bar, cwd /app/project',
      sections: [
        {
          kind: 'daemonSystemPrompt',
          content:
            'POST /api/runs/:id/cancel, match /foo/bar, cwd /app/project',
        },
      ],
    });

    expect(telemetry.sections[0]!.redactedContent).toBe(
      `POST /api/runs/:id/cancel, match /foo/bar, cwd ${PROMPT_STACK_PATH_MARKER}`,
    );
    expect(telemetry.sections[0]!.redactedContent).toContain(
      '/api/runs/:id/cancel',
    );
    expect(telemetry.sections[0]!.redactedContent).toContain('/foo/bar');
    expect(telemetry.sections[0]!.redactedContent).not.toContain('/app/project');
  });

  it('normalizes file URL local paths before fingerprinting', () => {
    const first = buildPromptStackTelemetry({
      composedPrompt: 'Preview file:///app/project/index.html',
      sections: [
        { kind: 'userRequest', content: 'Preview file:///app/project/index.html' },
      ],
    });
    const second = buildPromptStackTelemetry({
      composedPrompt: 'Preview file://localhost/app/other/index.html',
      sections: [
        {
          kind: 'userRequest',
          content: 'Preview file://localhost/app/other/index.html',
        },
      ],
    });

    expect(first.sections[0]!.redactedContent).toBe(`Preview ${PROMPT_STACK_PATH_MARKER}`);
    expect(second.sections[0]!.redactedContent).toBe(`Preview ${PROMPT_STACK_PATH_MARKER}`);
    expect(first.promptFingerprint).toBe(second.promptFingerprint);
    expect(first.sections[0]!.fingerprint).toBe(second.sections[0]!.fingerprint);
  });

  it('strips runtime tool token-bearing lines before capture', () => {
    const telemetry = buildPromptStackTelemetry({
      composedPrompt: 'tools',
      sections: [
        {
          kind: 'runtimeToolPrompt',
          content: [
            '## Runtime tool environment',
            '- `OD_TOOL_TOKEN` is available in your environment for this run.',
            '- Daemon URL: `http://127.0.0.1:1234`.',
          ].join('\n'),
        },
      ],
    });

    expect(telemetry.sections[0]!.redactedContent).not.toContain('OD_TOOL_TOKEN');
    expect(telemetry.sections[0]!.redactedContent).toContain('Daemon URL');
  });

  it('keeps metadata-only sections free of raw paths and attachment bodies', () => {
    const telemetry = buildPromptStackTelemetry({
      composedPrompt: 'attached',
      sections: [
        {
          kind: 'commentAttachments',
          content:
            'file: /Users/alice/project/index.html\ncomment: make the hero blue\nscreenshot: /tmp/mark.png',
          metadata: [
            {
              filePath: '/Users/alice/project/index.html',
              screenshotPath: '/tmp/mark.png',
              selectionKind: 'visual',
              comment: 'make the hero blue',
            },
          ],
        },
      ],
    });

    const section = telemetry.sections[0]!;
    expect(section.contentMode).toBe('metadata-only');
    expect(section.redactedContent).toBeUndefined();
    expect(section.metadata).toEqual({
      count: 1,
      extensions: ['html'],
      knownSizeCount: 0,
      selectionKinds: { visual: 1 },
      sizeBuckets: {},
    });
    expect(JSON.stringify(section)).not.toContain('/Users/alice');
    expect(JSON.stringify(section)).not.toContain('make the hero blue');
  });

  it('omits absent sections from the emitted prompt stack', () => {
    const telemetry = buildPromptStackTelemetry({
      composedPrompt: 'Build a card',
      sections: [
        { kind: 'formOverride', content: '' },
        { kind: 'daemonSystemPrompt', content: 'system prompt' },
        { kind: 'attachments', metadata: [] },
      ],
    });

    expect(telemetry.sections.map((section) => section.kind)).toEqual([
      'daemonSystemPrompt',
    ]);
    expect(telemetry.sectionCount).toBe(1);
  });

  it('keeps only high-value flat metadata fields', () => {
    const telemetry = buildPromptStackTelemetry({
      composedPrompt: 'Build a card',
      sections: [
        { kind: 'daemonSystemPrompt', content: 'system prompt' },
        { kind: 'runtimeToolPrompt', content: 'runtime tools' },
        { kind: 'pluginStagePrompt', content: 'plugin stage' },
        { kind: 'userRequest', content: 'Build a card' },
      ],
    });

    const flat = buildPromptStackFlatMetadata(telemetry);
    expect(Object.keys(flat).sort()).toEqual([
      'promptStack_promptFingerprint',
      'promptStack_redactedContentBudgetBytes',
      'promptStack_redactedContentBytes',
      'promptStack_redactionVersion',
      'promptStack_sectionCount',
      'promptStack_stackFingerprint',
    ]);
    expect(flat.promptStack_promptFingerprint).toMatch(/^sha256:/);
    expect(flat.promptStack_section_daemonSystemPrompt_rawBytes).toBeUndefined();
    expect(flat.promptStack_rawBytes).toBeUndefined();
  });

  it('applies per-section limits and total budget in diagnostic priority order', () => {
    const huge = 'x'.repeat(120 * 1024);
    const telemetry = buildPromptStackTelemetry({
      composedPrompt: huge,
      sections: [
        { kind: 'userRequest', content: huge },
        { kind: 'formOverride', content: huge },
        { kind: 'daemonSystemPrompt', content: huge },
        { kind: 'runtimeToolPrompt', content: huge },
        { kind: 'clientSystemPrompt', content: huge },
        { kind: 'skillPrompt', content: huge },
        { kind: 'designSystemPrompt', content: huge },
        { kind: 'pluginStagePrompt', content: huge },
        { kind: 'researchCommandContract', content: huge },
        { kind: 'runContextPrompt', content: huge },
        { kind: 'echoGuard', content: huge },
      ],
    });

    expect(telemetry.redactedContentBytes).toBe(512 * 1024);
    expect(telemetry.sections.find((s) => s.kind === 'formOverride')?.redactedContent)
      .toHaveLength(64 * 1024);
    expect(
      telemetry.sections.find((s) => s.kind === 'daemonSystemPrompt')?.redactedContent,
    ).toHaveLength(120 * 1024);
    expect(telemetry.sections.find((s) => s.kind === 'clientSystemPrompt')?.redactedContent)
      .toHaveLength(64 * 1024);
    expect(telemetry.sections.find((s) => s.kind === 'skillPrompt')?.redactedContent)
      .toHaveLength(64 * 1024);
    const userRequest = telemetry.sections.find((s) => s.kind === 'userRequest')!;
    expect(userRequest.redactedContent).toBeUndefined();
    expect(userRequest.truncationReason).toBe('total_budget_exceeded');
  });

  it('supports explicit metadata-only content sections without spending content budget', () => {
    const huge = 'x'.repeat(120 * 1024);
    const telemetry = buildPromptStackTelemetry({
      composedPrompt: huge,
      sections: [
        {
          kind: 'researchCommandContract',
          content: huge,
          captureContent: false,
        },
        { kind: 'skillPrompt', content: huge },
        { kind: 'designSystemPrompt', content: huge },
        { kind: 'pluginStagePrompt', content: huge },
        { kind: 'runContextPrompt', content: huge },
        { kind: 'echoGuard', content: huge },
      ],
    });

    const metadataOnlySection = telemetry.sections.find(
      (s) => s.kind === 'researchCommandContract',
    )!;
    expect(metadataOnlySection.contentMode).toBe('metadata-only');
    expect(metadataOnlySection.redactedContent).toBeUndefined();
    expect(metadataOnlySection.fingerprint).toMatch(/^sha256:/);
    expect(telemetry.sections.find((s) => s.kind === 'skillPrompt')?.redactedContent)
      .toHaveLength(64 * 1024);
    expect(
      telemetry.sections.find((s) => s.kind === 'designSystemPrompt')?.redactedContent,
    ).toHaveLength(64 * 1024);
    expect(
      telemetry.sections.find((s) => s.kind === 'pluginStagePrompt')?.redactedContent,
    ).toHaveLength(64 * 1024);
    expect(
      telemetry.sections.find((s) => s.kind === 'runContextPrompt')?.redactedContent,
    ).toHaveLength(64 * 1024);
    expect(telemetry.sections.find((s) => s.kind === 'echoGuard')?.redactedContent)
      .toHaveLength(64 * 1024);
    expect(telemetry.redactedContentBytes).toBe(320 * 1024);
  });

  it('removes redactedContent when content consent is unavailable', () => {
    const telemetry = buildPromptStackTelemetry({
      composedPrompt: 'hello',
      sections: [{ kind: 'userRequest', content: 'hello' }],
    });

    const metadataOnly = promptStackWithoutContent(telemetry);
    expect(metadataOnly.redactedContentBytes).toBe(0);
    expect(metadataOnly.sections[0]!.redactedContent).toBeUndefined();
    expect(metadataOnly.sections[0]!.fingerprint).toBe(telemetry.sections[0]!.fingerprint);
  });

  it('redacts Windows local paths', () => {
    expect(redactLocalPaths('Open C:\\Users\\alice\\repo\\index.html')).toBe(
      `Open ${PROMPT_STACK_PATH_MARKER}`,
    );
  });
});
