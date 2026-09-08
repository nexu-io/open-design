/**
 * 输入框草稿的**落盘规则**。
 *
 * 以前只存一行字:刷新之后文字还在,但「添加到对话」攒下的注释、待发送的附件、
 * 标注、以及挂上去的技能 / MCP / 连接器全没了。这一层把**整个待发送负载**存下来,
 * 并且规定清楚哪些能存、存多少、存坏了怎么办。
 *
 * ── 两个 key,不是一个 ─────────────────────────────────────────────────────
 * 正文仍旧单独存在 `<key>`(纯字符串,格式一个字没改),其余的存 `<key>:extras`
 * 的 JSON 里。理由是**正文最贵**:JSON 存坏、超额、或者用户把客户端降级回旧版本,
 * 都不该连累用户敲进去的那段字。旧版本读 `<key>` 照样能用,`:extras` 它不认识、
 * 直接忽略 —— 升级和回滚两个方向都不会把草稿弄丢。
 *
 * ── 存什么 ────────────────────────────────────────────────────────────────
 * 只存**自包含、且刷新之后仍然成立**的东西:
 *   · `attachments`     —— 文件已经在项目里,存的是相对路径,不是文件本身
 *   · `commentAttachments` —— 输入框自己攒的标注(不含宿主传进来的那批,那批
 *                             由 daemon 持有,刷新后本来就会回来,存了会重一份)
 *   · `quotes`          —— 用户选中的原文
 *   · `context`         —— 技能 / MCP / 连接器的**id**,外加工作区上下文条目
 *
 * ── 刻意不存 ──────────────────────────────────────────────────────────────
 *   · 上传中的卡片(`pendingUploads`):它挂着活的 `File` 句柄和 `blob:` 预览 URL,
 *     `blob:` 的定义就是「这个文档活着才有效」,刷新之后必然是死链。
 *   · `McpServerConfig` / `ConnectorDetail` 的**完整对象**:前者的 `env` / `headers`
 *     装的是用户自己填的 API key,写进 localStorage 等于把密钥落到磁盘上;
 *     后者的 `tools` 动辄几十条,纯属体积浪费。所以只存 id,加载时再解析。
 *   · `appliedPluginSnapshot`:同理带 `mcpServers[].env` 与用户填的 `inputs`,
 *     另外 `resolvedContext.promptFragments` 是没有上界的提示词全文。
 *     代价是插件芯片刷新后不回来 —— 这是已知取舍,不是遗漏。
 *
 * ── 存坏了怎么办 ──────────────────────────────────────────────────────────
 * 一律**静默丢弃**,永不抛。整段 JSON 解析不了 → 当作没存过(正文仍然回来);
 * 单条不合格(附件没有 path、注释没有正文、id 不是字符串)→ 只丢那一条。
 * 草稿是便利设施,不是数据源;宁可少回来几个芯片,也不能让输入框打不开。
 */
import type { ChatAttachment, ChatCommentAttachment, WorkspaceContextItem } from '@open-design/contracts';
import type { ChatQuote } from './quote-selection';

/** 一次待发送负载里除正文以外的部分。 */
export interface ComposerDraftExtras {
  attachments: ChatAttachment[];
  commentAttachments: ChatCommentAttachment[];
  quotes: ChatQuote[];
  context: ComposerDraftContext;
}

/** 需要「加载时再解析」的绑定。和 `RunContextSelection` 同形,少了不能落盘的那几项。 */
export interface ComposerDraftContext {
  skillIds: string[];
  mcpServerIds: string[];
  connectorIds: string[];
  workspaceItems: WorkspaceContextItem[];
}

/**
 * 上界。localStorage 是**整个源共用**约 5MB,而草稿是「每个项目每个会话一份」——
 * 会话一多就是几十份。所以每一份都必须自己封顶,不能指望总量。
 *
 * 数字的来历:一枚芯片装所有引用(设计稿组件 23),20 条已经远超「选几段话」的用法;
 * 每条 1000 字够装一整段,再长在浮层里也读不完。附件 / 标注按同样的思路取整。
 */
