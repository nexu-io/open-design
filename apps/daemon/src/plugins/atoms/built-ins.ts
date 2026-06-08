// Plan §3.D — built-in atom workers.
//
// Registered on first use into the worker registry. Every atom in
// FIRST_PARTY_ATOMS gets at least a permissive worker so the
// registry-driven pipeline runner stays at parity with the v1 stub
// for atoms whose real work happens entirely inside the agent CLI
// (file-write, todo-write, media-image, …) — the daemon has no
// independent ground truth to observe there and shipping a real
// watcher would force the agent into a fixed protocol we explicitly
// kept out of scope.
//
// One atom does have a daemon-observable signal today:
// `critique-theater`. The worker walks the run's devloop audit log
// (`run_devloop_iterations.critique_summary`) and surfaces the
// most recent numeric score it finds. Picking "latest" rather than
// "lowest" matches real critique-loop semantics: the agent revises
// based on prior critique, so each new score reflects the current
// quality bar, not the worst earlier attempt.

import { FIRST_PARTY_ATOMS } from '../atoms.js';
import {
  registerAtomWorker,
  type AtomOutcome,
  type AtomWorkerContext,
} from './registry.js';

let installed = false;

export function registerBuiltInAtomWorkers(): void {
  if (installed) return;
  for (const atom of FIRST_PARTY_ATOMS) {
    if (atom.id === 'critique-theater') {
      registerAtomWorker({
        id:       atom.id,
        describe: 'reads run_devloop_iterations.critique_summary for real critique scores',
        run:      critiqueTheaterWorker,
      });
      continue;
    }
    registerAtomWorker({
      id:       atom.id,
      describe: 'permissive default (daemon has no independent ground truth for this atom)',
      run:      () => ({ signals: {} }),
    });
  }
  installed = true;
}

export function resetBuiltInAtomWorkersForTests(): void {
  installed = false;
}

function critiqueTheaterWorker(ctx: AtomWorkerContext): AtomOutcome {
  type Row = { iteration: number; critique_summary: string | null };
  const rows = ctx.db
    .prepare(
      'SELECT iteration, critique_summary FROM run_devloop_iterations WHERE run_id = ? AND stage_id = ? ORDER BY iteration DESC',
    )
    .all(ctx.runId, ctx.stage.id) as Row[];
  for (const row of rows) {
    const score = parseCritiqueScore(row.critique_summary);
    if (score === null) continue;
    return {
      signals: { 'critique.score': score },
      note:    `latest critique score=${score} from iteration ${row.iteration}`,
    };
  }
  return { signals: {} };
}

// Matches `score=4`, `score: 4.5`, `Critique score 4/5`, etc.
function parseCritiqueScore(summary: string | null): number | null {
  if (!summary) return null;
  const match = summary.match(/score\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}
