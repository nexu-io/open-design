import { describe, it, expect } from 'vitest';
import { BADGE_TONES } from '../src/api/projects.js';
import { PluginManifestSchema } from '../src/plugins/manifest.js';

describe('BADGE_TONES single source of truth', () => {
  it('includes green', () => {
    expect(BADGE_TONES).toContain('green');
  });

  it('manifest schema accepts a green badge tone', () => {
    const manifest = {
      $schema: 'https://open-design.ai/schemas/plugin.v1.json',
      specVersion: '1.0.0',
      name: 'x',
      title: 'X',
      version: '0.0.0',
      od: { kind: 'scenario', badge: { label: 'Naver Blog', tone: 'green' } },
    };
    const parsed = PluginManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(true);
  });

  it('manifest schema rejects an unknown badge tone', () => {
    const manifest = {
      $schema: 'https://open-design.ai/schemas/plugin.v1.json',
      specVersion: '1.0.0',
      name: 'x',
      title: 'X',
      version: '0.0.0',
      od: { kind: 'scenario', badge: { label: 'X', tone: 'chartreuse' } },
    };
    expect(PluginManifestSchema.safeParse(manifest).success).toBe(false);
  });
});
