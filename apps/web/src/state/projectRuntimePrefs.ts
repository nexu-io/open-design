import type { AgentModelPrefs, ProjectMetadata, ProjectRuntimePrefs } from '@open-design/contracts';
import type { ApiProtocol, AppConfig, ExecMode } from '../types';
import { resolveFixedOriginBaseUrl, SUGGESTED_MODELS_BY_PROTOCOL } from './apiProtocols';

function isApiProtocol(value: string | undefined): value is ApiProtocol {
  return Boolean(value && Object.prototype.hasOwnProperty.call(SUGGESTED_MODELS_BY_PROTOCOL, value));
}

function cloneAgentModels(
  agentModels: AppConfig['agentModels'],
): Record<string, AgentModelPrefs> | undefined {
  if (!agentModels) return undefined;
  const entries = Object.entries(agentModels).filter(([, prefs]) => Boolean(prefs));
  if (entries.length === 0) return undefined;
  const cloned: Record<string, AgentModelPrefs> = {};
  for (const [agentId, prefs] of entries) {
    cloned[agentId] = { ...prefs };
  }
  return cloned;
}

export function mergeAgentModelChoice(
  previous: AgentModelPrefs | undefined,
  next: { model?: string; reasoning?: string; serviceTier?: string },
): AgentModelPrefs {
  const merged: AgentModelPrefs = { ...(previous ?? {}), ...next };
  if (
    Object.prototype.hasOwnProperty.call(next, 'serviceTier') &&
    next.serviceTier === undefined
  ) {
    delete merged.serviceTier;
  }
  return merged;
}

/**
 * Snapshot the runtime execution preferences from an `AppConfig` so a project
 * keeps its selected mode, CLI agent, per-agent model prefs, and BYOK model
 * even when the global config is later changed on Home or in another project.
 */
export function snapshotProjectRuntimePrefs(config: AppConfig): ProjectRuntimePrefs {
  const agentModels = cloneAgentModels(config.agentModels);
  return {
    mode: config.mode,
    agentId: config.agentId,
    ...(agentModels ? { agentModels } : {}),
    apiProtocol: config.apiProtocol,
    model: config.model,
  };
}

/**
 * Ensure `metadata.runtimePrefs` is populated on a project metadata record,
 * preserving any existing `runtimePrefs` if already present.
 */
export function ensureProjectMetadataRuntimePrefs(
  metadata: ProjectMetadata | undefined,
  config: AppConfig,
): ProjectMetadata {
  const baseMetadata: ProjectMetadata = metadata ?? { kind: 'other' };
  if (baseMetadata.runtimePrefs) return baseMetadata;
  return {
    ...baseMetadata,
    runtimePrefs: snapshotProjectRuntimePrefs(config),
  };
}

/**
 * Overlay a project's `runtimePrefs` onto the global `AppConfig` while keeping
 * global credentials (`apiKey`, `baseUrl`, `apiProtocolConfigs`, `agentCliEnv`,
 * `mediaProviders`, etc.) intact.
 */
