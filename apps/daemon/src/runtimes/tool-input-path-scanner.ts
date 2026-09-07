/**
 * Pull the file path out of a tool call's arguments **while they are still
 * streaming**, without ever holding or forwarding the arguments themselves.
 *
 * Claude streams a tool call's JSON arguments as `input_json_delta` fragments
 * that split at arbitrary byte offsets — a real recording splits one path
 * across four fragments and closes it inside a fifth that has already started
 * on `"content"`:
 *
 *   '{"file_path": "/private/tmp/claude-501'
 *   '/-Users-elian-Documents-open-design/bff58f5e-18'
 *   'bb-4b58-96e7-8180846e980a/'
 *   'scratchpad/w107/cwd/alpha.html'
 *   '", "content": "<!doctype html><html><body'
 *
 * `file_path` is normally the first key, so the answer is complete after a few
 * dozen bytes even when `content` runs to tens of kilobytes. This scanner
 * exists to spend exactly those bytes.
 *
 * ## Why not `JSON.parse` in a try/catch
 *
 * A truncated fragment is not a JSON document, so the retry-until-it-parses
 * shape would re-parse a growing buffer on every fragment — quadratic in the
 * argument size, and it cannot answer at all until the LAST byte arrives, which
 * is the exact moment this scanner is trying to beat.
 *
 * This is instead a resumable character scanner: each fragment advances a small
 * state machine over the new bytes only, so the whole stream costs one linear
 * pass and the answer lands the instant the path's closing quote does.
 *
 * ## When it deliberately yields nothing
 *
 * By contract it returns a path only when that path is **provably complete**.
 * It stays silent when:
 *
 *  - the closing quote never arrives (model stopped mid-path, run aborted);
 *  - the path key is absent, nested deeper than the top-level argument object,
 *    or holds a non-string value;
 *  - the tool is not a file-writing tool (`Bash`, `Grep`, … are never scanned);
 *  - the arguments exceed {@link SCAN_BUDGET_BYTES} without yielding a path.
 *
 * A key that appears late still resolves correctly — just late enough that the
 * head start is small or gone. Silence is the designed outcome, never a guess:
 * a half-read path must never reach the UI.
 *
 * ## 顺带把行数数出来(W120)
 *
 * 光有文件名,那一行在剩下的一百多秒里是**静止**的。同一趟扫描顺手数一下正文里
 * 的换行,行上就能一边写一边长 —— 代价是每个字符多一次比较,而这些字符本来就已经
 * 在 `claude-stream` 的缓冲里躺着了,不是新开的一遍扫描。
 *
 * 三条约束写死在这里,别在别处重新发明:
 *
 *  · **口径必须和落定后完全一致。** 落定那一行的 `+N` 由
 *    `apps/web/src/runtime/chat/format.ts` 的 `diffStat` 算出,Write 分支是
 *    `content.split('\n').length` —— 也就是**换行数 + 1**(结尾换行多算一行,
 *    空串算 1 行)。这里逐字用同一条,所以 `tool_use` 落地时数字不会跳。
 *  · **只给整份写下去的工具数**({@link WHOLE_FILE_WRITE_TOOLS})。`Edit` 落定后
 *    是 `+N −M`,而 `−M` 要等 `old_string` 数完才知道 —— 在途给不出来就一半都不
 *    显示,绝不拿 0 冒充。`MultiEdit` / `replace` 同理:`diffStat` 对它们本来
 *    就返回 null,在途也必须跟着不报。
 *  · **必须节流。** 每来一个分片就报一次 = 把心跳变成广播。攒够
 *    {@link COUNT_REPORT_STEP_CHARS} 个正文字符、而且行数确实变了才报一次;
 *    正文那个字符串一收尾则**立刻补报最后一个值**,不管攒了多少 —— 这一条就是
 *    「结尾不许跳数字」的实现。
 *
 * 路径没收尾之前一个数字都不报:行上还没有那一行,报了也没处放。
 */

