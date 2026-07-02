// The signature engine moved to packages/contracts (Option B, #4359) so the web
// preview can compute it in-browser. The terminal renderers and CLI arg parser
// stay here because they are CLI-presentation concerns, not shared data
// contracts. The CLI (cli.ts) imports everything it needs from this module
// unchanged.
export {
  computeDesignSignature,
  computeDesignSignatureFromText,
  diffDesignSignatures,
  normalizeColor,
  normalizeShadow,
} from '@open-design/contracts/design-signature';
export type {
  DesignSignature,
  SignatureStrand,
  SignatureStrandKey,
  DesignSignatureDiff,
  SignatureChange,
  ChangeDirection,
} from '@open-design/contracts/design-signature';

import type {
  DesignSignature,
  DesignSignatureDiff,
  ChangeDirection,
} from '@open-design/contracts/design-signature';

// ---------------------------------------------------------------------------
// Terminal rendering. Kept here (pure, string-in/string-out) so the CLI
// handler stays a thin wrapper and the formatting is unit-testable.
// ---------------------------------------------------------------------------

/** Render a signature as a compact, human-readable block for `od signature`. */
export function renderSignatureForTerminal(sig: DesignSignature): string {
  const lines: string[] = [];
  lines.push(`Design Signature  ·  vitality ${sig.vitality}/100  ·  ${sig.fingerprint}`);
  lines.push('');
  for (const s of sig.strands) {
    lines.push(`  ${s.label.padEnd(8)} ${bar(s.score)} ${String(s.score).padStart(3)}  ${s.detail}`);
  }
  return lines.join('\n');
}

// A 10-cell unicode meter. Deterministic, no color codes (keeps output stable
// for tests and pipes); the web panel renders the same scores graphically.
function bar(score: number): string {
  const filled = Math.round(Math.max(0, Math.min(100, score)) / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

// ---------------------------------------------------------------------------
// Diff — what changed between two signatures (the previous version vs. now).
// Pure and deterministic: it compares the token sets and strand scores and
// translates them into plain-language change lines a designer can read at a
// glance ("Heading scale increased", "Button radius increased").
// ---------------------------------------------------------------------------

/** Render a diff for `od signature --against`. */
export function renderDiffForTerminal(
  next: DesignSignature,
  diff: DesignSignatureDiff,
): string {
  const lines: string[] = [];
  lines.push(`Signature: ${next.fingerprint}`);
  lines.push('');
  if (diff.unchanged) {
    lines.push('No design changes since the previous version.');
    return lines.join('\n');
  }
  lines.push('Changes since last version:');
  for (const c of diff.changes) {
    lines.push(`  ${arrow(c.direction)} ${c.summary}`);
  }
  const sign = diff.vitalityDelta > 0 ? '+' : '';
  lines.push('');
  lines.push(`Vitality ${sign}${diff.vitalityDelta} (now ${next.vitality}/100).`);
  return lines.join('\n');
}

function arrow(d: ChangeDirection): string {
  return d === 'increased' ? '↑' : d === 'decreased' ? '↓' : '•';
}

// ---------------------------------------------------------------------------
// CLI argument parsing. Extracted so the `od signature` arg handling is unit
// testable without spawning a process. A bare `-` is the stdin target, not a
// flag; `--against`'s value is consumed so it is not read as the target.
// ---------------------------------------------------------------------------

export interface SignatureArgs {
  /** The artifact path, or `-` for stdin. undefined when none was given. */
  target: string | undefined;
  /** The previous-version path from --against, if any. */
  against: string | undefined;
  /** Whether --against was passed (so a missing value can be reported). */
  hasAgainst: boolean;
  /** Whether --json was passed. */
  json: boolean;
}

export function parseSignatureArgs(args: string[]): SignatureArgs {
  let against: string | undefined;
  let hasAgainst = false;
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? '';
    if (a === '--against') {
      hasAgainst = true;
      const next = args[i + 1];
      // Only treat the next token as the value if it is a real value: a normal
      // path, or the bare `-` stdin sentinel. A following flag (e.g. `--json`)
      // means the value is missing, so leave `against` undefined and let the
      // caller fail fast rather than opening a file named `--json`.
      if (next !== undefined && (next === '-' || !next.startsWith('-'))) {
        against = next;
        i++; // consume the value
      }
      continue;
    }
    if (a.startsWith('--against=')) {
      hasAgainst = true;
      against = a.slice('--against='.length);
      continue;
    }
    // A bare `-` is the stdin target, not a flag. Anything else starting with
    // `-` is a flag and is skipped from the positional scan.
    if (a === '-' || !a.startsWith('-')) positionals.push(a);
  }
  return {
    target: positionals[0],
    against,
    hasAgainst,
    json: args.includes('--json'),
  };
}
