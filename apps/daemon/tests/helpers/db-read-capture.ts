import type Database from 'better-sqlite3';

/**
 * Every row a database read hands to JS while `run` executes, serialized at
 * read time — the same technique as `db-list-conversations-events-payload`.
 *
 * "Does this path materialize an event log in JS?" is categorical: a read
 * either returns the column's payload or it does not. Counting the reads whose
 * rows carry a sentinel embedded in that payload states it exactly, where a
 * timing or memory threshold would restate it as an inequality a loaded
 * machine can violate.
 */
export interface CapturedRead {
  sql: string;
  payload: string;
}

function instrument(db: Database.Database, reads: CapturedRead[]): () => void {
  const original = db.prepare.bind(db);
  (db as { prepare: typeof db.prepare }).prepare = ((source: string) => {
    const statement = original(source);
    for (const method of ['all', 'get'] as const) {
      const inner = statement[method].bind(statement);
      (statement as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
        const rows = (inner as (...a: unknown[]) => unknown)(...args);
        reads.push({ sql: source, payload: JSON.stringify(rows ?? null) });
        return rows;
      };
    }
    const iterate = statement.iterate.bind(statement);
    (statement as unknown as Record<string, unknown>).iterate = function* (...args: unknown[]) {
      for (const row of (iterate as (...a: unknown[]) => Iterable<unknown>)(...args)) {
        reads.push({ sql: source, payload: JSON.stringify(row ?? null) });
        yield row;
      }
    };
    return statement;
  }) as typeof db.prepare;
  return () => {
    (db as { prepare: typeof db.prepare }).prepare = original;
  };
}

export function captureDbReads<T>(
  db: Database.Database,
  run: () => T,
): { result: T; reads: CapturedRead[] } {
  const reads: CapturedRead[] = [];
  const restore = instrument(db, reads);
  try {
    return { result: run(), reads };
  } finally {
    restore();
  }
}

export async function captureDbReadsAsync<T>(
  db: Database.Database,
  run: () => Promise<T>,
): Promise<{ result: T; reads: CapturedRead[] }> {
  const reads: CapturedRead[] = [];
  const restore = instrument(db, reads);
  try {
    return { result: await run(), reads };
  } finally {
    restore();
  }
}

export function readsCarrying(reads: readonly CapturedRead[], sentinel: string): CapturedRead[] {
  return reads.filter((read) => read.payload.includes(sentinel));
}
