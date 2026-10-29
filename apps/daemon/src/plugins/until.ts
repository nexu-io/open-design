// `until` expression evaluator (spec §10.1 / §10.2). Closed vocabulary;
// not arbitrary JS. The grammar is an `||`-separated disjunction of
// `&&`-joined comparisons over known signal variables, for example:
//
//   critique.score         number  — last critique-theater dim score (0..5)
//   iterations             number  — completed devloop iterations on this stage
//   user.confirmed         boolean — last `confirmation` surface answer
//   preview.ok             boolean — last `live-artifact` preview load result
//
// Comparison operators: == != >= <= > < (booleans support ==/!= only).
// Boolean literals: true / false. Number literals: any JSON number.
// A bare boolean signal reads as `== true`, and parentheses group terms;
// groups are flattened into the same disjunction of conjunctions.
//
// The evaluator is intentionally tiny so `od plugin doctor` can syntax-check
// at install time without booting an interpreter, and the daemon refuses
// to execute a stage whose `until` does not parse.

export type SignalKind = 'number' | 'boolean';

export interface UntilSignals {
  'critique.score'?: number | undefined;
  'iterations'?:     number | undefined;
  'user.confirmed'?: boolean | undefined;
  'preview.ok'?:     boolean | undefined;
  // Plan §3.N1 / spec §22.4 — promoted by the build-test atom
  // (Phase 7 entry slice). Lets a plan write
  // `until: 'build.passing && tests.passing'` directly instead of
  // collapsing pass/fail into critique.score.
  'build.passing'?:  boolean | undefined;
  'tests.passing'?:  boolean | undefined;
}

const SIGNAL_KINDS: Record<keyof UntilSignals, SignalKind> = {
  'critique.score': 'number',
  'iterations':     'number',
  'user.confirmed': 'boolean',
  'preview.ok':     'boolean',
  'build.passing':  'boolean',
  'tests.passing':  'boolean',
};

export type UntilOp = '==' | '!=' | '>=' | '<=' | '>' | '<';

export interface UntilComparison {
  signal: keyof UntilSignals;
  op:     UntilOp;
  value:  number | boolean;
}

// Disjunction of conjunctions: at least one outer term must hold; each
// inner term is a comparison over a known signal.
export interface UntilExpression {
  any: UntilComparison[][];
}

export class UntilSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UntilSyntaxError';
  }
}

// Flattening `(a || b) && (c || d) && …` multiplies the alternatives, so a
// third-party manifest could otherwise make `od plugin doctor` expand an
// exponential product at install time.
const MAX_ALTERNATIVES = 64;

export function parseUntil(source: string): UntilExpression {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    throw new UntilSyntaxError('empty until expression');
  }
  return { any: parseDisjunction(trimmed, source) };
}

function parseDisjunction(input: string, source: string): UntilComparison[][] {
  const any = splitTopLevel(input, '||').flatMap((orTerm) => parseConjunction(orTerm, source));
  if (any.length === 0) {
    throw new UntilSyntaxError(`no terms in "${source}"`);
  }
  return any;
}

// A conjunction of groups distributes into one conjunction per combination:
// `(a || b) && c` becomes `(a && c) || (b && c)`.
function parseConjunction(input: string, source: string): UntilComparison[][] {
  let product: UntilComparison[][] = [[]];
  for (const andTerm of splitTopLevel(input, '&&')) {
    const group = stripOuterParens(andTerm);
    const alternatives = group === andTerm
      ? [[parseComparison(andTerm)]]
      : parseDisjunction(group, source);
    if (product.length * alternatives.length > MAX_ALTERNATIVES) {
      throw new UntilSyntaxError(
        `"${source}" expands to more than ${MAX_ALTERNATIVES} alternatives`,
      );
    }
    product = product.flatMap((left) => alternatives.map((right) => [...left, ...right]));
  }
  return product;
}

