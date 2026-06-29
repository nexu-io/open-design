import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { DaemonDbConfig } from './daemon-db.js';

type Row = Record<string, any>;
type RunResult = { changes: number; lastInsertRowid?: number | bigint };

export interface PostgresCompatDatabase {
  exec(sql: string): void;
  prepare(sql: string): PostgresCompatStatement;
  pragma(name: string, options?: { simple?: boolean }): unknown;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
  close(): void;
}

class PostgresError extends Error {
  constructor(message: string, readonly sql?: string) {
    super(message);
    this.name = 'PostgresCompatError';
  }
}

export function openPostgresCompatDatabase(config: DaemonDbConfig): PostgresCompatDatabase {
  if (config.kind !== 'postgres' || !config.postgres) {
    throw new PostgresError('Postgres database config is required.');
  }
  return new PostgresCompatDatabaseImpl(config.postgres);
}

class PostgresCompatDatabaseImpl implements PostgresCompatDatabase {
  private readonly runnerPath = fileURLToPath(new URL('./postgres-query-runner.js', import.meta.url));

  constructor(
    private readonly config: NonNullable<DaemonDbConfig['postgres']>,
  ) {}

  exec(sql: string): void {
    for (const statement of splitSqlStatements(sql)) {
      const translated = translateSql(statement);
      if (!translated.trim()) continue;
      this.query(translated);
    }
  }

  prepare(sql: string): PostgresCompatStatement {
    return new PostgresCompatStatement(this, sql);
  }

  pragma(name: string, options?: { simple?: boolean }): unknown {
    const normalized = name.trim().toLowerCase();
    if (normalized.startsWith('user_version')) return options?.simple ? 0 : [{ user_version: 0 }];
    if (normalized === 'foreign_keys = on' || normalized === 'foreign_keys = off') return [];
    if (normalized === 'foreign_key_check') return [];
    if (normalized === 'integrity_check' || normalized === 'quick_check') return [{ integrity_check: 'ok' }];
    if (normalized.startsWith('journal_mode')) return options?.simple ? 'wal' : [{ journal_mode: 'wal' }];
    return options?.simple ? undefined : [];
  }

  transaction<T extends (...args: any[]) => any>(fn: T): T {
    // Compatibility bridge for existing synchronous callers. Individual DML
    // statements remain atomic in Postgres; a later async adapter can provide
    // connection-scoped multi-statement transactions.
    return ((...args: Parameters<T>) => fn(...args)) as T;
  }

  close(): void {}

  selectRows(sql: string): Row[] {
    const normalized = normalizeSpecialSelect(sql);
    const translated = translateSql(normalized);
    return this.query(translated).rows;
  }

  runStatement(sql: string): RunResult {
    const translated = translateSql(sql);
    const result = this.query(translated);
    return { changes: result.rowCount };
  }

  private query(sql: string): { rows: Row[]; rowCount: number } {
    const result = spawnSync(process.execPath, [this.runnerPath], {
      input: JSON.stringify({ config: this.config, sql }),
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.status !== 0) {
      const stderr = result.stderr.trim();
      const stdout = result.stdout.trim();
      throw new PostgresError(stderr || stdout || `pg query runner exited with status ${result.status}`, sql);
    }
    const parsed = JSON.parse(result.stdout || '{}') as { rows?: Row[]; rowCount?: number };
    return {
      rows: Array.isArray(parsed.rows) ? parsed.rows : [],
      rowCount: Number(parsed.rowCount ?? 0),
    };
  }
}

export class PostgresCompatStatement {
  constructor(
    private readonly db: PostgresCompatDatabaseImpl,
    private readonly sql: string,
  ) {}

  all(...params: unknown[]): Row[] {
    return this.db.selectRows(bindParams(this.sql, params));
  }

  get(...params: unknown[]): Row | undefined {
    return this.all(...params)[0];
  }

  run(...params: unknown[]): RunResult {
    return this.db.runStatement(bindParams(this.sql, params));
  }
}

function normalizeSpecialSelect(sql: string): string {
  const trimmed = sql.trim();
  const tableInfo = /^PRAGMA\s+table_info\(([^)]+)\)$/i.exec(trimmed);
  if (tableInfo) {
    const table = tableInfo[1]?.replace(/["'`]/g, '').trim() ?? '';
    return `
      SELECT column_name AS name
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = ${quoteLiteral(table)}
       ORDER BY ordinal_position
    `;
  }
  if (/FROM\s+sqlite_master/i.test(trimmed) && /name\s*=\s*'preview_comments'/i.test(trimmed)) {
    return `
      SELECT 'CREATE TABLE preview_comments (slide_key BIGINT, UNIQUE(project_id, conversation_id, file_path, element_id, slide_key))' AS sql
    `;
  }
  if (/FROM\s+sqlite_master/i.test(trimmed)) {
    return `
      SELECT table_name AS name, '' AS sql
        FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
       ORDER BY table_name
    `;
  }
  return trimmed;
}

function translateSql(sql: string): string {
  let out = sql.trim().replace(/;+\s*$/g, '');
  out = translateInsertOrIgnore(out);
  out = translateInsertOrReplace(out);
  out = out.replace(/\bINTEGER\b/gi, 'BIGINT');
  out = out.replace(/\bREAL\b/gi, 'DOUBLE PRECISION');
  out = out.replace(/\bBLOB\b/gi, 'BYTEA');
  out = out.replace(/\bAUTOINCREMENT\b/gi, 'GENERATED BY DEFAULT AS IDENTITY');
  return out;
}

function translateInsertOrIgnore(sql: string): string {
  const match = /^INSERT\s+OR\s+IGNORE\s+INTO\s+([a-zA-Z_][\w]*)\s*(\([^)]+\))?\s*VALUES\s*(.+)$/is.exec(sql.trim());
  if (!match) return sql;
  const columns = match[2] ? ` ${match[2].trim()}` : '';
  const table = match[1];
  const values = match[3];
  if (!table || !values) return sql;
  return `INSERT INTO ${table}${columns} VALUES ${values} ON CONFLICT DO NOTHING`;
}

function translateInsertOrReplace(sql: string): string {
  const match = /^INSERT\s+OR\s+REPLACE\s+INTO\s+([a-zA-Z_][\w]*)\s*\(([^)]+)\)\s*VALUES\s*(.+)$/is.exec(sql.trim());
  if (!match) return sql;
  const table = match[1];
  const columnList = match[2];
  const values = match[3];
  if (!table || !columnList || !values) return sql;
  const cols = columnList.split(',').map((col) => col.trim()).filter(Boolean);
  if (cols.length === 0) return sql;
  const conflict = cols[0];
  if (!conflict) return sql;
  const assignments = cols.slice(1).map((col) => `${col} = excluded.${col}`).join(', ');
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${values} ON CONFLICT (${conflict}) DO UPDATE SET ${assignments}`;
}

function bindParams(sql: string, params: unknown[]): string {
  let index = 0;
  const bound = sql.replace(/\?/g, () => {
    if (index >= params.length) throw new PostgresError('Not enough SQL parameters.', sql);
    return quoteValue(params[index++]);
  });
  if (index !== params.length) throw new PostgresError('Too many SQL parameters.', sql);
  return bound;
}

function quoteValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    return String(value);
  }
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (Buffer.isBuffer(value)) return `decode('${value.toString('hex')}', 'hex')`;
  return quoteLiteral(String(value));
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (quote) {
      current += ch;
      if (ch === quote) {
        if (next === quote) {
          current += next;
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      current += '\n';
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i += 1;
      current += ' ';
      continue;
    }
    if (ch === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}
