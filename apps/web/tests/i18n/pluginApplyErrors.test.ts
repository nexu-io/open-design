import { describe, expect, it } from 'vitest';
import { tForLanguageTag } from '../../src/i18n';
import { formatPluginApplyFailure } from '../../src/i18n/pluginApplyErrors';
import type { PluginApplyFailure } from '../../src/state/projects';

function format(locale: 'en' | 'zh-CN', failure: PluginApplyFailure): string {
  const t = tForLanguageTag(locale);
  if (!t) throw new Error(`Missing test dictionary for ${locale}`);
  return formatPluginApplyFailure(failure, t);
}

describe('formatPluginApplyFailure', () => {
  it('formats bounded missing fields without consulting a wire message', () => {
    expect(format('en', {
      ok: false,
      diagnosis: { code: 'PLUGIN_INPUTS_MISSING', fields: ['workspace_name', 'style'] },
    })).toBe('Apply failed: Missing required plugin inputs: workspace_name, style');
  });

  it.each([
    [
      { code: 'PLUGIN_CONFIGURATION_INVALID', reason: 'manifest_invalid' } as const,
      '应用失败：插件配置无效。请重新安装或更新插件后重试。',
    ],
    [
      { code: 'PLUGIN_RESOURCE_UNAVAILABLE' } as const,
      '应用失败：所需的插件资源不可用。请重新安装或更新插件后重试。',
    ],
    [
      { code: 'WORKSPACE_CONTEXT_INCOMPLETE' } as const,
      '应用失败：工作区上下文不完整。请等待工作区同步完成后重试。',
    ],
  ])('formats %s entirely from the zh-CN dictionary', (diagnosis, expected) => {
    const result = format('zh-CN', { ok: false, diagnosis });
    expect(result).toBe(expected);
    expect(result).not.toMatch(/Plugin|Workspace|Reinstall|resource/i);
  });
});