export const DRAFT_MAX_QUOTES = 20;
export const DRAFT_MAX_QUOTE_CHARS = 1000;
export const DRAFT_MAX_ATTACHMENTS = 50;
export const DRAFT_MAX_COMMENT_ATTACHMENTS = 20;
export const DRAFT_MAX_CONTEXT_ITEMS = 50;
/** 序列化之后的硬上界(字符数)。超了就按 §shed 顺序丢整组,还超就一个字不写。 */
export const DRAFT_MAX_EXTRAS_CHARS = 64 * 1024;

/** `<key>:extras` —— 和正文同一个作用域(项目 + 会话),自动跟着走。 */
export function composerDraftExtrasKey(key: string): string {
  return `${key}:extras`;
}

const EMPTY_EXTRAS: ComposerDraftExtras = {
  attachments: [],
  commentAttachments: [],
  quotes: [],
  context: { skillIds: [], mcpServerIds: [], connectorIds: [], workspaceItems: [] },
};

/** 空负载不落盘 —— 存一个 `{}` 只会让「从没存过」和「存过但是空的」分不开。 */
export function composerDraftExtrasAreEmpty(extras: ComposerDraftExtras): boolean {
  return extras.attachments.length === 0
    && extras.commentAttachments.length === 0
    && extras.quotes.length === 0
    && extras.context.skillIds.length === 0
    && extras.context.mcpServerIds.length === 0
    && extras.context.connectorIds.length === 0
    && extras.context.workspaceItems.length === 0;
}

function stringArray(raw: unknown, limit: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !item) continue;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/** 附件必须有 path 和 name;`kind` 只认两个值,别的当 `file`。 */
function sanitizeAttachments(raw: unknown): ChatAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const path = typeof row.path === 'string' ? row.path : '';
    const name = typeof row.name === 'string' ? row.name : '';
    if (!path || !name) continue;
    out.push({
      path,
      name,
      kind: row.kind === 'image' ? 'image' : 'file',
      ...(typeof row.size === 'number' && Number.isFinite(row.size) ? { size: row.size } : {}),
      ...(typeof row.order === 'number' && Number.isFinite(row.order) ? { order: row.order } : {}),
    });
    if (out.length >= DRAFT_MAX_ATTACHMENTS) break;
  }
  return out;
}

/**
 * 标注只校验「还能被渲染和发送」需要的那几项(id / filePath / elementId)。
 * 其余字段原样带回 —— 它们本来就是 daemon 契约里的可选项,少一个不影响这一层。
 */
function sanitizeCommentAttachments(raw: unknown): ChatCommentAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatCommentAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || !row.id) continue;
    if (typeof row.filePath !== 'string' || !row.filePath) continue;
    out.push(item as ChatCommentAttachment);
    if (out.length >= DRAFT_MAX_COMMENT_ATTACHMENTS) break;
  }
  return out;
}

/**
 * 引用必须有正文,超长掐断 —— 全文本来就只在 hover 浮层里露一眼。
 *
 * 导出是因为**引用有两条落盘路**,而它们必须受同一套上限约束:
 * 一条是这里的草稿 extras,另一条是发送队列(`od:chat-queued-sends:*`,
 * 那一层对 `meta` 不做任何校验,原样 JSON 落盘)。少了这道闸,一次超长选区
 * 就能把队列撑爆 localStorage 的配额,而症状会出现在完全不相干的地方。
 */
export function sanitizeQuotes(raw: unknown): ChatQuote[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatQuote[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const text = typeof row.text === 'string' ? row.text.trim() : '';
    if (!text) continue;
    out.push({
      id: typeof row.id === 'string' && row.id ? row.id : `q-${out.length}`,
      text: text.length > DRAFT_MAX_QUOTE_CHARS ? text.slice(0, DRAFT_MAX_QUOTE_CHARS) : text,
      messageId: typeof row.messageId === 'string' ? row.messageId : '',
    });
    if (out.length >= DRAFT_MAX_QUOTES) break;
  }
  return out;
}

