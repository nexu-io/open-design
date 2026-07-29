import { describe, expect, it } from 'vitest';
import { adaptAgentSkill } from '../src/adapters/agent-skill';
import { parseManifestObject } from '../src/parsers/manifest';

const SAMPLE_SKILL = `---
name: blog-post
description: |
  A long-form article. Use when the brief asks for "blog".
od:
  mode: prototype
  platform: desktop
  scenario: marketing
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
  craft:
    requires: [typography, typography-hierarchy]
  inputs:
    - name: tone
      type: enum
      values: [editorial, casual]
---

# Blog Post Skill
Produce one long-form article page.
`;

describe('adaptAgentSkill', () => {
  it('synthesizes a v1-valid manifest from od: frontmatter', () => {
    const result = adaptAgentSkill(SAMPLE_SKILL, { folderId: 'blog-post' });
    expect(result.manifest.name).toBe('blog-post');
    expect(result.manifest.title).toBe('Blog Post');
    expect(result.manifest.compat?.agentSkills?.[0]?.path).toBe('./SKILL.md');
    expect(result.manifest.od?.mode).toBe('prototype');
    expect(result.manifest.od?.preview?.entry).toBe('index.html');
    expect(result.manifest.od?.context?.craft).toEqual(['typography', 'typography-hierarchy']);
    expect(result.manifest.od?.inputs?.[0]?.type).toBe('select');
    expect(result.manifest.od?.inputs?.[0]?.options).toEqual(['editorial', 'casual']);
    // Spec invariant I1: synthesized output must validate against the v1 schema.
    const reparsed = parseManifestObject(result.manifest);
    expect(reparsed.ok).toBe(true);
  });

  it('falls back to folderId when frontmatter has no name', () => {
    const result = adaptAgentSkill('---\n---\n# heading', { folderId: 'no-name' });
    expect(result.manifest.name).toBe('no-name');
  });
});
