import type { PluginApplyFailure } from '../state/projects';
import type { Dict } from './types';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

export function formatPluginApplyFailure(
  failure: PluginApplyFailure,
  t: TranslateFn,
  pluginTitle?: string,
): string {
  const diagnosis = failure.diagnosis;
  let reason: string;

  switch (diagnosis.code) {
    case 'PLUGIN_INPUTS_MISSING':
      reason = t('pluginApply.inputsMissing', { fields: diagnosis.fields.join(', ') });
      break;
    case 'PLUGIN_CONFIGURATION_INVALID':
      reason = t('pluginApply.configurationInvalid');
      break;
    case 'PLUGIN_RESOURCE_UNAVAILABLE':
      reason = t('pluginApply.resourceUnavailable');
      break;
    case 'PLUGIN_APPLY_FAILED':
      reason = t('pluginApply.genericFailure');
      break;
    case 'WORKSPACE_CONTEXT_INCOMPLETE':
      reason = t('pluginApply.workspaceContextIncomplete');
      break;
    case 'PLUGIN_NOT_FOUND':
      reason = t('pluginApply.notFound');
      break;
  }

  return pluginTitle
    ? t('pluginApply.failedNamedWithReason', { plugin: pluginTitle, reason })
    : t('pluginDetail.applyFailedWithReason', { error: reason });
}
