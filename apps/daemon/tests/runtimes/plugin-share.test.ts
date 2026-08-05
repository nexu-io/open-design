import { describe, expect, it } from 'vitest';
import {
  githubRepoNameFromPluginName,
  normalizePluginShareAction,
  renderPluginSharePrompt,
} from '../../src/runtimes/plugin-share.js';

describe('plugin share helpers', () => {
  it('normalizes repository names and falls back for unusable names', () => {
    expect(githubRepoNameFromPluginName('  Acme / Landing Plugin  ')).toBe('acme-landing-plugin');
    expect(githubRepoNameFromPluginName('---')).toBe('open-design-plugin');
  });

  it('allows only the supported share actions', () => {
    expect(normalizePluginShareAction(' publish-github ')).toBe('publish-github');
    expect(normalizePluginShareAction('contribute-open-design')).toBe('contribute-open-design');
    expect(normalizePluginShareAction('delete-repository')).toBeNull();
    expect(normalizePluginShareAction(null)).toBeNull();
  });

  it('renders action-specific prompts with the staged path and endpoint', () => {
    const publish = renderPluginSharePrompt({
      action: 'publish-github',
      sourcePlugin: { id: 'acme-plugin', title: 'Acme Plugin' },
      stagedPath: 'plugin-source/acme-plugin',
    });
    expect(publish).toContain('Publish the local Open Design plugin "Acme Plugin"');
    expect(publish).toContain('/plugins/publish-github');
    expect(publish).toContain('plugin-source/acme-plugin');

    const contribute = renderPluginSharePrompt({
      action: 'contribute-open-design',
      sourcePlugin: { id: 'acme-plugin' },
      stagedPath: 'plugin-source/acme-plugin',
    });
    expect(contribute).toContain('Open a pull request');
    expect(contribute).toContain('/plugins/contribute-open-design');
  });
});
