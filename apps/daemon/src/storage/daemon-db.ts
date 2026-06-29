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
// `OD_DAEMON_DB=postgres` selects the Postgres-backed compatibility
// adapter used by container deployments that cannot rely on a local
// SQLite file.

export type DaemonDbKind = 'sqlite' | 'postgres';

export interface DaemonDbConfig {
  kind: DaemonDbKind;
  // Resolution metadata the future Postgres adapter will read.
  postgres?: {
    host:     string;
    port:     number;
    database: string;
    user:     string;
    password?: string;
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
  const kind = (e.OD_DAEMON_DB ?? 'sqlite').trim().toLowerCase();
  if (kind === 'postgres') {
    const host = e.OD_PG_HOST ?? '';
    const portStr = e.OD_PG_PORT ?? '5432';
    const database = e.OD_PG_DATABASE ?? '';
    const user = e.OD_PG_USER ?? '';
    const password = e.OD_PG_PASSWORD ?? '';
    const sslMode = e.OD_PG_SSL_MODE === 'disable' || e.OD_PG_SSL_MODE === 'verify-full'
      ? e.OD_PG_SSL_MODE
      : 'require';
    if (!host || !database || !user) {
      throw new DaemonDbConfigError(
        'OD_DAEMON_DB=postgres requires OD_PG_HOST, OD_PG_DATABASE, OD_PG_USER. ' +
        'OD_PG_PORT defaults to 5432; OD_PG_SSL_MODE defaults to "require".',
      );
    }
    const postgres: NonNullable<DaemonDbConfig['postgres']> = {
      host,
      port: Number.parseInt(portStr, 10) || 5432,
      database,
      user,
      sslMode,
    };
    if (password) postgres.password = password;
    return {
      kind: 'postgres',
      postgres,
    };
  }
  if (kind !== 'sqlite' && kind !== '') {
    throw new DaemonDbConfigError(
      `unknown OD_DAEMON_DB value '${kind}'. Accepted: 'sqlite' (default), 'postgres'.`,
    );
  }
  return { kind: 'sqlite' };
}