/** Tools whose arguments name a file this call is about to write. */
const FILE_WRITE_TOOLS: ReadonlySet<string> = new Set([
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'write_file',
  'replace',
]);

/**
 * Argument keys that hold that file's path, most specific first.
 *
 * `path` is only consulted for the tools above. It is a search ROOT on `Grep`
 * and `Glob`, and those tools never reach this scanner — which is the whole
 * reason the tool gate comes before the key gate.
 */
const PATH_KEYS: readonly string[] = ['file_path', 'notebook_path', 'filePath', 'path'];

/**
 * 会把**整份正文**写下去的工具 —— 只有这些的行数在途数得出来。
 *
 * 这份名单必须和 `format.ts` 的 `diffStat` 里 `name === 'write' || name ===
 * 'write_file'` 那一支**逐字对应**。多一个,在途就会报一个落定后算不出来的数字;
 * 少一个,行上白白静止。比较前一律转小写,和那边同一条。
 */
const WHOLE_FILE_WRITE_TOOLS: ReadonlySet<string> = new Set(['write', 'write_file']);

/** 正文所在的参数键。`diffStat` 读的也是它。 */
const CONTENT_KEY = 'content';

/**
 * 节流步长:每攒够这么多**正文字符**才允许报一次行数。
 *
 * 定这个值的依据是真机那一次:27.6KB 的页面写了 140 秒,约 200 字符/秒。512 字符
 * 折合 **2.6 秒一次** —— 秒表每秒在跳,行数每两三秒长一格,读起来是「在长」而不是
 * 「在闪」。事件量同时被两头卡住:整趟最多 `正文字节 / 512 + 1` 条(27.6KB → 55 条),
 * 而且每个分片最多产出一条,所以**永远少于** `tool_input_delta` 的条数 ——
 * 那一条本来就每个分片发一次(同一次写入约 700 条),这一档是它的零头。
 */
const COUNT_REPORT_STEP_CHARS = 512;

/** Longest plausible path; a longer value is not a path and is abandoned. */
const MAX_PATH_CHARS = 4096;
/** Longest plausible argument key. */
const MAX_KEY_CHARS = 64;
/** Give up rather than scan an unbounded argument blob. */
const SCAN_BUDGET_BYTES = 1 << 18;

export function isFileWriteToolName(name: unknown): name is string {
  return typeof name === 'string' && FILE_WRITE_TOOLS.has(name);
}

type Capture = 'none' | 'key' | 'path' | 'content';

/** 这一片喂进去之后有了什么新结论。两样都没有就返回 `null`。 */
export interface ToolInputScanUpdate {
  /** 这次调用要写的路径,**整趟只出现一次**。 */
  path?: string;
  /**
   * 到目前为止正文的行数,口径与 `diffStat` 一致(换行数 + 1)。
   * 只在节流放行、或正文收尾时出现,所以连着两次的值一定不同。
   */
  lines?: number;
}

export interface ToolInputPathScanner {
  /**
   * Feed the next raw argument fragment.
   *
   * Returns what this fragment newly established — the decoded path the first
   * time one is provably complete, and/or a fresh line count when the throttle
   * lets one through. `null` means this fragment established nothing, so a
   * caller that emits on a non-null return never emits noise.
   */
  push(fragment: string): ToolInputScanUpdate | null;
}

/**
 * A scanner for `toolName`, or `null` when that tool does not name a file.
 *
 * A `null` return is the caller's signal to not scan at all, so non-file tools
 * cost nothing beyond one set lookup for the whole call.
 */
export function createToolInputPathScanner(toolName: unknown): ToolInputPathScanner | null {
  if (!isFileWriteToolName(toolName)) return null;
  return new JsonPathScanner(WHOLE_FILE_WRITE_TOOLS.has(toolName.toLowerCase()));
}

