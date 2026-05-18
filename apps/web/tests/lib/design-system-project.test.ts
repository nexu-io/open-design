import { describe, expect, it } from 'vitest';
import {
  buildDesignSystemCreationPrompt,
  filterDesignSystemAgentAttachments,
  isDesignSystemCreationProject,
  pickDesignSystemEntryFile,
  pickDesignSystemShowcaseFile,
  pickUploadedDesignMdAttachment,
} from '../../src/lib/design-system-project';

describe('design-system-project helpers', () => {
  it('detects design system creation flow metadata', () => {
    expect(isDesignSystemCreationProject({ kind: 'prototype', creationFlow: 'design_system_from_sources' })).toBe(true);
    expect(isDesignSystemCreationProject({ kind: 'prototype' })).toBe(false);
  });

  it('prefers project-root showcase.html for preview and edit', () => {
    const files = [
      'figma/foo/raw.json',
      'figma/foo/manifest.json',
      'figma/foo/summary.md',
      'figma/foo/preview.svg',
      'figma/foo/showcase.html',
    ];
    expect(pickDesignSystemEntryFile(files)).toBe('figma/foo/showcase.html');
    expect(pickDesignSystemEntryFile(['showcase.html', 'DESIGN.md'])).toBe('showcase.html');
    expect(pickDesignSystemEntryFile(files.filter((f) => !f.includes('showcase.html')))).toBeNull();
  });

  it('requires showcase.html in creation prompts', () => {
    const prompt = buildDesignSystemCreationPrompt({ questionnaireEnabled: false, advancedGeneration: false });
    expect(prompt).toContain('showcase.html');
  });

  it('picks uploaded DESIGN.md by daemon storage path, not project-root alias', () => {
    expect(
      pickUploadedDesignMdAttachment([
        { path: '1740000000000-DESIGN.md', name: 'DESIGN.md', kind: 'file' },
        { path: '1740000000001-design.fig', name: 'design.fig', kind: 'file' },
      ]),
    ).toEqual({
      path: '1740000000000-DESIGN.md',
      name: 'DESIGN.md',
      kind: 'file',
    });
    expect(pickUploadedDesignMdAttachment([])).toBeNull();
  });

  it('filters agent attachments to practical package files', () => {
    const paths = [
      'figma/x/raw.json',
      'figma/x/tokens.dtcg.json',
      'figma/x/showcase.html',
      'figma/x/manifest.json',
    ];
    expect(filterDesignSystemAgentAttachments(paths)).toEqual([
      'figma/x/tokens.dtcg.json',
      'figma/x/showcase.html',
    ]);
  });

  it('builds prompts from brief without questionnaire skip phrasing when enabled', () => {
    const off = buildDesignSystemCreationPrompt({ questionnaireEnabled: false, advancedGeneration: false });
    expect(off).toContain('Do not run a discovery questionnaire');
    expect(off).not.toContain('skipping');

    const on = buildDesignSystemCreationPrompt({
      questionnaireEnabled: true,
      advancedGeneration: true,
    });
    expect(on).toContain('Advanced mode');
    expect(on).not.toContain('Do not run a discovery questionnaire');
  });
});
