/**
 * Daemon provider — fetch-based SSE client for /api/runs. The daemon can
 * emit three event streams depending on the agent's streamFormat:
 *   - 'agent'   : typed events emitted by Claude Code's stream-json parser
 *                 (status, text_delta, thinking_delta, tool_use, tool_result,
 *                 usage, raw). We forward these to the UI as AgentEvent items.
 *   - 'stdout'  : plain chunks from other CLIs. We wrap them in a single
 *                 rolling 'text' event.
 *   - 'stderr'  : incidental stderr. Shown only when the process exits
 *                 non-zero (tail appended to the error message).
 */
import type { AgentEvent, ChatCommentAttachment, ChatMessage } from '../types';
import type { AmrEntryAttribution } from '../analytics/amr-attribution';
import type {
  AmrAuthErrorKind,
  AmrAuthNetworkPath,
  AmrAuthStage,
  AmrAuthStageResult,
  AmrAuthStageSource,
} from '@open-design/contracts/analytics';
import type {
  ApiErrorResponse,
  ChatAnalyticsHints,
  ChatRunCreateResponse,
  ChatRunListResponse,
  ChatRunStatus,
  ChatRunStatusResponse,
  ChatRequest,
  ChatSessionMode,
  ChatSseEvent,
  ChatSseStartPayload,
  DaemonAgentPayload,
  AmrModelsResponse,
  AmrWalletSnapshot,
  ByokChatProviderConfig,
  MediaExecutionPolicy,
  ResearchOptions,
  RunCancelOrigin,
  RunContextSelection,
  SseErrorPayload,
  StrategyTaskProjectionV2,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import type { StreamHandlers } from './anthropic';

/**
 * 取消来源的四个合法值。服务端说了才算,说不清就不认 —— UI 把 `user_stop`
 * 当作「人按了停止」的证据,一个没见过的字符串不能冒充它。
 */
const RUN_CANCEL_ORIGINS = new Set<string>([
  'user_stop',
  'project_cleanup',
  'daemon_shutdown',
  'unknown',
]);

function isRunCancelOrigin(value: unknown): value is RunCancelOrigin {
  return typeof value === 'string' && RUN_CANCEL_ORIGINS.has(value);
}
import { workspaceProjectHeaders } from '../state/projects';
import { setRuntimeAmrConsoleOrigin } from '../runtime/amr-guidance';
import { coalescedGet } from '../lib/coalesced-get';
import { currentWorkspaceAccountGeneration } from '../collab/workspace-identity';

/**
 * Returns the front-end carrier that's about to send this request:
 * - 'desktop' when running inside the Electron shell
 * - 'web' when running in a regular browser
 * - 'unknown' in non-browser test environments (jsdom without a UA)
 *
 * The daemon uses this to label telemetry traces. Cheap, called once per
 * run so caching isn't worth the complexity.
 */
function detectClientType(): 'desktop' | 'web' | 'unknown' {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent ?? '';
  if (ua.includes('Electron/')) return 'desktop';
  if (ua) return 'web';
  return 'unknown';
}
import { BackoffController } from '../lib/backoff';
import { parseSseFrame } from './sse';
import {
  summarizeArtifactsForTranscript,
  type PersistedArtifactFileRef,
} from '../artifacts/strip';
import { trackRunProgress, trackRunStart, trackRunTerminal } from '../observability/stuck-run';
import { markUpstreamActivity } from '../runtime/chat/upstream-activity';
import { IN_FLIGHT_TOOL_INPUT_MARKER, IN_FLIGHT_TOOL_OUTPUT_KEY } from '../runtime/tool-events';

const MAX_TRANSCRIPT_MESSAGE_CHARS = 12_000;
const LARGE_TOOL_RESULT_CHARS = 8_000;
const HIGH_INPUT_TOKEN_WARNING_THRESHOLD = 200_000;
const RUN_CREATE_AUTHORITY_RETRY_DELAYS_MS = [500, 1_000, 2_000] as const;
const BYOK_OPENCODE_AGENT_ID = 'byok-opencode';
const API_MODE_AGENT_IDS = new Set([
  'anthropic-api',
  'openai-api',
  'azure-openai-api',
  'google-gemini-api',
  'ollama-cloud-api',
  'senseaudio-api',
  'aihubmix-api',
  'bedrock-api',
]);

export function latestUserPromptFromHistory(history: ChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (message?.role === 'user') return message.content;
  }
  return '';
}

function truncateForTranscript(content: string): string {
  if (content.length <= MAX_TRANSCRIPT_MESSAGE_CHARS) return content;
  const omitted = content.length - MAX_TRANSCRIPT_MESSAGE_CHARS;
  return `${content.slice(0, MAX_TRANSCRIPT_MESSAGE_CHARS)}\n\n[OpenDesign truncated ${omitted} chars from this prior message before sending it to the agent. Full content remains in persisted history.]`;
}

