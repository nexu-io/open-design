import {
  OD_NEXT_NO_DECLARATIONS_V2,
  OD_NEXT_PLAN_CONTRACT_BLOCK,
  OD_NEXT_RUNTIME_STATE_BLOCK,
  readStrategyTaskDeclarationsV2,
  type StrategyTaskDeclarationsV2,
} from '@open-design/contracts';

/**
 * What the daemon learned from one OD Next reply.
 *
 * `visibleText` is the reply with every reserved `<open-design-…>` block
 * removed: those blocks were never meant for the user, and a task frozen on an
 * older strategy package still writes them. `declarations` are the two light
 * signals the runtime-state block may carry; a reply without the block, or
 * with a block the daemon cannot read, simply carries none. Nothing here is
 * validated and nothing here can fail a turn — the settlement reads
 * host-observed facts first and consults these signals only after them.
 */
export interface OdNextProtocolResult {
  visibleText: string;
  declarations: StrategyTaskDeclarationsV2;
  /** A runtime-state block was present and held a JSON object. */
  declarationBlockSeen: boolean;
}

type MachineKind = 'plan' | 'runtime';

interface CapturedBlock {
  kind: MachineKind;
  body: string;
  bodyBytes: number;
  tooLarge: boolean;
}

const MACHINE_TAGS: Record<MachineKind, string> = {
  plan: OD_NEXT_PLAN_CONTRACT_BLOCK,
  runtime: OD_NEXT_RUNTIME_STATE_BLOCK,
};

const RESERVED_PREFIXES = (Object.values(MACHINE_TAGS).flatMap((tag) => [
  `<${tag}`,
  `</${tag}`,
])).map((value) => value.toLowerCase());

function longestReservedPrefixSuffix(value: string, candidates = RESERVED_PREFIXES): number {
  const lower = value.toLowerCase();
  let longest = 0;
  for (const candidate of candidates) {
    const limit = Math.min(candidate.length - 1, lower.length);
    for (let length = limit; length > longest; length -= 1) {
      if (lower.endsWith(candidate.slice(0, length))) {
        longest = length;
        break;
      }
    }
  }
  return longest;
}

function stripSingleJsonFence(value: string): string {
  const trimmed = value.trim();
  const match = /^```(?:json)?\s*\n([\s\S]*?)\n```$/iu.exec(trimmed);
  if (match?.[1]) return match[1].trim();
  return firstBalancedJsonObject(trimmed) ?? trimmed;
}

/**
 * Recover the block's JSON object when the agent wrapped it in prose or a
 * fence that carries trailing text. Hand-scanned so a pathological body cannot
 * cause catastrophic backtracking, and string literals are tracked so a brace
 * inside a value cannot end the object early.
 */
function firstBalancedJsonObject(value: string): string | null {
  const start = value.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return null;
}

function jsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/**
 * Incremental, strategy-only stream boundary. Reserved machine blocks are
 * withheld before callers can broadcast or persist the returned delta, so a
 * user never sees them; whatever the runtime-state block says is read once at
 * the end, leniently. The boundary deliberately has no ordinary-Run
 * auto-detection: activation comes from the durable task/run mapping.
 */
export class OdNextMachineProtocolStream {
  private readonly maxMachineBlockBytes: number;
  private pending = '';
  private current: CapturedBlock | null = null;
  private readonly blocks: CapturedBlock[] = [];
  private readonly visible: string[] = [];
  private finished = false;

  constructor(options: { maxMachineBlockBytes?: number } = {}) {
    const max = options.maxMachineBlockBytes ?? 256 * 1024;
    if (!Number.isSafeInteger(max) || max < 1) {
      throw new TypeError('maxMachineBlockBytes must be a positive safe integer.');
    }
    this.maxMachineBlockBytes = max;
  }

  push(chunk: string): string {
    if (this.finished) throw new Error('OD Next machine protocol stream is already finished.');
    if (typeof chunk !== 'string' || chunk.length === 0) return '';
    this.pending += chunk;
    const emitted: string[] = [];
    this.drain(emitted, false);
    const delta = emitted.join('');
    if (delta) this.visible.push(delta);
    return delta;
  }

  finish(): OdNextProtocolResult {
    if (this.finished) throw new Error('OD Next machine protocol stream is already finished.');
    this.finished = true;
    const emitted: string[] = [];
    this.drain(emitted, true);
    if (emitted.length > 0) this.visible.push(emitted.join(''));
    if (this.current) {
      // An unclosed reserved block at EOF stays withheld: its bytes were
      // machine-addressed, and leaking half of them is worse than dropping them.
      this.appendMachineBody(this.pending);
      this.pending = '';
      this.finishCurrent();
    } else if (this.pending) {
      this.visible.push(this.pending);
      this.pending = '';
    }

    let declarations: StrategyTaskDeclarationsV2 = { ...OD_NEXT_NO_DECLARATIONS_V2 };
    let declarationBlockSeen = false;
    for (const block of this.blocks) {
      if (block.kind !== 'runtime' || block.tooLarge) continue;
      const parsed = jsonObject(stripSingleJsonFence(block.body));
      if (!parsed) continue;
      declarationBlockSeen = true;
      const read = readStrategyTaskDeclarationsV2(parsed);
      declarations = {
        nonDesignRequest: declarations.nonDesignRequest || read.nonDesignRequest,
        noFileWrites: declarations.noFileWrites || read.noFileWrites,
      };
    }
    return {
      visibleText: this.visible.join(''),
      declarations,
      declarationBlockSeen,
    };
  }

