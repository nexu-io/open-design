import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BundledStrategyDeclarationV2Schema } from '@open-design/contracts';
import { parseManifest } from '../src/index.js';

const pluginRoot = fileURLToPath(
  new URL('../../../plugins/_official/scenarios/od-next-strategy/', import.meta.url),
);
const manifestSource = readFileSync(`${pluginRoot}/open-design.json`, 'utf8');
const parsed = parseManifest(manifestSource);

if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
const manifest = parsed.manifest;
const declaration = BundledStrategyDeclarationV2Schema.parse(
  (manifest.od as Record<string, unknown>)['strategy'],
);

const forbiddenContent = [
  /acceptanceChecklist/i,
  /evidence[ -]plan/i,
  /quality[ -]score/i,
  /judge(?:[ -]agent)?/i,
  /artifact[ -]repair/i,
  /candidate[ -]evidence[ -]bundle/i,
  /completion[ -]gate/i,
  /final[ -]evidence[ -]bundle/i,
  /repair[ -]required/i,
  /\brepeat\b/i,
  /\bcritique\b/i,
  /revalidation/i,
  /critique(?:-theater)?/i,
  /post[- ]build[\s\S]{0,80}(?:verify|inspect|check|review)/i,
  /(?:screenshot|browser|dom)[\s\S]{0,80}(?:verify|inspect|check|review)/i,
];

describe('bundled OD Next Strategy V2 package', () => {
  it('declares the inactive versioned asset set and exact planning recipe identity', () => {
    expect(manifest).toMatchObject({
      name: 'od-next-strategy',
      version: '2.0.0',
      od: {
        kind: 'scenario',
        hidden: true,
        strategy: {
          schema: 'open-design.bundled-strategy/v2',
          id: 'od-next-strategy',
          promptRecipe: 'od-next-plan-build-v2',
        },
      },
    });
    expect(declaration.assets.taskProfiles.map((profile) => [
      profile.taskType,
      profile.rollout,
      profile.projectKinds,
    ])).toEqual([
      ['prototype', 'active', ['prototype']],
      ['ppt', 'active', ['deck']],
      ['marketing', 'active', ['image']],
      ['hyperframes', 'active', ['video']],
    ]);
  });

  it('declares discovery, plan, and generate without a repeating stage', () => {
    expect(manifest.od?.pipeline?.stages).toEqual([
      { id: 'discovery', atoms: ['discovery-question-form'] },
      { id: 'plan', atoms: ['direction-picker', 'todo-write'] },
      { id: 'generate', atoms: ['file-write', 'live-artifact'] },
    ]);
    expect(manifest.od?.pipeline?.stages.some((stage) => stage.repeat)).toBe(false);
  });

  it('ships every declared asset and keeps strategy content on the pre-Build side', () => {
    const assetPaths = [
      declaration.assets.core.path,
      declaration.assets.orchestration.path,
      ...declaration.assets.taskProfiles.map((profile) => profile.path),
      ...declaration.assets.taskProfiles.flatMap((profile) => (profile.resources ?? []).map((resource) => resource.path)),
      declaration.assets.taskProfileMapping.path,
    ];
    expect(new Set(assetPaths).size).toBe(assetPaths.length);

    for (const assetPath of assetPaths) {
      const content = readFileSync(`${pluginRoot}/${assetPath.slice(2)}`, 'utf8');
      expect(content.length, assetPath).toBeGreaterThan(100);
      // Resources (shells, stylesheets) are quoted as facts, never as
      // instructions, so the pre-Build vocabulary rule applies to prose only.
      if (!assetPath.endsWith('.md')) continue;
      for (const forbidden of forbiddenContent) {
        expect(content, `${assetPath} must not match ${forbidden}`).not.toMatch(forbidden);
      }
    }
  });

  it('ships the three handheld shells and the layout primitives as prototype resources', () => {
    const prototype = declaration.assets.taskProfiles.find((profile) => profile.taskType === 'prototype');
    expect(prototype?.resources?.map((resource) => resource.path)).toEqual([
      './assets/task-profiles/prototype/device-frames/iphone.html',
      './assets/task-profiles/prototype/device-frames/android.html',
      './assets/task-profiles/prototype/device-frames/neutral.html',
      './assets/task-profiles/prototype/layout.css',
    ]);
    const primitives = readFileSync(`${pluginRoot}/assets/task-profiles/prototype/layout.css`, 'utf8');
    expect(primitives).toContain('/* OD-LAYOUT-PRIMITIVES v1');
    expect(primitives).toContain('/* /OD-LAYOUT-PRIMITIVES v1 */');
    expect(primitives).toMatch(/^@layer od-layout \{/m);
    // Structure only: no palette, type, radius, or shadow opinions.
    expect(primitives).not.toMatch(/(^|[^-])color\s*:|font-family|font-size|border-radius|box-shadow|background\s*:/);
    for (const resource of (prototype?.resources ?? []).filter((r) => r.path.includes('/device-frames/'))) {
      const shell = readFileSync(`${pluginRoot}/${resource.path.slice(2)}`, 'utf8');
      expect(shell).toContain('data-phone-shell');
      expect(shell).toContain('class="phone-content"');
      expect(shell).toContain('APP CONTENT START');
      expect(shell).toContain('APP CONTENT END');
      expect(shell).toContain('--phone-safe-top');
      expect(shell).toContain('@media (max-width: 480px)');
    }
    const ruleCard = readFileSync(`${pluginRoot}/${prototype!.path.slice(2)}`, 'utf8');
    expect(ruleCard).toContain('### Handheld device shell');
    for (const shell of ['.od-frames/iphone.html', '.od-frames/android.html', '.od-frames/neutral.html']) {
      expect(ruleCard).toContain(shell);
    }
    expect(ruleCard).toContain('### Variable-length text and stacked information');
    expect(ruleCard).toContain('.od-frames/layout.css');
    expect(ruleCard).toContain('OD-LAYOUT-PRIMITIVES v1');
  });

  it('maps unknown project kinds to generic or blocked instead of guessing', () => {
    const mapping = readFileSync(
      `${pluginRoot}/${declaration.assets.taskProfileMapping.path.slice(2)}`,
      'utf8',
    );
    expect(mapping).toContain('use task type `generic`');
    expect(mapping).toContain('report blocked');
    expect(mapping).toContain('Never select the nearest specialist profile by guesswork');
  });
});
