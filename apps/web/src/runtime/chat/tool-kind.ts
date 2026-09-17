import { isTodoWriteToolName } from '@open-design/contracts';
/**
 * 工具行的语义:这一次调用到底在干什么。
 *
 * 为什么不能只看工具名(D7 / 规格 §2.1):
 * OD 的 skill 引导让 agent 把读、搜、查全塞进 `Bash` —— 真实录制里 claude 一轮
 * 84 次 `Bash` / 8 次 `Read`;codex 14 条命令全叫 `Bash` 且没有 description。
 * 照工具名分类,整列都会退化成「运行命令」。所以要嗅 `command` 的内容。
 *
 * 改 skill 让 agent 用专用工具的方案被否掉了(D7):skill 是产品行为,
 * 影响面远大于改 UI。代价是这里的规则要跟着 agent 的习惯演进 —— 所以它必须有测试。
 *
 * 最初的 9 条录制命令仍在回归集里;2026-08-28 又用本机 stable / beta /
 * prerelease 会话里的 332 条 command 做了只读补样,只固化可证明的语法形态。
 */

/** 界面上的动词:读取 / 新建 / 改写 / 删除 / 搜索 / 执行 / 生成;认不出来的按工具名原样显示(T4) */
export type ToolKind = 'read' | 'write' | 'edit' | 'delete' | 'search' | 'exec' | 'image' | 'other';

type CommandKind = Exclude<ToolKind, 'image' | 'other'>;
type ClassifiedKind = CommandKind | 'noise';

const READ = /^(cat|head|tail|less|more|sed|awk|jq|wc|nl|stat|file|du|diff|pwd)$/;
const SEARCH = /^(grep|rg|egrep|find|fd|ls|tree|locate|which)$/;
const WRITE = /^(tee|touch|mkdir|cp|install)$/;
const EDIT = /^(mv|ln|chmod|patch|apply_patch)$/;
const DELETE = /^(rm|rmdir|unlink)$/;
/** 这些命令本身不说明意图(`cd`、`echo`),整条命令只有它们时才回落成「执行」 */
const NOISE = /^(echo|printf|true|false|cd|export|set)$/;

const RANK: Record<ClassifiedKind, number> = {
  delete: 6,
  edit: 5,
  write: 4,
  read: 3,
  search: 2,
  exec: 1,
  noise: 0,
};

/**
 * codex 把每条命令包成 `/bin/zsh -lc '…'`(踩坑 #16:不剥壳,14 条命令全判成「运行」)。
 * 最多剥两层;结尾引号对不上(命令里混用引号)也照剥,宁可多剥不可不剥。
 */
export function unwrapShell(command: string): string {
  let c = String(command ?? '').trim();
  for (let i = 0; i < 2; i += 1) {
    const m = c.match(/^(?:\/bin\/|\/usr\/bin\/)?(?:sh|bash|zsh|dash)\s+(?:-[a-zA-Z]+\s+)*(['"])([\s\S]*)$/);
    if (!m) break;
    const quote = m[1] ?? '';
    let inner = m[2] ?? '';
    if (quote && inner.endsWith(quote)) inner = inner.slice(0, -1);
    c = inner.trim();
  }
  return c;
}

interface SimpleCommand {
  text: string;
  words: string[];
  headIndex: number;
  token: string;
}

interface CommandAnalysis {
  kind: ClassifiedKind;
  segment: SimpleCommand | null;
  inlineTarget?: string;
}

/**
 * 只在 shell 顶层切连接符。本地会话里有 78 条命令的引号内容含 `>` / `|` / `;`,
 * 用正则直接 split 会把搜索模式和 HTML 片段当成 shell 语法。
 */
function splitTopLevel(input: string, mode: 'groups' | 'pipes'): string[] {
  const out: string[] = [];
  let start = 0;
  let quote = '';
  let escaped = false;
  const push = (end: number, width: number) => {
    const part = input.slice(start, end).trim();
    if (part) out.push(part);
    start = end + width;
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i] ?? '';
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && quote !== "'") { escaped = true; continue; }
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }

    if (mode === 'groups') {
      const pair = input.slice(i, i + 2);
      if (pair === '&&' || pair === '||') { push(i, 2); i += 1; continue; }
      if (ch === ';' || ch === '\n') { push(i, 1); continue; }
    } else if (ch === '|' && input[i + 1] !== '|') {
      push(i, 1);
    }
  }
  push(input.length, 0);
  return out;
}