function escapeTranscriptRoleDelimiters(content: string): string {
  return content.replace(/^(## (?:user|assistant)[ \t]*)(\r?)$/gm, '\\$1$2');
}

function compactInput(input: unknown): string {
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function buildPriorRunContextWarning(history: ChatMessage[]): string | null {
  let highestInputTokens = 0;
  let largeToolResults = 0;
  let sawAgentBrowserCoreDump = false;

  for (const message of history) {
    for (const event of message.events ?? []) {
      if (event.kind === 'usage' && typeof event.inputTokens === 'number') {
        highestInputTokens = Math.max(highestInputTokens, event.inputTokens);
      }
      if (event.kind === 'tool_result') {
        if (event.content.length > LARGE_TOOL_RESULT_CHARS) largeToolResults += 1;
        if (
          event.content.includes('agent-browser skills get core') ||
          event.content.includes('Agent Browser Core') ||
          event.content.includes('name: core')
        ) {
          sawAgentBrowserCoreDump = true;
        }
      }
      if (event.kind === 'tool_use') {
        const input = compactInput(event.input);
        if (input.includes('agent-browser skills get core')) {
          sawAgentBrowserCoreDump = true;
        }
      }
    }
  }

  const notes: string[] = [];
  if (highestInputTokens >= HIGH_INPUT_TOKEN_WARNING_THRESHOLD) {
    notes.push(`a previous run reported ${highestInputTokens} input tokens`);
  }
  if (largeToolResults > 0) {
    notes.push(`${largeToolResults} large prior tool result${largeToolResults === 1 ? '' : 's'} exist only in persisted event history`);
  }
  if (sawAgentBrowserCoreDump) {
    notes.push('agent-browser documentation output was seen earlier; do not replay it into this turn');
  }
  if (notes.length === 0) return null;

  return [
    '## context warning',
    `OpenDesign detected ${notes.join(', ')}.`,
    'Keep this turn compact: summarize prior tool output, read large references from temp files, and quote only task-relevant lines.',
  ].join('\n');
}

function scopeHistoryToAgent(history: ChatMessage[], targetAgentId?: string): ChatMessage[] {
  if (!targetAgentId) return history;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (
      message?.role === 'assistant' &&
      message.agentId &&
      !isSameTranscriptAgentFamily(message.agentId, targetAgentId)
    ) {
      return history.slice(i + 1);
    }
  }
  return history;
}

function isSameTranscriptAgentFamily(agentId: string, targetAgentId: string): boolean {
  if (agentId === targetAgentId) return true;
  if (targetAgentId !== BYOK_OPENCODE_AGENT_ID) return false;
  return API_MODE_AGENT_IDS.has(agentId);
}

// Strip OD-specific markup that the agent emitted on a prior turn but
// that the model would otherwise pattern-match as a template to echo.
// Today this is `<question-form>` blocks (and the `<ask-question>` alias the
// UI parser and the daemon open-tag matcher both accept) and the ```json
// fenced schemas
// some models (GPT-OSS-120B Medium, Gemini 3.5 Flash) emit alongside
// them — leaving those literal in the transcript causes weak/medium
// plain-stream models to re-emit an identical form on the user's
// follow-up turn, looking like the discovery form loop never breaks
// (see PR #3157 form-loop investigation). If we only scrubbed the canonical
// tag, an alias-form turn would replay verbatim and re-trigger that loop.
//
// User content is preserved verbatim — a user message that legitimately
// quotes `<question-form>` (e.g. discussing the markup with the agent)
// must not be mangled.
export function sanitizePriorAssistantTurnForTranscript(
  content: string,
  persistedArtifactFiles: ReadonlyArray<PersistedArtifactFileRef> = [],
): string {
  let sanitized = content.replace(
    // `\1` backreference keeps the open/close tag names matched so we never
    // splice across a `<question-form>…</ask-question>` mismatch.
    /<(question-form|ask-question)\b[^>]*>[\s\S]*?<\/\1>/g,
    '[question-form was emitted here on a prior turn; the user already answered, see their reply below.]',
  );
  // Strip ```json (or plain ```) fenced blocks whose body matches the
  // form schema shape — `"questions": [` is the strongest tell. A
  // generic JSON snippet without that key (e.g. an API response the
  // agent shared) is left intact.
  sanitized = sanitized.replace(
    /```(?:json)?\s*\n([\s\S]*?)\n```/g,
    (match, body: string) => {
      if (/"questions"\s*:\s*\[/.test(body)) {
        return '[form schema was echoed here on a prior turn; stripped to avoid a loop.]';
      }
      return match;
    },
  );
  // Replace prior-turn `<artifact>` HTML with a one-line summary — but ONLY
  // for artifacts whose save to the project files is confirmed by the
  // message's producedFiles record. persistArtifact has refusal and
  // write-failure branches; on those paths the transcript copy is the only
  // surviving artifact body, so an unconfirmed block stays verbatim (the
  // 12K truncation below still bounds it) and a follow-up turn can repair it.
  // For confirmed saves the agent reads/edits the file from disk, never from
  // this transcript copy, so re-sending the whole document each turn is pure
  // waste — the summary keeps identifier/title/type plus the saved file name.
  // Runs before truncateForTranscript so the summarized message no longer
  // trips the 12K cap. Uses markdown-aware detection so a literal
  // `<artifact>` recited in a code fence survives.
  sanitized = summarizeArtifactsForTranscript(sanitized, persistedArtifactFiles);
  return sanitized;
}

// producedFiles → the persistence evidence summarizeArtifactsForTranscript
// matches artifact blocks against. producedFiles is the whole per-turn file
// diff — tool-written files included — so a name collision with an unrelated
// same-turn file must not count as proof the <artifact> body was saved. Only
// artifact-originated saves qualify: persistArtifact always writes an explicit
// (non-inferred) manifest, whereas tool-written files surface with no manifest
// or a daemon-inferred one (`metadata.inferred === true`). Within that
// narrowed set, the manifest identifier is the strongest link (it survives
// `-2`/`-3` collision renames); the file name is the fallback for artifact
// saves whose manifest predates identifier metadata.
function persistedArtifactFilesOf(message: ChatMessage): PersistedArtifactFileRef[] {
  return (message.producedFiles ?? [])
    .filter((file) => file.artifactManifest && file.artifactManifest.metadata?.inferred !== true)
    .map((file) => {
      const identifier = file.artifactManifest?.metadata?.identifier;
      return {
        name: file.name,
        identifier: typeof identifier === 'string' && identifier ? identifier : undefined,
      };
    });
}

export function buildDaemonTranscript(history: ChatMessage[], targetAgentId?: string): string {
  const scopedHistory = scopeHistoryToAgent(history, targetAgentId);
  const transcript = scopedHistory
    .map((m) => {
      const trimmed = m.content.trim();
      const sanitized =
        m.role === 'assistant'
          ? sanitizePriorAssistantTurnForTranscript(trimmed, persistedArtifactFilesOf(m))
          : trimmed;
      return `## ${m.role}\n${escapeTranscriptRoleDelimiters(truncateForTranscript(sanitized))}`;
    })
    .join('\n\n');
  const warning = buildPriorRunContextWarning(scopedHistory);
  return warning ? `${warning}\n\n${transcript}` : transcript;
}

/** Build only the turns before the latest user message without text subtraction. */
export function buildDaemonPriorTranscript(
  history: ChatMessage[],
  targetAgentId?: string,
): string {
  let latestUserIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.role === 'user') {
      latestUserIndex = index;
      break;
    }
  }
  return latestUserIndex < 0
    ? buildDaemonTranscript(history, targetAgentId)
    : buildDaemonTranscript(history.slice(0, latestUserIndex), targetAgentId);
}

export interface DaemonStreamHandlers extends StreamHandlers {
  onAgentEvent: (ev: AgentEvent) => void;
  /** Authoritative artifact count from the daemon's terminal run record. */
  onArtifactCount?: (count: number) => void;
  /**
   * SSE 重连的进度。UI(设计稿组件 22)靠它画「正在重新连接 N/5」那一行。
   *
   * 只在**掉线期间**发,恢复就发一条 `cleared` 让调用方把那一行撤掉
   * ——设计稿明说「恢复后整行消失,不留『已恢复』」。
   */
  onReconnect?: (state: DaemonReconnectState) => void;
  /**
   * daemon 把 agent 那一轮重跑了。UI 用它在流水尾部说一行「正在重试 N/M」——
   * 和「正在重新连接」共用组件 22 的形态(交付稿 4058:同一件事不许有第三个说法)。
   *
   * 和 `onReconnect` 一样只在**期间**发,重跑真的接上了就发一条 `cleared`
   * 让调用方撤掉那一行 —— 恢复后整行消失,不留「已恢复」。
   */
  onAgentRetry?: (state: DaemonAgentRetryState) => void;
  /** Codex/agent CLI is reconnecting to its upstream model stream. */
  onAgentReconnect?: (state: DaemonAgentReconnectState) => void;
}

/**
 * 运行层给 UI 的自动重试读数。
 *
 * 和 {@link DaemonReconnectState} 是**两件事**:那一条数的是浏览器 ↔ daemon 的
 * 连接断了几次,这一条数的是 daemon 把 agent 那一轮重跑了第几次。层级不同,
 * 预算也不同(重连 5 次,重试今天 1 次),所以刻意不合并成一个类型 ——
 * 合并了就得靠调用方记住这个 `max` 是哪个 max。
 */
export interface DaemonAgentRetryState {
  /** 第几次自动重试,1 起。逐字取自 `run_retry_attempted.retry_attempt_index`。 */
  attempt: number;
  /** 这一轮的自动重试预算。逐字取自 `retry_max_attempts`(今天是 1)。 */
  max: number;
  /**
   * `retrying` 重跑正在进行 · `cleared` 重跑真的接上了(第二次尝试吐出了第一段
   * 可见输出),把那一行撤掉。
   *
   * 撤的时机刻意不是 `start`:真机 `.od/runs/0e40b819-…` 里第二次尝试的 `start`
   * 在错误后 3.2 秒就到了,而第一个 token 还要再等 30 秒。在 `start` 撤等于那一行
   * 一闪而过,最需要解释的那 30 秒照旧沉默。
   */
  phase: 'retrying' | 'cleared';
}

/** Upstream reconnect progress emitted by an agent runtime (not browser SSE). */
export interface DaemonAgentReconnectState {
  attempt: number;
  max: number;
  phase: 'reconnecting' | 'cleared';
}

/**
 * 传输层给 UI 的重连读数。
 *
 * `attempt` 在**一段掉线**里单调递增,从不倒退 —— 这一点与传输层内部的重连预算
 * 刻意不同:预算看到流上有动静就归零(`shouldResetReconnects`),包括只收到
 * keepalive 注释帧的那种「连上了但什么也没来」。那种情况下预算回到 0,可用户
 * 眼里这条连接一次都没真正恢复过,读数跟着回到 1/5 就是倒退。
 * 所以这里另记一份「掉线段」的计数:只有真正收到**运行事件**才算恢复,
 * 才把它清零并发 `cleared`。
 *
 * `attempt` 因此可能超过 `max`(keepalive 空转会不断续预算)。这是如实上报,
 * 显示层自己夹到 `max`(见 `Reconnect.tsx`),不要在这里造一个假的上限。
 */
export interface DaemonReconnectState {
  /** 本段掉线里的第几次重连尝试,1 起。单调递增。 */
  attempt: number;
  /** 传输层的重连预算(设计稿的「共几次」)。 */
  max: number;
  /**
   * `reconnecting` 还在重试 · `cleared` 不再重连中,把那一行撤掉(流通了、这一轮
   * 已落终态、或改由报错接管)· `exhausted` 预算用尽,自动重连停止,交回给人
   * (组件 22-3)。
   *
   * 用 `cleared` 而不是 `recovered`:设计稿要求「恢复后整行消失,**不留『已恢复』**」,
   * 而这条信号也用在「没恢复但轮到别人说话」的场合,不该自称恢复。
   */
  phase: 'reconnecting' | 'cleared' | 'exhausted';
}

/**
 * 传输层最多重连几次。设计稿的「N/5」就是这个数,导出给 UI 与测试共用,
 * 免得两边各写一个 5。
 */
export const DAEMON_STREAM_RECONNECT_LIMIT = 5;

/**
 * 掉线之后隔多久再试一次 —— 和 `providers/project-events.ts`、`state/projects.ts`
 * 共用 `lib/backoff.ts` 那支退避原语,这条流以前是唯一漏掉退避的。
 *
 * 为什么非等不可,理由不止「别打服务端」:
 *  · 连接被拒的 fetch 大约 1ms 就 reject。不等的话,5 次预算在同一个 tick 里烧光,
 *    合上盖子、切一下 Wi-Fi 这种几秒钟就自愈的抖动会被直接判成不可恢复。
 *  · 交付稿第 82 格那一行「正在重新连接 N/5」是给人读的读数;毫秒内跑完等于没画。
 *
 * 上限压在 8s 而不是共用默认的 30s:预算只有 5 次,更高的天花板只会把「放弃」
 * 推到用户已经走开之后 —— 5 次退避合起来约 9–18s,正好是还愿意等的量级。
 */
const DAEMON_STREAM_RECONNECT_BACKOFF_INITIAL_MS = 700;
const DAEMON_STREAM_RECONNECT_BACKOFF_MAX_MS = 8_000;

/**
 * 一条**开着但一个字节都不来**的流,等多久算它已经死了。
 *
 * 为什么非有不可:浏览器和 daemon 之间永远隔着一层代理(dev 是 `next.config.ts`
 * 的 rewrite,打包版是 `apps/web/sidecar/server.ts` 的 `proxyHttpRequest`)。
 * 本机实测(2026-08-27,Next 16 dev rewrite + 一个可杀的上游):**上游在流中途死掉,
 * 代理会把客户端那条响应一直挂着** —— curl 只在自己 30s 超时才退出,上游死后
 * 27 秒里既没有 EOF 也没有错误。于是 `reader.read()` 既不 resolve 也不 reject,
 * 整个消费循环停在那一行,后面所有重连代码一句都跑不到。用户看到的就是
 * 壳头永远写着「进行中」、既没有重连行也没有报错(真机 2026-08-27)。
 *
 * ── 阈值为什么钉在**心跳**上,而不是「多久没输出」 ────────────────────────
 *
 * 这是这条超时唯一安全的量法。daemon 的 `createSseResponse`
 * (`apps/daemon/src/server.ts`)对**每一条** SSE 挂一个无条件的
 * `setInterval(writeKeepAlive, SSE_KEEPALIVE_INTERVAL_MS)`,25 秒一个注释帧,
 * **与 agent 有没有在吐东西无关**;`/api/runs/:id/events` 正是走它
 * (`runtimes/runs.ts` 的 `stream()`)。所以这里量的是「**这条连接**还活着吗」,
 * 永远不是「**这个 agent** 是不是太慢了」。
 *
 * 这一条区分是硬要求,不是措辞讲究:真机上正常的静默可以很长 —— AMR `session/new`
 * 中位数 26.7 秒,claude 思考静默过 36 秒,codex 有过 274.9 秒零输出。任何按
 * 「多久没有运行事件」计的超时都会把这些正常的慢判成断线,那比现在这个 bug 更糟
 * (误报一条「正在重新连接」会让用户以为是自己的网,还会把真正在跑的一轮打断)。
 * 而它们全都照旧每 25 秒收到一个 keepalive,所以在这条判据下一个都不会中招。
 *
 * 取 3 个心跳(75s)而不是 1 个:单次心跳错过可能只是 GC、调度、代理抖动。
 * 连丢三次没有任何解释能站得住。也仍远小于 5 分钟的卡死看门狗
 * (`observability/stuck-run.ts`),那一条是埋点,不是给用户看的。
 */
const DAEMON_STREAM_IDLE_TIMEOUT_MS = 75_000;

/** 读超时的哨兵,和真正的传输错误分开,免得被当成 AbortError 往外抛。 */
const DAEMON_STREAM_IDLE_TIMEOUT = Symbol('daemon-stream-idle-timeout');

/**
 * 读一帧,但**不许无限等**。
 *
 * 超过 {@link DAEMON_STREAM_IDLE_TIMEOUT_MS} 还没有任何字节到达就返回哨兵,
 * 调用方按「这条连接断了」处理。刻意不 abort 整个 `signal`:断的是这一条连接,
 * 不是这一轮运行 —— 重连循环还要继续用同一个 `signal` 去开下一条。
 */
async function readFrameWithIdleDeadline(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array> | typeof DAEMON_STREAM_IDLE_TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<typeof DAEMON_STREAM_IDLE_TIMEOUT>((resolve) => {
        timer = setTimeout(() => resolve(DAEMON_STREAM_IDLE_TIMEOUT), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * 这份非 2xx 应答,是 **daemon 自己答的**吗?
 *
 * 判据是「有没有人替 daemon 答话」,不是状态码本身 —— 状态码在这里靠不住:
 * 本机实测 Next 16 的 dev rewrite 在上游死掉之后回的是 **500**
 * `Internal Server Error`(text/plain),而打包版那条代理回的是 **502**
 * (`apps/web/sidecar/server.ts:562`)。按状态码开白名单会正好漏掉真机上最常见的那一种。
 *
 * 而 daemon 自己报错永远走 `sendApiError`(`apps/daemon/src/http/api-errors.ts`),
 * 一律是 `res.status(...).json(...)`,body 里必有 `{"error":{"code":...}}` 这个信封。
 * 代理替一个已经死了的 daemon 答话时给不出这个信封 —— 它根本没拿到 daemon 的话。
 *
 * 所以:**有信封 = daemon 答了,它的话是终局的;没信封 = 没人答得上来,这就是掉线。**
 * 这样既不会把 400 / 403 这种「服务端明确拒绝了你」拖进重连(那种重试 5 次也没用,
 * 只会把一句准确的错误换成一句含糊的「连接失败」),也不会把 daemon 自己的 500
 * 误判成掉线。
 */
function daemonAnsweredWithError(bodyText: string): boolean {
  if (!bodyText) return false;
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (!isRecord(parsed)) return false;
    const error = parsed.error;
    return isRecord(error) && typeof error.code === 'string';
  } catch {
    return false;
  }
}

export interface DaemonStreamOptions {
  agentId: string;
  history: ChatMessage[];
  /** Legacy field accepted by older tests/callers. Daemon-owned prompt composition ignores it. */
  systemPrompt?: string;
  /** Stops the current browser-side SSE subscription. The daemon run continues. */
  signal: AbortSignal;
  /** Explicit user cancellation signal. This maps to POST /api/runs/:id/cancel. */
  cancelSignal?: AbortSignal;
  handlers: DaemonStreamHandlers;
  // The active project's id. When supplied, the daemon spawns the agent
  // with cwd = the project folder so its file tools target the right
  // workspace.
  projectId?: string | null;
  conversationId?: string | null;
  sessionMode?: ChatSessionMode;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  clientRequestId?: string | null;
  skillId?: string | null;
  // Per-turn skill ids picked via the composer's @-mention popover. These
  // are layered onto the system prompt for this run only and do not
  // change the project's persistent `skillId`.
  skillIds?: string[];
  designSystemId?: string | null;
  // Project-relative paths the user has staged for this turn. The
  // daemon resolves them inside the project folder, validates they
  // exist, and stitches them into the user message as `@<path>` hints.
  attachments?: string[];
  commentAttachments?: ChatCommentAttachment[];
  // Per-CLI model + reasoning / service tier the user picked in the model menu. These are
  // optional; the daemon validates them against the agent's declared
  // options and falls back to the CLI default when missing.
  model?: string | null;
  reasoning?: string | null;
  serviceTier?: string | null;
  byokProvider?: ByokChatProviderConfig;
  byokMediaDefaults?: ChatRequest['byokMediaDefaults'];
  research?: ResearchOptions;
  context?: RunContextSelection;
  appliedPluginSnapshotId?: string | null;
  mediaExecution?: MediaExecutionPolicy;
  titleGeneration?: { enabled?: boolean };
  locale?: string;
  // The caller's current workspace identity, attached as `x-od-workspace-*`
  // headers on POST /api/runs so the daemon's workspace-resource mutation
  // gate (see `enforceWorkspaceProjectMutation` in
  // `apps/daemon/src/routes/runs.ts`) can tell a team member apart from a
  // headerless caller. Mirrors `workspaceProjectHeaders` usage on every
  // other project write (rename/delete/duplicate/comments/file writes) —
  // omitting it here would make POST /api/runs the one write path that
  // forgets to identify the caller. Null/omitted for signed-out / personal
  // (non-workspace) usage, matching those other call sites.
  workspaceContext?: WorkspaceCollabContext | null;
  initialLastEventId?: string | null;
  onRunStatus?: (status: ChatRunStatus) => void;
  /** Authoritative project-relative artifacts created or modified by the run. */
  onArtifactPaths?: (paths: string[]) => void;
  onRunEventId?: (eventId: string) => void;
  /**
   * 这一轮**被谁取消了**,由 `POST /api/runs/:id/cancel` 的应答如实带回。
   *
   * 只有走这条端点的取消才会拿到 `user_stop` —— 也就是「人按了停止」这件事的
   * 唯一证据。它保留取消来源供持久化、诊断和归因使用;run 的终态展示由
   * AssistantMessage footer 接管,不能再据此追加「已手动暂停任务」独立行 ——
   * `user_stop` 表达的是终止 run,不等于任务进入可继续的 paused 状态。
   *
   * 旧 daemon 不带这个字段时**不发**这条回调 —— 证不出是用户按的就不说是。
   */
  onCancelOrigin?: (origin: RunCancelOrigin) => void;
  // v2 analytics context propagated to run_created / run_finished.
  // Optional; the daemon only consumes these to shape PostHog props
  // (page_name / area / entry_from / DS context). Behavior never
  // depends on them.
  analyticsHints?: ChatAnalyticsHints;
  /** Daemon-issued continuation handle used only for an explicit task reply. */
  taskExecutionId?: string;
  /** Called for the initial Run and every daemon-projected successor Run. */
  onRunCreated?: (runId: string, strategyTask?: StrategyTaskProjectionV2) => void;
  /** Called once the daemon projects the logical strategy task as terminal
   *  (completed / blocked / canceled), with the terminal projection. */
  onStrategyTaskSettled?: (strategyTask: StrategyTaskProjectionV2) => void;
}

export interface DaemonReattachOptions {
  /** Runtime that owns the reattached run, when persisted with its message. */
  agentId?: string;
  runId: string;
  projectId?: string | null;
  conversationId?: string | null;
  workspaceContext?: WorkspaceCollabContext | null;
  signal: AbortSignal;
  cancelSignal?: AbortSignal;
  handlers: DaemonStreamHandlers;
  initialLastEventId?: string | null;
  onRunStatus?: (status: ChatRunStatus) => void;
  onArtifactPaths?: (paths: string[]) => void;
  onRunEventId?: (eventId: string) => void;
  /**
   * 这一轮**被谁取消了**,由 `POST /api/runs/:id/cancel` 的应答如实带回。
   *
   * 只有走这条端点的取消才会拿到 `user_stop` —— 也就是「人按了停止」这件事的
   * 唯一证据。它保留取消来源供持久化、诊断和归因使用;run 的终态展示由
   * AssistantMessage footer 接管,不能再据此追加「已手动暂停任务」独立行 ——
   * `user_stop` 表达的是终止 run,不等于任务进入可继续的 paused 状态。
   *
   * 旧 daemon 不带这个字段时**不发**这条回调 —— 证不出是用户按的就不说是。
   */
  onCancelOrigin?: (origin: RunCancelOrigin) => void;
  /** Publish a current-run success outcome to the app-level upgrade gate. */
  publishRunFinishedEvent?: boolean;
  /** Called when reattach discovers a newer active Run in the same task. */
  onRunCreated?: (runId: string, strategyTask?: StrategyTaskProjectionV2) => void;
  /** Called once the daemon projects the logical strategy task as terminal
   *  (completed / blocked / canceled), with the terminal projection. */
  onStrategyTaskSettled?: (strategyTask: StrategyTaskProjectionV2) => void;
}

export const RUNS_CHANGED_EVENT = 'open-design:runs-changed';
export const DAEMON_RUN_FINISHED_EVENT = 'open-design:daemon-run-finished';

export interface DaemonRunFinishedEventDetail {
  agentId: string;
  runId: string;
  projectId: string;
  conversationId: string;
  result: 'success';
  artifactCount: number;
}

export function publishDaemonRunFinishedEvent(
  detail: DaemonRunFinishedEventDetail,
): void {
  if (
    typeof window === 'undefined'
    || detail.agentId !== 'amr'
    || !detail.runId.trim()
    || !detail.projectId.trim()
    || !detail.conversationId.trim()
    || detail.result !== 'success'
    || !Number.isFinite(detail.artifactCount)
    || detail.artifactCount <= 0
  ) {
    return;
  }
  window.dispatchEvent(new CustomEvent<DaemonRunFinishedEventDetail>(
    DAEMON_RUN_FINISHED_EVENT,
    { detail },
  ));
}

export const GENERIC_DAEMON_DISCONNECT_MESSAGE =
  'daemon stream disconnected before run completed';
export const GENERIC_DAEMON_DISCONNECT_CODE = 'DAEMON_STREAM_DISCONNECTED';

export function createGenericDaemonDisconnectError(): Error & { code: string } {
  const error = new Error(GENERIC_DAEMON_DISCONNECT_MESSAGE) as Error & { code: string };
  error.code = GENERIC_DAEMON_DISCONNECT_CODE;
  return error;
}

/**
 * The DIAGNOSTIC sentence, not the card.
 *
 * What the user reads is now localized copy, resolved from the reason code this
 * error carries: `runtime/amr-guidance.ts` maps the four Runtime State issue
 * codes to `chat.runError.title.agentReplyIncomplete` +
 * `chat.runError.agentReplyIncompleteMessage`, present in all 19 locales.
 * Before that mapping existed this failure fell through to the generic
 * fallback, so the card said "the task failed" and nothing else while the user
 * was looking at their answers and a complete plan.
 *
 * This string stays English on purpose: it lands in the collapsible diagnostic
 * area and in `error.message`, which is engineering-facing surface. It is
 * written to say what the daemon actually refused, without implying the user
 * or the reply was at fault.
 *
 * ⚠️ THE CARD COPY IS STILL A DRAFT — W41's, not product's.
 * `docs/design/run-errors/error-ux-design.md` has no cell for "the agent
 * answered and Open Design could not record the answer". S21, the nearest,
 * covers an empty / malformed / looping model response, which this is not: the
 * reply is complete, readable, and already on screen. Product should rewrite
 * the two locale strings; the routing and the reason codes are settled.
 */
export const STRATEGY_TASK_BLOCKED_MESSAGE =
  "The agent's reply did not carry the machine-readable state Open Design needs "
  + 'to record this step, so the task could not continue.';

/**
 * Hand the user the daemon's OWN verdict on a blocked strategy task.
 *
 * The blocked projection already says why it blocked — `blockedContext`
 * names the gate that refused the turn — and none of it used to leave this
 * function. The user got one subject-less sentence, the card's raw-error view
 * showed `error_code: n/a`, and `resolveRunFailureUi` had nothing to match on,
 * so every gate in the strategy contract rendered the same anonymous card.
 *
 * The turn most often behind it: the user answers a question form, their
 * answers go in, the agent replies — and the reply carries no Runtime State
 * block, so the clarification stage lands terminal-`blocked`. Refusing it is
 * right (the stage admits only `plan_ready`, which needs a Plan Contract the
 * reply never had, `blocked`, or `canceled`), but the user is looking at their
 * answers and a full prose plan while being told, without elaboration, that
 * nothing could continue.
 *
 * The primary reason code rides on `code` — the same channel every other
 * structured daemon failure uses — so the diagnostics text, the failure-UI
 * resolver, and the error analytics can all name the gate. A projection from a
 * daemon too old to send `blockedContext` still fails, just anonymously.
 */
function createStrategyTaskBlockedError(
  strategyTask: StrategyTaskProjectionV2,
): Error & { code?: string } {
  const error = new Error(STRATEGY_TASK_BLOCKED_MESSAGE) as Error & { code?: string };
  const reasonCode = strategyTask.blockedContext?.reasonCodes[0]?.trim();
  if (reasonCode) error.code = reasonCode;
  return error;
}

function notifyRunsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(RUNS_CHANGED_EVENT));
}

function daemonSseErrorMessage(data: SseErrorPayload): string {
  const formattedOpenCodeError = formatOpenCodeSessionError(data.error?.details);
  if (formattedOpenCodeError) return formattedOpenCodeError;

  const message = String(data.error?.message ?? data.message ?? 'daemon error');
  const legacyOpenCodeError = formatLegacyOpenCodeSessionError(message);
  if (legacyOpenCodeError) return legacyOpenCodeError;

  const detail =
    data.error?.details &&
    typeof data.error.details === 'object' &&
    !Array.isArray(data.error.details) &&
    typeof data.error.details.detail === 'string'
      ? data.error.details.detail
      : null;
  if (!detail || detail === message || message.includes(detail)) return message;
  return `${message}\n${detail}`;
}

function daemonSseError(data: SseErrorPayload): Error {
  const error = new Error(daemonSseErrorMessage(data)) as Error & {
    code?: string;
    details?: unknown;
    stderrTail?: string;
  };
  if (data.error?.code) error.code = data.error.code;
  if (data.error?.details !== undefined) error.details = data.error.details;
  // The daemon's own sentence for a failure is frequently generic ("…exited
  // without a terminal result"); the agent's stderr is where the actual cause
  // is. It arrives already bounded and secret-redacted (failureCardStderrTail),
  // so carry it verbatim onto the surfaced error for the failure card's details.
  if (typeof data.stderrTail === 'string' && data.stderrTail.trim()) {
    error.stderrTail = data.stderrTail;
  }
  return error;
}

function shouldSuppressLifecycleExitFallback(
  agentId: string | undefined,
  exitCode: number | null,
  exitSignal: string | null,
  stderrTail: string,
): boolean {
  if (exitCode !== 130 || exitSignal) return false;
  if (agentId === 'amr') return true;
  const normalizedStderr = stderrTail.toLowerCase();
  return (
    normalizedStderr.includes('opencode server listening') ||
    normalizedStderr.includes('opencode_server_password')
  );
}

const AMR_OPENCODE_INCOMPLETE_MESSAGE =
  'OpenDesign started, but the run did not complete. Please retry or check the run details for the session stream error.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readStringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumberField(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBooleanField(record: Record<string, unknown> | null, key: string): boolean | null {
  const value = record?.[key];
  return typeof value === 'boolean' ? value : null;
}

function daemonCreateRunError(response: Response, responseText: string): Error {
  let payload: ApiErrorResponse | null = null;
  try {
    payload = JSON.parse(responseText) as ApiErrorResponse;
  } catch {
    // Older daemons and proxy failures can return plain text.
  }
  const apiError = payload?.error;
  if (!apiError || typeof apiError !== 'object') {
    return new Error(`daemon ${response.status}: ${responseText || 'no body'}`);
  }
  const error = new Error(apiError.message || `OpenDesign service returned ${response.status}`) as Error & {
    code?: string;
    requestId?: string;
    retryable?: boolean;
    status?: number;
  };
  error.status = response.status;
  error.code = apiError.code;
  error.retryable = apiError.retryable === true;
  if (apiError.requestId) error.requestId = apiError.requestId;
  return error;
}

interface OpenCodeSessionErrorDetails {
  source: string | null;
  code: string | null;
  message: string | null;
  statusCode: number | null;
  retryable: boolean | null;
  suggestion: string | null;
  responseBodyPreview: string | null;
}

function inferOpenCodeRetryable(statusCode: number | null): boolean | null {
  if (statusCode === null) return null;
  return statusCode === 429 || statusCode >= 500;
}

function normalizeOpenCodeSessionErrorDetails(value: unknown): OpenCodeSessionErrorDetails | null {
  if (!isRecord(value) || value.kind !== 'opencode_session_error') return null;
  const statusCode = readNumberField(value, 'statusCode');
  return {
    source: readStringField(value, 'source'),
    code: readStringField(value, 'code'),
    message: readStringField(value, 'message'),
    statusCode,
    retryable: readBooleanField(value, 'retryable') ?? inferOpenCodeRetryable(statusCode),
    suggestion: readStringField(value, 'suggestion'),
    responseBodyPreview: readStringField(value, 'responseBodyPreview'),
  };
}

function linkErrorMessageFromResponseBodyPreview(preview: string | null): string | null {
  if (!preview) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(preview);
  } catch {
    return null;
  }
  const error = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : null;
  return readStringField(error, 'message');
}