/**
 * Reads top-level string values out of a JSON object as it arrives.
 *
 * Only depth-1 keys are considered: a `file_path` buried inside a nested object
 * is not this call's target. Whether a quote opens a key or a value is decided
 * by the last significant character — `{` or `,` means a key follows — which is
 * what keeps a `content` value containing `{`, `}` or `"file_path"` from being
 * mistaken for structure.
 */
class JsonPathScanner implements ToolInputPathScanner {
  private scanned = 0;
  private depth = 0;
  /** Set once the top-level object has closed; nothing more can arrive. */
  private closed = false;

  private inString = false;
  private capture: Capture = 'none';
  private buf = '';
  private overflowed = false;

  /** Pending backslash escape, possibly split across fragments. */
  private escaping = false;
  private unicode: string | null = null;

  private lastSignificant = '';
  private pendingKey: string | null = null;
  private expectColon = false;
  private expectPathValue = false;
  private expectContentValue = false;

  /** 路径已经报过了 —— 之后再出现同名键也不再报第二次。 */
  private pathFound = false;
  /** 正文那个字符串已经开过头(才轮得到数行)。 */
  private contentSeen = false;
  /** 正文那个字符串已经收尾 —— 该补报最后一个值了。 */
  private contentClosed = false;
  private newlines = 0;
  private charsSinceReport = 0;
  private reportedLines: number | null = null;

  constructor(private readonly countsLines: boolean) {}

  push(fragment: string): ToolInputScanUpdate | null {
    if (this.closed) return null;
    this.scanned += fragment.length;
    /*
     * 预算只用来拦「扫了一大堆什么都没找到」的 blob。一旦路径已出、或者已经在数
     * 正文,结构就已经明确了,继续扫的代价是每字符一次比较 —— 而
     * `claude-stream` 本来就在把同一批字节往 `state.input` 上攒,这里没有第二份
     * 内存。中途停手反而会让最后那个数字对不上落定值,那正是这一单要防的事。
     */
    if (this.scanned > SCAN_BUDGET_BYTES && !this.pathFound && !this.contentSeen) {
      this.closed = true;
      return null;
    }

    let path: string | undefined;
    for (let i = 0; i < fragment.length; i += 1) {
      const found = this.step(fragment.charAt(i));
      if (found !== null && path === undefined) {
        path = found;
        this.pathFound = true;
      }
      if (this.closed) break;
    }

    const lines = this.dueLineCount();
    if (path === undefined && lines === undefined) return null;
    return {
      ...(path !== undefined ? { path } : {}),
      ...(lines !== undefined ? { lines } : {}),
    };
  }

  /**
   * 现在该不该报一个行数,报多少。
   *
   * 路径还没收尾就一律不报 —— 行上还没有那一行。正文收尾时**无条件补报**,
   * 这一条保证「在途最后一个行数 == 落定后 `diffStat` 的 `+N`」。
   */
  private dueLineCount(): number | undefined {
    if (!this.countsLines || !this.pathFound || !this.contentSeen) return undefined;
    const lines = this.newlines + 1;
    if (this.contentClosed) {
      if (this.reportedLines === lines) return undefined;
      this.reportedLines = lines;
      return lines;
    }
    if (this.charsSinceReport < COUNT_REPORT_STEP_CHARS) return undefined;
    if (this.reportedLines !== null && lines <= this.reportedLines) return undefined;
    this.charsSinceReport = 0;
    this.reportedLines = lines;
    return lines;
  }

