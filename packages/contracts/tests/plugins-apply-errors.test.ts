import { describe, expect, it } from 'vitest';

import {
  LegacyPluginApplyErrorResponseSchema,
  PluginApplyErrorResponseSchema,
} from '../src/index.js';

describe('plugin apply error responses', () => {
  it('accepts a bounded diagnosed failure', () => {
    expect(PluginApplyErrorResponseSchema.safeParse({
      error: {
        code: 'PLUGIN_RESOURCE_UNAVAILABLE',
        message: 'A required plugin resource is unavailable. Reinstall or update the plugin and try again.',
        details: { reason: 'required_resource_missing' },
      },
    }).success).toBe(true);
  });

  it.each([
    {
      error: {
        code: 'PLUGIN_RESOURCE_UNAVAILABLE',
        message: 'ENOENT: /Volumes/PortableSSD/private-plugin/open-design.json',
        details: { reason: 'required_resource_missing' },
      },
    },
    {
      error: {
        code: 'PLUGIN_RESOURCE_UNAVAILABLE',
        message: 'A required plugin resource is unavailable. Reinstall or update the plugin and try again.',
        details: {
          reason: 'required_resource_missing',
          path: '/Volumes/PortableSSD/private-plugin/open-design.json',
        },
      },
    },
    {
      error: {
        code: 'PLUGIN_INPUTS_MISSING',
        message: 'Missing required plugin inputs.',
        details: { kind: 'missing_inputs', fields: ['../../private-key'] },
      },
    },
  ])('rejects unbounded daemon details %#', (response) => {
    expect(PluginApplyErrorResponseSchema.safeParse(response).success).toBe(false);
  });

  it('keeps only the closed legacy rolling-upgrade shapes', () => {
    expect(LegacyPluginApplyErrorResponseSchema.safeParse({
      error: 'missing_inputs',
      fields: ['workspace_name'],
    }).success).toBe(true);
    expect(LegacyPluginApplyErrorResponseSchema.safeParse({
      error: 'plugin_apply_failed',
      message: '/private/tmp/plugin.ts',
    }).success).toBe(false);
  });
});