function retryExhaustedMessage(details: OpenCodeSessionErrorDetails): string | null {
  const linkMessage = linkErrorMessageFromResponseBodyPreview(details.responseBodyPreview);
  if (!linkMessage) return null;
  const retryMatch = linkMessage.match(/\bRetried the upstream request\s+(\d+)\s+times\b/i);
  if (!retryMatch) return null;
  const retryCount = retryMatch[1];
  return [
    'The upstream model service is temporarily unavailable.',
    '',
    `We already retried ${retryCount} times, but the request still failed. Please retry later or switch to another model.`,
  ].join('\n');
}

function formatOpenCodeSessionError(value: unknown): string | null {
  const details = normalizeOpenCodeSessionErrorDetails(value);
  if (!details) return null;
  const statusCode = details.statusCode;
  const message = details.message;
  if (details.source === 'opencode' && details.code === 'ROLE_MARKER_HALLUCINATION') {
    return message;
  }
  if (statusCode === 404) {
    return 'The model service returned 404 Not Found for the configured runtime endpoint. Check the OpenDesign link URL or model route.';
  }
  if (statusCode === 401 || statusCode === 403) {
    return 'OpenDesign authentication failed. Please sign in again or refresh the runtime key.';
  }
  if (statusCode === 429) {
    return 'The model service rejected the request due to quota or rate limits. Retry later or check quota and rate limits.';
  }
  if (typeof statusCode === 'number' && statusCode >= 500) {
    const exhaustedMessage = retryExhaustedMessage(details);
    if (exhaustedMessage) return exhaustedMessage;
    return 'The upstream model provider returned a temporary error. Please retry or switch models.';
  }
  const base = message ? `OpenCode session failed: ${message}` : 'OpenCode session failed.';
  return details.suggestion ? `${base}\n${details.suggestion}` : base;
}

function extractBalancedJsonObject(text: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, i + 1);
    }
  }
  return null;
}

function legacyOpenCodeSessionErrorDetails(text: string): OpenCodeSessionErrorDetails | null {
  const marker = 'opencode session error:';
  const markerIndex = text.toLowerCase().indexOf(marker);
  if (markerIndex === -1) return null;
  const jsonStart = text.indexOf('{', markerIndex + marker.length);
  if (jsonStart === -1) return null;
  const jsonText = extractBalancedJsonObject(text, jsonStart);
  if (!jsonText) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const error = isRecord(parsed.error) ? parsed.error : null;
  const data = isRecord(error?.data) ? error.data : null;
  const statusCode = readNumberField(data, 'statusCode');
  const retryable = readBooleanField(data, 'isRetryable') ?? inferOpenCodeRetryable(statusCode);
  return {
    source: null,
    code: null,
    message: readStringField(data, 'message') ?? readStringField(error, 'message'),
    statusCode,
    retryable,
    suggestion: null,
    responseBodyPreview: readStringField(data, 'responseBodyPreview') ?? readStringField(data, 'responseBody'),
  };
}

