// Characterization test for renderMetadataBlock (internal to system.ts).
// composeSystemPrompt pushes the metadata block before the shared host-runtime
// tail. Compose an explicit classic Design prompt, then slice from the metadata marker to the next
// section separator so these snapshots continue to characterize metadata only.
// These snapshots pin the block across kinds/flags so the decomposition of
// renderMetadataBlock into per-concern helpers is provably behavior-preserving.

import { describe, expect, it } from 'vitest';
import { composeSystemPrompt as composePrompt } from '../src/prompts/system.js';
import type { ProjectMetadata, ProjectTemplate } from '../src/api/projects.js';

const composeSystemPrompt = (input: Parameters<typeof composePrompt>[0]) =>
  composePrompt({ ...input, promptCoreVariant: 'classic' });

function metadataBlock(metadata: ProjectMetadata, template?: ProjectTemplate): string {
  const out = composeSystemPrompt({ metadata, template });
  const idx = out.indexOf('\n\n## Project metadata');
  if (idx === -1) return '';
  const separators = [
    out.indexOf('\n\n---\n\n', idx),
    out.indexOf('\n---\n\n', idx),
  ].filter((position) => position >= 0);
  const end = separators.length > 0 ? Math.min(...separators) : -1;
  return end === -1 ? out.slice(idx) : out.slice(idx, end);
}

describe('renderMetadataBlock (characterization via classic Design composition)', () => {
  it('prototype with platform, cross-platform targets, and flags', () => {
    const block = metadataBlock({
      kind: 'prototype',
      platform: 'responsive',
      platformTargets: ['responsive', 'mobile-ios'],
      includeLandingPage: true,
      includeOsWidgets: true,
      fidelity: 'high-fidelity',
    } as ProjectMetadata);
    expect(block).toMatchSnapshot();
  });

  it('prototype with unknown platform and no fidelity (asks)', () => {
    const block = metadataBlock({ kind: 'prototype' } as ProjectMetadata);
    expect(block).toMatchSnapshot();
  });

  it('deck with slideCount and speakerNotes', () => {
    const block = metadataBlock({
      kind: 'deck',
      slideCount: '12',
      speakerNotes: true,
    } as ProjectMetadata);
    expect(block).toMatchSnapshot();
  });

  it('template kind with template reference files', () => {
    const template: ProjectTemplate = {
      id: 't1',
      name: 'Neon Dashboard',
      description: 'a dark neon dashboard',
      createdAt: 0,
      files: [{ name: 'index.html', content: '<html><body>hi</body></html>' }],
    };
    const block = metadataBlock(
      { kind: 'template', animations: true, templateLabel: 'Neon' } as ProjectMetadata,
      template,
    );
    expect(block).toMatchSnapshot();
  });

  it('image kind with a reference prompt template', () => {
    const block = metadataBlock({
      kind: 'image',
      imageModel: 'seedream',
      imageAspect: '16:9',
      imageStyle: 'cinematic',
      promptTemplate: {
        title: 'Golden Hour Portrait',
        prompt: 'A portrait bathed in warm ```golden``` light',
        category: 'portrait',
        model: 'seedream',
        aspect: '3:4',
        tags: ['warm', 'portrait'],
        summary: 'Warm, soft-lit portrait.',
        source: { repo: 'awesome/prompts', author: 'jane', license: 'MIT' },
      },
    } as ProjectMetadata);
    expect(block).toMatchSnapshot();
  });

  it('video kind with the hyperframes-html special case', () => {
    const block = metadataBlock({
      kind: 'video',
      videoModel: 'hyperframes-html',
      videoLength: 5,
      videoAspect: '16:9',
    } as ProjectMetadata);
    expect(block).toMatchSnapshot();
  });

  it('audio speech kind with a chosen voice', () => {
    const block = metadataBlock({
      kind: 'audio',
      audioKind: 'speech',
      audioModel: 'elevenlabs',
      audioDuration: 30,
      voice: 'rachel',
    } as ProjectMetadata);
    expect(block).toMatchSnapshot();
  });

  it('brand extraction project with brand ids', () => {
    const block = metadataBlock({
      kind: 'brand',
      brandId: 'acme',
      brandSourceUrl: 'https://acme.example',
      brandDesignSystemId: 'acme-ds',
    } as ProjectMetadata);
    expect(block).toMatchSnapshot();
  });

  it('inspiration design systems and @ plugin context', () => {
    const block = metadataBlock({
      kind: 'prototype',
      platform: 'web-desktop',
      inspirationDesignSystemIds: ['brand-a', 'brand-b'],
      contextPlugins: [
        { id: 'p1', title: 'Charts', description: 'nice charts' },
        { id: 'p2', title: 'Forms' },
      ],
    } as ProjectMetadata);
    expect(block).toMatchSnapshot();
  });
});
