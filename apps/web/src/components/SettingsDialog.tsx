import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { LOCALE_LABEL, LOCALES, useI18n } from '../i18n';
import type { Locale } from '../i18n';
import { AgentIcon } from './AgentIcon';
import { Icon } from './Icon';
import {
  CUSTOM_MODEL_SENTINEL,
  renderModelOptions,
} from './modelOptions';
import { DEFAULT_NOTIFICATIONS, KNOWN_PROVIDERS } from '../state/config';
import type { KnownProvider } from '../state/config';
import {
  MAX_MAX_TOKENS,
  MIN_MAX_TOKENS,
  modelMaxTokensDefault,
} from '../state/maxTokens';
import type {
  AgentInfo,
  ApiProtocol,
  ApiProtocolConfig,
  AppConfig,
  AppTheme,
  AppVersionInfo,
  ConnectionTestResponse,
  ExecMode,
} from '../types';
import { testAgent, testApiProvider } from '../providers/connection-test';
import { MEDIA_PROVIDERS } from '../media/models';
import type { MediaProvider } from '../media/models';
import { PetSettings } from './pet/PetSettings';
import { LibrarySection } from './LibrarySection';
import {
  applyAppearanceToDocument,
  normalizeAccentColor,
} from '../state/appearance';
import {
  FAILURE_SOUNDS,
  SUCCESS_SOUNDS,
  notificationPermission,
  playSound,
  requestNotificationPermission,
  showCompletionNotification,
} from '../utils/notifications';

export type SettingsSection =
  | 'execution'
  | 'media'
  | 'composio'
  | 'integrations'
  | 'language'
  | 'appearance'
  | 'notifications'
  | 'pet'
  | 'library'
  | 'about';

interface Props {
  initial: AppConfig;
  agents: AgentInfo[];
  daemonLive: boolean;
  appVersionInfo: AppVersionInfo | null;
  welcome?: boolean;
  initialSection?: SettingsSection;
  onSave: (cfg: AppConfig, closeModal?: boolean) => Promise<{ success: boolean }> | void;
  onClose: () => void;
  onRefreshAgents: (
    options?: AgentRefreshOptions,
  ) => AgentInfo[] | Promise<AgentInfo[] | void> | void;
}

export interface AgentRefreshOptions {
  throwOnError?: boolean;
  agentCliEnv?: AppConfig['agentCliEnv'];
}

const SUGGESTED_MODELS_BY_PROTOCOL = {
  anthropic: [
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    'deepseek-chat',
    'deepseek-reasoner',
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'MiniMax-M2.7-highspeed',
    'MiniMax-M2.7',
    'MiniMax-M2.5-highspeed',
    'MiniMax-M2.5',
    'MiniMax-M2.1-highspeed',
    'MiniMax-M2.1',
    'MiniMax-M2',
    'mimo-v2.5-pro',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'o3',
    'o4-mini',
    'deepseek-chat',
    'deepseek-reasoner',
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'MiniMax-M2.7-highspeed',
    'MiniMax-M2.7',
    'MiniMax-M2.5-highspeed',
    'MiniMax-M2.5',
    'MiniMax-M2.1-highspeed',
    'MiniMax-M2.1',
    'MiniMax-M2',
    'mimo-v2.5-pro',
  ],
  azure: [
    'gpt-4o',
    'gpt-4o-mini',
  ],
  google: [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
} as const;

const API_PROTOCOL_TABS: Array<{
  id: ApiProtocol;
  title: string;
}> = [
  { id: 'anthropic', title: 'Anthropic' },
  { id: 'openai', title: 'OpenAI' },
  { id: 'azure', title: 'Azure OpenAI' },
  { id: 'google', title: 'Google Gemini' },
];

const API_PROTOCOL_LABELS: Record<ApiProtocol, string> = {
  anthropic: 'Anthropic API',
  openai: 'OpenAI API',
  azure: 'Azure OpenAI',
  google: 'Google Gemini',
};

const API_KEY_PLACEHOLDERS: Record<ApiProtocol, string> = {
  anthropic: 'sk-ant-...',
  openai: 'sk-...',
  azure: 'azure key',
  google: 'AIza...',
};

type RescanNotice =
  | { kind: 'success'; count: number }
  | { kind: 'error' };

type TestState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; result: ConnectionTestResponse };

// Map a test result to the visual severity of its inline status node so
// the same green/red/amber palette as the Rescan status applies.
export function testStatusVariant(
  result: ConnectionTestResponse,
): 'success' | 'warn' | 'error' {
  if (result.ok) return 'success';
  if (result.kind === 'rate_limited') return 'warn';
  return 'error';
}

export function shouldShowCustomModelInput(
  modelValue: string,
  knownModelIds: readonly string[],
  explicitCustomMode: boolean,
): boolean {
  return (
    explicitCustomMode ||
    !modelValue ||
    !knownModelIds.includes(modelValue)
  );
}

export function canRunProviderConnectionTest(
  config: Pick<AppConfig, 'apiKey' | 'baseUrl' | 'model'>,
): boolean {
  return (
    Boolean(config.apiKey.trim()) &&
    Boolean(config.baseUrl.trim()) &&
    Boolean(config.model.trim())
  );
}

const AGENT_CLI_ENV_FIELDS = [
  {
    agentId: 'claude',
    envKey: 'CLAUDE_CONFIG_DIR',
    labelKey: 'settings.cliEnvClaudeConfigDir',
    placeholder: '~/.claude-2',
  },
  {
    agentId: 'codex',
    envKey: 'CODEX_HOME',
    labelKey: 'settings.cliEnvCodexHome',
    placeholder: '~/.codex-alt',
  },
  {
    agentId: 'codex',
    envKey: 'CODEX_BIN',
    labelKey: 'settings.cliEnvCodexBin',
    placeholder: '/absolute/path/to/codex',
  },
] as const;

function defaultApiProtocolConfig(protocol: ApiProtocol): ApiProtocolConfig {
  const provider = KNOWN_PROVIDERS.find((p) => p.protocol === protocol);
  return {
    apiKey: '',
    baseUrl: provider?.baseUrl ?? '',
    model: provider?.model ?? '',
    apiVersion: '',
    apiProviderBaseUrl: provider ? provider.baseUrl : null,
  };
}

function providerFamilyLabel(provider: KnownProvider): string {
  return provider.label.replace(/\s+—\s+(Anthropic|OpenAI)$/u, '');
}

function siblingProviderForProtocol(
  providerBaseUrl: string | null | undefined,
  protocol: ApiProtocol,
): KnownProvider | null {
  if (!providerBaseUrl) return null;
  const currentProvider = KNOWN_PROVIDERS.find(
    (p) => p.baseUrl === providerBaseUrl,
  );
  if (!currentProvider) return null;

  const currentFamily = providerFamilyLabel(currentProvider);
  return (
    KNOWN_PROVIDERS.find(
      (p) => p.protocol === protocol && providerFamilyLabel(p) === currentFamily,
    ) ?? null
  );
}

function nextApiProtocolConfig(
  config: AppConfig,
  protocol: ApiProtocol,
): ApiProtocolConfig {
  const savedConfig = config.apiProtocolConfigs?.[protocol];
  if (savedConfig) return savedConfig;

  const currentConfig = currentApiProtocolConfig(config);
  const siblingProvider = siblingProviderForProtocol(
    currentConfig.apiProviderBaseUrl,
    protocol,
  );
  if (siblingProvider) {
    return {
      ...defaultApiProtocolConfig(protocol),
      baseUrl: siblingProvider.baseUrl,
      model: siblingProvider.model,
      apiProviderBaseUrl: siblingProvider.baseUrl,
    };
  }

  if (currentConfig.apiProviderBaseUrl === null) {
    return {
      ...currentConfig,
      apiKey: '',
      apiVersion: protocol === 'azure' ? currentConfig.apiVersion : '',
      apiProviderBaseUrl: null,
    };
  }

  return {
    ...defaultApiProtocolConfig(protocol),
  };
}

function currentApiProtocolConfig(config: AppConfig): ApiProtocolConfig {
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    apiVersion: config.apiVersion ?? '',
    apiProviderBaseUrl: config.apiProviderBaseUrl ?? null,
  };
}

function applyApiProtocolConfig(
  config: AppConfig,
  protocol: ApiProtocol,
  apiConfig: ApiProtocolConfig,
): AppConfig {
  return {
    ...config,
    apiProtocol: protocol,
    apiKey: apiConfig.apiKey,
    baseUrl: apiConfig.baseUrl,
    model: apiConfig.model,
    apiProviderBaseUrl: apiConfig.apiProviderBaseUrl ?? null,
    apiVersion: protocol === 'azure' ? (apiConfig.apiVersion ?? '') : '',
  };
}

export function isValidApiBaseUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase();
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      Boolean(url.hostname) &&
      (isLoopbackApiHost(hostname) || !isBlockedInternalApiHost(hostname))
    );
  } catch {
    return false;
  }
}

function normalizeBracketedIpv6(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1).toLowerCase()
    : hostname.toLowerCase();
}

function parseIpv4(hostname: string): [number, number, number, number] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4) return null;
  const parsed = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    return value >= 0 && value <= 255 ? value : null;
  });
  if (parsed.some((part) => part === null)) return null;
  return parsed as [number, number, number, number];
}

function isLoopbackIpv4(hostname: string): boolean {
  const parts = parseIpv4(hostname);
  return Boolean(parts && parts[0] === 127);
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = parseIpv4(hostname);
  if (!parts) return false;
  const [a, b] = parts;
  return (
    (a === 169 && b === 254) ||
    a === 10 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31)
  );
}