function formatLegacyOpenCodeSessionError(text: string): string | null {
  const details = legacyOpenCodeSessionErrorDetails(text);
  if (!details) return null;
  return formatOpenCodeSessionError({
    kind: 'opencode_session_error',
    ...details,
  });
}

function isAmrOpenCodeExitFallback(agentId: string | undefined, stderr: string): boolean {
  if (agentId === 'amr' || agentId === 'opencode') return true;
  const normalized = stderr.toLowerCase();
  return normalized.includes('opencode server listening') || normalized.includes('opencode session error:');
}

function isAmrOpenCodeBootstrapLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^AMR run id:\s*\S+/i.test(trimmed) ||
    /^Performing one time database migration/i.test(trimmed) ||
    /^sqlite-migration:done$/i.test(trimmed) ||
    /^Database migration complete\.?$/i.test(trimmed) ||
    /^Warning:\s*OPENCODE_SERVER_PASSWORD is not set/i.test(trimmed) ||
    /^opencode server listening on http:\/\/127\.0\.0\.1:\d+/i.test(trimmed)
  );
}

function cleanAmrOpenCodeStderrFallback(agentId: string | undefined, stderr: string): string {
  if (!isAmrOpenCodeExitFallback(agentId, stderr)) return stderr.trim();
  return stderr
    .split(/\r?\n/)
    .filter((line) => line.trim() && !isAmrOpenCodeBootstrapLine(line))
    .join('\n')
    .trim();
}

export async function streamViaDaemon({
  agentId,
  history,
  signal,
  cancelSignal,
  handlers,
  projectId,
  conversationId,
  sessionMode,
  userMessageId,
  assistantMessageId,
  clientRequestId,
  skillId,
  skillIds,
  designSystemId,
  attachments,
  commentAttachments,
  model,
  reasoning,
  serviceTier,
  byokProvider,
  byokMediaDefaults,
  research,
  context,
  appliedPluginSnapshotId,
  mediaExecution,
  titleGeneration,
  locale,
  workspaceContext,
  initialLastEventId,
  onRunCreated,
  onRunStatus,
  onArtifactPaths,
  onRunEventId,
  onCancelOrigin,
  analyticsHints,
  taskExecutionId,
  onStrategyTaskSettled,
}: DaemonStreamOptions): Promise<void> {
  const emitRunStatus = (status: ChatRunStatus) => {
    onRunStatus?.(status);
    notifyRunsChanged();
  };
  // Local CLIs are single-turn print-mode programs, so we collapse the whole
  // chat into one string. If this becomes too noisy for long histories, the
  // fix is to only include the final user turn.
  const transcript = buildDaemonTranscript(history, agentId);
  const request: ChatRequest = {
    agentId,
    message: transcript,
    ...(taskExecutionId ? { taskExecutionId } : {}),
    currentPrompt: latestUserPromptFromHistory(history),
    priorTranscript: buildDaemonPriorTranscript(history, agentId),
    projectId: projectId ?? null,
    conversationId: conversationId ?? null,
    sessionMode,
    userMessageId: userMessageId ?? null,
    assistantMessageId: assistantMessageId ?? null,
    clientRequestId: clientRequestId ?? null,
    skillId: skillId ?? null,
    skillIds: Array.isArray(skillIds) ? skillIds : [],
    designSystemId: designSystemId ?? null,
    attachments: attachments ?? [],
    commentAttachments: commentAttachments ?? [],
    model: model ?? null,
    reasoning: reasoning ?? null,
    serviceTier: serviceTier ?? null,
    ...(byokProvider ? { byokProvider } : {}),
    ...(byokMediaDefaults ? { byokMediaDefaults } : {}),
    locale,
    ...(appliedPluginSnapshotId ? { appliedPluginSnapshotId } : {}),
    ...(context ? { context } : {}),
    ...(research ? { research } : {}),
    ...(mediaExecution ? { mediaExecution } : {}),
    ...(titleGeneration?.enabled ? { titleGeneration: { enabled: true } } : {}),
    ...(analyticsHints ? { analyticsHints } : {}),
  };
  const body = JSON.stringify(request);

  try {
    let createResp: Response;
    for (let attempt = 0; ; attempt += 1) {
      createResp = await fetch('/api/runs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Tells the daemon which front-end carrier started the run so the
          // telemetry trace can be tagged 'client:desktop' vs 'client:web'.
          // The daemon falls back to a User-Agent sniff when this header is
          // absent (e.g. third-party clients), so omitting it in tests is OK.
          'X-OD-Client': detectClientType(),
          // Identifies the caller's workspace to the daemon's workspace-resource
          // mutation gate (see `enforceWorkspaceProjectMutation` in
          // apps/daemon/src/routes/runs.ts) — without it, a team member's own
          // run on a team-bound project 401s exactly like an unauthenticated
          // caller's would. Omitted (headers stay absent) for signed-out /
          // personal usage, matching every other workspace-gated write.
          ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
        },
        body,
      });
      if (createResp.ok) break;

      const errorBody = await createResp.clone().json().catch(() => null) as ApiErrorResponse | null;
      const error = errorBody?.error;
      const retryableAuthorityOutage =
        createResp.status === 503
        && error?.code === 'WORKSPACE_AUTHORITY_UNAVAILABLE'
        && error.retryable === true;
      const delayMs = RUN_CREATE_AUTHORITY_RETRY_DELAYS_MS[attempt];
      if (!retryableAuthorityOutage || delayMs === undefined || cancelSignal?.aborted) break;
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      if (cancelSignal?.aborted) return;
    }

    if (!createResp.ok) {
      const text = await createResp.text().catch(() => '');
      emitRunStatus('failed');
      handlers.onError(daemonCreateRunError(createResp, text));
      return;
    }

    const created = (await createResp.json()) as ChatRunCreateResponse;
    const runId = created.runId;
    if (created.strategyTask) onRunCreated?.(runId, created.strategyTask);
    else onRunCreated?.(runId);
    // Start the stuck-run watchdog. trackRunProgress is called inside the
    // SSE consumer below on every event; trackRunTerminal fires when the
    // stream resolves to a terminal state (or errors out).
    trackRunStart(runId, {
      agent_id: agentId,
      project_id: projectId ?? undefined,
      conversation_id: conversationId ?? undefined,
      client_type: detectClientType(),
    });
    notifyRunsChanged();
    emitRunStatus('queued');
    await consumeDaemonRun({
      agentId,
      runId,
      signal,
      cancelSignal,
      handlers,
      initialLastEventId,
      onRunStatus: emitRunStatus,
      onArtifactPaths,
      onRunEventId,
      onCancelOrigin,
      projectId,
      conversationId,
      workspaceContext,
      publishRunFinishedEvent: true,
      onRunCreated,
      onStrategyTaskSettled,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    emitRunStatus('failed');
    handlers.onError(err instanceof Error ? err : new Error(String(err)));
  }
}

export async function reattachDaemonRun(options: DaemonReattachOptions): Promise<void> {
  await consumeDaemonRun({
    ...options,
    onRunStatus: (status) => {
      options.onRunStatus?.(status);
      notifyRunsChanged();
    },
  });
}

