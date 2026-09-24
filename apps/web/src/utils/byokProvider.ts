import type { KnownProvider } from '../state/config';
import type { ApiProtocol, BedrockAuthMode } from '../types';

export function isLocalOllamaBaseUrl(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl);
    const hostname = parsed.hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

/** Bedrock defaults to the API-key (bearer) mode; the profile mode is opt-in. */
export function resolveBedrockAuthMode(
  awsAuthMode: BedrockAuthMode | undefined,
): BedrockAuthMode {
  return awsAuthMode === 'profile' ? 'profile' : 'api_key';
}

/**
 * The AWS profile a Bedrock request should carry: the configured profile when
 * the protocol is Bedrock in profile mode, otherwise empty. Callers send it to
 * the daemon (connection test, model discovery) and omit the API key with it.
 */
export function bedrockActiveProfile(config: {
  apiProtocol?: ApiProtocol | undefined;
  awsAuthMode?: BedrockAuthMode | undefined;
  awsProfile?: string | undefined;
}): string {
  if (config.apiProtocol !== 'bedrock') return '';
  if (resolveBedrockAuthMode(config.awsAuthMode) !== 'profile') return '';
  return (config.awsProfile ?? '').trim();
}

/**
 * Credential fields of a provider request (connection test, model discovery).
 * In Bedrock profile mode the profile travels and the key is dropped, so a
 * leftover bearer never rides along; the explicit SSO sign-in flag is only
 * ever set by the dedicated button, never by a routine test. Shared by the
 * Settings and onboarding surfaces so the two cannot drift.
 */
export function byokRequestCredentials(
  config: {
    apiProtocol?: ApiProtocol | undefined;
    awsAuthMode?: BedrockAuthMode | undefined;
    awsProfile?: string | undefined;
  },
  apiKey: string,
  options: { awsSsoLogin?: boolean } = {},
): { apiKey: string; awsProfile?: string; awsSsoLogin?: true } {
  const awsProfile = bedrockActiveProfile(config);
  if (!awsProfile) return { apiKey };
  return {
    apiKey: '',
    awsProfile,
    ...(options.awsSsoLogin ? { awsSsoLogin: true as const } : {}),
  };
}

export function byokProviderRequiresApiKey(
  protocol: ApiProtocol,
  provider: KnownProvider | undefined,
  baseUrl: string,
  options: { awsAuthMode?: BedrockAuthMode } = {},
): boolean {
  if (provider?.requiresApiKey === false) return false;
  if (protocol === 'ollama' && isLocalOllamaBaseUrl(baseUrl)) return false;
  // Bedrock in AWS-profile mode signs with the credential chain; there is no
  // bearer to collect. The profile itself is validated by the caller.
  if (protocol === 'bedrock' && resolveBedrockAuthMode(options.awsAuthMode) === 'profile') {
    return false;
  }
  return true;
}

/**
 * 每个 API 协议对应的 agent id —— 也就是「设置 → 执行 → API 提供商」里选中一个
 * 协议之后,那一轮的助手消息上记着的 id(`ProjectView` 走
 * `apiProtocolAgentId(config.apiProtocol)` 写上去)。
 *
 * 住在这里而不是 `utils/apiProtocol.ts`:这张表是 BYOK 这一档的**身份**,
 * `runtime/amr-guidance.ts` 要在报错卡上读它,而 `apiProtocol.ts` 会把
 * `providers/openai-compatible` 整条链拖进来 —— amr-guidance 刻意不带运行时依赖
 * (见该文件头注释)。本模块只有 `import type`,运行时是空的。
 */
export const API_PROTOCOL_AGENT_IDS: Record<ApiProtocol, string> = {
  anthropic: 'anthropic-api',
  openai: 'openai-api',
  azure: 'azure-openai-api',
  google: 'google-gemini-api',
  ollama: 'ollama-cloud-api',
  senseaudio: 'senseaudio-api',
  aihubmix: 'aihubmix-api',
  bedrock: 'bedrock-api',
};

/** daemon 模式下那台替 BYOK 跑活的 OpenCode。 */
export const BYOK_OPENCODE_AGENT_ID = 'byok-opencode';

const BYOK_MANAGED_AGENT_IDS: ReadonlySet<string> = new Set<string>([
  BYOK_OPENCODE_AGENT_ID,
  ...Object.values(API_PROTOCOL_AGENT_IDS),
]);

/**
 * 这一轮的 API key 是不是**我们自己**存着、用户能在设置里改的。
 *
 * 这不是一个新的分类维度,而是发送前那道 BYOK 闸门用的同一条线换个读法:
 * `ProjectView` 的 `requiresByokPreflight` 是
 * `mode === 'api' || (mode === 'daemon' && agentId === 'byok-opencode')`,
 * 而 `mode === 'api'` 的一轮落到消息上就是 `API_PROTOCOL_AGENT_IDS` 里的那个 id。
 * 报错卡这一侧手上只有 agentId(`resolveRunFailureUi` 的第三个参数),所以判据也
 * 按 agentId 写 —— 同一档,两处读法一致。
 *
 * `bedrock-api` 同样算数:API key 模式下凭据就是 Bedrock API key,AWS profile
 * 模式下凭据是 profile 名,两者都填在 API 提供商那一屏,所以 key 报错把人送过去是对的。
 *
 * 反过来,`claude` / `codex` / `opencode` / `grok` / `deepseek` 这些本机 CLI **不**
 * 在这一档:它们的登录态在用户自己的终端里(`claude` 报 key 错时自己给的指引就是
 * `/login`),设置页那几个 `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` 是给自建代理用的
 * 进阶覆盖项(`SettingsDialog` 的 `AGENT_CLI_ENV_FIELDS`),不是它们的主登录路径,
 * 而 `opencode` / `kimi` / `qwen` 那一批在那一屏**连一个 key 输入框都没有**。
 */
export function byokApiKeyIsEditableInSettings(
  agentId: string | null | undefined,
): boolean {
  return typeof agentId === 'string' && BYOK_MANAGED_AGENT_IDS.has(agentId);
}
