import {
  OD_NEXT_PLAN_CONTRACT_BLOCK,
  OD_NEXT_RUNTIME_STATE_BLOCK,
  OpenDesignPlanContractV2Schema,
  StrategyRuntimeStateV2Schema,
  type OpenDesignPlanContractV2,
  type StrategyRuntimeStateV2,
} from '@open-design/contracts';

export type OdNextProtocolReasonCode =
  | 'od_next_protocol_machine_block_malformed'
  | 'od_next_protocol_machine_block_too_large'
  | 'od_next_protocol_plan_contract_duplicate'
  | 'od_next_protocol_plan_contract_invalid_json'
  | 'od_next_protocol_plan_contract_invalid_schema'
  | 'od_next_protocol_runtime_state_duplicate'
  | 'od_next_protocol_runtime_state_invalid_json'
  | 'od_next_protocol_runtime_state_invalid_schema'
  | 'od_next_protocol_runtime_state_missing';

export interface OdNextProtocolIssue {
  code: OdNextProtocolReasonCode;
  detail: string;
}

export interface OdNextMachineProtocolResult {
  visibleText: string;
  planContract?: OpenDesignPlanContractV2;
  runtimeState?: StrategyRuntimeStateV2;
  /**
   * Schema-valid semantic anchors recovered from wrapper/fence defects. They
   * are never accepted as wire output; the Coordinator may use exactly one as
   * the immutable hash anchor for the one allowed serialization repair.
   */
  repairPlanContract?: OpenDesignPlanContractV2;
  repairRuntimeState?: StrategyRuntimeStateV2;
  issues: OdNextProtocolIssue[];
  /**
   * Deterministic, meaning-preserving corrections applied before schema
   * validation. A normalization is not a protocol defect: it removes an
   * agent declaration that carries no authority at this stage (for example a
   * premature execution-mode prediction on a clarification turn).
   */
  normalizations: string[];
}

type MachineKind = 'plan' | 'runtime';

interface CapturedBlock {
  kind: MachineKind;
  body: string;
  bodyBytes: number;
  exactOpen: boolean;
  exactClose: boolean;
  tooLarge: boolean;
}

const MACHINE = {
  plan: {
    tag: OD_NEXT_PLAN_CONTRACT_BLOCK,
    duplicateCode: 'od_next_protocol_plan_contract_duplicate',
    jsonCode: 'od_next_protocol_plan_contract_invalid_json',
    schemaCode: 'od_next_protocol_plan_contract_invalid_schema',
  },
  runtime: {
    tag: OD_NEXT_RUNTIME_STATE_BLOCK,
    duplicateCode: 'od_next_protocol_runtime_state_duplicate',
    jsonCode: 'od_next_protocol_runtime_state_invalid_json',
    schemaCode: 'od_next_protocol_runtime_state_invalid_schema',
  },
} as const;

