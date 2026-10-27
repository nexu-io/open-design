import { describe, expect, it } from 'vitest';
import { renderDeliverableSkillCatalog } from '../src/plugins/deliverable-skills.js';
import { projectKindFromMetadataToTracking } from '../src/analytics/events/mappers.js';
import { isRetiredHyperFramesPlugin, isRetiredHyperFramesPromptTemplate, isRetiredHyperFramesSkillId } from '../src/plugins/hyperframes-retirement.js';
import { composeSystemPrompt } from '../src/prompts/system.js';

describe('Motion replaces the independent HyperFrames creation choice', () => {
  it('carries Motion routing and source-only delivery into API/BYOK creation', () => {
    const prompt = composeSystemPrompt({ streamFormat: 'plain' });
    expect(prompt).toContain('Select motion-design for new motion films and editable timeline-animation source');
    expect(prompt).toContain('does NOT require MP4 production');
    expect(prompt).toContain('Preserve original persisted bindings');
    expect(composeSystemPrompt({ sessionMode: 'chat' })).not.toContain('## Current motion creation policy');
  });
  it('preserves explicit model video delivery instead of requiring editable animation source', () => {
    const prompt = composeSystemPrompt({ streamFormat: 'plain', metadata: { kind: 'video', videoModel: 'sora-2' } });
    expect(prompt.includes('For actual Motion video requests')).toBe(true);
    expect(prompt.includes('Explicit video-generation-model requests keep their existing delivery contract')).toBe(true);
    expect(prompt.includes('Actual video requests still require editable source')).toBe(false);
  });
  it('retires exact official identities without treating the renderer or third-party content as retired', () => {
    expect(isRetiredHyperFramesPlugin({ id: 'example-hyperframes', sourceKind: 'bundled' })).toBe(true);
    expect(isRetiredHyperFramesPlugin({ id: 'example-hyperframes', sourceKind: 'local' })).toBe(false);
    expect(isRetiredHyperFramesPlugin({ id: 'example-hyperframes', sourceKind: 'github', sourceMarketplaceId: 'official', resolvedSource: 'github:nexu-io/open-design@main/plugins/_official/examples/hyperframes' })).toBe(true);
    expect(isRetiredHyperFramesPlugin({ id: 'example-hyperframes', sourceKind: 'github', resolvedSource: 'github:nexu-io/open-design/plugins/_official/examples/hyperframes' })).toBe(true);
    expect(isRetiredHyperFramesPlugin({ id: 'example-hyperframes', sourceKind: 'github', resolvedSource: 'github:nexu-io/open-design-fork/plugins/_official/examples/hyperframes' })).toBe(false);
    expect(isRetiredHyperFramesPlugin({ id: 'example-hyperframes', sourceKind: 'github', sourceMarketplaceId: 'official', resolvedSource: 'github:another/team@main/hyperframes' })).toBe(false);
    expect(isRetiredHyperFramesPlugin({ id: 'example-motion-frames', sourceKind: 'bundled' })).toBe(false);
    expect(isRetiredHyperFramesSkillId('hyperframes:example')).toBe(true);
    expect(isRetiredHyperFramesSkillId('user:hyperframes')).toBe(false);
    expect(isRetiredHyperFramesSkillId('hyperframes-html')).toBe(false);
    expect(isRetiredHyperFramesPromptTemplate('video', 'hyperframes-brand-sizzle-reel')).toBe(true);
    expect(isRetiredHyperFramesPromptTemplate('video', 'hyperframes-user-film')).toBe(false);
    expect(isRetiredHyperFramesPromptTemplate('image', 'hyperframes-brand-sizzle-reel')).toBe(false);
  });
  it('advertises Motion source and video without offering the retired production Skill', () => {
    const catalog = renderDeliverableSkillCatalog('/production');
    expect(catalog).toContain('- motion-design (');
    expect(catalog).not.toContain('- hyperframes (');
    expect(catalog).toContain('hyperframes-html');
    expect(catalog).toContain('source only');
  });

  it('tracks Motion by the chosen intent while retaining historical HyperFrames', () => {
    expect(projectKindFromMetadataToTracking({ kind: 'video', intent: 'motion-design', videoModel: 'hyperframes-html' })).toBe('motion_design');
    expect(projectKindFromMetadataToTracking({ kind: 'video', intent: 'hyperframes', videoModel: 'hyperframes-html' })).toBe('hyperframes');
    expect(projectKindFromMetadataToTracking({ kind: 'video', videoModel: 'hyperframes-html' })).toBe('hyperframes');
    expect(projectKindFromMetadataToTracking({ kind: 'video', videoModel: 'kling-v2' })).toBe('video');
  });
});