export function resolveProjectAppConfig(
  baseConfig: AppConfig,
  runtimePrefs?: ProjectRuntimePrefs | null,
): AppConfig {
  if (!runtimePrefs) return baseConfig;

  let resolved: AppConfig = { ...baseConfig };

  const targetProtocol = isApiProtocol(runtimePrefs.apiProtocol)
    ? runtimePrefs.apiProtocol
    : resolved.apiProtocol;

  if (targetProtocol && targetProtocol !== resolved.apiProtocol) {
    const protocolConfig = resolved.apiProtocolConfigs?.[targetProtocol];
    if (protocolConfig) {
      resolved = {
        ...resolved,
        apiProtocol: targetProtocol,
        apiKey: protocolConfig.apiKey,
        baseUrl: resolveFixedOriginBaseUrl(targetProtocol, protocolConfig.baseUrl),
        model: protocolConfig.model,
        apiProviderBaseUrl: protocolConfig.apiProviderBaseUrl ?? null,
        apiVersion: targetProtocol === 'azure' ? (protocolConfig.apiVersion ?? '') : '',
        byokImageModel:
          targetProtocol === 'senseaudio' || targetProtocol === 'aihubmix'
            ? (protocolConfig.byokImageModel ?? '')
            : '',
        byokVideoModel:
          targetProtocol === 'aihubmix' ? (protocolConfig.byokVideoModel ?? '') : '',
        byokSpeechModel:
          targetProtocol === 'aihubmix' ? (protocolConfig.byokSpeechModel ?? '') : '',
        byokSpeechVoice:
          targetProtocol === 'aihubmix' ? (protocolConfig.byokSpeechVoice ?? '') : '',
      };
    } else {
      resolved = {
        ...resolved,
        apiProtocol: targetProtocol,
      };
    }
  }

  if (typeof runtimePrefs.model === 'string' && runtimePrefs.model.trim()) {
    const activeProtocol = resolved.apiProtocol ?? 'anthropic';
    const existingProtocolEntry = resolved.apiProtocolConfigs?.[activeProtocol];
    resolved = {
      ...resolved,
      model: runtimePrefs.model,
      ...(existingProtocolEntry
        ? {
            apiProtocolConfigs: {
              ...resolved.apiProtocolConfigs,
              [activeProtocol]: {
                ...existingProtocolEntry,
                model: runtimePrefs.model,
              },
            },
          }
        : {}),
    };
  }

  if (runtimePrefs.mode === 'daemon' || runtimePrefs.mode === 'api') {
    resolved.mode = runtimePrefs.mode;
  }

  if (runtimePrefs.agentId !== undefined) {
    resolved.agentId = runtimePrefs.agentId;
  }

  if (runtimePrefs.agentModels && Object.keys(runtimePrefs.agentModels).length > 0) {
    const mergedAgentModels: NonNullable<AppConfig['agentModels']> = {
      ...(baseConfig.agentModels ?? {}),
    };
    for (const [agentId, prefs] of Object.entries(runtimePrefs.agentModels)) {
      if (!prefs) continue;
      mergedAgentModels[agentId] = {
        ...(baseConfig.agentModels?.[agentId] ?? {}),
        ...prefs,
      };
    }
    resolved.agentModels = mergedAgentModels;
  }

  return resolved;
}

export function applyProjectModeChange(
  current: ProjectRuntimePrefs | undefined,
  baseConfig: AppConfig,
  mode: ExecMode,
): ProjectRuntimePrefs {
  const base = current ?? snapshotProjectRuntimePrefs(baseConfig);
  return {
    ...base,
    mode,
  };
}

export function applyProjectAgentChange(
  current: ProjectRuntimePrefs | undefined,
  baseConfig: AppConfig,
  agentId: string,
): ProjectRuntimePrefs {
  const base = current ?? snapshotProjectRuntimePrefs(baseConfig);
  return {
    ...base,
    agentId,
  };
}

export function applyProjectSwitchToCloud(
  current: ProjectRuntimePrefs | undefined,
  baseConfig: AppConfig,
): ProjectRuntimePrefs {
  const base = current ?? snapshotProjectRuntimePrefs(baseConfig);
  return {
    ...base,
    mode: 'daemon',
    agentId: 'amr',
  };
}

export function applyProjectAgentModelChange(
  current: ProjectRuntimePrefs | undefined,
  baseConfig: AppConfig,
  agentId: string,
  choice: { model?: string; reasoning?: string; serviceTier?: string },
): ProjectRuntimePrefs {
  const base = current ?? snapshotProjectRuntimePrefs(baseConfig);
  const existingAgentPrefs =
    base.agentModels?.[agentId] ?? baseConfig.agentModels?.[agentId];
  const mergedChoice = mergeAgentModelChoice(existingAgentPrefs, choice);
  return {
    ...base,
    agentModels: {
      ...(base.agentModels ?? {}),
      [agentId]: mergedChoice,
    },
  };
}

export function applyProjectApiProtocolChange(
  current: ProjectRuntimePrefs | undefined,
  baseConfig: AppConfig,
  protocol: ApiProtocol,
): ProjectRuntimePrefs {
  const base = current ?? snapshotProjectRuntimePrefs(baseConfig);
  const protocolModel =
    baseConfig.apiProtocolConfigs?.[protocol]?.model ??
    SUGGESTED_MODELS_BY_PROTOCOL[protocol]?.[0] ??
    base.model;
  return {
    ...base,
    mode: 'api',
    apiProtocol: protocol,
    ...(protocolModel ? { model: protocolModel } : {}),
  };
}

export function applyProjectApiModelChange(
  current: ProjectRuntimePrefs | undefined,
  baseConfig: AppConfig,
  model: string,
): ProjectRuntimePrefs {
  const base = current ?? snapshotProjectRuntimePrefs(baseConfig);
  return {
    ...base,
    model,
  };
}