export async function fetchChatRunStatus(
  runId: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<ChatRunStatusResponse | null> {
  try {
    const resp = await fetch(`/api/runs/${encodeURIComponent(runId)}`, {
      ...(workspaceContext
        ? { headers: workspaceProjectHeaders(workspaceContext) }
        : {}),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as ChatRunStatusResponse;
  } catch {
    return null;
  }
}

// PR #3157: Antigravity's auth banner can offer a one-click "open
// system terminal with agy" button. The daemon endpoint spawns
// osascript / x-terminal-emulator / `cmd /c start` for the user; on
// success the new Terminal window pops up with agy running and the
// browser opens for OAuth. The Promise resolves once the daemon kicks
// off the spawn (not when OAuth completes), so the UI can disable the
// button momentarily and then re-enable for a retry click after the
// user finishes in the terminal.
export interface LaunchAntigravityOauthResult {
  ok: boolean;
  platform?: string;
  via?: string;
  error?: string;
}
export async function launchAntigravityOauth(): Promise<LaunchAntigravityOauthResult> {
  try {
    const resp = await fetch('/api/agents/antigravity/oauth-launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = (await resp.json().catch(() => null)) as
      | LaunchAntigravityOauthResult
      | null;
    if (!resp.ok) {
      return {
        ok: false,
        error:
          body?.error ?? `daemon returned ${resp.status} ${resp.statusText}`,
      };
    }
    return body ?? { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface VelaUser {
  id: string;
  email: string;
  name?: string;
  image?: string | null;
  plan?: string;
  /** Wallet balance (USD, string) from the live `/api/v1/me` projection; `null` when unknown. */
  balanceUsd?: string | null;
}

/**
 * Format a raw wallet `balanceUsd` string (e.g. "12.3") into a display string
 * (e.g. "$12.30"). Returns `null` when the balance is unknown/unparseable so
 * callers can simply hide the balance area.
 */
export function formatVelaBalanceUsd(raw?: string | null): string | null {
  if (raw == null || raw === '') return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return null;
  // Sign before the currency symbol: an overdrawn wallet reads "-$1.25",
  // never the malformed "$-1.25".
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

/** Top subscription tier — no upgrade affordance is shown at/above this. */
export const VELA_TOP_PLAN_TIER = 'max';

/**
 * Whether to surface an "Upgrade" affordance for the given plan tier. True for
 * a KNOWN tier below the top (free/plus/pro); false at the top tier AND when
 * the plan is unknown. The unknown case matters: a signed-in session whose live
 * billing summary has not resolved yet has no plan, and treating that as
 * upgradeable would flash an Upgrade CTA at top-tier users until billing loads.
 */
export function canUpgradeVelaPlan(plan?: string | null): boolean {
  const normalized = plan?.trim().toLowerCase();
  if (!normalized) return false;
  return normalized !== VELA_TOP_PLAN_TIER;
}

/**
 * Live billing projection (plan tier + wallet balance) for the signed-in
 * account, surfaced on its OWN field rather than on {@link VelaUser} so
 * env-backed sessions (where `user` is null) can show plan/balance without a
 * fabricated identity. Absent means unknown → hide the fields.
 */
export interface VelaLiveAccount {
  plan?: string;
  balanceUsd?: string | null;
}

export interface VelaLoginStatus {
  loggedIn: boolean;
  sessionState?: import('@open-design/contracts').AmrSessionState;
  credentialRevision?: string;
  loginInFlight?: boolean;
  profile: string;
  user: VelaUser | null;
  account?: VelaLiveAccount;
  configPath: string;
  // Device-authorization details parsed from `vela login` output while a login
  // is in flight, so the UI can offer a manual sign-in link when the browser
  // did not auto-open. See parseVelaLoginActivation in the daemon's vela.ts.
  activationUrl?: string;
  userCode?: string;
  browserOpenFailed?: boolean;
  // Origin of the vela web console this runtime talks to, when the daemon was
  // given one (OD_VELA_WEB_URL, baked into packaged builds from a CI secret).
  // The client builds wallet / plans / upgrade links from it; internal AMR
  // environments therefore need no hostname literal in this public bundle.
  // Absent for prod and fork builds.
  consoleOrigin?: string;
  authAttemptId?: string;
  authStages?: VelaLoginAuthStage[];
  authRoute?: AmrAuthNetworkPath;
  fallbackUsed?: boolean;
}

export interface VelaLoginAuthStage {
  sequence: number;
  stage: AmrAuthStage;
  result: AmrAuthStageResult;
  source: AmrAuthStageSource;
  occurredAt: string;
  route: AmrAuthNetworkPath;
  errorKind?: AmrAuthErrorKind;
}

// AMR (vela) login surfaces three thin endpoints on the daemon:
//   GET  /api/integrations/vela/status   — read ~/.amr/config.json projection
//   POST /api/integrations/vela/login    — spawn `vela login` (vela opens browser itself)
//   POST /api/integrations/vela/login/cancel — terminate a still-pending login
//   POST /api/integrations/vela/logout   — clear ~/.amr auth and Settings-backed AMR auth env
// The Settings UI polls /status after kicking off /login to detect completion.
/** One `/api/integrations/vela/status` response, before any owner interprets it. */
export interface VelaLoginStatusRead {
  readonly ok: boolean;
  readonly httpStatus: number;
  /** Parsed JSON body, or `null` when the response carried none. */
  readonly body: unknown;
}

/**
 * The ONE transport read of the AMR status projection.
 *
 * Three independent owners ask the daemon this same question on a cold open,
 * and none of them can drop its read: `App` drives analytics identity and the
 * model refresh, `MessageCenter` drives its signed-in/anonymous message split,
 * `ChatPane` drives the inline sign-in pill. Measured on one cold conversation
 * open they produced SEVEN requests — three, two and two, each owner's effect
 * replayed while the previous request was still open.
 *
 * So they share the request, not the state: this returns the raw response and
 * every owner keeps its own mapping (see `fetchVelaLoginStatus` and
 * `isAmrLoggedIn`, which disagree about what a non-ok status means).
 *
 * SINGLE-FLIGHT ONLY (ttl 0). Nothing is retained once a read settles, so no
 * caller can ever be handed a projection it did not itself trigger — this can
 * only remove a request the browser would have opened concurrently with an
 * identical one. That matters here: `refresh: true` exists precisely to make
 * the daemon re-probe after the user returned from the browser sign-in, and a
 * shared settled answer would defeat it. It cannot, because `?refresh=1` is a
 * different URL and therefore a different key.
 *
 * The key also carries the account generation. This endpoint sends no Workspace
 * headers — it is an ACCOUNT-level projection of `~/.amr/config.json` — so the
 * account boundary IS its scope. A sign-out/sign-in leaves the URL identical
 * while the authority behind it changed, and ttl 0 does not catch that: it
 * stops settled-result reuse, not a post-boundary reader joining a request
 * issued before the boundary. Captured once, up front, before any await.
 */
export function readVelaLoginStatus(
  options: { refresh?: boolean } = {},
): Promise<VelaLoginStatusRead> {
  const query = options.refresh ? '?refresh=1' : '';
  const url = `/api/integrations/vela/status${query}`;
  const accountGeneration = currentWorkspaceAccountGeneration();
  return coalescedGet(
    `vela-login-status:${accountGeneration}:${url}`,
    async (): Promise<VelaLoginStatusRead> => {
      const resp = await fetch(url, { cache: 'no-store' });
      const body = await resp.json().catch(() => null);
      return { ok: resp.ok, httpStatus: resp.status, body };
    },
    // ttl 0 — join an open request, retain nothing after it settles.
    0,
  );
}

export async function fetchVelaLoginStatus(options: { refresh?: boolean } = {}): Promise<VelaLoginStatus | null> {
  try {
    const read = await readVelaLoginStatus(options);
    if (!read.ok) return null;
    const status = read.body as VelaLoginStatus;
    // Every AMR status read refreshes the runtime console origin, so the console
    // links stay correct no matter which surface (login pill, model switcher,
    // avatar menu, low-balance dialog) triggered the fetch. Doing it here rather
    // than in each caller is what keeps the origin out of web source: no caller
    // needs to know the hostname of the environment it is pointed at.
    setRuntimeAmrConsoleOrigin(status.consoleOrigin);
    return status;
  } catch {
    return null;
  }
}

export async function fetchAmrWalletSnapshot(options: { refresh?: boolean } = {}): Promise<AmrWalletSnapshot | null> {
  try {
    const query = options.refresh ? '?refresh=1' : '';
    const resp = await fetch(`/api/integrations/vela/wallet${query}`, { cache: 'no-store' });
    if (!resp.ok) return null;
    return (await resp.json()) as AmrWalletSnapshot;
  } catch {
    return null;
  }
}

export async function fetchAmrModels(): Promise<AmrModelsResponse | null> {
  try {
    const resp = await fetch('/api/amr/models', { cache: 'no-store' });
    if (!resp.ok) return null;
    return (await resp.json()) as AmrModelsResponse;
  } catch {
    return null;
  }
}

export interface StartVelaLoginResult {
  ok: boolean;
  status: number;
  pid?: number;
  alreadyRunning?: boolean;
  error?: string;
  authAttemptId?: string;
  authStages?: VelaLoginAuthStage[];
  authRoute?: AmrAuthNetworkPath;
  fallbackUsed?: boolean;
}

export async function startVelaLogin(
  attribution?: AmrEntryAttribution | null,
  odDeviceId?: string | null,
  authAttemptId?: string,
): Promise<StartVelaLoginResult> {
  try {
    const loginAttribution =
      attribution && odDeviceId ? { ...attribution, odDeviceId } : attribution;
    const canonicalAuthAttemptId = authAttemptId
      && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(authAttemptId)
      ? authAttemptId
      : null;
    const authRequestId = authAttemptId
      && /^pending-amr-auth-[a-z0-9]+-[a-z0-9]+$/.test(authAttemptId)
      ? authAttemptId
      : null;
    const payload = {
      ...(loginAttribution ? { attribution: loginAttribution } : {}),
      ...(canonicalAuthAttemptId ? { authAttemptId: canonicalAuthAttemptId } : {}),
      ...(authRequestId ? { authRequestId } : {}),
    };
    const resp = await fetch('/api/integrations/vela/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await resp.json().catch(() => null)) as Omit<
      StartVelaLoginResult,
      'ok' | 'status' | 'alreadyRunning'
    > | null;
    if (resp.ok) {
      return { ok: true, status: resp.status, ...(body ?? {}) };
    }
    return {
      ok: false,
      status: resp.status,
      alreadyRunning: resp.status === 409,
      error: body?.error ?? '',
      ...(body?.authAttemptId ? { authAttemptId: body.authAttemptId } : {}),
      ...(body?.authStages ? { authStages: body.authStages } : {}),
      ...(body?.authRoute ? { authRoute: body.authRoute } : {}),
      ...(body?.fallbackUsed !== undefined
        ? { fallbackUsed: body.fallbackUsed }
        : {}),
    };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function cancelVelaLogin(
  authAttemptId?: string,
): Promise<{ ok: boolean; canceled?: boolean }> {
  const hasTarget = authAttemptId !== undefined;
  const canonicalAuthAttemptId = authAttemptId
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(authAttemptId)
    ? authAttemptId
    : null;
  const authRequestId = authAttemptId
    && /^pending-amr-auth-[a-z0-9]+-[a-z0-9]+$/.test(authAttemptId)
    ? authAttemptId
    : null;
  if (hasTarget && !canonicalAuthAttemptId && !authRequestId) {
    return { ok: false };
  }
  try {
    const resp = await fetch('/api/integrations/vela/login/cancel', {
      method: 'POST',
      ...(hasTarget
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(canonicalAuthAttemptId
              ? { authAttemptId: canonicalAuthAttemptId }
              : { authRequestId }),
          }
        : {}),
    });
    if (!resp.ok) return { ok: false };
    const body = (await resp.json().catch(() => null)) as { canceled?: boolean } | null;
    return { ok: true, canceled: body?.canceled };
  } catch {
    return { ok: false };
  }
}

export async function velaLogout(): Promise<{ ok: boolean }> {
  try {
    const resp = await fetch('/api/integrations/vela/logout', { method: 'POST' });
    return { ok: resp.ok };
  } catch {
    return { ok: false };
  }
}

// Forwards the user's assistant-turn rating to the daemon so it can emit
// a Langfuse `score-create`. Fire-and-forget — failures are not surfaced
// to the UI (the rating is already persisted on the message itself via
// the PUT /messages/:id round-trip).
export async function reportChatRunFeedback(req: {
  runId: string;
  rating: 'positive' | 'negative';
  reasonCodes: string[];
  hasCustomReason: boolean;
  customReason: string;
}, workspaceContext?: WorkspaceCollabContext | null): Promise<void> {
  try {
    const { runId, ...feedback } = req;
    await fetch(`/api/runs/${encodeURIComponent(runId)}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
      },
      body: JSON.stringify(feedback),
    });
  } catch {
    // Best-effort.
  }
}

/**
 * B11 「引导对话」 — push one more user message into the turn that is STILL
 * running, instead of stopping it and resending.
 *
 * Deliberately NOT fire-and-forget: unlike a rating, a dropped steer means the
 * model never heard the user, so the caller has to know. A refusal comes back
 * as a typed daemon error code (`RUN_STEERING_UNSUPPORTED` when the agent's CLI
 * closes stdin with the prompt, `RUN_STEERING_CLOSED` when this turn already
 * stopped reading) so the UI can say which one it was instead of "failed".
 */
export async function steerChatRun(
  req: { runId: string; text: string },
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<
  | { ok: true; messageId: string }
  | { ok: false; code: string; message: string }
> {
  let response: Response;
  try {
    response = await fetch(`/api/runs/${encodeURIComponent(req.runId)}/steer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
      },
      body: JSON.stringify({ text: req.text }),
    });
  } catch (err) {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: err instanceof Error ? err.message : String(err),
    };
  }
  const body = await response.json().catch(() => null) as
    | { messageId?: string; error?: { code?: string; message?: string } }
    | null;
  if (!response.ok) {
    return {
      ok: false,
      code: body?.error?.code ?? `HTTP_${response.status}`,
      message: body?.error?.message ?? 'steering failed',
    };
  }
  return { ok: true, messageId: body?.messageId ?? '' };
}

export async function listActiveChatRuns(
  projectId: string,
  conversationId: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<ChatRunStatusResponse[]> {
  try {
    const qs = new URLSearchParams({ projectId, conversationId, status: 'active' });
    const resp = await fetch(`/api/runs?${qs.toString()}`, {
      ...(workspaceContext
        ? { headers: workspaceProjectHeaders(workspaceContext) }
        : {}),
    });
    if (!resp.ok) return [];
    const body = (await resp.json()) as ChatRunListResponse;
    return body.runs ?? [];
  } catch {
    return [];
  }
}

export async function listProjectRuns(
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<ChatRunStatusResponse[]> {
  try {
    const resp = await fetch('/api/runs', {
      ...(workspaceContext
        ? { headers: workspaceProjectHeaders(workspaceContext) }
        : {}),
    });
    if (!resp.ok) return [];
    const body = (await resp.json()) as ChatRunListResponse;
    return body.runs ?? [];
  } catch {
    return [];
  }
}

/**
 * One project's runs plus the awaiting-input flag the run bodies cannot carry.
 *
 * Scoped to a single project ON PURPOSE. The catalogue-wide `listProjectRuns`
 * above 400s (`PROJECT_SCOPE_REQUIRED`) the moment any run belongs to a
 * workspace-bound project — which, in a workspace session, is all of them — so
 * it silently returns `[]` there. Asking per project id takes the route's
 * authorized branch instead and actually works.
 *
 * Returns `null` when the project is unreadable or the daemon is unreachable,
 * so a caller can tell "no runs" apart from "could not ask".
 */
export async function listRunsForProject(
  projectId: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<{ runs: ChatRunStatusResponse[]; awaitingInputProjectIds: string[] } | null> {
  try {
    const resp = await fetch(`/api/runs?projectId=${encodeURIComponent(projectId)}`, {
      ...(workspaceContext
        ? { headers: workspaceProjectHeaders(workspaceContext) }
        : {}),
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as ChatRunListResponse;
    return {
      runs: body.runs ?? [],
      // Absent on daemons older than this field; treat as "no pending
      // question" rather than failing the whole read.
      awaitingInputProjectIds: body.awaitingInputProjectIds ?? [],
    };
  } catch {
    return null;
  }
}

interface DaemonPhysicalRunResult {
  nextRunId?: string;
  strategyTask?: StrategyTaskProjectionV2;
}

async function consumeDaemonRun(options: DaemonReattachOptions): Promise<void> {
  let runId = options.runId;
  let initialLastEventId = options.initialLastEventId;
  let taskText = '';
  const visited = new Set<string>();
  const taskHandlers: DaemonStreamHandlers = {
    ...options.handlers,
    onDelta: (delta) => {
      taskText += delta;
      options.handlers.onDelta(delta);
    },
    onDone: () => options.handlers.onDone(taskText),
  };
  while (true) {
    if (visited.has(runId)) {
      options.onRunStatus?.('failed');
      options.handlers.onError(new Error('daemon returned a cyclic strategy task Run chain'));
      return;
    }
    visited.add(runId);
    const result = await consumeDaemonPhysicalRun({
      ...options,
      handlers: taskHandlers,
      runId,
      initialLastEventId,
    });
    if (!result?.nextRunId) return;
    runId = result.nextRunId;
    initialLastEventId = null;
    trackRunStart(runId, {
      agent_id: options.agentId,
      project_id: options.projectId ?? undefined,
      conversation_id: options.conversationId ?? undefined,
      client_type: detectClientType(),
    });
    options.onRunCreated?.(runId, result.strategyTask);
  }
}

async function consumeDaemonPhysicalRun({
  agentId,
  runId,
  signal,
  cancelSignal,
  handlers,
  initialLastEventId,
  onRunStatus,
  onArtifactPaths,
  onRunEventId,
  onCancelOrigin,
  projectId,
  conversationId,
  workspaceContext,
  publishRunFinishedEvent,
  onStrategyTaskSettled,
}: DaemonReattachOptions): Promise<DaemonPhysicalRunResult | void> {
  let acc = '';
  /*
   * 流水尾部那一行「正在重试」此刻是不是挂着的。
   *
   * 放在这一层(而不是每条连接的读循环里)是因为它要**跨传输层重连**活着:
   * 重跑期间连接如果抖了一下,重连回来接着读的还是同一轮的同一次重试,那一行
   * 不该因为换了条 TCP 就凭空消失或者重复宣告一次。
   */
  let agentRetryPending = false;
  let agentReconnectPending = false;
  let stderrBuf = '';
  let exitCode: number | null = null;
  let exitSignal: string | null = null;
  let endStatus: ChatRunStatus | null = null;
  let endStrategyTask: StrategyTaskProjectionV2 | undefined;
  let pendingStructuredError: Error | null = null;
  // Tracks whether the server explicitly declared `status: 'succeeded'` in
  // the SSE end payload (or via the fallback run-status fetch). Distinct
  // from `endStatus === 'succeeded'`, which can be a local fallback when
  // the SSE end event omits or sends an invalid `status` field. Only the
  // explicit declaration is allowed to bypass the exit-code/signal safety
  // net below — a missing-status fallback keeps the old behavior so a
  // failure response with `{code:1}` or `{code:null,signal:"SIGTERM"}` and
  // no `status` field still surfaces an error banner.
  let serverDeclaredSuccess = false;
  // Set when the daemon reports this terminal failure can be recovered by
  // resuming the agent's CLI session (transient upstream drop / inactivity on
  // a session-resuming runtime). Carried onto the surfaced error so the chat
  // can offer a Continue affordance. See ChatRunStatusResponse.resumable.
  let endResumable = false;
  // Daemon failure classification carried onto the surfaced error so the chat's
  // error card can name a specific failure type + fix (see resolveRunFailureUi).
  // Sourced from the run-status fetch on the error frame and from the SSE `end`
  // frame — both mirror the same finalize-time classification.
  let endFailureCategory: ChatRunStatusResponse['failureCategory'] = null;
  let endFailureDetail: ChatRunStatusResponse['failureDetail'] = null;
  // The daemon's VERDICT on the same failure — what the user should do, and
  // whether re-running can help at all. Tracked separately from the
  // classification above because the card's button hangs off it: without these
  // the chat could only re-derive retryability from the detail NAME, and its
  // table disagreed with the daemon on forty-odd causes the daemon had already
  // ruled futile. `undefined` means the daemon said nothing (an older build, or
  // a run it never classified) and must stay distinguishable from a verdict of
  // `false`, which is why neither starts at `null`.
  let endFailureAction: ChatRunStatusResponse['failureAction'] | undefined;
  let endRetryable: boolean | undefined;
  let resolvedArtifactCount: number | undefined;
  const reportArtifactCount = (value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return;
    resolvedArtifactCount = value;
    handlers.onArtifactCount?.(value);
  };
  const reportArtifactPaths = (value: unknown) => {
    if (!Array.isArray(value)) return;
    const paths = value.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
    onArtifactPaths?.([...new Set(paths)]);
  };
  let lastEventId: string | null = initialLastEventId ?? null;
  let canceled = false;
  const cancelRun = () => {
    if (canceled) return;
    canceled = true;
    void fetch(`/api/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
      ...(workspaceContext
        ? { headers: workspaceProjectHeaders(workspaceContext) }
        : {}),
    })
      .then(async (resp) => {
        // 读应答而不是「我发了这个请求所以一定是用户按的」:这一层不替服务端
        // 下结论。服务端说不出来(旧 daemon、失败、非 200)就什么都不报,
        // 那一行于是不画 —— 宁可少说一句,不可谎报。
        if (!resp.ok) return;
        const body = (await resp.json()) as { run?: { cancelOrigin?: unknown } };
        const origin = body?.run?.cancelOrigin;
        if (isRunCancelOrigin(origin)) onCancelOrigin?.(origin);
      })
      .catch(() => {});
  };

  /**
   * 掉线段的重连读数 —— **只服务 UI,不参与任何重连决策**(决策仍由下面循环里的
   * `reconnects` 预算说了算)。0 = 此刻没在掉线,那一行不该在屏幕上。
   * 为什么要单独记一份而不是直接把 `reconnects` 抛出去:见 DaemonReconnectState。
   */
  let reconnectAttempt = 0;
  const reconnectBackoff = new BackoffController({
    initialMs: DAEMON_STREAM_RECONNECT_BACKOFF_INITIAL_MS,
    maxMs: DAEMON_STREAM_RECONNECT_BACKOFF_MAX_MS,
    factor: 2,
    jitter: true,
  });
  const emitReconnect = (phase: DaemonReconnectState['phase']): void => {
    handlers.onReconnect?.({
      attempt: reconnectAttempt,
      max: DAEMON_STREAM_RECONNECT_LIMIT,
      phase,
    });
  };
  /** 一次连接没能带回运行事件:读数 +1,把那一行推给 UI。 */
  const noteReconnectAttempt = (): void => {
    reconnectAttempt += 1;
    emitReconnect('reconnecting');
  };
  /** 不再重连中:撤掉那一行、读数归零。从没显示过就什么也不发。 */
  const clearReconnect = (): void => {
    reconnectBackoff.reset();
    if (reconnectAttempt === 0) return;
    reconnectAttempt = 0;
    emitReconnect('cleared');
  };

  /**
   * 睡到下一次重连。取消信号一到就立刻醒 —— 否则用户按了停止,还要陪这一觉睡完
   * 才看得到反应。
   */
  const waitBeforeReconnect = async (): Promise<void> => {
    const delay = reconnectBackoff.nextDelay();
    if (!(delay > 0) || cancelSignal?.aborted || signal?.aborted) return;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cancelSignal?.removeEventListener('abort', finish);
        signal?.removeEventListener('abort', finish);
        resolve();
      };
      const timer = setTimeout(finish, delay);
      cancelSignal?.addEventListener('abort', finish, { once: true });
      signal?.addEventListener('abort', finish, { once: true });
    });
  };

  cancelSignal?.addEventListener('abort', cancelRun, { once: true });
  try {
    if (cancelSignal?.aborted) {
      cancelRun();
      return;
    }

    for (let reconnects = 0; endStatus === null && reconnects < DAEMON_STREAM_RECONNECT_LIMIT;) {
      const qs = lastEventId ? `?after=${encodeURIComponent(lastEventId)}` : '';
      let resp: Response;
      try {
        resp = await fetch(`/api/runs/${encodeURIComponent(runId)}/events${qs}`, {
          method: 'GET',
          signal,
          ...(workspaceContext
            ? { headers: workspaceProjectHeaders(workspaceContext) }
            : {}),
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        reconnects += 1;
        noteReconnectAttempt();
        if (reconnects < DAEMON_STREAM_RECONNECT_LIMIT) await waitBeforeReconnect();
        continue;
      }

      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => '');
        /*
         * daemon 死了之后,这条路才是真机上最常走的一条 —— 而它以前一进来就收摊。
         *
         * 浏览器和 daemon 之间永远隔着一层代理,所以「daemon 不在了」到达客户端时
         * **不是** fetch 抛错(那是直连才有的形状,只有下面那个 `catch` 认得),
         * 而是一份代理替它生成的非 2xx 应答:dev 是 500,打包版是 502。
         * 于是这里第一次拿到非 2xx 就 `return`,5 次预算一次都没用上,
         * `exhausted` 也永远发不出来 —— 组件 22 那一行和 22-3 那颗〔重新连接〕
         * 因此在真机上一次都没出现过(用户 2026-08-27)。
         *
         * 分流交给 `daemonAnsweredWithError`:daemon 自己答的话是终局的,照旧立刻报错;
         * 没人答得上来的,就是掉线,按掉线走重连预算。
         */
        if (!daemonAnsweredWithError(text)) {
          reconnects += 1;
          noteReconnectAttempt();
          if (reconnects < DAEMON_STREAM_RECONNECT_LIMIT) await waitBeforeReconnect();
          continue;
        }
        clearReconnect();
        handlers.onError(new Error(`daemon ${resp.status}: ${text || 'no body'}`));
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let sawStreamProgress = false;
      /**
       * 比 `sawStreamProgress` 严一档:**只有真的运行事件**才算数,keepalive 注释帧不算。
       * 预算那边(`shouldResetReconnects`)刻意把 keepalive 也当进度 —— 一条安静但活着的
       * 流不该被判死;但对用户来说那次「连上了什么也没来」不是恢复,所以 UI 读数不跟它走。
       */
      let sawRunEvent = false;

      while (true) {
        let readResult: ReadableStreamReadResult<Uint8Array>;
        try {
          /*
           * 有读超时,不能裸 `await reader.read()`。上游死在流中途时代理会把这条
           * 响应一直挂着(实测见 DAEMON_STREAM_IDLE_TIMEOUT_MS),裸读会永远停在这里,
           * 于是「daemon 卡死 / 被杀」在客户端**是隐形的** —— 壳头照旧写着进行中。
           * 阈值钉在 daemon 的 25s 心跳上,所以长时间不吐东西的正常运行不受影响。
           */
          const framed = await readFrameWithIdleDeadline(reader, DAEMON_STREAM_IDLE_TIMEOUT_MS);
          if (framed === DAEMON_STREAM_IDLE_TIMEOUT) {
            try { void reader.cancel(); } catch {}
            break;
          }
          readResult = framed;
        } catch (err) {
          // Only catch reader.read() failures — a broken SSE connection
          // (tab backgrounded, proxy idle timeout, network drop). Parsing
          // and handler invocations stay OUTSIDE this catch so local
          // processing bugs surface through the existing outer error path.
          if ((err as Error).name === 'AbortError') throw err;
          try { reader.cancel(); } catch {}
          break;
        }
        const { value, done } = readResult;
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const parsed = parseSseFrame(frame);
          if (!parsed) continue;
          if (parsed.kind === 'comment') {
            sawStreamProgress = true;
            trackRunProgress(runId);
            continue;
          }
          if (parsed.kind !== 'event') continue;
          sawStreamProgress = true;
          sawRunEvent = true;
          trackRunProgress(runId);
          /*
           * S12 的静默计时就认这一刻 —— **上游给过我们东西**的唯一如实证据。
           *
           * 必须记在这里,不能记在事件落进 `message.events` 之后:那之后
           * `tool_input_delta` 已经被丢掉、空 thinking 已经被挡掉、连续文字
           * 已经被合并,真机 161.6 秒的窗口里数组一次都不会变。理由与真机
           * 数据见 `runtime/chat/upstream-activity.ts`。
           *
           * 也必须在 `parsed.kind !== 'event'` 这一刀**之后**:keepalive 注释帧
           * 是我们自己的心跳,证不出上游还在干活,拿它归零就等于把 S12 关掉。
           *
           * ── 这张表的主力是 `tool_input_delta` ─────────────────────────────
           *
           * 真机 run `7ed15c2f` 里它是 1346 条 agent 帧中的 **699 条**,那个 161.6 秒
           * 窗口里更是 126 条占 124 条。它**只在这里被用一次**(记一笔到达时刻),
           * 之后走到下面 `translateAgentEvent` 没有它的分支、返回 `null` 被丢掉 ——
           * 载荷是半截入参 JSON,本来也 parse 不了。
           *
           * **别拿它去画界面。** 它是模型在写**下一个**工具调用的入参,此刻上一个工具
           * 早已返回(同一份 run 里 10 个 30 秒以上的空档,每一个都是
           * `tool_result → tool_use`;而真正的工具执行 43 次里最长 0.4 秒)。
           * 设计稿组件 9 / 10 逐字写死:「没有「执行中」这一档……"它在干活"由正在跑的
           * 那一步的转圈说,**一处就够**」—— 在途反馈就是壳头那颗球 + 扫光的「进行中」
           * + 每秒在走的秒数。落进规格是 D3(`specs/current/chat-panel-next.md:413`)
           * 与 B8(`:754`)。这条帧曾经被岔进一个专供流式代码卡(`LiveCodeBox`,按 N4 已下线)
           * 的回调槽位,卡片撤掉后全仓再没有调用方接过它 —— 那个死槽位已删。
           * 钉子见 `tests/components/chat/tool-input-delta-dead-wiring.test.tsx`。
           */
          markUpstreamActivity(runId);
          if (parsed.id) {
            lastEventId = parsed.id;
            onRunEventId?.(parsed.id);
          }

          const event = parsed as unknown as ChatSseEvent;

          /*
           * 重跑真的接上了 = 第二次尝试吐出了**用户看得见**的东西。
           *
           * 不认 `start`:真机 `.od/runs/0e40b819-…` 里第二次尝试的 `start` 在
           * 错误后 3.2 秒就到了,而第一个 token 还要再等 30 秒 —— 在 `start` 撤,
           * 那一行一闪而过,最需要解释的那 30 秒照旧沉默。
           *
           * 也不认 `status`(壳头那句「启动中」):它不是上游给的东西,重跑成不成
           * 它都会来。
           */
          const clearAgentSelfHealOnVisibleOutput = (): void => {
            if (agentRetryPending) {
              agentRetryPending = false;
              handlers.onAgentRetry?.({ attempt: 0, max: 0, phase: 'cleared' });
            }
            if (agentReconnectPending) {
              agentReconnectPending = false;
              handlers.onAgentReconnect?.({ attempt: 0, max: 0, phase: 'cleared' });
            }
          };

          if (event.event === 'run_retry_attempted') {
            // daemon 把这一轮重跑了。它写这条是为了埋点,但 `runs.ts` 的 `emit`
            // 同时也是 SSE 扇出,所以它本来就到了浏览器 —— 以前只是没人接。
            const data = event.data;
            const attempt = Number(data.retry_attempt_index);
            const max = Number(data.retry_max_attempts);
            if (Number.isFinite(attempt) && attempt > 0) {
              agentRetryPending = true;
              handlers.onAgentRetry?.({
                attempt,
                max: Number.isFinite(max) && max > 0 ? max : attempt,
                phase: 'retrying',
              });
            }
            continue;
          }

          if (event.event === 'stdout') {
            const chunk = String(event.data.chunk ?? '');
            acc += chunk;
            clearAgentSelfHealOnVisibleOutput();
            handlers.onDelta(chunk);
            handlers.onAgentEvent({ kind: 'text', text: chunk });
            continue;
          }

          if (event.event === 'stderr') {
            stderrBuf += event.data.chunk ?? '';
            continue;
          }

          if (event.event === 'agent') {
            const translated = translateAgentEvent(event.data);
            if (!translated) continue;
            if (translated.kind === 'status' && translated.label === 'agent_reconnecting') {
              const match = /^(\d+)\/(\d+)$/u.exec(translated.detail?.trim() ?? '');
              const attempt = Number(match?.[1]);
              const max = Number(match?.[2]);
              if (Number.isFinite(attempt) && attempt > 0 && Number.isFinite(max) && max > 0) {
                agentReconnectPending = true;
                handlers.onAgentReconnect?.({ attempt, max, phase: 'reconnecting' });
              }
              // This is transport telemetry, never assistant content.
              continue;
            }
            if (translated.kind !== 'status') clearAgentSelfHealOnVisibleOutput();
            if (translated.kind === 'text') {
              acc += translated.text;
              handlers.onDelta(translated.text);
            }
            handlers.onAgentEvent(translated);
            continue;
          }

          if (event.event === 'start') {
            const data = event.data as ChatSseStartPayload;
            onRunStatus?.('running');
            handlers.onAgentEvent({
              kind: 'status',
              label: 'starting',
              detail: typeof data.bin === 'string' ? data.bin : undefined,
            });
            continue;
          }

          if (event.event === 'error') {
            const data = event.data as SseErrorPayload;
            const structuredError = daemonSseError(data);
            pendingStructuredError = structuredError;
            // Error frames can be emitted for a failed first attempt before the
            // same run's retry has completed. Do not classify the run from a
            // point-in-time status probe here: that can catch a transient
            // failed state, surface a stale error, and disconnect before the
            // later successful retry frames arrive. Cache the structured error
            // and let the terminal `end` event or the post-stream status
            // fallback below decide whether it should be surfaced.
            continue;
          }

          if (event.event === 'end') {
            exitCode = typeof event.data.code === 'number' ? event.data.code : null;
            exitSignal = typeof event.data.signal === 'string' ? event.data.signal : null;
            if (event.data.resumable === true) endResumable = true;
            if (event.data.failureCategory) endFailureCategory = event.data.failureCategory;
            if (event.data.failureDetail) endFailureDetail = event.data.failureDetail;
            if (event.data.failureAction) endFailureAction = event.data.failureAction;
            if (typeof event.data.retryable === 'boolean') endRetryable = event.data.retryable;
            reportArtifactCount(event.data.artifactCount);
            reportArtifactPaths(event.data.artifactPaths);
            if (event.data.strategyTask) endStrategyTask = event.data.strategyTask;
            // `serverDeclaredSuccess` records whether the server explicitly
            // set `status: 'succeeded'` in the end payload — the local
            // `'succeeded'` fallback below does not count and must keep
            // hitting the exit-code/signal safety net later.
            serverDeclaredSuccess = event.data.status === 'succeeded';
            endStatus = isChatRunStatus(event.data.status) ? event.data.status : 'succeeded';
          }
        }
      }
      let shouldResetReconnects = sawStreamProgress;
      if (pendingStructuredError && endStatus === null) {
        const status = await fetchChatRunStatus(runId, workspaceContext).catch(() => null);
        if (status && isChatRunStatus(status.status) && status.status !== 'queued' && status.status !== 'running') {
          endStatus = status.status;
          exitCode = status.exitCode ?? null;
          exitSignal = status.signal ?? null;
          serverDeclaredSuccess = status.status === 'succeeded';
          if (status.resumable === true) endResumable = true;
          // Carry the daemon failure classification off this terminal status
          // too — this error-frame-then-status recovery path breaks before the
          // SSE `end` frame, so without it markErrorRunFailure() below stamps
          // null and the specific failureDetail card degrades to the generic
          // run-error UI on reconnect.
          if (status.failureCategory) endFailureCategory = status.failureCategory;
          if (status.failureDetail) endFailureDetail = status.failureDetail;
          if (status.failureAction) endFailureAction = status.failureAction;
          if (typeof status.retryable === 'boolean') endRetryable = status.retryable;
          reportArtifactCount(status.artifactCount);
          reportArtifactPaths(status.artifactPaths);
          if (status.strategyTask) endStrategyTask = status.strategyTask;
          break;
        }
        if (!status) {
          onRunStatus?.('failed');
          clearReconnect();
          handlers.onError(pendingStructuredError);
          return;
        }
        // The connection closed after an error frame but before a terminal
        // frame. If the run is still active, retry the SSE stream, but count
        // this as a reconnect attempt instead of letting the error frame reset
        // the budget forever.
        shouldResetReconnects = false;
      }
      // UI 读数与预算分头算:预算认 keepalive,读数只认运行事件(见 sawRunEvent)。
      if (sawRunEvent) clearReconnect(); else noteReconnectAttempt();
      reconnects = shouldResetReconnects ? 0 : reconnects + 1;
      if (shouldResetReconnects) reconnectBackoff.reset();
      else if (endStatus === null && reconnects < DAEMON_STREAM_RECONNECT_LIMIT) {
        await waitBeforeReconnect();
      }
    }

    // 循环里 break 出来的都是已经拿到终态的路径 —— 那一行该撤了。
    if (endStatus !== null) clearReconnect();

    if (endStatus === null) {
      const status = await fetchChatRunStatus(runId, workspaceContext);
      if (status && isChatRunStatus(status.status) && status.status !== 'queued' && status.status !== 'running') {
        endStatus = status.status;
        exitCode = status.exitCode ?? null;
        exitSignal = status.signal ?? null;
        // Fallback REST path: `status.status` is explicitly declared by the
        // daemon's run record (it passed `isChatRunStatus()` above), so an
        // explicit `'succeeded'` here is just as authoritative as the SSE
        // end-event success.
        serverDeclaredSuccess = status.status === 'succeeded';
        if (status.resumable === true) endResumable = true;
        if (status.failureCategory) endFailureCategory = status.failureCategory;
        if (status.failureDetail) endFailureDetail = status.failureDetail;
        if (status.failureAction) endFailureAction = status.failureAction;
        if (typeof status.retryable === 'boolean') endRetryable = status.retryable;
        reportArtifactCount(status.artifactCount);
        reportArtifactPaths(status.artifactPaths);
        if (status.strategyTask) endStrategyTask = status.strategyTask;
        // 拿到终态就撤掉重连行。`onRunStatus` 不在这里发:合并 origin/main 后
        // 它挪到了 strategy task 收敛之后统一发一次(见下方 `onRunStatus?.(endStatus)`),
        // 在这里再发一次会让 blocked/canceled 的改写被旧值盖掉。
        clearReconnect();
      } else {
        onRunStatus?.('failed');
        // 预算用尽、这一轮还没落终态 —— 组件 22-3:停止自动重连,交回给人。
        // 这条要在 onError 之前发:报错卡与重连行今天在抢同一件事(盘点 R9),
        // 先把「已经交回给人」这个事实摆出来,分流由消费方决定。
        emitReconnect('exhausted');
        handlers.onError(createGenericDaemonDisconnectError());
        return;
      }
    }

    if (endStrategyTask && !endStrategyTask.terminal) {
      const nextRunId = endStrategyTask.activeRunId !== runId
        ? endStrategyTask.activeRunId
        : endStrategyTask.nextRunId;
      if (nextRunId && nextRunId !== runId) {
        onRunStatus?.('running');
        return { nextRunId, strategyTask: endStrategyTask };
      }
    }

    if (endStrategyTask?.terminal) {
      // Surface the terminal projection before the status/error handlers run,
      // so a blocked verdict (with its gate attribution) is stamped onto the
      // assistant message ahead of the failure finalization it triggers.
      onStrategyTaskSettled?.(endStrategyTask);
      if (endStrategyTask.outcome === 'canceled') {
        endStatus = 'canceled';
      } else if (endStrategyTask.outcome === 'blocked') {
        // A blocked strategy verdict does not retroactively unmake a Run that
        // already succeeded AND delivered. Observed across every runtime: the
        // agent writes the canonical deliverable correctly, the daemon's own
        // `validateRunDeliverable` resolves it, and then the turn is refused
        // over a machine-block defect. Remapping that to `failed` hid the file
        // the user asked for behind a generic error card and suppressed the
        // next-step actions that reach it.
        //
        // The strategy contract is explicit that a post-claim failure keeps the
        // current Run's own result rather than inventing a new one, so only a
        // Run that did NOT succeed-and-deliver falls through to the failure
        // branch. `deliverableValid` is filesystem-backed (entry resolved, this
        // Run touched it, kind matches) — never the agent's own assertion — and
        // an unreachable daemon fails closed to the previous behaviour.
        const deliveredDespiteBlock = endStatus === 'succeeded'
          && (await fetchChatRunStatus(runId, workspaceContext))?.deliverableValid === true;
        if (!deliveredDespiteBlock) {
          endStatus = 'failed';
          pendingStructuredError ??= createStrategyTaskBlockedError(endStrategyTask);
        }
      } else if (endStrategyTask.outcome === 'completed') {
        endStatus = 'succeeded';
        serverDeclaredSuccess = true;
      }
    }

    onRunStatus?.(endStatus);

    if (endStatus === 'canceled') {
      handlers.onDone(acc);
      return;
    }

    // Trust the server's authoritative success declaration. When the server
    // explicitly sets `status: 'succeeded'` (either in the SSE end payload
    // or via the fallback run-status fetch), the run completed cleanly even
    // if the underlying process exited via a signal — some agents (e.g.
    // ACP agents like Devin for Terminal) intentionally exit via SIGTERM
    // after a clean prompt completion because they don't shut down on
    // `stdin.end()`. The signal/non-zero-code safety net is bypassed only
    // for that explicit declaration; a missing/invalid `status` from a
    // compatible or older daemon still falls back to `endStatus =
    // 'succeeded'` for the run-status surface but must keep the safety net
    // intact so a real failure response like `{code:1}` or
    // `{code:null,signal:"SIGTERM"}` without `status` still surfaces an
    // error banner.
    const looksLikeFailure =
      endStatus === 'failed' ||
      (!serverDeclaredSuccess &&
        (exitSignal || (exitCode !== null && exitCode !== 0)));
    if (looksLikeFailure) {
      if (pendingStructuredError) {
        handlers.onError(
          markErrorRunFailure(markErrorResumable(pendingStructuredError, endResumable), {
            failureCategory: endFailureCategory,
            failureDetail: endFailureDetail,
            failureAction: endFailureAction,
            retryable: endRetryable,
          }),
        );
        return;
      }
      if (shouldSuppressLifecycleExitFallback(agentId, exitCode, exitSignal, stderrBuf)) {
        handlers.onDone(acc);
        return;
      }
      const cleanedStderr = cleanAmrOpenCodeStderrFallback(agentId, stderrBuf);
      const formattedOpenCodeError = formatLegacyOpenCodeSessionError(cleanedStderr);
      const tail = (formattedOpenCodeError ?? cleanedStderr).trim().slice(-400);
      const fallbackTail =
        tail || (isAmrOpenCodeExitFallback(agentId, stderrBuf) ? AMR_OPENCODE_INCOMPLETE_MESSAGE : '');
      handlers.onError(
        markErrorRunFailure(
          markErrorResumable(
            new Error(`agent exited with ${exitSignal ? `signal ${exitSignal}` : `code ${exitCode}`}${fallbackTail ? `\n${fallbackTail}` : ''}`),
            endResumable,
          ),
          {
            failureCategory: endFailureCategory,
            failureDetail: endFailureDetail,
            failureAction: endFailureAction,
            retryable: endRetryable,
          },
        ),
      );
      return;
    }
    if (
      publishRunFinishedEvent
      && agentId === 'amr'
      && Boolean(projectId?.trim())
      && Boolean(conversationId?.trim())
      && serverDeclaredSuccess
      && endStatus === 'succeeded'
      && resolvedArtifactCount !== undefined
      && resolvedArtifactCount > 0
    ) {
      publishDaemonRunFinishedEvent({
        agentId,
        runId,
        projectId: projectId!,
        conversationId: conversationId!,
        result: 'success',
        artifactCount: resolvedArtifactCount,
      });
    }
    handlers.onDone(acc);
  } finally {
    cancelSignal?.removeEventListener('abort', cancelRun);
    // Settle the stuck-run watchdog with whatever terminal state we
    // resolved. If the watchdog was never armed (reattach paths that
    // hit the daemon for an already-finished run), trackRunTerminal
    // is a no-op for unknown runIds.
    trackRunTerminal(runId, endStatus ?? (canceled ? 'canceled' : 'unknown'));
  }
}

function isChatRunStatus(value: unknown): value is ChatRunStatus {
  return value === 'queued' || value === 'running' || value === 'succeeded' || value === 'failed' || value === 'canceled';
}

/** Tag an error surfaced to the chat with whether the failed run can be
 *  resumed (continued from its existing CLI session). Only stamps the property
 *  when true so non-resumable failures stay undefined. */
function markErrorResumable(err: Error, resumable: boolean): Error {
  if (resumable) (err as Error & { resumable?: boolean }).resumable = true;
  return err;
}

/** Stamp the daemon's failure classification AND its verdict onto a surfaced
 *  error, so the chat error card can both name a specific failure type + fix
 *  (`failureDetail`) and lead with the action the daemon actually recommends
 *  (`failureAction` / `retryable`) instead of re-deriving retryability from the
 *  detail name (see resolveRunFailureUi).
 *
 *  Only stamps values the daemon actually sent: an older daemon that omits a
 *  field must leave the property ABSENT, not present-and-undefined, because the
 *  card distinguishes "the daemon had no verdict" from "the daemon said no" —
 *  the classifier's own last-resort `unknown` row is `retryable: false`, so
 *  reading absence as a verdict would strip Retry from exactly the
 *  unclassified failures that deserve it. `retryable` is therefore gated on a
 *  boolean type check rather than on truthiness. */
function markErrorRunFailure(
  err: Error,
  fields: {
    failureCategory?: ChatRunStatusResponse['failureCategory'];
    failureDetail?: ChatRunStatusResponse['failureDetail'];
    failureAction?: ChatRunStatusResponse['failureAction'];
    retryable?: boolean;
  },
): Error {
  const target = err as Error & {
    failureCategory?: ChatRunStatusResponse['failureCategory'];
    failureDetail?: ChatRunStatusResponse['failureDetail'];
    failureAction?: ChatRunStatusResponse['failureAction'];
    retryable?: boolean;
  };
  if (fields.failureCategory) target.failureCategory = fields.failureCategory;
  if (fields.failureDetail) target.failureDetail = fields.failureDetail;
  if (fields.failureAction) target.failureAction = fields.failureAction;
  if (typeof fields.retryable === 'boolean') target.retryable = fields.retryable;
  return err;
}

function normalizeToolInput(input: unknown): unknown {
  if (input == null || typeof input !== 'object') return input;
  const obj = input as Record<string, unknown>;
  if ('filePath' in obj && typeof obj.filePath === 'string') {
    return { ...obj, file_path: obj.filePath };
  }
  return input;
}

const TRANSIENT_ACP_STATUS_LABELS = new Set([
  'waiting_for_first_output',
  'tool_call',
  'tool_call_update',
  'session_update',
]);

function normalizeAgentStatusLabel(label: string): string {
  return TRANSIENT_ACP_STATUS_LABELS.has(label) ? 'running' : label;
}

// Translate a raw `agent` SSE payload (what apps/daemon/src/claude-stream.ts emits)
// into the UI's AgentEvent union. Keep this liberal — unknown types just
// return null so the UI ignores them instead of rendering garbage.
function translateAgentEvent(data: DaemonAgentPayload): AgentEvent | null {
  const t = data.type;
  if (t === 'status' && typeof data.label === 'string') {
    return {
      kind: 'status',
      label: normalizeAgentStatusLabel(data.label),
      detail:
        typeof data.detail === 'string'
          ? data.detail
          : typeof data.model === 'string'
          ? data.model
          : typeof data.ttftMs === 'number'
            ? `first token in ${Math.round((data.ttftMs as number) / 100) / 10}s`
            : undefined,
    };
  }
  if (t === 'text_delta' && typeof data.delta === 'string') {
    return { kind: 'text', text: data.delta };
  }
  // This turn's done-marker nonce. The daemon emits it before the first
  // text_delta so `buildTurnBlocks` already holds the key by the time a
  // `<od-done key="…"/>` can arrive.
  if (t === 'done_key' && typeof data.key === 'string' && data.key) {
    return { kind: 'done_key', key: data.key };
  }
  // This turn's follow-up suggestions, already parsed and key-checked by the
  // daemon. The client never sees the `<od-next>` marker itself.
  if (t === 'next_steps' && Array.isArray(data.suggestions)) {
    const suggestions = data.suggestions.filter(
      (s): s is string => typeof s === 'string' && s.trim().length > 0,
    );
    if (suggestions.length === 0) return null;
    return { kind: 'next_steps', suggestions };
  }
  // This turn's display intent, already key-checked and path-resolved by the
  // daemon. The client never sees the `<od-focus …/>` marker itself, and never
  // resolves a path of its own — `open` is a project-relative path the daemon
  // already proved lands inside the project root.
  if (t === 'artifact_focus') {
    const open = typeof data.open === 'string' && data.open ? data.open : undefined;
    const show = Array.isArray(data.show)
      ? (data.show as unknown[]).filter(
          (p): p is string => typeof p === 'string' && p.trim().length > 0,
        )
      : undefined;
    if (!open && (!show || show.length === 0)) return null;
    return {
      kind: 'artifact_focus',
      ...(open ? { open } : {}),
      ...(show && show.length > 0 ? { show } : {}),
    };
  }
  if (t === 'conversation_title' && typeof data.title === 'string') {
    return { kind: 'conversation_title', title: data.title };
  }
  if (t === 'thinking_delta' && typeof data.delta === 'string') {
    return { kind: 'thinking', text: data.delta };
  }
  if (t === 'thinking_start') {
    return { kind: 'status', label: 'thinking' };
  }
  /*
   * Reasoning progress for the block that is running right now. Stamped with
   * the **client's** clock on arrival, not the daemon's: the only consumer asks
   * "has this number moved recently?" by comparing against the chat panel's own
   * `nowMs`, and a daemon timestamp would put a machine's clock skew straight
   * into that comparison. Arrival time is a transport fact the client always
   * knows — the same argument `BuildTurnInput.lastEventAtMs` is built on.
   */
  if (t === 'thinking_tokens' && typeof data.tokens === 'number' && Number.isFinite(data.tokens)) {
    return { kind: 'thinking_tokens', tokens: data.tokens, at: Date.now() };
  }
  if (t === 'live_artifact') {
    return {
      kind: 'live_artifact',
      action: data.action,
      projectId: data.projectId,
      artifactId: data.artifactId,
      title: data.title,
      refreshStatus: data.refreshStatus,
    };
  }
  if (t === 'live_artifact_refresh') {
    return {
      kind: 'live_artifact_refresh',
      phase: data.phase,
      projectId: data.projectId,
      artifactId: data.artifactId,
      refreshId: data.refreshId,
      title: data.title,
      refreshedSourceCount: data.refreshedSourceCount,
      error: data.error,
    };
  }
  /*
   * The write target of a call whose arguments are still streaming. This is the
   * ONLY thing the client learns from a mid-flight tool call: `tool_input_delta`
   * stays a heartbeat that is counted and dropped (see the table below), and the
   * daemon reads the path out of its own buffer so the arguments never cross the
   * wire. Rendering happens in `AssistantMessage`, which drops this event once
   * the real `tool_use` for the same id arrives.
   */
  if (
    t === 'tool_input_target' &&
    typeof data.id === 'string' &&
    typeof data.name === 'string' &&
    typeof data.path === 'string' &&
    data.path.length > 0
  ) {
    return {
      kind: 'tool_use',
      id: data.id,
      name: data.name,
      // The early form of this very call — same id, same path, no arguments.
      // `dropSupersededInFlightToolUses` retires it when the real one lands.
      input: { file_path: data.path, [IN_FLIGHT_TOOL_INPUT_MARKER]: true },
      /*
       * 这次调用的**不动的计时起点**(daemon 那边是 `content_block_start` 那一刻)。
       *
       * 少了它,`build-turn-blocks` 的 `spanElapsed(undefined, liveEndMs)` 返回
       * null,行上那一格秒数是空的 —— 文件名在,秒表不走。`Edit` / `MultiEdit` /
       * `NotebookEdit` / `replace` **只有**这一条早期事件(在途算不出 `−M`,所以
       * `tool_input_progress` 一条都不发),它们没有第二次机会补上起点。
       *
       * 不是数字就当没有:宁可这一行没有秒表,也不能因为一个脏字段整行不上屏 ——
       * 「调用开始就上屏」是红线,秒表是红线的一半。
       */
      ...(typeof data.startedAt === 'number' ? { startedAt: data.startedAt } : {}),
    };
  }
  /*
   * 同一条早期形态,**加上已经写了多少行**(W120)。行数走 `od_diff_stat` ——
   * `diffStat` 认这个字段(codex 也是从这里进来的),于是行上那一格 `+N −0` 和
   * 落定后走的是同一段渲染,一个新文案 key 都不用加。
   *
   * `removed` 写 0 不是拿 0 冒充:整份写下去的工具落定后 `diffStat` 给的就是
   * `{ added, removed: 0 }`,这里逐字同一个形状。算不出 `−M` 的 `Edit` 那一档
   * daemon 根本不发这条事件(见 `tool-input-path-scanner.ts`)。
   *
   * `startedAt` 是这次调用的**不动的起点**,秒数由 `build-turn-blocks` 在客户端
   * 每秒算一次 —— daemon 不为了让秒数动而每秒推事件。
   */
  if (
    t === 'tool_input_progress' &&
    typeof data.id === 'string' &&
    typeof data.name === 'string' &&
    typeof data.path === 'string' &&
    data.path.length > 0 &&
    typeof data.lines === 'number' &&
    Number.isInteger(data.lines) &&
    data.lines >= 0
  ) {
    return {
      kind: 'tool_use',
      id: data.id,
      name: data.name,
      input: {
        file_path: data.path,
        od_diff_stat: { added: data.lines, removed: 0 },
        [IN_FLIGHT_TOOL_INPUT_MARKER]: true,
      },
      ...(typeof data.startedAt === 'number' ? { startedAt: data.startedAt } : {}),
    };
  }
  /*
   * ACP 那条线的早期形态 —— 一次**已经开始、还没结束**的调用。
   *
   * 上面两条是 claude 专属的:它的入参是流式的,所以能提前说的只有「写哪个文件」
   * 和「写了多少行」。ACP 的 agent 发的是整帧状态(`pending` → `in_progress` →
   * 终态),OD 以前只转写最后一帧 —— 202 次真实 AMR 调用里,**每一次的整个生命
   * 周期都不可见**,855 秒的工具时间对着一个空壳,最长那次 222 秒。
   *
   * 于是这里 `input` 是**整个入参对象**,不是一个路径:占掉 58% 隐藏时长的是
   * bash,那一行上有意义的是命令,不是文件。也因此这条事件会**重复**到 ——
   * 工具名和路径都是 ACP 从 `kind`/`title`/`locations` 推出来的,后一帧可能推得
   * 更准。`dropSupersededInFlightToolUses` 按 id 留**最后一条**,所以先猜后改
   * 是原地覆盖,不会多画一行。
   */
  if (
    t === 'tool_in_flight' &&
    typeof data.id === 'string' &&
    typeof data.name === 'string' &&
    typeof data.startedAt === 'number'
  ) {
    const input = data.input && typeof data.input === 'object' && !Array.isArray(data.input)
      ? (data.input as Record<string, unknown>)
      : {};
    return {
      kind: 'tool_use',
      id: data.id,
      name: data.name,
      input: {
        ...input,
        // 还在跑的那一段输出。挂在 `input` 上而不是造一条 `tool_result`,是因为
        // 有结果就等于「这一行结束了」—— 行会立刻不再是 pending,秒表停住,
        // 而它明明还在跑。
        ...(typeof data.output === 'string' && data.output
          ? { [IN_FLIGHT_TOOL_OUTPUT_KEY]: data.output }
          : {}),
        [IN_FLIGHT_TOOL_INPUT_MARKER]: true,
      },
      startedAt: data.startedAt,
    };
  }
  if (t === 'tool_use' && typeof data.id === 'string' && typeof data.name === 'string') {
    // Carry the call's start/finish clock through. The daemon stamps both at its
    // single agent-event choke point; dropping them here was the second place the
    // timing was lost (the first was the SSE payload), which is why tool rows never
    // showed a duration. Only pass numbers — a missing end means "unknown", and the
    // UI must render nothing rather than `0.0s`.
    return {
      kind: 'tool_use',
      id: data.id,
      name: data.name,
      input: normalizeToolInput(data.input),
      ...(typeof data.startedAt === 'number' ? { startedAt: data.startedAt } : {}),
    };
  }
  if (t === 'tool_result' && typeof data.toolUseId === 'string') {
    return {
      kind: 'tool_result',
      toolUseId: data.toolUseId,
      content: String(data.content ?? ''),
      isError: Boolean(data.isError),
      ...(typeof data.completedAt === 'number' ? { completedAt: data.completedAt } : {}),
    };
  }
  if (t === 'usage') {
    const usage = (data.usage ?? {}) as Record<string, number>;
    return {
      kind: 'usage',
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      costUsd: typeof data.costUsd === 'number' ? data.costUsd : undefined,
      durationMs: typeof data.durationMs === 'number' ? data.durationMs : undefined,
    };
  }
  if (t === 'fabricated_role_marker' && typeof data.marker === 'string') {
    return {
      kind: 'status',
      label: 'warning',
      detail: `Model emitted fabricated role marker ("${data.marker}"). Response was truncated to prevent unauthorized instruction injection.`,
    };
  }
  if (t === 'tool_loop' && typeof data.toolName === 'string') {
    const toolName = data.toolName;
    const count = typeof data.count === 'number' ? data.count : 0;
    const detail =
      data.action === 'halt'
        ? `Run stopped: the agent repeated a failing ${toolName} call ${count}× without progress. Re-check the actual target before retrying.`
        : `Heads up — the agent has repeated a failing ${toolName} call ${count}× and may be stuck.`;
    return { kind: 'status', label: 'warning', detail };
  }
  if (t === 'raw' && typeof data.line === 'string') {
    return { kind: 'raw', line: data.line };
  }
  return null;
}

export async function saveArtifact(
  identifier: string,
  title: string,
  html: string,
): Promise<{ url: string; path: string } | null> {
  try {
    const resp = await fetch('/api/artifacts/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, title, html }),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as { url: string; path: string };
  } catch {
    return null;
  }
}