function sanitizeWorkspaceItems(raw: unknown): WorkspaceContextItem[] {
  if (!Array.isArray(raw)) return [];
  const out: WorkspaceContextItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || !row.id) continue;
    if (typeof row.kind !== 'string' || !row.kind) continue;
    out.push(item as WorkspaceContextItem);
    if (out.length >= DRAFT_MAX_CONTEXT_ITEMS) break;
  }
  return out;
}

/**
 * 把任意一坨东西收成一份合法负载。存之前存之后都走它 ——
 * 这样「写出去的」和「读回来的」受同一套判据约束,不会出现只在读那一侧才发现的坏数据。
 */
export function sanitizeComposerDraftExtras(raw: unknown): ComposerDraftExtras {
  if (!raw || typeof raw !== 'object') return EMPTY_EXTRAS;
  const row = raw as Record<string, unknown>;
  const context = (row.context && typeof row.context === 'object' ? row.context : {}) as Record<string, unknown>;
  return {
    attachments: sanitizeAttachments(row.attachments),
    commentAttachments: sanitizeCommentAttachments(row.commentAttachments),
    quotes: sanitizeQuotes(row.quotes),
    context: {
      skillIds: stringArray(context.skillIds, DRAFT_MAX_CONTEXT_ITEMS),
      mcpServerIds: stringArray(context.mcpServerIds, DRAFT_MAX_CONTEXT_ITEMS),
      connectorIds: stringArray(context.connectorIds, DRAFT_MAX_CONTEXT_ITEMS),
      workspaceItems: sanitizeWorkspaceItems(context.workspaceItems),
    },
  };
}

/**
 * 序列化并封顶。超了就**按「越大越先丢」的顺序整组丢**:
 * 标注(带 htmlHint / 截图路径,最重)→ 附件 → 引用。三组全丢还超,就返回 null,
 * 一个字都不写 —— 写半份坏数据比不写更糟。
 */
export function serializeComposerDraftExtras(extras: ComposerDraftExtras): string | null {
  const shedOrder: Array<(current: ComposerDraftExtras) => ComposerDraftExtras> = [
    (current) => current,
    (current) => ({ ...current, commentAttachments: [] }),
    (current) => ({ ...current, commentAttachments: [], attachments: [] }),
    (current) => ({ ...current, commentAttachments: [], attachments: [], quotes: [] }),
  ];
  for (const shed of shedOrder) {
    const candidate = shed(extras);
    if (composerDraftExtrasAreEmpty(candidate)) return null;
    const encoded = JSON.stringify(candidate);
    if (encoded.length <= DRAFT_MAX_EXTRAS_CHARS) return encoded;
  }
  return null;
}

export function loadComposerDraftExtras(key?: string): ComposerDraftExtras {
  if (!key || typeof window === 'undefined') return EMPTY_EXTRAS;
  let encoded: string | null = null;
  try {
    encoded = window.localStorage.getItem(composerDraftExtrasKey(key));
  } catch {
    return EMPTY_EXTRAS;
  }
  if (!encoded) return EMPTY_EXTRAS;
  try {
    return sanitizeComposerDraftExtras(JSON.parse(encoded));
  } catch {
    // 存坏了(手改过 / 写到一半断电 / 旧格式)——当作没存过。正文在另一个 key 里,不受影响。
    return EMPTY_EXTRAS;
  }
}

export function saveComposerDraftExtras(key: string | undefined, extras: ComposerDraftExtras): void {
  if (!key || typeof window === 'undefined') return;
  const storageKey = composerDraftExtrasKey(key);
  const encoded = serializeComposerDraftExtras(sanitizeComposerDraftExtras(extras));
  try {
    if (encoded) window.localStorage.setItem(storageKey, encoded);
    else window.localStorage.removeItem(storageKey);
  } catch {
    // 隐私模式 / 配额满 —— 存不下不影响输入框继续用。
  }
}

export function clearComposerDraftExtras(key?: string): void {
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(composerDraftExtrasKey(key));
  } catch {
    // 同上。
  }
}
