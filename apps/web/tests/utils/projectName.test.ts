import { describe, expect, it } from 'vitest';

import {
  canAutoRenameProjectFromPrompt,
  summarizeProjectNameFromPrompt,
} from '../../src/utils/projectName';

describe('summarizeProjectNameFromPrompt', () => {
  it('summarizes Chinese first prompts into concise project names', () => {
    expect(
      summarizeProjectNameFromPrompt('先实现一下根据项目中的第一个prompt总结项目名称，并自动更改项目名称'),
    ).toBe('自动项目命名');
  });

  it('drops common English request prefixes', () => {
    expect(
      summarizeProjectNameFromPrompt('Please build a settings page for managing desktop pets'),
    ).toBe('Settings Page Managing Desktop Pets');
  });

  it('ignores code blocks and links before naming', () => {
    expect(
      summarizeProjectNameFromPrompt('Create a dashboard for https://example.com\n```ts\nconst x = 1\n```'),
    ).toBe('Dashboard');
  });

  it('only allows first-prompt renaming for generated project names', () => {
    expect(
      canAutoRenameProjectFromPrompt({
        metadata: { kind: 'prototype', nameSource: 'generated' },
      }),
    ).toBe(true);
    expect(
      canAutoRenameProjectFromPrompt({
        metadata: { kind: 'prototype', nameSource: 'user' },
      }),
    ).toBe(false);
    expect(canAutoRenameProjectFromPrompt({ metadata: undefined })).toBe(false);
  });
});
