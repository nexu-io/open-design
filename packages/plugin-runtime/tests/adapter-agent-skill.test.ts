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

  it('passes display copy and tags from SKILL frontmatter into the manifest', () => {
    const result = adaptAgentSkill(
      `---
name: board-pre-read
en_name: Board Pre-read Decision Memo
zh_name: 董事会决策预读
description: Legacy design note.
en_description: Turn metrics, risks, and owners into a board-ready decision deck.
zh_description: 把经营指标、风险和负责人收敛成董事会可直接决策的预读材料。
tags: [board-pre-read, corporate-strategy, decision-deck]
od:
  mode: deck
---
# Board Pre-read
`,
      { folderId: 'board-pre-read' },
    );

    expect(result.manifest.title).toBe('Board Pre-read Decision Memo');
    expect(result.manifest.title_i18n).toEqual({
      en: 'Board Pre-read Decision Memo',
      'zh-CN': '董事会决策预读',
    });
    expect(result.manifest.description).toBe('Turn metrics, risks, and owners into a board-ready decision deck.');
    expect(result.manifest.description_i18n).toEqual({
      en: 'Turn metrics, risks, and owners into a board-ready decision deck.',
      'zh-CN': '把经营指标、风险和负责人收敛成董事会可直接决策的预读材料。',
    });
    expect(result.manifest.tags).toEqual([
      'board-pre-read',
      'corporate-strategy',
      'decision-deck',
    ]);
    expect(parseManifestObject(result.manifest).ok).toBe(true);
  });
});