/** heredoc 的 body 是 Python / JS / HTML,不能再当 shell 切。shell 分析只看开启行。 */
function shellPrelude(command: string): string {
  const firstNewline = command.indexOf('\n');
  if (firstNewline < 0) return command;
  const first = command.slice(0, firstNewline);
  return /<<-?\s*["']?[A-Za-z_][\w-]*/.test(first) ? first : command;
}

/** 一个 simple command 的 shell words;只需要支持分类和单文件目标,不执行也不尝试完整解析 shell AST。 */
function shellWords(input: string): string[] {
  const out: string[] = [];
  let word = '';
  let quote = '';
  let escaped = false;
  let started = false;
  const push = () => {
    if (started) out.push(word);
    word = '';
    started = false;
  };
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i] ?? '';
    if (escaped) { word += ch; started = true; escaped = false; continue; }
    if (ch === '\\' && quote !== "'") { escaped = true; started = true; continue; }
    if (quote) {
      if (ch === quote) quote = '';
      else word += ch;
      started = true;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; started = true; continue; }
    if (/\s/.test(ch)) { push(); continue; }
    word += ch;
    started = true;
  }
  if (escaped) word += '\\';
  push();
  return out;
}

function commandHeadIndex(words: string[]): number {
  let i = 0;
  while (i < words.length && /^\w+=/.test(words[i] ?? '')) i += 1;
  while (i < words.length) {
    const prefix = basename(words[i] ?? '');
    if (!/^(sudo|env|command|nohup|time)$/.test(prefix)) break;
    const prefixIndex = i;
    i += 1;
    while (i < words.length && (words[i] ?? '').startsWith('-')) i += 1;
    while (i < words.length && /^\w+=/.test(words[i] ?? '')) i += 1;
    // `env | rg ...` 里 env 是数据源,不是一个没后续命令的前缀。
    if (i >= words.length) return prefixIndex;
  }
  return i;
}

function simpleCommand(text: string): SimpleCommand {
  const words = shellWords(text);
  const headIndex = commandHeadIndex(words);
  const raw = words[headIndex] ?? '';
  const token = raw.startsWith('$') ? '$VAR' : basename(raw);
  return { text, words, headIndex, token };
}

function classifyToken(token: string, words: readonly string[], headIndex: number): ClassifiedKind {
  if (token === '$VAR') return 'exec';
  if (NOISE.test(token)) return 'noise';
  const args = words.slice(headIndex + 1);
  if (token === 'sed' && args.some((arg) => arg === '-i' || /^-i.+/.test(arg))) return 'edit';
  if (token === 'perl' && args.some((arg) => /^-[^-]*p[^-]*i|^-[^-]*i[^-]*p/.test(arg))) return 'edit';
  if (DELETE.test(token)) return 'delete';
  if (EDIT.test(token)) return 'edit';
  if (READ.test(token)) return 'read';
  if (SEARCH.test(token)) return 'search';
  if (WRITE.test(token)) return 'write';
  return 'exec';
}

/** 找真正的输出重定向,忽略引号内 `>` 和 `2>&1` / `2>/dev/null` 这类 fd 控制。 */
function outputRedirectionTargets(segment: string): string[] {
  const out: string[] = [];
  let quote = '';
  let escaped = false;
  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i] ?? '';
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && quote !== "'") { escaped = true; continue; }
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch !== '>') continue;
    if (segment[i - 1] === '>') continue;
    if (/\d/.test(segment[i - 1] ?? '')) continue;
    const append = segment[i + 1] === '>';
    let j = i + (append ? 2 : 1);
    while (/\s/.test(segment[j] ?? '')) j += 1;
    if (segment[j] === '&') continue;
    const words = shellWords(segment.slice(j));
    const target = words[0];
    if (target) out.push(target);
    if (append) i += 1;
  }
  return out;
}