function splitTopLevel(input: string, sep: '||' | '&&'): string[] {
  const parts: string[] = [];
  let cursor = 0;
  let depth = 0;
  for (let i = 0; i < input.length - 1; i += 1) {
    const ch = input[i] as string;
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (depth === 0 && ch === sep[0] && input[i + 1] === sep[1]) {
      parts.push(input.slice(cursor, i));
      cursor = i + 2;
      i += 1;
    }
  }
  parts.push(input.slice(cursor));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function parseComparison(expression: string): UntilComparison {
  const opMatch = expression.match(/(==|!=|>=|<=|>|<)/);
  if (!opMatch || opMatch.index === undefined) {
    if (SIGNAL_KINDS[expression as keyof UntilSignals] === 'boolean') {
      return { signal: expression as keyof UntilSignals, op: '==', value: true };
    }
    throw new UntilSyntaxError(`expected comparison operator in "${expression}"`);
  }
  const op = opMatch[0] as UntilOp;
  const lhs = expression.slice(0, opMatch.index).trim();
  const rhs = expression.slice(opMatch.index + op.length).trim();
  if (!(lhs in SIGNAL_KINDS)) {
    throw new UntilSyntaxError(
      `unknown signal "${lhs}" — supported: ${Object.keys(SIGNAL_KINDS).join(', ')}`,
    );
  }
  const signal = lhs as keyof UntilSignals;
  const kind = SIGNAL_KINDS[signal];
  let value: number | boolean;
  if (kind === 'boolean') {
    if (rhs !== 'true' && rhs !== 'false') {
      throw new UntilSyntaxError(`signal "${signal}" expects true/false, got "${rhs}"`);
    }
    if (op !== '==' && op !== '!=') {
      throw new UntilSyntaxError(
        `boolean signal "${signal}" only supports == and !=, got "${op}"`,
      );
    }
    value = rhs === 'true';
  } else {
    const parsed = Number(rhs);
    if (!Number.isFinite(parsed)) {
      throw new UntilSyntaxError(`signal "${signal}" expects a number, got "${rhs}"`);
    }
    value = parsed;
  }
  return { signal, op, value };
}

function stripOuterParens(input: string): string {
  let s = input;
  while (s.startsWith('(') && s.endsWith(')')) {
    let depth = 0;
    let isOuter = true;
    for (let i = 0; i < s.length - 1; i += 1) {
      const ch = s[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      if (depth === 0 && i < s.length - 1) {
        isOuter = false;
        break;
      }
    }
    if (!isOuter) return s;
    s = s.slice(1, -1).trim();
  }
  return s;
}

export interface EvaluationResult {
  satisfied: boolean;
  // The first matching conjunction's terms — useful for debugging /
  // event payloads. Empty when no term holds.
  matched:   UntilComparison[];
}

export function evaluateUntil(
  expression: UntilExpression,
  signals: UntilSignals,
): EvaluationResult {
  for (const conjunction of expression.any) {
    let allHold = true;
    for (const term of conjunction) {
      if (!evaluateTerm(term, signals)) {
        allHold = false;
        break;
      }
    }
    if (allHold) return { satisfied: true, matched: conjunction };
  }
  return { satisfied: false, matched: [] };
}

function evaluateTerm(term: UntilComparison, signals: UntilSignals): boolean {
  const left = signals[term.signal];
  if (left === undefined) return false;
  if (typeof term.value === 'boolean') {
    if (typeof left !== 'boolean') return false;
    return term.op === '==' ? left === term.value : left !== term.value;
  }
  if (typeof left !== 'number') return false;
  const right = term.value;
  switch (term.op) {
    case '==': return left === right;
    case '!=': return left !== right;
    case '>=': return left >= right;
    case '<=': return left <= right;
    case '>':  return left >  right;
    case '<':  return left <  right;
  }
}

export function isParseableUntil(source: string): boolean {
  try {
    parseUntil(source);
    return true;
  } catch {
    return false;
  }
}