  private drain(emitted: string[], finishing: boolean): void {
    while (this.pending.length > 0) {
      if (this.current) {
        if (!this.drainMachine(finishing)) return;
      } else if (!this.drainVisible(emitted, finishing)) {
        return;
      }
    }
  }

  private drainVisible(emitted: string[], finishing: boolean): boolean {
    const lower = this.pending.toLowerCase();
    let first = -1;
    for (const prefix of RESERVED_PREFIXES) {
      const index = lower.indexOf(prefix);
      if (index !== -1 && (first === -1 || index < first)) first = index;
    }
    if (first === -1) {
      const hold = finishing ? 0 : longestReservedPrefixSuffix(this.pending);
      const length = this.pending.length - hold;
      if (length > 0) {
        emitted.push(this.pending.slice(0, length));
        this.pending = this.pending.slice(length);
      }
      return hold === 0;
    }
    if (first > 0) {
      emitted.push(this.pending.slice(0, first));
      this.pending = this.pending.slice(first);
      return true;
    }

    const lowerAtMarker = this.pending.toLowerCase();
    const kind: MachineKind = lowerAtMarker.startsWith(`<${MACHINE_TAGS.plan}`)
      || lowerAtMarker.startsWith(`</${MACHINE_TAGS.plan}`)
      ? 'plan'
      : 'runtime';
    const closing = lowerAtMarker.startsWith('</');
    const tagEnd = this.pending.indexOf('>');
    if (tagEnd === -1) {
      if (finishing) {
        // An incomplete reserved tag at EOF is machine-addressed bytes; drop it.
        this.pending = '';
        return true;
      }
      return false;
    }
    this.pending = this.pending.slice(tagEnd + 1);
    // A stray closing tag outside any block is dropped, never shown.
    if (closing) return true;
    this.current = { kind, body: '', bodyBytes: 0, tooLarge: false };
    return true;
  }

  private drainMachine(finishing: boolean): boolean {
    const current = this.current;
    if (!current) return true;
    // Requiring the closing tag to start on its own line prevents a
    // user-controlled JSON string containing `</open-design-…>` from ending
    // suppression and leaking the remaining machine body to SSE/persistence.
    const closePrefix = `\n</${MACHINE_TAGS[current.kind]}`;
    const lower = this.pending.toLowerCase();
    const closeIndex = lower.indexOf(closePrefix);
    if (closeIndex === -1) {
      const hold = finishing
        ? 0
        : longestReservedPrefixSuffix(this.pending, [closePrefix]);
      const length = this.pending.length - hold;
      if (length > 0) {
        this.appendMachineBody(this.pending.slice(0, length));
        this.pending = this.pending.slice(length);
      }
      return hold === 0;
    }
    if (closeIndex > 0) {
      this.appendMachineBody(this.pending.slice(0, closeIndex));
      this.pending = this.pending.slice(closeIndex);
      return true;
    }
    const tagEnd = this.pending.indexOf('>');
    if (tagEnd === -1) {
      if (finishing) {
        // EOF cannot leave the drain loop parked on a reserved closing prefix.
        this.pending = '';
        this.finishCurrent();
        return true;
      }
      return false;
    }
    this.pending = this.pending.slice(tagEnd + 1);
    this.finishCurrent();
    return true;
  }

  private appendMachineBody(value: string): void {
    const current = this.current;
    if (!current || !value) return;
    current.bodyBytes += Buffer.byteLength(value, 'utf8');
    if (!current.tooLarge && current.bodyBytes > this.maxMachineBlockBytes) {
      current.tooLarge = true;
    }
    if (!current.tooLarge) current.body += value;
  }

  private finishCurrent(): void {
    const current = this.current;
    if (!current) return;
    this.blocks.push(current);
    this.current = null;
  }
}

/** Explicit ordinary-Run branch used by the activation seam. */
export function passThroughOrdinaryAssistantText(
  boundary: OdNextMachineProtocolStream | null,
  chunk: string,
): string {
  return boundary ? boundary.push(chunk) : chunk;
}

/**
 * Physical-run emission boundary. Streamed text passes through the block
 * stripper; whatever the stripper was still holding back at close time is the
 * `visibleTail` the caller must still publish.
 */
export function createOdNextRunProtocol() {
  const protocol = new OdNextMachineProtocolStream();
  let visibleEmitted = 0;
  return {
    push(delta: string): string {
      const visible = protocol.push(delta);
      visibleEmitted += visible.length;
      return visible;
    },
    finish(): { parsed: OdNextProtocolResult; visibleTail: string } {
      const parsed = protocol.finish();
      return { parsed, visibleTail: parsed.visibleText.slice(visibleEmitted) };
    },
  };
}