interface InlineScriptMutation { kind: 'write' | 'edit' | 'delete'; target?: string }

/**
 * OD 真实会话里常用 Python / Node heredoc 做小型定点改写。只认静态可证明的
 * 写入 API,不根据脚本文案猜意图;目标只从字面量或字面量变量恢复。
 */
function inlineScriptMutation(command: string): InlineScriptMutation | null {
  const first = command.split('\n', 1)[0] ?? '';
  if (!/\b(?:python(?:3)?|node)\b[^\n]*<<-?\s*["']?[A-Za-z_][\w-]*/.test(first)) return null;
  const body = command.slice(command.indexOf('\n') + 1);
  const assignments = new Map<string, string>();
  const assignmentRe = /(?:^|\n)\s*(?:const\s+|let\s+|var\s+)?([A-Za-z_]\w*)\s*=\s*(["'])([^"'\n]+)\2/g;
  for (const match of body.matchAll(assignmentRe)) {
    const name = match[1]; const value = match[3];
    if (name && value) assignments.set(name, value);
  }
  const resolve = (raw: string | undefined): string | undefined => {
    const value = raw?.trim();
    if (!value) return undefined;
    const quoted = value.match(/^["']([^"']+)["']$/)?.[1];
    return quoted ?? assignments.get(value);
  };

  const deleteMatch = body.match(/(?:os\.(?:remove|unlink)|fs\.(?:unlinkSync|rmSync)|\.unlink)\s*\(\s*([^,)\n]+)/);
  if (deleteMatch) return { kind: 'delete', target: resolve(deleteMatch[1]) };

  const writeMatch = body.match(/open\s*\(\s*([^,\n]+),\s*["'][wa][^"']*["']/)
    ?? body.match(/(?:Path\s*\(\s*([^\n)]+)\s*\)\s*\.write_(?:text|bytes)|(?:fs\.)?(?:writeFileSync|appendFileSync)\s*\(\s*([^,\n]+))/);
  const writes = Boolean(writeMatch)
    || /\b(?:write_text|write_bytes|writeFileSync|appendFileSync)\s*\(/.test(body);
  if (!writes) return null;
  const target = resolve(writeMatch?.[1] ?? writeMatch?.[2]);
  const readsBeforeWrite = /(?:\.read\s*\(|read_text\s*\(|readFileSync\s*\(|\.replace\s*\()/.test(body);
  return { kind: readsBeforeWrite ? 'edit' : 'write', target };
}

function classifySimple(part: string): CommandAnalysis {
  const segment = simpleCommand(part);
  let kind = classifyToken(segment.token, segment.words, segment.headIndex);
  const args = segment.words.slice(segment.headIndex + 1);
  if (segment.token === 'curl' && args.some((arg) => arg === '-o' || arg === '--output')) kind = 'write';
  if (outputRedirectionTargets(part).length && kind !== 'delete' && kind !== 'edit') kind = 'write';
  return { kind, segment };
}

function analyzeGroup(group: string): CommandAnalysis {
  const pipeline = splitTopLevel(group, 'pipes').map(classifySimple);
  const first = pipeline[0] ?? { kind: 'noise' as const, segment: null };
  /*
   * 本地会话里有 `sed/awk ... | grep/rg ...` 这类「先把文本流整理一下,再搜索」
   * 的命令。上游只是流生产/预处理时,显式搜索阶段才是用户要看的动作;但只放宽
   * 这三个只读 token,并且整条管道不能含写入/改写/删除,避免把一般管道猜成搜索。
   */
  const searchStage = pipeline.find((item, index) => index > 0 && item.kind === 'search');
  const firstToken = first.segment?.token ?? '';
  const hasMutation = pipeline.some((item) => item.kind === 'write' || item.kind === 'edit' || item.kind === 'delete');
  if (/^(cat|sed|awk)$/.test(firstToken) && searchStage && !hasMutation) return searchStage;
  if (first.kind !== 'exec' && first.kind !== 'noise') return first;
  // `grep | wc` 仍然是搜索;但 `env/curl | rg` 的上游不带语义,要看下游第一个可证明动作。
  return pipeline.find((item, index) => index > 0 && item.kind !== 'exec' && item.kind !== 'noise') ?? first;
}

function analyzeCommand(command: string): CommandAnalysis {
  const cmd = unwrapShell(command);
  const inline = inlineScriptMutation(cmd);
  if (inline) return { kind: inline.kind, segment: null, inlineTarget: inline.target };
  const groups = splitTopLevel(shellPrelude(cmd), 'groups').map(analyzeGroup);
  const use = groups.length ? groups : [{ kind: 'noise' as const, segment: null }];
  return use.reduce((winner, item) => (RANK[item.kind] > RANK[winner.kind] ? item : winner), use[0]!);
}

/**
 * 一条 shell 命令是在读、新建、改写、删除、搜索还是单纯执行。
 *
 * 规则:
 *  · 只把引号外的 `>` / `>>` 当输出重定向;fd 控制和搜索模式不算写
 *  · 顺序 / 逻辑连接(`;` `&&` `||`)只在 shell 顶层切,取权重最高的一段
 *  · 管道优先上游;`env/curl | rg` 这种上游无语义时,才看下游第一个可证明动作
 *  · Python / Node heredoc 只认静态写入 API,不解释脚本也不猜动态目标
 *  · 整条只有噪音命令(`cd`、`echo`)→ 执行
 */
export function classifyCommand(command: string): ToolKind {
  const winner = analyzeCommand(command).kind;
  return winner === 'noise' ? 'exec' : winner;
}

/**
 * 工具名本身能说明问题的,直接认;`Bash` 一类要去看命令内容。
 *
 * 名单要**保守**:能指到「这次调用到底干了什么」才归类。归错比归成 `other` 更糟 ——
 * `other` 只是说「我认不出来」,归错是**谎报**(把一次网络请求画成读文件)。
 * 认不出来的那一档现在也有图标了(见 `icons.tsx` 的兜底),不再退化成圆点。
 */
export function toolKind(toolName: string, input: unknown): ToolKind {
  const name = String(toolName ?? '').toLowerCase();
  if (WRITE_TOOLS.test(name)) return 'write';
  if (EDIT_TOOLS.test(name)) return 'edit';
  if (READ_TOOLS.test(name)) return 'read';
  if (SEARCH_TOOLS.test(name)) return 'search';
  if (isCommandTool(name)) return classifyCommand(commandOf(input));
  return 'other';
}

const WRITE_TOOLS = /^(write|write_file|create_file|new_file)$/;
const EDIT_TOOLS = /^(edit|multiedit|edit_file|apply_patch|str_replace|str_replace_editor|notebookedit|notebook_edit)$/;
/** 「把内容取回来」都算读:本地文件、远端网页,对用户是同一件事 */
const READ_TOOLS = /^(read|read_file|view_file|webfetch|web_fetch|fetch|read_url|readmediafile)$/;
/**
 * 「去找东西」都算搜:找文件、找代码、找网页。
 *
 * **元工具(`ToolSearch` 一类)不在这里** —— 它们该归哪一类是 T4,产品还没拍。
 * 现在它们走 `other`,行首拿兜底图标,不谎报成某一类。
 */
const SEARCH_TOOLS = /^(grep|glob|search|file_search|codebase_search|search_files|websearch|web_search)$/;

/**
 * 跑命令的工具。PowerShell 漏在名单外过一次 —— 一整轮十条 PowerShell 全被判成
 * 「未知」、行首只剩一颗点,是产品在真实页面上看出来的。名单按「它收 command 参数」认,
 * 不按平台认。
 */
export function isCommandTool(toolName: string): boolean {
  return /^(bash|sh|zsh|shell|powershell|pwsh|cmd|terminal|console|run_command|run_terminal_cmd|execute_command|local_shell|shell_command|terminal_command)$/
    .test(String(toolName ?? '').toLowerCase());
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
}

export function commandOf(input: unknown): string {
  const v = asRecord(input).command;
  return typeof v === 'string' ? v : '';
}

const basename = (p: string): string => String(p).replace(/^['"]|['"]$/g, '').split(/[\\/]/).pop() ?? '';

/** 工具入参里直指的文件(Read / Write / Edit 都有) */
export function fileOf(input: unknown): { path: string; label: string } | null {
  const rec = asRecord(input);
  const p = rec.file_path ?? rec.filePath ?? rec.path;
  return typeof p === 'string' && p ? { path: p, label: basename(p) } : null;
}

function positionalArgs(args: readonly string[], optionsWithValue: ReadonlySet<string> = new Set()): string[] {
  const out: string[] = [];
  let options = true;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (options && arg === '--') { options = false; continue; }
    if (options && arg.startsWith('-') && arg !== '-') {
      if (optionsWithValue.has(arg)) i += 1;
      continue;
    }
    out.push(arg);
  }
  return out;
}

function safeSingleTarget(raw: string | undefined): string | null {
  const path = raw?.trim();
  if (!path || path === '-' || path === '/dev/null') return null;
  if (/[$*?\[\]{}<>|&;]/.test(path)) return null;
  return path;
}

function targetFromSimple(segment: SimpleCommand, kind: ClassifiedKind): string | null {
  const args = segment.words.slice(segment.headIndex + 1);
  const token = segment.token;
  if (kind === 'write') {
    const redirected = outputRedirectionTargets(segment.text).map(safeSingleTarget).filter((x): x is string => Boolean(x));
    if (redirected.length === 1) return redirected[0] ?? null;
    if (token === 'curl') {
      const index = args.findIndex((arg) => arg === '-o' || arg === '--output');
      return safeSingleTarget(index >= 0 ? args[index + 1] : undefined);
    }
    if (token === 'cp' || token === 'install') return safeSingleTarget(positionalArgs(args).at(-1));
    if (token === 'tee' || token === 'touch' || token === 'mkdir') {
      const targets = positionalArgs(args);
      return targets.length === 1 ? safeSingleTarget(targets[0]) : null;
    }
  }
  if (kind === 'edit') {
    if (token === 'sed') return safeSingleTarget(args.at(-1));
    if (token === 'perl') return safeSingleTarget(positionalArgs(args).at(-1));
    if (token === 'mv' || token === 'ln') return safeSingleTarget(positionalArgs(args).at(-1));
    if (token === 'chmod') {
      const targets = positionalArgs(args).slice(1);
      return targets.length === 1 ? safeSingleTarget(targets[0]) : null;
    }
    if (token === 'patch' || token === 'apply_patch') return safeSingleTarget(positionalArgs(args)[0]);
  }
  if (kind === 'delete') {
    const targets = positionalArgs(args);
    return targets.length === 1 ? safeSingleTarget(targets[0]) : null;
  }
  if (kind !== 'read') return null;

  if (token === 'sed') return safeSingleTarget(args.at(-1));
  if (token === 'awk' || token === 'jq') {
    const targets = positionalArgs(args).slice(1);
    return targets.length === 1 ? safeSingleTarget(targets[0]) : null;
  }
  const targets = positionalArgs(args, new Set(['-n', '--lines', '-c', '--bytes']));
  return targets.length === 1 ? safeSingleTarget(targets[0]) : null;
}

/**
 * 从 shell 命令恢复一个静态可证明的文件目标,让 Bash 也能画成「读取 / 新建 /
 * 改写 / 删除 + 文件名」。多目标、glob、动态变量不猜 —— 猜错比回落成命令更糟。
 */
export function commandFile(command: string): { path: string; label: string } | null {
  const analysis = analyzeCommand(command);
  const selectedIsPiped = analysis.segment != null && splitTopLevel(shellPrelude(unwrapShell(command)), 'groups')
    .some((group) => {
      const pipeline = splitTopLevel(group, 'pipes');
      return pipeline.length > 1 && pipeline.includes(analysis.segment?.text ?? '');
    });
  if (selectedIsPiped) return null;
  const raw = safeSingleTarget(analysis.inlineTarget)
    ?? (analysis.segment ? targetFromSimple(analysis.segment, analysis.kind) : null);
  return raw ? { path: raw, label: basename(raw) } : null;
}

/**
 * 搜索行要显示「搜索 <模式> N 处」(D23),模式从入参或命令里抽。
 * 先按引号切词,再截到第一个裸的 `|` / `&&` / `;` —— 引号里的 `|` 是模式的一部分。
 *
 * **抽不出来就返回 `null`,不拿字面量 `'.'` 顶上。** 这一格回答的是「搜的是什么」;
 * 命令没说,就没有答案 —— 而 `ToolRow` 把这个字符串塞进 `FileButton`,伪造出来的
 * `.` 会长成一枚看着能点开的文件(真机上就是「搜索 . 14 处」,命令是
 * `cd "<项目>" && ls -la && …`)。同一套规矩在这个文件里已经写过两遍:`commandFile`
 * 的「多目标 / glob / 动态变量不猜 —— 猜错比回落成命令更糟」,和 `ToolRow` 那支
 * 回落分支的「不能伪造一个可点文件」。
 *
 * 设计稿只画过 `搜索 商品卡 6 处` 一条搜索行,没有列目录这一行,所以这里不发明新
 * 行型 —— 返回 `null` 之后行退回稿子已有的形态(有命令没人话 → 搜索 + 命令 + 命中数;
 * 有人话 → 命令折叠块)。`pattern` 本来就是 `string | null`,`null` 是它一直就有的取值。
 */
export function searchPattern(_toolName: string, input: unknown): string | null {
  const rec = asRecord(input);
  const direct = rec.pattern ?? rec.query;
  if (typeof direct === 'string' && direct) return direct;
  const analysis = analyzeCommand(commandOf(input));
  const segment = analysis.kind === 'search' ? analysis.segment : null;
  if (!segment) return null;
  const head = segment.token;
  const toks = segment.words.slice(segment.headIndex + 1);
  // `ls docs` 的 `docs` 是用户真打出来的目标,照答;`ls -la` 没有目标,就没有答案。
  if (/^(ls|tree)$/.test(head)) return positionalArgs(toks)[0] || null;
  if (/^(which|locate)$/.test(head)) return positionalArgs(toks)[0] ?? null;
  if (!/^(find|fd|grep|rg|egrep)$/.test(head)) return null;
  if (/^(find|fd)$/.test(head)) {
    // find 只有带 -name/-iname/-path/-regex 时才算「搜索了什么」;`find . -type f` 没有模式
    for (let i = 0; i < toks.length - 1; i += 1) {
      const flag = toks[i]; const value = toks[i + 1];
      if (flag && value && /^-(i?name|i?path|regex)$/.test(flag)) return value;
    }
    const first = toks[0];
    return head === 'fd' && first && !first.startsWith('-') ? first : null;
  }
  for (let i = 0; i < toks.length; i += 1) {
    const tok = toks[i];
    if (!tok) continue;
    const next = toks[i + 1];
    if (/^(-e|--regexp)$/.test(tok) && next) return next;
    // `rg --files` 只是把文件列出来,同样没有模式;带 `-g` 时那个 glob 才是模式。
    if (tok === '--files') {
      const globIndex = toks.findIndex((value) => value === '-g' || value === '--glob');
      return globIndex >= 0 ? (toks[globIndex + 1] ?? null) : null;
    }
    if (/^(-g|--glob|-t|--type|-A|-B|-C|-m|--max-count|--include|--exclude|--exclude-dir)$/.test(tok)) {
      i += 1;
      continue;
    }
    if (tok.startsWith('-')) continue;
    return tok;
  }
  return null;
}

/**
 * 行标题:有人话就用人话(claude 的 `description`),没有就回落成命令本身
 * —— codex 全程没有 description,这时候设计稿走「执行 <命令>」单行(S8)。
 */
export function toolTitle(toolName: string, input: unknown): string {
  const rec = asRecord(input);
  if (typeof rec.description === 'string' && rec.description) return rec.description;
  const cmd = commandOf(input);
  if (cmd) return commandHeadline(unwrapShell(cmd));
  const pattern = rec.pattern ?? rec.query;
  if (typeof pattern === 'string' && pattern) return pattern;
  return String(toolName ?? '');
}

/**
 * 一条命令显示成一行时留哪一截。
 *
 * 取第一行是对的 —— 但 **heredoc** 的第一行正好是最没信息的那一行:
 * `node - <<'NODE'` 里真正在跑的脚本全在后面几行,摆出来只剩「解释器 + 分隔符」
 * (用户真机指认「这个命令没什么可读性呢」)。
 * 所以把 heredoc 的开启标记连同它前面那个「从标准输入读」的 `-` 一起去掉:
 *   `node - <<'NODE'`           → `node`
 *   `cat > page.html <<'EOF'`   → `cat > page.html`(真正在做的事留住了)
 * 去完之后什么都不剩(比如整行就是 `<<'X'`)就退回原样,宁可难看也不空着。
 */
export function commandHeadline(command: string): string {
  const first = String(command ?? '').split('\n')[0] ?? '';
  const stripped = first
    // heredoc 开启标记:<<EOF / <<'EOF' / <<"EOF" / <<-EOF
    .replace(/\s*<<-?\s*(['"]?)[A-Za-z_][A-Za-z0-9_]*\1\s*$/, '')
    // 紧跟其后的那个「从标准输入读」的孤立 `-`
    .replace(/\s+-\s*$/, '')
    .trim();
  return stripped || first.trim();
}

/** 标题是原始命令(而不是人话)时,界面要用等宽字体显示 */
export function isRawCommandTitle(toolName: string, input: unknown): boolean {
  return isCommandTool(toolName) && !asRecord(input).description;
}

/**
 * **快照型**工具:每次调用都是把整份状态**替换**一遍,而不是记一笔流水。
 *
 * 各家 agent 在 daemon 归一后都叫 `TodoWrite`;这里仍放宽匹配,兼容 MCP 注入的
 * `mcp__*__todo_write` 和 codex 的 `update_plan`。
 *
 * 谁要用它:
 *  · `build-turn-blocks` 靠它把快照落成 todo 分段;
 *  · `dedupeToolUsesById` 靠它**放行同 id 的多次调用** —— 有的 agent 把「计划」
 *    建模成一个反复改写的条目,五次推进共用一个 tool id,按 id 去重会把
 *    除第一次以外的状态推进全部丢掉(真机撞到:一轮跑完四条 todo 还全是未开始)。
 */
/**
 * **快照型**工具:每次调用都是把整份状态**替换**一遍,而不是记一笔流水。
 *
 * 判据本身**不在这里** —— 它是全仓唯一的 `isTodoWriteToolName`(契约里),
 * 这里只是给它一个说明「为什么落块器和去重器要认它」的名字。
 * 曾经这里自己写过一份带 `/i` 的正则,而契约那份是精确 `===`,两份口径不一,
 * 于是 AMR 把名字改成 `Todowrite` 之后表现成「一半坏」:这边认得、那边不认。
 *
 * 谁要用它:
 *  · `build-turn-blocks` 靠它把快照落成 todo 分段;
 *  · `dedupeToolUsesById` 靠它**放行同 id 的多次调用** —— 有的 agent 把「计划」
 *    建模成一个反复改写的条目,五次推进共用一个 tool id,按 id 去重会把
 *    除第一次以外的状态推进全部丢掉(真机撞到:一轮跑完四条 todo 还全是未开始)。
 */
export function isSnapshotTool(toolName: string): boolean {
  return isTodoWriteToolName(toolName);
}