  /** Consume one character; returns the path when this character completed it. */
  private step(ch: string): string | null {
    if (this.inString) return this.stepInString(ch);

    if (ch === '"') {
      this.inString = true;
      this.buf = '';
      this.overflowed = false;
      // A quote right after `{` or `,` opens a key; anything else opens a value.
      if (this.depth === 1 && (this.lastSignificant === '{' || this.lastSignificant === ',')) {
        this.capture = 'key';
      } else if (this.expectPathValue) {
        this.capture = 'path';
      } else if (this.expectContentValue) {
        this.capture = 'content';
        this.contentSeen = true;
      } else {
        this.capture = 'none';
      }
      this.expectPathValue = false;
      this.expectContentValue = false;
      return null;
    }

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') return null;

    if (ch === '{' || ch === '[') {
      this.depth += 1;
    } else if (ch === '}' || ch === ']') {
      this.depth -= 1;
      if (this.depth <= 0) this.closed = true;
    } else if (ch === ':' && this.expectColon) {
      this.expectColon = false;
      // Only a path key at the top level opens a value we care about. Anything
      // else (including a non-string value for a path key) falls through and is
      // skipped by ordinary depth tracking.
      this.expectPathValue =
        !this.pathFound && this.pendingKey !== null && PATH_KEYS.includes(this.pendingKey);
      // 正文只认第一次:同名键出现第二次继续数下去会把行数数成两份之和。
      this.expectContentValue =
        this.countsLines && !this.contentSeen && this.pendingKey === CONTENT_KEY;
      this.pendingKey = null;
    }

    if (ch !== ':') {
      this.expectColon = false;
      this.pendingKey = null;
    }
    // A path key followed by a non-string value is not a path.
    if (ch !== ':' && ch !== '"') {
      this.expectPathValue = false;
      this.expectContentValue = false;
    }

    this.lastSignificant = ch;
    return null;
  }

  /** Consume one character inside a JSON string, honouring split escapes. */
  private stepInString(ch: string): string | null {
    if (this.unicode !== null) {
      this.unicode += ch;
      if (this.unicode.length === 4) {
        const code = Number.parseInt(this.unicode, 16);
        this.unicode = null;
        // A malformed `\uXXXX` means this is not a string we can read.
        if (!Number.isFinite(code)) return this.abandon();
        this.append(String.fromCharCode(code));
      }
      return null;
    }

    if (this.escaping) {
      this.escaping = false;
      if (ch === 'u') {
        this.unicode = '';
        return null;
      }
      this.append(UNESCAPE[ch] ?? ch);
      return null;
    }

    if (ch === '\\') {
      this.escaping = true;
      return null;
    }

    if (ch !== '"') {
      this.append(ch);
      return null;
    }

    // Closing quote: the string is now provably complete.
    this.inString = false;
    const captured = this.capture;
    const value = this.buf;
    const overflowed = this.overflowed;
    this.capture = 'none';
    this.buf = '';
    this.overflowed = false;
    this.lastSignificant = '"';

    if (captured === 'key' && !overflowed) {
      this.pendingKey = value;
      this.expectColon = true;
      return null;
    }
    // 正文收尾:行数就此定死,`dueLineCount` 会无条件补报最后一个值。
    if (captured === 'content') {
      this.contentClosed = true;
      return null;
    }
    if (captured === 'path' && !overflowed && value.length > 0) return value;
    return null;
  }

  /** Stop reading the current string without producing anything. */
  private abandon(): null {
    this.capture = 'none';
    this.buf = '';
    this.overflowed = true;
    return null;
  }

  private append(ch: string): void {
    /*
     * 正文**一个字符都不留**:只把换行数出来,顺便记一下攒了多少字符给节流用。
     * 这里是「原始入参不出 daemon」那条红线在扫描器里的落点 —— 27KB 的页面
     * 进来,留下的是两个整数。
     */
    if (this.capture === 'content') {
      this.charsSinceReport += 1;
      if (ch === '\n') this.newlines += 1;
      return;
    }
    if (this.capture === 'none' || this.overflowed) return;
    const limit = this.capture === 'key' ? MAX_KEY_CHARS : MAX_PATH_CHARS;
    if (this.buf.length >= limit) {
      // Too long to be what we are looking for — stop buffering, keep scanning
      // structure so the rest of the document still parses correctly.
      this.buf = '';
      this.overflowed = true;
      return;
    }
    this.buf += ch;
  }
}

const UNESCAPE: Readonly<Record<string, string>> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
};
