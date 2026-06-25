// Phase 5 / spec §15.6 — `DaemonDb` adapter stub.
//
// Spec §15.6 calls out a Postgres adapter so multi-replica daemons
// can share state behind a load balancer. v1 ships local SQLite via
// better-sqlite3 (already in `apps/daemon/src/db.ts`). The full lift
// is a substantial migration; this module is the substrate slice
// that pins the parameter surface so a follow-up PR can land the
// adapter without re-litigating the env-var contract.
//
// Today's resolver simply records the operator's choice; the
// existing better-sqlite3 path is the only reachable backend.
// `MAX_DAEMON_DB=postgres` returns a stub that throws when used so
// a misconfigured operator sees a clear error instead of silently
// dropping writes onto a non-existent backend.

export type DaemonDbKind = 'sqlite' | 'postgres';

export interface DaemonDbConfig {
  kind: DaemonDbKind;
  // Resolution metadata the future Postgres adapter will read.
  postgres?: {
    host:     string;
    port:     number;
    database: string;
    user:     string;
    // Password / connection string are looked up at runtime from the
    // matching secret manager; we never read them through env at this
    // layer.
    sslMode?: 'disable' | 'require' | 'verify-full';
  };
}

export class DaemonDbConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DaemonDbConfigError';
  }
}

export function resolveDaemonDbConfig(env?: Record<string, string | undefined>): DaemonDbConfig {
  const e = env ?? process.env;
  const kind = (e.MAX_DAEMON_DB ?? 'sqlite').trim().toLowerCase();
  if (kind === 'postgres') {
    const host = e.MAX_PG_HOST ?? '';
    const portStr = e.MAX_PG_PORT ?? '5432';
    const database = e.MAX_PG_DATABASE ?? '';
    const user = e.MAX_PG_USER ?? '';
    const sslMode = e.MAX_PG_SSL_MODE === 'disable' || e.MAX_PG_SSL_MODE === 'verify-full'
      ? e.MAX_PG_SSL_MODE
      : 'require';
    if (!host || !database || !user) {
      throw new DaemonDbConfigError(
        'MAX_DAEMON_DB=postgres requires MAX_PG_HOST, MAX_PG_DATABASE, MAX_PG_USER. ' +
        'MAX_PG_PORT defaults to 5432; MAX_PG_SSL_MODE defaults to "require".',
      );
    }
    return {
      kind: 'postgres',
      postgres: {
        host,
        port:     Number.parseInt(portStr, 10) || 5432,
        database,
        user,
        sslMode,
      },
    };
  }
  if (kind !== 'sqlite' && kind !== '') {
    throw new DaemonDbConfigError(
      `unknown MAX_DAEMON_DB value '${kind}'. Accepted: 'sqlite' (default), 'postgres'.`,
    );
  }
  return { kind: 'sqlite' };
}
