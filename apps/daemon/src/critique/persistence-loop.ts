/**
 * Loop Persistence —— 循环引擎数据持久化
 *
 * 管理 critique_loops 和 critique_loop_iterations 两张表。
 * 需要合并到 apps/daemon/src/critique/persistence.ts。
 */

import type Database from 'better-sqlite3';

// ============================================================================
// 表结构定义
// ============================================================================

export interface CritiqueLoopRow {
  id: string;
  project_id: string;
  status: 'running' | 'converged' | 'exhausted' | 'interrupted' | 'timed_out' | 'degraded' | 'failed';
  max_iterations: number;
  total_iterations: number;
  best_composite: number | null;
  final_artifact_path: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface CritiqueLoopIterationRow {
  id: string;
  loop_id: string;
  iteration: number;
  run_id: string;
  status: string;
  composite: number | null;
  must_fix_count: number;
  fix_duration_ms: number | null;
  feedback_json: string | null;
  started_at: string;
  finished_at: string | null;
}

// ============================================================================
// DDL 迁移
// ============================================================================

/**
 * 创建循环相关表
 * 应在数据库初始化时调用
 */
export function migrateLoopSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS critique_loops (
      id                TEXT PRIMARY KEY,
      project_id        TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'running',
      max_iterations    INTEGER NOT NULL,
      total_iterations  INTEGER NOT NULL DEFAULT 0,
      best_composite    REAL,
      final_artifact_path TEXT,
      started_at        TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at       TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_critique_loops_project_id
      ON critique_loops(project_id);

    CREATE INDEX IF NOT EXISTS idx_critique_loops_status
      ON critique_loops(status);

    CREATE TABLE IF NOT EXISTS critique_loop_iterations (
      id              TEXT PRIMARY KEY,
      loop_id         TEXT NOT NULL,
      iteration       INTEGER NOT NULL,
      run_id          TEXT NOT NULL,
      status          TEXT NOT NULL,
      composite       REAL,
      must_fix_count  INTEGER NOT NULL DEFAULT 0,
      fix_duration_ms INTEGER,
      feedback_json   TEXT,
      started_at      TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at     TEXT,
      FOREIGN KEY (loop_id) REFERENCES critique_loops(id),
      FOREIGN KEY (run_id) REFERENCES critique_runs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_critique_loop_iterations_loop_id
      ON critique_loop_iterations(loop_id);

    CREATE INDEX IF NOT EXISTS idx_critique_loop_iterations_run_id
      ON critique_loop_iterations(run_id);
  `);
}

// ============================================================================
// CRUD 操作
// ============================================================================

/**
 * 插入循环运行记录
 */
export function insertCritiqueLoop(db: Database.Database, row: Omit<CritiqueLoopRow, 'started_at' | 'finished_at'>): void {
  const stmt = db.prepare(`
    INSERT INTO critique_loops (id, project_id, status, max_iterations, total_iterations, best_composite, final_artifact_path)
    VALUES (@id, @project_id, @status, @max_iterations, @total_iterations, @best_composite, @final_artifact_path)
  `);
  stmt.run(row);
}

/**
 * 更新循环运行记录
 */
export function updateCritiqueLoop(
  db: Database.Database,
  loopId: string,
  updates: Partial<Pick<CritiqueLoopRow, 'status' | 'total_iterations' | 'best_composite' | 'final_artifact_path'>>,
): void {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id: loopId };

  if (updates.status !== undefined) {
    sets.push('status = @status');
    params.status = updates.status;
  }
  if (updates.total_iterations !== undefined) {
    sets.push('total_iterations = @total_iterations');
    params.total_iterations = updates.total_iterations;
  }
  if (updates.best_composite !== undefined) {
    sets.push('best_composite = @best_composite');
    params.best_composite = updates.best_composite;
  }
  if (updates.final_artifact_path !== undefined) {
    sets.push('final_artifact_path = @final_artifact_path');
    params.final_artifact_path = updates.final_artifact_path;
  }

  // 如果标记为终态，添加完成时间
  if (
    updates.status &&
    ['converged', 'exhausted', 'interrupted', 'timed_out', 'degraded', 'failed'].includes(updates.status)
  ) {
    sets.push("finished_at = datetime('now')");
  }

  if (sets.length === 0) return;

  const sql = `UPDATE critique_loops SET ${sets.join(', ')} WHERE id = @id`;
  db.prepare(sql).run(params);
}

/**
 * 插入循环迭代记录
 */
export function insertLoopIteration(
  db: Database.Database,
  row: Omit<CritiqueLoopIterationRow, 'started_at' | 'finished_at'>,
): void {
  const stmt = db.prepare(`
    INSERT INTO critique_loop_iterations
      (id, loop_id, iteration, run_id, status, composite, must_fix_count, fix_duration_ms, feedback_json)
    VALUES
      (@id, @loop_id, @iteration, @run_id, @status, @composite, @must_fix_count, @fix_duration_ms, @feedback_json)
  `);
  stmt.run(row);
}

/**
 * 更新循环迭代记录（标记完成）
 */
export function finishLoopIteration(
  db: Database.Database,
  iterationId: string,
  updates: { status: string; composite: number | null },
): void {
  db.prepare(`
    UPDATE critique_loop_iterations
    SET status = @status, composite = @composite, finished_at = datetime('now')
    WHERE id = @id
  `).run({ id: iterationId, ...updates });
}

/**
 * 查询项目的循环历史
 */
export function getProjectLoops(db: Database.Database, projectId: string, limit = 20): CritiqueLoopRow[] {
  return db
    .prepare(
      `SELECT * FROM critique_loops WHERE project_id = ? ORDER BY started_at DESC LIMIT ?`,
    )
    .all(projectId, limit) as CritiqueLoopRow[];
}

/**
 * 查询单个循环的迭代详情
 */
export function getLoopIterations(
  db: Database.Database,
  loopId: string,
): CritiqueLoopIterationRow[] {
  return db
    .prepare(`SELECT * FROM critique_loop_iterations WHERE loop_id = ? ORDER BY iteration ASC`)
    .all(loopId) as CritiqueLoopIterationRow[];
}

/**
 * 获取活跃（未完成）的循环
 */
export function getActiveLoops(db: Database.Database): CritiqueLoopRow[] {
  return db
    .prepare(`SELECT * FROM critique_loops WHERE status = 'running' ORDER BY started_at ASC`)
    .all() as CritiqueLoopRow[];
}