function ipv4MappedToDotted(hostname: string): string | null {
  const host = normalizeBracketedIpv6(hostname);
  const mapped = /^::ffff:(.+)$/i.exec(host)?.[1];
  if (!mapped) return null;
  if (parseIpv4(mapped.toLowerCase())) return mapped.toLowerCase();
  const hexParts = mapped.split(':');
  if (
    hexParts.length !== 2 ||
    !hexParts.every((part) => /^[0-9a-f]{1,4}$/i.test(part))
  ) {
    return null;
  }
  const hi = hexParts[0];
  const lo = hexParts[1];
  if (!hi || !lo) return null;
  const value =
    (Number.parseInt(hi, 16) << 16) |
    Number.parseInt(lo, 16);
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join('.');
}

function isLoopbackApiHost(hostname: string): boolean {
  const host = normalizeBracketedIpv6(hostname);
  if (host === 'localhost' || host === '::1') return true;
  if (isLoopbackIpv4(host)) return true;
  const mapped = ipv4MappedToDotted(host);
  return Boolean(mapped && isLoopbackIpv4(mapped));
}

function isBlockedInternalApiHost(hostname: string): boolean {
  const host = normalizeBracketedIpv6(hostname);
  if (isPrivateIpv4(host)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
  const mapped = ipv4MappedToDotted(host);
  return Boolean(mapped && isPrivateIpv4(mapped));
}

export function updateCurrentApiProtocolConfig(
  config: AppConfig,
  patch: Partial<ApiProtocolConfig>,
): AppConfig {
  const protocol = config.apiProtocol ?? 'anthropic';
  const nextApiConfig: ApiProtocolConfig = {
    ...currentApiProtocolConfig(config),
    ...patch,
  };
  return applyApiProtocolConfig(
    {
      ...config,
      apiProtocolConfigs: {
        ...(config.apiProtocolConfigs ?? {}),
        [protocol]: nextApiConfig,
      },
    },
    protocol,
    nextApiConfig,
  );
}

export function updateAgentCliEnvValue(
  config: AppConfig,
  agentId: string,
  envKey: string,
  rawValue: string,
): AppConfig {
  const value = rawValue.trim();
  const agentCliEnv = { ...(config.agentCliEnv ?? {}) };
  const nextAgentEnv = { ...(agentCliEnv[agentId] ?? {}) };
  if (value) {
    nextAgentEnv[envKey] = value;
  } else {
    delete nextAgentEnv[envKey];
  }

  if (Object.keys(nextAgentEnv).length > 0) {
    agentCliEnv[agentId] = nextAgentEnv;
  } else {
    delete agentCliEnv[agentId];
  }

  return {
    ...config,
    agentCliEnv: Object.keys(agentCliEnv).length > 0 ? agentCliEnv : {},
  };
}

export function agentRefreshOptionsForConfig(cfg: AppConfig): AgentRefreshOptions {
  return {
    throwOnError: true,
    agentCliEnv: cfg.agentCliEnv ?? {},
  };
}

export function switchApiProtocolConfig(
  config: AppConfig,
  protocol: ApiProtocol,
): AppConfig {
  const currentProtocol = config.apiProtocol ?? 'anthropic';
  const apiProtocolConfigs = {
    ...(config.apiProtocolConfigs ?? {}),
    [currentProtocol]: currentApiProtocolConfig(config),
  };
  const nextApiConfig = nextApiProtocolConfig(
    {
      ...config,
      apiProtocolConfigs,
    },
    protocol,
  );
  return applyApiProtocolConfig(
    {
      ...config,
      mode: 'api',
      apiProtocolConfigs,
    },
    protocol,
    nextApiConfig,
  );
}

export function SettingsDialog({
  initial,
  agents,
  daemonLive,
  appVersionInfo,
  welcome,
  initialSection = 'execution',
  onSave,
  onClose,
  onRefreshAgents,
}: Props) {
  const { t, locale, setLocale } = useI18n();
  const [cfg, setCfg] = useState<AppConfig>(initial);

  // Revert the live theme preview when the dialog closes without saving.
  // On Save, App's useLayoutEffect fires after unmount and applies the new
  // saved theme, so this cleanup is effectively a no-op in that path.
  useLayoutEffect(() => {
    return () => {
      applyAppearanceToDocument({
        theme: initial.theme ?? 'system',
        accentColor: initial.accentColor,
      });
    };
  }, [initial.theme, initial.accentColor]);
  const [showApiKey, setShowApiKey] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);
  const [languageMenuRect, setLanguageMenuRect] = useState<DOMRect | null>(null);
  const [agentRescanRunning, setAgentRescanRunning] = useState(false);
  const [agentRescanNotice, setAgentRescanNotice] =
    useState<RescanNotice | null>(null);
  const [agentTestState, setAgentTestState] = useState<TestState>({
    status: 'idle',
  });
  const [providerTestState, setProviderTestState] = useState<TestState>({
    status: 'idle',
  });
  const agentTestAbortRef = useRef<AbortController | null>(null);
  const providerTestAbortRef = useRef<AbortController | null>(null);
  const agentTestRevisionRef = useRef(0);
  const providerTestRevisionRef = useRef(0);
  const [apiModelCustomEditing, setApiModelCustomEditing] = useState(false);
  const [agentCustomModelIds, setAgentCustomModelIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const languageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  // Tests pin a result against the unsaved draft. Once the user edits any
  // field that feeds into the test, the result is no longer trustworthy —
  // clear it so we don't show a stale "Connected" line next to fresh input.
  // If a test is already running, leave the running state visible and let the
  // stale result be ignored when it returns; the button stays disabled so a
  // new smoke test cannot overlap the old one.
  const agentChoiceForTest = cfg.agentModels?.[cfg.agentId ?? ''];
  useEffect(() => {
    agentTestRevisionRef.current += 1;
    setAgentTestState((state) =>
      state.status === 'running' ? state : { status: 'idle' },
    );
  }, [
    cfg.agentId,
    agentChoiceForTest?.model,
    agentChoiceForTest?.reasoning,
    cfg.agentCliEnv,
  ]);
  useEffect(() => {
    providerTestRevisionRef.current += 1;
    setProviderTestState((state) =>
      state.status === 'running' ? state : { status: 'idle' },
    );
  }, [
    cfg.apiProtocol,
    cfg.apiKey,
    cfg.baseUrl,
    cfg.model,
    cfg.apiVersion,
  ]);
  // Releasing the abort controllers on unmount avoids the "setState after
  // unmount" warning if the dialog closes while a test is still running.
  useEffect(() => {
    return () => {
      agentTestAbortRef.current?.abort();
      providerTestAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!languageOpen) return;
    const updateRect = () => {
      const button = languageRef.current?.querySelector('button');
      setLanguageMenuRect(button?.getBoundingClientRect() ?? null);
    };
    updateRect();
    function onDown(e: MouseEvent) {
      if (languageRef.current?.contains(e.target as Node)) return;
      setLanguageOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLanguageOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [languageOpen]);

  // Close the language menu on window resize so its placement (computed on
  // open) cannot end up stale relative to the new viewport dimensions.
  useEffect(() => {
    if (!languageOpen) return;
    const handleResize = () => setLanguageOpen(false);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [languageOpen]);

  const installedCount = useMemo(
    () => agents.filter((a) => a.available).length,
    [agents],
  );

  const setMode = (mode: ExecMode) => setCfg((c) => ({ ...c, mode }));
  const setApiProtocol = (protocol: ApiProtocol) => {
    setApiModelCustomEditing(false);
    setCfg((c) => switchApiProtocolConfig(c, protocol));
  };
  const updateApiConfig = (patch: Partial<ApiProtocolConfig>) =>
    setCfg((c) => updateCurrentApiProtocolConfig(c, patch));
  const handleRefreshAgents = async () => {
    if (agentRescanRunning) return;
    setAgentRescanRunning(true);
    setAgentRescanNotice(null);
    try {
      const refreshed = await onRefreshAgents(agentRefreshOptionsForConfig(cfg));
      const nextAgents = Array.isArray(refreshed) ? refreshed : agents;
      setAgentRescanNotice({
        kind: 'success',
        count: nextAgents.filter((a) => a.available).length,
      });
    } catch {
      setAgentRescanNotice({ kind: 'error' });
    } finally {
      setAgentRescanRunning(false);
    }
  };

  const handleTestAgent = async () => {
    if (agentTestState.status === 'running') {
      return;
    }
    const selected = agents.find((a) => a.id === cfg.agentId && a.available);
    if (!selected) return;
    const choice = cfg.agentModels?.[selected.id] ?? {};
    const controller = new AbortController();
    const revision = agentTestRevisionRef.current;
    agentTestAbortRef.current = controller;
    setAgentTestState({ status: 'running' });
    const clearIfStale = () => {
      if (agentTestAbortRef.current === controller) {
        setAgentTestState({ status: 'idle' });
      }
    };
    try {
      const result = await testAgent(
        {
          agentId: selected.id,
          model: choice.model || undefined,
          reasoning: choice.reasoning || undefined,
          agentCliEnv: cfg.agentCliEnv ?? {},
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (agentTestRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      setAgentTestState({ status: 'done', result });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (agentTestRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      setAgentTestState({
        status: 'done',
        result: {
          ok: false,
          kind: 'unknown',
          latencyMs: 0,
          model: choice.model || 'default',
          detail: err instanceof Error ? err.message : 'Test request failed',
        },
      });
    } finally {
      if (agentTestAbortRef.current === controller) {
        agentTestAbortRef.current = null;
      }
    }
  };

  const handleTestProvider = async () => {
    if (providerTestState.status === 'running') {
      return;
    }
    const controller = new AbortController();
    const revision = providerTestRevisionRef.current;
    providerTestAbortRef.current = controller;
    setProviderTestState({ status: 'running' });
    const clearIfStale = () => {
      if (providerTestAbortRef.current === controller) {
        setProviderTestState({ status: 'idle' });
      }
    };
    try {
      const result = await testApiProvider(
        {
          protocol: apiProtocol,
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey,
          model: cfg.model,
          apiVersion:
            apiProtocol === 'azure'
              ? cfg.apiVersion?.trim() || undefined
              : undefined,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (providerTestRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      setProviderTestState({ status: 'done', result });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (providerTestRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      setProviderTestState({
        status: 'done',
        result: {
          ok: false,
          kind: 'unknown',
          latencyMs: 0,
          model: cfg.model,
          detail: err instanceof Error ? err.message : 'Test request failed',
        },
      });
    } finally {
      if (providerTestAbortRef.current === controller) {
        providerTestAbortRef.current = null;
      }
    }
  };

  const renderTestMessage = (
    result: ConnectionTestResponse,
    kindForSuccess: 'api' | 'cli',
  ): string => {
    const ms = Math.max(0, Math.round(result.latencyMs));
    const sample = result.sample ?? '';
    const agentName = result.agentName ?? '';
    const testedModel = result.model ?? cfg.model;
    if (result.ok) {
      return kindForSuccess === 'api'
        ? t('settings.testSuccessApi', { ms, sample })
        : t('settings.testSuccessCli', { agentName, ms, sample });
    }
    switch (result.kind) {
      case 'auth_failed':
        return t('settings.testAuthFailed');
      case 'forbidden':
        return t('settings.testForbidden');
      case 'not_found_model':
        return t('settings.testNotFoundModel', { model: testedModel });
      case 'invalid_model_id':
        return t('settings.testInvalidModelId', { model: testedModel });
      case 'invalid_base_url':
        return t('settings.testInvalidBaseUrl');
      case 'rate_limited':
        return t('settings.testRateLimited');
      case 'upstream_unavailable':
        return t('settings.testUpstream', { status: result.status ?? 0 });
      case 'timeout':
        return t('settings.testTimeout', { ms });
      case 'agent_not_installed':
        return t('settings.testAgentMissing', { agentName });
      case 'agent_spawn_failed':
        return t('settings.testAgentSpawn', {
          agentName,
          detail: result.detail ?? '',
        });
      default:
        return t('settings.testUnknown', { detail: result.detail ?? '' });
    }
  };

  const apiProtocol = cfg.apiProtocol ?? 'anthropic';
  const baseUrlValid = isValidApiBaseUrl(cfg.baseUrl);
  const baseUrlInvalid = Boolean(cfg.baseUrl.trim() && !baseUrlValid);
  const canSave =
    cfg.mode === 'daemon'
      ? Boolean(cfg.agentId && agents.find((a) => a.id === cfg.agentId)?.available)
      : Boolean(
          cfg.apiKey.trim() &&
          cfg.model.trim() &&
          baseUrlValid,
        );

  const protocolProviders = useMemo(
    () => KNOWN_PROVIDERS.filter((p) => p.protocol === apiProtocol),
    [apiProtocol],
  );
  const selectedProviderIndex =
    cfg.apiProviderBaseUrl == null
      ? -1
      : protocolProviders.findIndex(
          (p) => p.baseUrl === cfg.apiProviderBaseUrl && p.baseUrl === cfg.baseUrl,
        );
  const selectedProvider = selectedProviderIndex >= 0 ? protocolProviders[selectedProviderIndex] : undefined;
  const apiModelOptions = useMemo(
    () => Array.from(new Set(
      selectedProvider?.models?.length
        ? selectedProvider.models
        : SUGGESTED_MODELS_BY_PROTOCOL[apiProtocol],
    )),
    [apiProtocol, cfg.baseUrl, selectedProvider],
  );
  const apiModelCustomActive =
    shouldShowCustomModelInput(
      cfg.model,
      apiModelOptions,
      apiModelCustomEditing,
    );
  const apiModelSelectValue = apiModelCustomActive
    ? CUSTOM_MODEL_SENTINEL
    : cfg.model;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-settings"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          {welcome ? (
            <>
              <span className="kicker">{t('settings.welcomeKicker')}</span>
              <h2>{t('settings.welcomeTitle')}</h2>
              <p className="subtitle">{t('settings.welcomeSubtitle')}</p>
              {/* First-run users see a mini pet teaser inside the welcome
                  modal so adoption is part of the warm intro rather than
                  hidden behind another nav click. The chip nudges them
                  toward Pets without forcing them to leave the rest of
                  the welcome flow. */}
              <button
                type="button"
                className="welcome-pet-teaser"
                onClick={() => setActiveSection('pet')}
              >
                <span className="welcome-pet-glyph" aria-hidden>🐾</span>
                <span className="welcome-pet-copy">
                  <strong>{t('pet.welcomeTeaserTitle')}</strong>
                  <span>{t('pet.welcomeTeaserBody')}</span>
                </span>
                <span className="welcome-pet-cta">
                  {t('pet.welcomeTeaserCta')}
                  <Icon name="chevron-right" size={12} />
                </span>
              </button>
            </>
          ) : (
            <>
              <span className="kicker">{t('settings.kicker')}</span>
              <h2>{t('settings.title')}</h2>
              <p className="subtitle">{t('settings.subtitle')}</p>
            </>
          )}
        </header>

        <div className="modal-body">
          <aside className="settings-sidebar" aria-label="Settings sections">
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'execution' ? ' active' : ''}`}
              onClick={() => setActiveSection('execution')}
            >
              <Icon name="sliders" size={18} />
              <span>
                <strong>{t('settings.envConfigure')}</strong>
                <small>{`${t('settings.localCli')} / ${t('settings.modeApiMeta')}`}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'media' ? ' active' : ''}`}
              onClick={() => setActiveSection('media')}
            >
              <Icon name="image" size={18} />
              <span>
                <strong>{t('settings.mediaProviders')}</strong>
                <small>Image / video / audio</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'composio' ? ' active' : ''}`}
              onClick={() => setActiveSection('composio')}
            >
              <Icon name="sliders" size={18} />
              <span>
                <strong>Connectors</strong>
                <small>External system connections</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'integrations' ? ' active' : ''}`}
              onClick={() => setActiveSection('integrations')}
            >
              <Icon name="link" size={18} />
              <span>
                <strong>MCP server</strong>
                <small>Connect your coding agent</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'language' ? ' active' : ''}`}
              onClick={() => setActiveSection('language')}
            >
              <Icon name="languages" size={18} />
              <span>
                <strong>{t('settings.language')}</strong>
                <small>{t('settings.languageHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'appearance' ? ' active' : ''}`}
              onClick={() => setActiveSection('appearance')}
            >
              <Icon name="sun-moon" size={18} />
              <span>
                <strong>{t('settings.appearance')}</strong>
                <small>{t('settings.appearanceHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'notifications' ? ' active' : ''}`}
              onClick={() => setActiveSection('notifications')}
            >
              <Icon name="bell" size={18} />
              <span>
                <strong>{t('settings.notifications')}</strong>
                <small>{t('settings.notificationsHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'pet' ? ' active' : ''}`}
              onClick={() => setActiveSection('pet')}
            >
              <Icon name="sparkles" size={18} />
              <span>
                <strong>{t('pet.navTitle')}</strong>
                <small>{t('pet.navHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'library' ? ' active' : ''}`}
              onClick={() => setActiveSection('library')}
            >
              <Icon name="grid" size={18} />
              <span>
                <strong>{t('settings.library')}</strong>
                <small>{t('settings.libraryHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'about' ? ' active' : ''}`}
              onClick={() => setActiveSection('about')}
            >
              <Icon name="settings" size={18} />
              <span>
                <strong>{t('settings.about')}</strong>
                <small>{t('settings.aboutHint')}</small>
              </span>
            </button>
          </aside>
          <div className="settings-content">
          {activeSection === 'execution' ? (
            <>
              <div
                className="seg-control"
                role="tablist"
                aria-label={t('settings.modeAria')}
                style={{ ['--seg-cols' as string]: 2 } as CSSProperties}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={cfg.mode === 'daemon'}
                  className={'seg-btn' + (cfg.mode === 'daemon' ? ' active' : '')}
                  disabled={!daemonLive}
                  onClick={() => setMode('daemon')}
                  title={
                    daemonLive
                      ? t('settings.modeDaemonHelp')
                      : t('settings.modeDaemonOffline')
                  }
                >
                  <span className="seg-title">{t('settings.localCli')}</span>
                  <span className="seg-meta">
                    {daemonLive
                      ? t('settings.modeDaemonInstalledMeta', { count: installedCount })
                      : t('settings.modeDaemonOfflineMeta')}
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={cfg.mode === 'api'}
                  className={'seg-btn' + (cfg.mode === 'api' ? ' active' : '')}
                  onClick={() => setMode('api')}
                >
                  <span className="seg-title">{t('settings.modeApiMeta')}</span>
                  <span className="seg-meta">{t('settings.modeApi')}</span>
                </button>
              </div>
              {cfg.mode === 'api' ? (
                <div
                  className="protocol-chips"
                  role="tablist"
                  aria-label={t('settings.protocolAria')}
                >
                  {API_PROTOCOL_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={apiProtocol === tab.id}
                      className={'protocol-chip' + (apiProtocol === tab.id ? ' active' : '')}
                      onClick={() => setApiProtocol(tab.id)}
                    >
                      {tab.title}
                    </button>
                  ))}
                </div>
              ) : null}
          {cfg.mode === 'daemon' ? (
            <section className="settings-section">
              <div className="section-head">
                <div>
                  <h3>{t('settings.localCli')}</h3>
                  <p className="hint">{t('settings.codeAgentHint')}</p>
                </div>
                <div className="section-head-actions">
                  {(() => {
                    const selected = agents.find(
                      (a) => a.id === cfg.agentId && a.available,
                    );
                    const running = agentTestState.status === 'running';
                    const disabled = running || !selected;
                    return (
                      <button
                        type="button"
                        className={
                          'ghost icon-btn settings-test-btn' +
                          (running ? ' loading' : '')
                        }
                        onClick={() => void handleTestAgent()}
                        disabled={disabled}
                        title={t('settings.testTitle')}
                      >
                        {running ? (
                          <>
                            <Icon
                              name="spinner"
                              size={13}
                              className="icon-spin"
                            />
                            <span>{t('settings.test')}</span>
                          </>
                        ) : (
                          t('settings.test')
                        )}
                      </button>
                    );
                  })()}
                  <button
                    type="button"
                    className={
                      'ghost icon-btn settings-rescan-btn' +
                      (agentRescanRunning ? ' loading' : '')
                    }
                    onClick={() => void handleRefreshAgents()}
                    disabled={agentRescanRunning}
                    title={t('settings.rescanTitle')}
                  >
                    {agentRescanRunning ? (
                      <>
                        <Icon name="spinner" size={13} className="icon-spin" />
                        <span>{t('settings.rescanRunning')}</span>
                      </>
                    ) : (
                      t('settings.rescan')
                    )}
                  </button>
                </div>
              </div>
              {agentRescanNotice ? (
                <p
                  className={
                    'settings-rescan-status ' + agentRescanNotice.kind
                  }
                  role={
                    agentRescanNotice.kind === 'error' ? 'alert' : 'status'
                  }
                >
                  {agentRescanNotice.kind === 'success'
                    ? t('settings.rescanSuccess', {
                        count: agentRescanNotice.count,
                      })
                    : t('settings.rescanFailed')}
                </p>
              ) : null}
              {agentTestState.status === 'running' ? (
                <p
                  className="settings-test-status running"
                  role="status"
                  aria-live="polite"
                >
                  {t('settings.testRunning')}
                </p>
              ) : agentTestState.status === 'done' ? (
                <p
                  className={
                    'settings-test-status ' +
                    testStatusVariant(agentTestState.result)
                  }
                  role={agentTestState.result.ok ? 'status' : 'alert'}
                >
                  {renderTestMessage(agentTestState.result, 'cli')}
                </p>
              ) : null}
              {agents.length === 0 ? (
                <div className="empty-card">
                  {t('settings.noAgentsDetected')}
                </div>
              ) : (
                <div className="agent-grid">
                  {agents.map((a) => {
                    const active = cfg.agentId === a.id;
                    return (
                      <button
                        type="button"
                        key={a.id}
                        className={
                          'agent-card' +
                          (active ? ' active' : '') +
                          (a.available ? '' : ' disabled')
                        }
                        onClick={() =>
                          a.available && setCfg((c) => ({ ...c, agentId: a.id }))
                        }
                        disabled={!a.available}
                        aria-pressed={active}
                      >
                        <AgentIcon id={a.id} size={40} />
                        <div className="agent-card-body">
                          <div className="agent-card-name">{a.name}</div>
                          <div className="agent-card-meta">
                            {a.available ? (
                              a.version ? (
                                <span title={a.path ?? ''}>{a.version}</span>
                              ) : (
                                <span title={a.path ?? ''}>
                                  {t('common.installed')}
                                </span>
                              )
                            ) : (
                              <span className="muted">
                                {t('common.notInstalled')}
                              </span>
                            )}
                          </div>
                        </div>
                        {a.available ? (
                          <span
                            className={'status-dot' + (active ? ' active' : '')}
                            aria-hidden="true"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
              {(() => {
                const selected = agents.find(
                  (a) => a.id === cfg.agentId && a.available,
                );
                if (!selected) return null;
                const hasModels =
                  Array.isArray(selected.models) && selected.models.length > 0;
                const hasReasoning =
                  Array.isArray(selected.reasoningOptions) &&
                  selected.reasoningOptions.length > 0;
                if (!hasModels && !hasReasoning) return null;
                const choice = cfg.agentModels?.[selected.id] ?? {};
                const setChoice = (
                  next: { model?: string; reasoning?: string },
                ) => {
                  setCfg((c) => {
                    const prev = c.agentModels?.[selected.id] ?? {};
                    return {
                      ...c,
                      agentModels: {
                        ...(c.agentModels ?? {}),
                        [selected.id]: { ...prev, ...next },
                      },
                    };
                  });
                };
                const modelValue =
                  choice.model ?? selected.models?.[0]?.id ?? '';
                const reasoningValue =
                  choice.reasoning ??
                  selected.reasoningOptions?.[0]?.id ?? '';
                const customActive =
                  hasModels &&
                  shouldShowCustomModelInput(
                    modelValue,
                    selected.models!.map((m) => m.id),
                    agentCustomModelIds.has(selected.id),
                  );
                const selectValue = customActive
                  ? CUSTOM_MODEL_SENTINEL
                  : modelValue;
                return (
                  <div className="agent-model-row">
                    {hasModels ? (
                      <label className="field">
                        <span className="field-label">
                          {t('settings.modelPicker')}
                        </span>
                        <select
                          value={selectValue}
                          onChange={(e) => {
                            if (e.target.value === CUSTOM_MODEL_SENTINEL) {
                              // Switching to "Custom…" should clear the
                              // value so the input below opens empty for
                              // typing. Keep an explicit edit-mode flag so
                              // intermediate values like `gpt-5` do not
                              // collapse the custom input while typing
                              // `gpt-5.5`.
                              setAgentCustomModelIds((prev) => {
                                const next = new Set(prev);
                                next.add(selected.id);
                                return next;
                              });
                              setChoice({ model: '' });
                            } else {
                              setAgentCustomModelIds((prev) => {
                                if (!prev.has(selected.id)) return prev;
                                const next = new Set(prev);
                                next.delete(selected.id);
                                return next;
                              });
                              setChoice({ model: e.target.value });
                            }
                          }}
                        >
                          {renderModelOptions(selected.models!)}
                          <option value={CUSTOM_MODEL_SENTINEL}>
                            {t('settings.modelCustom')}
                          </option>
                        </select>
                      </label>
                    ) : null}
                    {customActive ? (
                      <label className="field">
                        <span className="field-label">
                          {t('settings.modelCustomLabel')}
                        </span>
                        <input
                          type="text"
                          value={modelValue}
                          placeholder={t('settings.modelCustomPlaceholder')}
                          onChange={(e) =>
                            setChoice({ model: e.target.value.trim() })
                          }
                        />
                      </label>
                    ) : null}
                    {hasReasoning ? (
                      <label className="field">
                        <span className="field-label">
                          {t('settings.reasoningPicker')}
                        </span>
                        <select
                          value={reasoningValue}
                          onChange={(e) =>
                            setChoice({ reasoning: e.target.value })
                          }
                        >
                          {selected.reasoningOptions!.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <p className="hint">{t('settings.modelPickerHint')}</p>
                  </div>
                );
              })()}
              <div className="agent-cli-env">
                <div className="agent-cli-env-head">
                  <h4>{t('settings.cliEnvTitle')}</h4>
                  <p className="hint">{t('settings.cliEnvHint')}</p>
                </div>
                <div className="agent-cli-env-grid">
                  {AGENT_CLI_ENV_FIELDS.map((field) => (
                    <label className="field" key={`${field.agentId}:${field.envKey}`}>
                      <span className="field-label">{t(field.labelKey)}</span>
                      <input
                        type="text"
                        value={cfg.agentCliEnv?.[field.agentId]?.[field.envKey] ?? ''}
                        placeholder={field.placeholder}
                        spellCheck={false}
                        onChange={(e) =>
                          setCfg((c) =>
                            updateAgentCliEnvValue(
                              c,
                              field.agentId,
                              field.envKey,
                              e.target.value,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <section className="settings-section">
              <div className="section-head">
                <div>
                  <h3>{API_PROTOCOL_LABELS[apiProtocol]}</h3>
                </div>
                {(() => {
                  const running = providerTestState.status === 'running';
                  const hasRequired = canRunProviderConnectionTest(cfg);
                  const disabled = running || !hasRequired;
                  return (
                    <button
                      type="button"
                      className={
                        'ghost icon-btn settings-test-btn' +
                        (running ? ' loading' : '')
                      }
                      onClick={() => void handleTestProvider()}
                      disabled={disabled}
                      title={t('settings.testTitle')}
                    >
                      {running ? (
                        <>
                          <Icon
                            name="spinner"
                            size={13}
                            className="icon-spin"
                          />
                          <span>{t('settings.test')}</span>
                        </>
                      ) : (
                        t('settings.test')
                      )}
                    </button>
                  );
                })()}
              </div>
              {providerTestState.status === 'running' ? (
                <p
                  className="settings-test-status running"
                  role="status"
                  aria-live="polite"
                >
                  {t('settings.testRunning')}
                </p>
              ) : providerTestState.status === 'done' ? (
                <p
                  className={
                    'settings-test-status ' +
                    testStatusVariant(providerTestState.result)
                  }
                  role={providerTestState.result.ok ? 'status' : 'alert'}
                >
                  {renderTestMessage(providerTestState.result, 'api')}
                </p>
              ) : null}
              <label className="field">
                <span className="field-label">{t('settings.quickFillProvider')}</span>
                <select
                  value={selectedProviderIndex >= 0 ? String(selectedProviderIndex) : ''}
                  onChange={(e) => {
                    if (e.target.value === '') {
                      setApiModelCustomEditing(false);
                      updateApiConfig({
                        baseUrl: '',
                        model: '',
                        apiProviderBaseUrl: null,
                      });
                      return;
                    }
                    const idx = Number(e.target.value);
                    if (!isNaN(idx) && protocolProviders[idx]) {
                      const p = protocolProviders[idx]!;
                      setApiModelCustomEditing(false);
                      updateApiConfig({
                        baseUrl: p.baseUrl,
                        model: p.model,
                        apiProviderBaseUrl: p.baseUrl,
                      });
                    }
                  }}
                >
                  <option value="">{t('settings.customProvider')}</option>
                  {protocolProviders.map((p, i) => (
                    <option key={p.label} value={i}>{p.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">{t('settings.apiKey')}</span>
                <div className="field-row">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    placeholder={API_KEY_PLACEHOLDERS[apiProtocol]}
                    value={cfg.apiKey}
                    onChange={(e) => updateApiConfig({ apiKey: e.target.value })}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="ghost icon-btn"
                    onClick={() => setShowApiKey((v) => !v)}
                    title={
                      showApiKey ? t('settings.hideKey') : t('settings.showKey')
                    }
                  >
                    {showApiKey ? t('settings.hide') : t('settings.show')}
                  </button>
                </div>
              </label>
              <label className="field">
                <span className="field-label">
                  {apiProtocol === 'azure'
                    ? t('settings.azureDeploymentModel')
                    : t('settings.model')}
                </span>
                <select
                  value={apiModelSelectValue}
                  onChange={(e) => {
                    if (e.target.value === CUSTOM_MODEL_SENTINEL) {
                      setApiModelCustomEditing(true);
                      updateApiConfig({ model: '' });
                    } else {
                      setApiModelCustomEditing(false);
                      updateApiConfig({ model: e.target.value });
                    }
                  }}
                >
                  {apiModelOptions.map((m) => (
                    <option value={m} key={m}>{m}</option>
                  ))}
                  <option value={CUSTOM_MODEL_SENTINEL}>{t('settings.modelCustom')}</option>
                </select>
              </label>
              {!selectedProvider ? (
                <p className="hint">{t('settings.suggestedModelsHint')}</p>
              ) : null}
              {apiProtocol === 'azure' ? (
                <p className="hint">{t('settings.azureDeploymentModelHint')}</p>
              ) : null}
              {apiModelCustomActive ? (
                <label className="field">
                  <span className="field-label">{t('settings.modelCustomLabel')}</span>
                  <input
                    type="text"
                    value={cfg.model}
                    placeholder={t('settings.modelCustomPlaceholder')}
                    onChange={(e) => updateApiConfig({ model: e.target.value.trim() })}
                  />
                </label>
              ) : null}
              <label className="field">
                <span className="field-label">{t('settings.baseUrl')}</span>
                <input
                  type="url"
                  inputMode="url"
                  value={cfg.baseUrl}
                  aria-invalid={baseUrlInvalid || undefined}
                  aria-describedby={
                    baseUrlInvalid ? 'settings-base-url-error' : undefined
                  }
                  onChange={(e) => updateApiConfig({ baseUrl: e.target.value, apiProviderBaseUrl: null })}
                />
                {baseUrlInvalid ? (
                  <span
                    id="settings-base-url-error"
                    className="settings-field-error"
                    role="alert"
                  >
                    {t('settings.baseUrlInvalid')}
                  </span>
                ) : null}
              </label>
              {apiProtocol === 'azure' ? (
                <label className="field">
                  <span className="field-label">{t('settings.apiVersion')}</span>
                  <input
                    type="text"
                    value={cfg.apiVersion ?? ''}
                    placeholder="2024-10-21"
                    onChange={(e) => updateApiConfig({ apiVersion: e.target.value.trim() })}
                  />
                </label>
              ) : null}
              <p className="hint">{t('settings.apiHint')}</p>
            </section>
          )}
            </>
          ) : null}

          {activeSection === 'media' ? <MediaProvidersSection cfg={cfg} setCfg={setCfg} /> : null}
          {activeSection === 'integrations' ? <IntegrationsSection /> : null}

          {activeSection === 'composio' ? <ComposioSection cfg={cfg} setCfg={setCfg} /> : null}

          {activeSection === 'language' ? (
          <section className="settings-section">
            <div className="section-head">
              <div>
                <h3>{t('settings.language')}</h3>
                <p className="hint">{t('settings.languageHint')}</p>
              </div>
            </div>
            <div className="settings-language-picker" ref={languageRef}>
              <button
                type="button"
                className="settings-language-button"
                aria-haspopup="menu"
                aria-expanded={languageOpen}
                onClick={() => setLanguageOpen((v) => !v)}
              >
                <span className="settings-language-icon" aria-hidden="true">
                  <Icon name="languages" size={22} strokeWidth={1.8} />
                </span>
                <span className="settings-language-text">
                  <span className="settings-language-title">
                    {LOCALE_LABEL[locale]}
                  </span>
                  <span className="settings-language-code">{locale}</span>
                </span>
                <Icon name="chevron-down" size={16} />
              </button>
              {languageOpen && languageMenuRect ? (() => {
                const spaceBelow = window.innerHeight - languageMenuRect.bottom;
                const spaceAbove = languageMenuRect.top;
                // Prefer downward if at least 200px available (enough for ~5 options)
                const openDownward = spaceBelow >= spaceAbove || spaceBelow >= 200;
                return (
                <div
                  className="settings-language-menu"
                  role="menu"
                  style={{
                    top: openDownward ? languageMenuRect.bottom + 6 : undefined,
                    bottom: openDownward
                      ? undefined
                      : window.innerHeight - languageMenuRect.top + 6,
                    left: languageMenuRect.left,
                    width: languageMenuRect.width,
                    '--menu-available-h': `${(openDownward ? spaceBelow : spaceAbove) - 6}px`,
                  } as React.CSSProperties}
                >
                  {LOCALES.map((code) => {
                    const active = locale === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        className={`settings-language-option${active ? ' active' : ''}`}
                        onClick={() => {
                          setLocale(code as Locale);
                          setLanguageOpen(false);
                        }}
                      >
                        <span>
                          <span className="settings-language-option-title">
                            {LOCALE_LABEL[code]}
                          </span>
                          <span className="settings-language-option-code">
                            {code}
                          </span>
                        </span>
                        {active ? <Icon name="check" size={16} /> : null}
                      </button>
                    );
                  })}
                </div>
                );
              })() : null}
            </div>
          </section>
          ) : null}

          {activeSection === 'appearance' ? (
            <AppearanceSection cfg={cfg} setCfg={setCfg} />
          ) : null}

          {activeSection === 'notifications' ? (
            <NotificationsSection cfg={cfg} setCfg={setCfg} />
          ) : null}

          {activeSection === 'pet' ? (
            <PetSettings cfg={cfg} setCfg={setCfg} />
          ) : null}

          {activeSection === 'library' ? (
            <LibrarySection cfg={cfg} setCfg={setCfg} />
          ) : null}

          {activeSection === 'about' ? (
            <section className="settings-section">
              <div className="section-head">
                <div>
                  <h3>{t('settings.about')}</h3>
                  <p className="hint">{t('settings.aboutHint')}</p>
                </div>
              </div>
              {appVersionInfo ? (
                <dl className="settings-about-list">
                  <div>
                    <dt>{t('settings.appVersion')}</dt>
                    <dd>{appVersionInfo.version}</dd>
                  </div>
                  <div>
                    <dt>{t('settings.appChannel')}</dt>
                    <dd>{appVersionInfo.channel}</dd>
                  </div>
                  <div>
                    <dt>{t('settings.appRuntime')}</dt>
                    <dd>
                      {appVersionInfo.packaged
                        ? t('settings.runtimePackaged')
                        : t('settings.runtimeDevelopment')}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('settings.appPlatform')}</dt>
                    <dd>{appVersionInfo.platform}</dd>
                  </div>
                  <div>
                    <dt>{t('settings.appArchitecture')}</dt>
                    <dd>{appVersionInfo.arch}</dd>
                  </div>
                </dl>
              ) : (
                <div className="empty-card">{t('settings.versionUnavailable')}</div>
              )}
            </section>
          ) : null}
          </div>
        </div>

        <footer className="modal-foot">
          <button type="button" className="ghost" onClick={onClose}>
            {welcome ? t('settings.skipForNow') : t('common.cancel')}
          </button>
          <button
            type="button"
            className="primary"
            disabled={!canSave}
            onClick={() => onSave(cfg, activeSection !== 'composio')}
          >
            {welcome ? t('settings.getStarted') : t('common.save')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ComposioSection({
  cfg,
  setCfg,
}: {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}) {
  const composio = cfg.composio ?? {};

  const updateComposio = (patch: NonNullable<AppConfig['composio']>) => {
    setCfg((curr) => ({ ...curr, composio: { ...(curr.composio ?? {}), ...patch } }));
  };
  const hasPendingEdit = Boolean(composio.apiKey?.trim());
  const apiKeyConfigured = Boolean(hasPendingEdit || composio.apiKeyConfigured);
  const isSavedState = apiKeyConfigured && !hasPendingEdit;
  const tail = composio.apiKeyTail?.trim();

  return (
    <section className="settings-section">
      <div className="section-head">
        <div>
          <h3>Connectors</h3>
          <p className="hint">Manage connector and tool provider settings for this device.</p>
        </div>
      </div>
      <label className="field">
        <span className="field-label-row">
          <span className="field-label-group">
            <span className="field-label">Composio API Key</span>
            {isSavedState ? (
              <span className="field-status-badge" title="Saved to local daemon">
                {tail ? `Saved · ••••${tail}` : 'Saved'}
              </span>
            ) : null}
          </span>
          <a
            className="field-label-link"
            href="https://app.composio.dev"
            target="_blank"
            rel="noreferrer"
          >
            Get API Key
            <Icon name="external-link" size={11} />
          </a>
        </span>
        <div className="field-row">
          <input
            type="password"
            value={composio.apiKey ?? ''}
            placeholder={isSavedState ? 'Paste a new key to replace the saved one' : 'Paste Composio API key'}
            onChange={(e) => updateComposio({ apiKey: e.target.value })}
            aria-describedby="composio-api-key-help"
          />
          <button
            type="button"
            className="ghost"
            disabled={!apiKeyConfigured}
            onClick={() => updateComposio({ apiKey: '', apiKeyConfigured: false, apiKeyTail: '' })}
          >
            Clear
          </button>
        </div>
        <span id="composio-api-key-help" className="hint">
          {isSavedState
            ? 'Your key stays in the local daemon. Paste a new key above to replace it, or Clear to remove.'
            : apiKeyConfigured
              ? 'Unsaved changes — click Save to store this key in the local daemon.'
              : 'Keys are stored locally in the daemon and never sent through environment variables.'}
        </span>
      </label>
    </section>
  );
}

function MediaProvidersSection({
  cfg,
  setCfg,
}: {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}) {
  const { t } = useI18n();
  const providers = MEDIA_PROVIDERS
    .filter((p) => p.settingsVisible !== false)
    .slice()
    .sort((a, b) => {
      const aEntry = cfg.mediaProviders?.[a.id];
      const bEntry = cfg.mediaProviders?.[b.id];
      const aConfigured = Boolean(aEntry?.apiKey.trim() || aEntry?.baseUrl.trim());
      const bConfigured = Boolean(bEntry?.apiKey.trim() || bEntry?.baseUrl.trim());
      if (aConfigured !== bConfigured) return aConfigured ? -1 : 1;
      if (a.integrated !== b.integrated) return a.integrated ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
  const updateProvider = (
    provider: MediaProvider,
    patch: { apiKey?: string; baseUrl?: string; model?: string },
  ) => {
    setCfg((curr) => {
      const prev = curr.mediaProviders?.[provider.id] ?? { apiKey: '', baseUrl: '', model: '' };
      const next = { ...prev, ...patch };
      const map = { ...(curr.mediaProviders ?? {}) };
      if (!next.apiKey.trim() && !next.baseUrl.trim() && !next.model?.trim()) {
        delete map[provider.id];
      } else {
        map[provider.id] = next;
      }
      return { ...curr, mediaProviders: map };
    });
  };

  return (
    <section className="settings-section">
      <div className="section-head">
        <div>
          <h3>{t('settings.mediaProviders')}</h3>
          <p className="hint">{t('settings.mediaProvidersHint')}</p>
        </div>
      </div>
      <div className="media-provider-list">
        {providers.map((provider) => {
          const entry = cfg.mediaProviders?.[provider.id] ?? { apiKey: '', baseUrl: '', model: '' };
          const configured = Boolean(entry.apiKey.trim() || entry.baseUrl.trim());
          const disabled = !provider.integrated;
          const supportsCustomModel = provider.supportsCustomModel === true;
          const clearable = Boolean(entry.apiKey.trim() || entry.baseUrl.trim() || entry.model?.trim());
          return (
            <div key={provider.id} className={`media-provider-row${provider.integrated ? '' : ' pending'}`}>
              <div className="media-provider-head">
                <div className="media-provider-meta">
                  <span className="media-provider-name">{provider.label}</span>
                  <span className="media-provider-hint">{provider.hint}</span>
                </div>
                <div className="media-provider-badges">
                  <span className={`media-provider-badge ${provider.integrated ? 'integrated' : 'unsupported'}`}>
                    {provider.integrated ? 'Integrated' : 'Unsupported'}
                  </span>
                  {configured ? (
                    <span className="media-provider-badge on">
                      {t('settings.mediaProviderConfigured')}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="media-provider-body">
                <input
                  type="password"
                  value={entry.apiKey}
                  placeholder={t('settings.mediaProviderPlaceholder')}
                  aria-label={`${provider.label} ${t('settings.mediaProviderApiKey')}`}
                  disabled={disabled}
                  onChange={(e) => updateProvider(provider, { apiKey: e.target.value })}
                />
                <input
                  value={entry.baseUrl}
                  placeholder={provider.defaultBaseUrl || t('settings.mediaProviderBaseUrlPlaceholder')}
                  aria-label={`${provider.label} ${t('settings.mediaProviderBaseUrl')}`}
                  disabled={disabled}
                  onChange={(e) => updateProvider(provider, { baseUrl: e.target.value })}
                />
                {supportsCustomModel ? (
                  <input
                    value={entry.model ?? ''}
                    placeholder="gemini-3.1-flash-image-preview"
                    aria-label={`${provider.label} model`}
                    disabled={disabled}
                    onChange={(e) => updateProvider(provider, { model: e.target.value })}
                  />
                ) : null}
                <button
                  type="button"
                  className="ghost"
                  disabled={!clearable}
                  onClick={() => updateProvider(provider, { apiKey: '', baseUrl: '', model: '' })}
                >
                  {t('settings.mediaProviderClear')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Per-client install paths. Each entry's `snippet` is what the user
// copies; some clients also support a richer `deeplink` flow that
// triggers a one-click install with an in-client approval dialog.
//
// Schemas drift between clients in deliberate ways. VS Code keys
// servers under "servers" with a required "type" field; Zed uses
// "context_servers"; Cursor, Windsurf, and Antigravity share
// "mcpServers"; Claude Code is best served by its CLI which writes
// to the local config for you. Verified against each tool's official
// docs in May 2026.
//
// Important: every snippet uses absolute paths to the daemon's current
// Node-compatible runtime and built cli.js, fetched at runtime. macOS
// and Linux ship a system /usr/bin/od (octal-dump) that shadows any
// `od` we might add to PATH, and most Open Design users run from
// source where `od` is not installed globally. The installer panel
// must NOT reference bare `od`.
type McpClientId =
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'vscode'
  | 'zed'
  | 'windsurf'
  | 'antigravity';

interface McpInstallInfo {
  command: string;
  args: string[];
  env?: Record<string, string>;
  daemonUrl: string;
  platform: 'darwin' | 'linux' | 'win32' | string;
  cliExists: boolean;
  nodeExists: boolean;
  buildHint: string | null;
}

interface McpStdioServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface McpClient {
  id: McpClientId;
  label: string;
  // Function so the dropdown can show different methods per OS
  // (Claude Code uses CLI on POSIX but JSON edit on Windows because
  // the bash/PowerShell/cmd.exe quoting is too fragile to reliably
  // emit a single command that works in every shell).
  buildMethod: (info: McpInstallInfo) => string;
  // Function so per-OS path hints (~/.cursor on POSIX vs
  // %USERPROFILE%\.cursor on Windows) and shortcut differences
  // (⌘⇧P vs Ctrl+Shift+P) can be rendered correctly.
  buildInstruction: (info: McpInstallInfo) => string;
  buildSnippet: (info: McpInstallInfo) => string;
  buildSnippetLang: (info: McpInstallInfo) => 'bash' | 'json' | 'toml';
  // Optional one-click install action. Currently only Cursor
  // supports deeplinks of this shape.
  buildDeeplink?: (info: McpInstallInfo) => string;
  deeplinkLabel?: string;
}

// Path hint per OS. Localizes the "where to paste" copy so a
// Windows user does not see ~/.cursor/mcp.json (which their shell
// will not expand) or a Linux user does not see %APPDATA% paths.
function homeConfigPath(
  platform: McpInstallInfo['platform'],
  posix: string,
  windows: string,
): string {
  return platform === 'win32' ? windows : posix;
}

function commandPaletteShortcut(platform: McpInstallInfo['platform']): string {
  return platform === 'darwin' ? '⌘⇧P' : 'Ctrl+Shift+P';
}

function settingsShortcut(platform: McpInstallInfo['platform']): string {
  return platform === 'darwin' ? '⌘,' : 'Ctrl+,';
}

// btoa() requires every input character be representable in Latin-1
// (codepoints 0-255). A Mac/Linux home directory like
// "/Users/Émile/.fnm/.../node" trips that and throws
// InvalidCharacterError. UTF-8-encode the string into bytes first,
// then map each byte back to a Latin-1 char before base64'ing.
function utf8Btoa(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function buildMcpStdioServerConfig(info: McpInstallInfo): McpStdioServerConfig {
  const env = info.env && Object.keys(info.env).length > 0 ? info.env : undefined;
  return {
    command: info.command,
    args: info.args,
    ...(env ? { env } : {}),
  };
}

function buildCodexEnvToml(info: McpInstallInfo): string {
  const entries = Object.entries(info.env ?? {});
  if (entries.length === 0) return '';
  return `

[mcp_servers.open-design.env]
${entries.map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join('\n')}`;
}

function buildSharedMcpJson(info: McpInstallInfo): string {
  const inner = buildMcpStdioServerConfig(info);
  const innerJson = JSON.stringify(inner, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : `    ${line}`))
    .join('\n');
  return `{
  "mcpServers": {
    "open-design": ${innerJson}
  }
}`;
}

const MCP_CLIENTS: McpClient[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    // `claude mcp add-json <name> '<json>'` takes ONLY the inner
    // server-config object, not the full mcpServers wrapper. We
    // inline the JSON into the command itself so the snippet is a
    // real one-liner the user can copy and run, no template
    // substitution. Single quotes around the JSON work in bash, zsh,
    // PowerShell, and Git Bash; the only outlier is Windows cmd.exe,
    // where users would need to swap to PowerShell.
    buildMethod: () => 'CLI command',
    buildInstruction: () => 'Run this in your terminal.',
    buildSnippet: (info) => {
      const inner = JSON.stringify(buildMcpStdioServerConfig(info));
      return `claude mcp add-json --scope user open-design '${inner}'`;
    },
    buildSnippetLang: () => 'bash',
  },
  {
    id: 'codex',
    label: 'Codex',
    // Codex CLI shares config between the terminal CLI and the IDE
    // extension at ~/.codex/config.toml (TOML, not JSON, and a
    // different table key from every other client - mcp_servers
    // rather than mcpServers / servers / context_servers). Schema
    // ref: https://developers.openai.com/codex/mcp.
    //
    // For our payload (just command + args, both strings/arrays of
    // strings) JSON.stringify happens to produce valid TOML literal
    // values, since TOML basic strings use the same double-quote
    // escape rules and TOML inline arrays match JSON array syntax.
    buildMethod: () => 'TOML config',
    buildInstruction: (info) => {
      const path = homeConfigPath(
        info.platform,
        '~/.codex/config.toml',
        '%USERPROFILE%\\.codex\\config.toml',
      );
      return `Append this table to ${path}. The same config is shared between the Codex CLI and the Codex IDE extension.`;
    },
    buildSnippet: (info) => `[mcp_servers.open-design]
command = ${JSON.stringify(info.command)}
args = ${JSON.stringify(info.args)}${buildCodexEnvToml(info)}`,
    buildSnippetLang: () => 'toml',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    buildMethod: () => 'One-click install',
    buildInstruction: (info) =>
      `Click "Install in Cursor" to install with an approval dialog, or merge this JSON into ${homeConfigPath(info.platform, '~/.cursor/mcp.json', '%USERPROFILE%\\.cursor\\mcp.json')}.`,
    buildSnippet: buildSharedMcpJson,
    buildSnippetLang: () => 'json',
    buildDeeplink: (info) => {
      const inner = buildMcpStdioServerConfig(info);
      // Cursor expects the inner server-config object base64-encoded
      // as ?config=...; the handler decodes it and pops an approval
      // dialog before writing to mcp.json. We UTF-8-encode first so
      // non-Latin1 chars in paths (e.g. an accented username) do not
      // throw from btoa().
      const encoded = utf8Btoa(JSON.stringify(inner));
      return `cursor://anysphere.cursor-deeplink/mcp/install?name=open-design&config=${encoded}`;
    },
    deeplinkLabel: 'Install in Cursor',
  },
  {
    id: 'vscode',
    label: 'VS Code',
    buildMethod: () => 'JSON config',
    buildInstruction: (info) =>
      `Open the Command Palette (${commandPaletteShortcut(info.platform)}), run "MCP: Open User Configuration", and merge this JSON. Copilot Chat must be in Agent mode for tools to show up.`,
    buildSnippet: (info) => `{
  "servers": {
    "open-design": {
      "type": "stdio",
      "command": ${JSON.stringify(info.command)},
      "args": ${JSON.stringify(info.args)}${info.env && Object.keys(info.env).length > 0 ? `,
      "env": ${JSON.stringify(info.env)}` : ''}
    }
  }
}`,
    buildSnippetLang: () => 'json',
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    buildMethod: () => 'JSON config',
    buildInstruction: () =>
      'In Antigravity: Agent panel "..." menu → MCP Servers → Manage MCP Servers → View raw config. Merge this JSON.',
    buildSnippet: buildSharedMcpJson,
    buildSnippetLang: () => 'json',
  },
  {
    id: 'zed',
    label: 'Zed',
    buildMethod: () => 'JSON config',
    buildInstruction: (info) =>
      `Open Zed Settings (${settingsShortcut(info.platform)}) and merge this into the top-level object. Zed uses "context_servers", not "mcpServers".`,
    buildSnippet: (info) => `{
  "context_servers": {
    "open-design": {
      "source": "custom",
      "command": ${JSON.stringify(info.command)},
      "args": ${JSON.stringify(info.args)}${info.env && Object.keys(info.env).length > 0 ? `,
      "env": ${JSON.stringify(info.env)}` : ''}
    }
  }
}`,
    buildSnippetLang: () => 'json',
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    buildMethod: () => 'JSON config',
    buildInstruction: (info) =>
      `Open ${homeConfigPath(info.platform, '~/.codeium/windsurf/mcp_config.json', '%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json')} (or use the MCPs icon in Cascade → Configure) and merge:`,
    buildSnippet: buildSharedMcpJson,
    buildSnippetLang: () => 'json',
  },
];

function IntegrationsSection() {
  const [clientId, setClientId] = useState<McpClientId>('claude');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [info, setInfo] = useState<McpInstallInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  // The reset is wired through a ref-driven timer rather than effect
  // cleanup so re-clicks during the 2s window restart the countdown.
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!pickerRef.current) return;
      if (!pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  // Pull the absolute paths to node + cli.js from the running daemon
  // so snippets work even when `od` isn't on PATH (the realistic
  // case for source clones, plus macOS/Linux ship a /usr/bin/od that
  // shadows any global install). Fetched on mount; if the daemon is
  // unreachable we surface a clear error instead of a half-built
  // snippet that would silently fail when pasted.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/mcp/install-info')
      .then(async (res) => {
        if (!res.ok) throw new Error(`daemon ${res.status}`);
        return (await res.json()) as McpInstallInfo;
      })
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        setInfoError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setInfoError(String(err && err.message ? err.message : err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const client = MCP_CLIENTS.find((c) => c.id === clientId) ?? MCP_CLIENTS[0]!;
  const snippet = info ? client.buildSnippet(info) : '';
  const snippetLang: 'bash' | 'json' | 'toml' = info
    ? client.buildSnippetLang(info)
    : 'json';

  // Reset the "Copied" badge when the user flips to a different
  // client; otherwise the green check sits there next to a snippet
  // they haven't actually copied.
  useEffect(() => {
    setCopied(false);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, [clientId]);

  const onCopy = async () => {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail under non-secure contexts; the snippet
      // is selectable so the user can still copy manually.
      setCopied(false);
    }
  };

  return (
    <section className="settings-section">
      <div className="section-head">
        <div>
          <h3>MCP server</h3>
          <p className="hint">
            Lets a coding agent in another repo (Claude Code, Cursor,
            VS Code, Antigravity, Zed, Windsurf) read your Open Design
            projects. Use it to pull a design into your app without
            exporting a zip first.
          </p>
        </div>
      </div>

      <div className="settings-about-list" style={{ display: 'block' }}>
        {infoError ? (
          <div
            className="empty-card"
            style={{ marginBottom: 14, color: 'var(--danger-fg, #f88)' }}
          >
            Couldn&rsquo;t reach the local daemon to resolve install paths
            ({infoError}). Make sure Open Design is running, then reopen this
            panel.
          </div>
        ) : null}

        {info && (!info.cliExists || !info.nodeExists) ? (
          <div
            className="empty-card"
            style={{
              marginBottom: 14,
              borderLeft: '3px solid var(--warning-fg, #fbbf24)',
            }}
          >
            <strong>
              {!info.cliExists
                ? 'Build the daemon first.'
                : 'Node binary is missing.'}
            </strong>{' '}
            {info.buildHint ??
              'apps/daemon/dist/cli.js is missing. Run `pnpm --filter @open-design/daemon build` and refresh.'}
          </div>
        ) : null}

        <div
          className="ds-picker"
          ref={pickerRef}
          style={{ marginBottom: 14 }}
        >
          <button
            type="button"
            className={`ds-picker-trigger${pickerOpen ? ' open' : ''}`}
            onClick={() => setPickerOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
          >
            <span className="ds-picker-meta">
              <span className="ds-picker-title">{client.label}</span>
              <span className="ds-picker-sub">
                {info ? client.buildMethod(info) : ''}
              </span>
            </span>
            <Icon
              name="chevron-down"
              size={14}
              className="ds-picker-chevron"
              style={{ transform: pickerOpen ? 'rotate(180deg)' : undefined }}
            />
          </button>
          {pickerOpen ? (
            <div className="ds-picker-popover" role="listbox">
              <div className="ds-picker-list">
                {MCP_CLIENTS.map((c) => {
                  const active = c.id === clientId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`ds-picker-item${active ? ' active' : ''}`}
                      onClick={() => {
                        setClientId(c.id);
                        setPickerOpen(false);
                      }}
                    >
                      <span className="ds-picker-item-text">
                        <span className="ds-picker-item-title">{c.label}</span>
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {info ? c.buildMethod(info) : ''}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {info ? (
          <p style={{ margin: '0 0 10px' }}>{client.buildInstruction(info)}</p>
        ) : null}

        {client.buildDeeplink && info ? (
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="primary"
              onClick={() => {
                // Use a hidden anchor so the cursor:// scheme is
                // handled the same way as a normal link click; some
                // browsers block window.location assignments to
                // unknown schemes from button handlers.
                const url = client.buildDeeplink!(info);
                const a = document.createElement('a');
                a.href = url;
                a.rel = 'noopener noreferrer';
                a.click();
              }}
              disabled={!info.cliExists || !info.nodeExists}
              style={{ padding: '6px 14px', fontSize: 13 }}
            >
              <Icon name="link" size={14} />
              <span style={{ marginLeft: 6 }}>{client.deeplinkLabel}</span>
            </button>
            <span
              style={{
                marginLeft: 10,
                fontSize: 12,
                color: 'var(--fg-2, #9aa0a6)',
              }}
            >
              Cursor pops an approval dialog before writing the config.
            </span>
          </div>
        ) : null}

        <div style={{ position: 'relative' }}>
          <pre
            style={{
              background: 'var(--surface-2, #11141a)',
              color: 'var(--fg-1, #e6e6e6)',
              padding: '12px 14px',
              borderRadius: 8,
              overflowX: 'auto',
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 12,
              lineHeight: 1.55,
              margin: 0,
              userSelect: 'text',
              whiteSpace: snippetLang === 'bash' ? 'pre-wrap' : 'pre',
              wordBreak: snippetLang === 'bash' ? 'break-all' : 'normal',
              minHeight: 60,
            }}
            data-lang={snippetLang}
          >
            <code>
              {snippet ||
                (infoError
                  ? '# resolving paths failed, see the error above'
                  : '# loading install paths from the local daemon…')}
            </code>
          </pre>
          <button
            type="button"
            className="ghost"
            onClick={onCopy}
            disabled={!snippet}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              padding: '4px 10px',
              fontSize: 12,
            }}
            aria-label="Copy MCP configuration snippet"
          >
            <Icon name={copied ? 'check' : 'copy'} size={14} />
            <span style={{ marginLeft: 6 }}>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: 6,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong>Restart your client to pick up the new server.</strong>{' '}
          <span style={{ color: 'var(--text-muted)' }}>
            Most editors only load MCP servers at startup. In Cursor / VS
            Code / Antigravity / Windsurf you can run{' '}
            <code>Developer: Reload Window</code> from the command palette
            instead of a full restart. Zed and Claude Code need a quit and
            reopen.
          </span>
        </div>

        <div style={{ marginTop: 20, lineHeight: 1.55 }}>
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 11,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontWeight: 600,
            }}
          >
            What your agent can do
          </p>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13,
              color: 'var(--text)',
            }}
          >
            <li>
              Read or search any file in a project (HTML, JSX, CSS, JSON,
              SVG, Markdown).
            </li>
            <li>
              Pull a design bundle in one call: the entry file plus every
              CSS variable, component, and font it references.
            </li>
            <li>
              Default to the project and file you have open in Open Design,
              so you can say &ldquo;build this in my app&rdquo; without
              re-stating which design.
            </li>
          </ul>
        </div>

        <p
          style={{
            marginTop: 14,
            fontSize: 12,
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          Open Design must be running for MCP tool calls to succeed. If
          you started your coding agent before opening Open Design,
          restart the agent so it can reach the live daemon.
        </p>
      </div>
    </section>
  );
}

const THEMES: Array<{ value: AppTheme; labelKey: 'settings.themeSystem' | 'settings.themeLight' | 'settings.themeDark' }> = [
  { value: 'system', labelKey: 'settings.themeSystem' },
  { value: 'light', labelKey: 'settings.themeLight' },
  { value: 'dark', labelKey: 'settings.themeDark' },
];

const DEFAULT_ACCENT_COLOR = '#c96442';
const ACCENT_SWATCHES = [
  DEFAULT_ACCENT_COLOR,
  '#2563eb',
  '#7c3aed',
  '#059669',
  '#dc2626',
  '#d97706',
  '#0891b2',
  '#db2777',
] as const;

function AppearanceSection({
  cfg,
  setCfg,
}: {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}) {
  const { t } = useI18n();
  const current = cfg.theme ?? 'system';
  const currentAccent = normalizeAccentColor(cfg.accentColor) ?? DEFAULT_ACCENT_COLOR;

  // Apply the draft theme immediately so the user sees a live preview
  // before hitting Save. SettingsDialog's cleanup reverts this on cancel.
  useLayoutEffect(() => {
    applyAppearanceToDocument({
      theme: current,
      accentColor: cfg.accentColor,
    });
  }, [current, cfg.accentColor]);

  const setAccentColor = (color: string | undefined) => {
    setCfg((c) => ({ ...c, accentColor: color ? normalizeAccentColor(color) ?? c.accentColor : undefined }));
  };

  return (
    <section className="settings-section">
      <div className="section-head">
        <div>
          <h3>{t('settings.appearance')}</h3>
          <p className="hint">{t('settings.appearanceHint')}</p>
        </div>
      </div>
      <div className="seg-control" role="group" aria-label={t('settings.appearance')} style={{ '--seg-cols': THEMES.length } as React.CSSProperties}>
        {THEMES.map(({ value, labelKey }) => (
          <button
            key={value}
            type="button"
            className={'seg-btn' + (current === value ? ' active' : '')}
            aria-pressed={current === value}
            onClick={() => setCfg((c) => ({ ...c, theme: value }))}
          >
            <span className="seg-title">{t(labelKey)}</span>
          </button>
        ))}
      </div>
      <div className="field">
        <span className="field-label">Accent color</span>
        <div className="pet-swatches" role="radiogroup" aria-label="Accent color">
          {ACCENT_SWATCHES.map((color) => {
            const active = currentAccent === color;
            return (
              <button
                key={color}
                type="button"
                className={`pet-swatch${active ? ' active' : ''}`}
                style={{ background: color }}
                aria-label={color === DEFAULT_ACCENT_COLOR ? 'Default accent color' : color}
                aria-checked={active}
                role="radio"
                onClick={() => setAccentColor(color === DEFAULT_ACCENT_COLOR ? undefined : color)}
              />
            );
          })}
          <input
            type="color"
            aria-label="Custom accent color"
            className="pet-swatch-picker"
            value={currentAccent}
            onChange={(e) => setAccentColor(e.target.value)}
          />
        </div>
      </div>
    </section>
  );
}

function NotificationsSection({
  cfg,
  setCfg,
}: {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}) {
  const { t } = useI18n();
  const notif = cfg.notifications ?? DEFAULT_NOTIFICATIONS;
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    () => notificationPermission(),
  );
  const [testStatus, setTestStatus] = useState<ReturnType<typeof testNotificationStatusText> | null>(null);

  const updateNotif = (
    patch: Partial<NonNullable<AppConfig['notifications']>>,
  ) => {
    setCfg((c) => ({
      ...c,
      notifications: { ...DEFAULT_NOTIFICATIONS, ...(c.notifications ?? {}), ...patch },
    }));
  };

  const toggleSound = () => {
    const next = !notif.soundEnabled;
    updateNotif({ soundEnabled: next });
    // Give the user immediate audible feedback when turning the master
    // switch on so they know which sound they're signing up for. Resuming
    // the AudioContext also bakes in their gesture for later auto-plays.
    if (next) playSound(notif.successSoundId);
  };

  const toggleDesktop = async () => {
    if (notif.desktopEnabled) {
      updateNotif({ desktopEnabled: false });
      return;
    }
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted') {
      updateNotif({ desktopEnabled: true });
    } else {
      updateNotif({ desktopEnabled: false });
    }
  };

  const sendTestNotification = async () => {
    const result = await showCompletionNotification({
      status: 'succeeded',
      title: t('notify.successTitle'),
      body: t('notify.successBody'),
    });
    setPermission(notificationPermission());
    setTestStatus(testNotificationStatusText(result));
  };

  return (
    <section className="settings-section">
      <div className="section-head">
        <div>
          <h3>{t('settings.notifications')}</h3>
          <p className="hint">{t('settings.notificationsHint')}</p>
        </div>
      </div>

      <div className="settings-subsection">
        <div className="section-head">
          <div>
            <h4>{t('settings.notifyCompletionSound')}</h4>
            <p className="hint">{t('settings.notifyCompletionSoundHint')}</p>
          </div>
        </div>
        <div className="seg-control" role="group" aria-label={t('settings.notifyCompletionSound')} style={{ '--seg-cols': 1 } as React.CSSProperties}>
          <button
            type="button"
            className={'seg-btn' + (notif.soundEnabled ? ' active' : '')}
            aria-pressed={notif.soundEnabled}
            onClick={toggleSound}
          >
            <span className="seg-title">{notif.soundEnabled ? t('common.active') : t('common.offline')}</span>
          </button>
        </div>

        {notif.soundEnabled ? (
          <>
            <div className="settings-field">
              <label>{t('settings.notifySuccessSound')}</label>
              <div className="seg-control" role="group" aria-label={t('settings.notifySuccessSound')} style={{ '--seg-cols': SUCCESS_SOUNDS.length } as React.CSSProperties}>
                {SUCCESS_SOUNDS.map((sound) => (
                  <button
                    key={sound.id}
                    type="button"
                    className={'seg-btn' + (notif.successSoundId === sound.id ? ' active' : '')}
                    aria-pressed={notif.successSoundId === sound.id}
                    onClick={() => {
                      updateNotif({ successSoundId: sound.id });
                      playSound(sound.id);
                    }}
                  >
                    <span className="seg-title">{t(sound.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-field">
              <label>{t('settings.notifyFailureSound')}</label>
              <div className="seg-control" role="group" aria-label={t('settings.notifyFailureSound')} style={{ '--seg-cols': FAILURE_SOUNDS.length } as React.CSSProperties}>
                {FAILURE_SOUNDS.map((sound) => (
                  <button
                    key={sound.id}
                    type="button"
                    className={'seg-btn' + (notif.failureSoundId === sound.id ? ' active' : '')}
                    aria-pressed={notif.failureSoundId === sound.id}
                    onClick={() => {
                      updateNotif({ failureSoundId: sound.id });
                      playSound(sound.id);
                    }}
                  >
                    <span className="seg-title">{t(sound.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="settings-subsection">
        <div className="section-head">
          <div>
            <h4>{t('settings.notifyDesktop')}</h4>
            <p className="hint">{t('settings.notifyDesktopHint')}</p>
          </div>
        </div>
        <div className="seg-control" role="group" aria-label={t('settings.notifyDesktop')} style={{ '--seg-cols': 1 } as React.CSSProperties}>
          <button
            type="button"
            className={'seg-btn' + (notif.desktopEnabled ? ' active' : '')}
            aria-pressed={notif.desktopEnabled}
            disabled={permission === 'unsupported'}
            onClick={() => { void toggleDesktop(); }}
          >
            <span className="seg-title">{notif.desktopEnabled ? t('common.active') : t('common.offline')}</span>
          </button>
        </div>
        {permission === 'unsupported' ? (
          <p className="hint">{t('settings.notifyDesktopUnsupported')}</p>
        ) : null}
        {permission === 'denied' ? (
          <p className="hint">{t('settings.notifyDesktopBlocked')}</p>
        ) : null}
        {notif.desktopEnabled && permission === 'granted' ? (
          <>
            <button type="button" className="ghost" onClick={() => { void sendTestNotification(); }}>
              {t('settings.notifyTest')}
            </button>
            {testStatus ? <p className="hint" role="status">{t(testStatus)}</p> : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

function testNotificationStatusText(
  result: Awaited<ReturnType<typeof showCompletionNotification>>,
):
  | 'settings.notifyTestSent'
  | 'settings.notifyDesktopBlocked'
  | 'settings.notifyDesktopUnsupported'
  | 'settings.notifyTestFailed' {
  if (result === 'shown') return 'settings.notifyTestSent';
  if (result === 'permission-denied') return 'settings.notifyDesktopBlocked';
  if (result === 'unsupported') return 'settings.notifyDesktopUnsupported';
  return 'settings.notifyTestFailed';
}