const RESERVED_PREFIXES = (Object.values(MACHINE).flatMap(({ tag }) => [
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
 * Recover the machine block's JSON object when the agent wrapped it in
 * something the whole-body fence pattern cannot match — prose either side of
 * the block, a fence that carries trailing text, a missing newline before the
 * closing fence.
 *
 * That is the same class of wrapper defect the fence strip already exists to
 * undo, and the anchor it produces is held to exactly the same bar: it must
 * still satisfy the block's full schema, and it is only ever usable as the one
 * allowed serialization-repair anchor, never accepted as wire output. A wrong
 * extraction therefore fails validation and yields nothing rather than being
 * mistaken for a declaration.
 *
 * Hand-scanned rather than matched with a regex so a pathological body cannot
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

function jsonValue(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

/**
 * Incremental, strategy-only stream boundary. Exact reserved machine blocks
 * are withheld before callers can broadcast or persist the returned delta.
 * The boundary deliberately has no ordinary-Run auto-detection: Task10 owns
 * activation from the durable task/run mapping.
 */
/**
 * Name the fields a machine block got wrong, not just the first message.
 *
 * Zod's bare message for an absent required field is the word "Required", which
 * on its own cannot tell an operator WHICH field the agent omitted — and that is
 * the single most common way a Plan Contract or Runtime State is refused. The
 * path is what makes the report actionable, so carry it.
 *
 * Only Zod's own structural vocabulary is emitted — field paths and validator
 * messages. No agent prose, Prompt body, or user content reaches this string,
 * and it stays bounded so a pathological error cannot flood the daemon log.
 */
function describeMachineSchemaFailure(
  tag: string,
  error: { issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }> },
): string {
  const described = error.issues.slice(0, 4).map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  if (described.length === 0) return `${tag} failed schema validation.`;
  const more = error.issues.length > described.length
    ? ` (+${error.issues.length - described.length} more)`
    : '';
  return `${tag} failed schema validation — ${described.join('; ')}${more}`.slice(0, 400);
}

export class OdNextMachineProtocolStream {
  private readonly maxMachineBlockBytes: number;
  private pending = '';
  private current: CapturedBlock | null = null;
  private readonly blocks: CapturedBlock[] = [];
  private readonly streamIssues: OdNextProtocolIssue[] = [];
  private readonly normalizations: string[] = [];
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

  finish(): OdNextMachineProtocolResult {
    if (this.finished) throw new Error('OD Next machine protocol stream is already finished.');
    this.finished = true;
    const emitted: string[] = [];
    this.drain(emitted, true);
    if (emitted.length > 0) this.visible.push(emitted.join(''));
    if (this.current) {
      this.appendMachineBody(this.pending);
      this.pending = '';
      this.current.exactClose = false;
      this.issue(
        'od_next_protocol_machine_block_malformed',
        `Unclosed <${MACHINE[this.current.kind].tag}> block.`,
      );
      this.finishCurrent();
    } else if (this.pending) {
      this.visible.push(this.pending);
      this.pending = '';
    }

    const issues = [...this.streamIssues];
    const plan = this.parseKind('plan', issues);
    const runtime = this.parseKind('runtime', issues);
    if (this.blocks.filter((block) => block.kind === 'runtime').length === 0) {
      issues.push({
        code: 'od_next_protocol_runtime_state_missing',
        detail: 'Every OD Next response requires exactly one Runtime State block.',
      });
    }
    return {
      visibleText: this.visible.join(''),
      normalizations: [...this.normalizations],
      ...(plan.strict ? { planContract: plan.strict } : {}),
      ...(runtime.strict ? { runtimeState: runtime.strict } : {}),
      ...(!plan.strict && plan.repair ? { repairPlanContract: plan.repair } : {}),
      ...(!runtime.strict && runtime.repair ? { repairRuntimeState: runtime.repair } : {}),
      issues,
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
    const kind = lowerAtMarker.startsWith(`<${MACHINE.plan.tag}`)
      || lowerAtMarker.startsWith(`</${MACHINE.plan.tag}`)
      ? 'plan'
      : 'runtime';
    const closing = lowerAtMarker.startsWith(`</`);
    const tagEnd = this.pending.indexOf('>');
    if (tagEnd === -1) {
      if (finishing) {
        this.issue(
          'od_next_protocol_machine_block_malformed',
          `Incomplete reserved ${kind} machine tag.`,
        );
        this.pending = '';
        return true;
      }
      return false;
    }
    const rawTag = this.pending.slice(0, tagEnd + 1);
    this.pending = this.pending.slice(tagEnd + 1);
    if (closing) {
      this.issue(
        'od_next_protocol_machine_block_malformed',
        `Unexpected closing </${MACHINE[kind].tag}> tag.`,
      );
      return true;
    }
    const exactOpen = rawTag === `<${MACHINE[kind].tag}>`;
    if (!exactOpen) {
      this.issue(
        'od_next_protocol_machine_block_malformed',
        `Machine block <${MACHINE[kind].tag}> must use the exact wrapper.`,
      );
    }
    this.current = {
      kind,
      body: '',
      bodyBytes: 0,
      exactOpen,
      exactClose: false,
      tooLarge: false,
    };
    return true;
  }

  private drainMachine(finishing: boolean): boolean {
    const current = this.current;
    if (!current) return true;
    // The versioned wire examples require a line-delimited wrapper. Requiring
    // the closing tag to start on its own line prevents a user-controlled JSON
    // string containing `</open-design-...>` from terminating suppression and
    // leaking the remaining machine body to SSE/message persistence.
    const closePrefix = `\n</${MACHINE[current.kind].tag}`;
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
        // Consume the incomplete tag without treating it as JSON body so the
        // schema-valid payload remains available only as a repair anchor.
        this.pending = '';
        current.exactClose = false;
        this.issue(
          'od_next_protocol_machine_block_malformed',
          `Incomplete closing </${MACHINE[current.kind].tag}> tag.`,
        );
        this.finishCurrent();
        return true;
      }
      return false;
    }
    const rawTag = this.pending.slice(0, tagEnd + 1);
    this.pending = this.pending.slice(tagEnd + 1);
    current.exactClose = rawTag === `${closePrefix}>`;
    if (!current.exactClose) {
      this.issue(
        'od_next_protocol_machine_block_malformed',
        `Machine block </${MACHINE[current.kind].tag}> must use the exact wrapper.`,
      );
    }
    this.finishCurrent();
    return true;
  }

  private appendMachineBody(value: string): void {
    const current = this.current;
    if (!current || !value) return;
    current.bodyBytes += Buffer.byteLength(value, 'utf8');
    if (!current.tooLarge && current.bodyBytes > this.maxMachineBlockBytes) {
      current.tooLarge = true;
      this.issue(
        'od_next_protocol_machine_block_too_large',
        `${MACHINE[current.kind].tag} exceeded ${this.maxMachineBlockBytes} bytes.`,
      );
    }
    if (!current.tooLarge) current.body += value;
  }

  private finishCurrent(): void {
    const current = this.current;
    if (!current) return;
    this.blocks.push(current);
    this.current = null;
  }

  private parseKind<T extends MachineKind>(
    kind: T,
    issues: OdNextProtocolIssue[],
  ): {
    strict?: T extends 'plan' ? OpenDesignPlanContractV2 : StrategyRuntimeStateV2;
    repair?: T extends 'plan' ? OpenDesignPlanContractV2 : StrategyRuntimeStateV2;
  } {
    type Parsed = T extends 'plan' ? OpenDesignPlanContractV2 : StrategyRuntimeStateV2;
    const blocks = this.blocks.filter((block) => block.kind === kind);
    const metadata = MACHINE[kind];
    if (blocks.length > 1) {
      issues.push({
        code: metadata.duplicateCode,
        detail: `Expected at most one ${metadata.tag} block, received ${blocks.length}.`,
      });
      return {};
    }
    const block = blocks[0];
    if (!block || block.tooLarge) return {};
    const schema = kind === 'plan'
      ? OpenDesignPlanContractV2Schema
      : StrategyRuntimeStateV2Schema;

    if (block.exactOpen && block.exactClose) {
      const exactJson = jsonValue(block.body.trim());
      if (!exactJson.ok) {
        issues.push({
          code: metadata.jsonCode,
          detail: `${metadata.tag} must contain JSON only, without Markdown fences.`,
        });
      } else {
        const parsed = schema.safeParse(this.normalizeMachineValue(kind, exactJson.value));
        if (parsed.success) return { strict: parsed.data as Parsed };
        issues.push({
          code: metadata.schemaCode,
          detail: describeMachineSchemaFailure(metadata.tag, parsed.error),
        });
        return {};
      }
    }

    const recoveredJson = jsonValue(stripSingleJsonFence(block.body));
    if (!recoveredJson.ok) return {};
    const recovered = schema.safeParse(this.normalizeMachineValue(kind, recoveredJson.value));
    return recovered.success ? { repair: recovered.data as Parsed } : {};
  }

  /**
   * A clarification turn cannot lock the execution mode — the daemon owns
   * mode locking after clarification resolves — so an agent that predicts a
   * mode alongside outcome clarification_required has emitted an authority-
   * free field, not a defect. Discard exactly that field and record the
   * normalization; every other shape passes through to schema validation
   * unchanged.
   */
  private normalizeMachineValue(kind: MachineKind, value: unknown): unknown {
    if (kind !== 'runtime') return value;
    if (
      typeof value !== 'object'
      || value === null
      || Array.isArray(value)
    ) return value;
    const record = value as Record<string, unknown>;
    if (
      record['outcome'] !== 'clarification_required'
      || record['executionMode'] === null
      || record['executionMode'] === undefined
    ) return value;
    this.normalizations.push('od_next_protocol_clarification_execution_mode_normalized');
    return { ...record, executionMode: null };
  }

  private issue(code: OdNextProtocolReasonCode, detail: string): void {
    this.streamIssues.push({ code, detail });
  }
}

/** Explicit ordinary-Run branch used by Task10's future activation seam. */
export function passThroughOrdinaryAssistantText(
  boundary: OdNextMachineProtocolStream | null,
  chunk: string,
): string {
  return boundary ? boundary.push(chunk) : chunk;
}
