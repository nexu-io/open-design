/**
 * Lessons Loop — Outer Loop 的经验教训持久化层
 *
 * Loop Engineering 的 Memory 组件核心实现。
 * 将每次循环中踩过的坑、有效的修复策略沉淀为可复用经验，
 * 让下一轮循环跳过已知陷阱。实现 Reflexion 范式中的"失败即燃料"。
 *
 * 存储双轨:
 *   1. SQLite (critique_loop_lessons 表) — 结构化查询
 *   2. Markdown 文件 (.loop/lessons.md) — Agent 可读上下文
 *
 * @see specs/current/critique-theater.md § Loop Engineering / Outer Loop
 */

import type Database from 'better-sqlite3';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// ============================================================================
// 类型定义
// ============================================================================

export type LessonSeverity = 'critical' | 'warning' | 'info';

export type LessonCategory =
  | 'a11y'       // 无障碍
  | 'brand'      // 品牌一致性
  | 'layout'     // 布局/排版
  | 'color'      // 色彩
  | 'typography' // 字体/排版
  | 'copy'       // 文案
  | 'style'      // 样式
  | 'logic'      // 逻辑/交互
  | 'perf'       // 性能
  | 'general';   // 通用

export interface LoopLesson {
  id: string;
  loopId: string;
  projectId: string;
  iteration: number;
  category: LessonCategory;
  severity: LessonSeverity;
  /** 问题描述（简短） */
  problem: string;
  /** 已采取的修复措施 */
  resolution: string;
  /** 修复有效性评分 0-10，确认修复成功才记入 */
  effectiveness: number | null;
  /** 标签，供 Agent 检索 */
  tags: string[];
  createdAt: string;
}

export interface LessonSummary {
  category: LessonCategory;
  total: number;
  lastSeenAt: string;
  commonResolutions: string[];
}

// ============================================================================
// DDL 迁移
// ============================================================================

export function migrateLessonSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS critique_loop_lessons (
      id            TEXT PRIMARY KEY,
      loop_id       TEXT NOT NULL,
      project_id    TEXT NOT NULL,
      iteration     INTEGER NOT NULL,
      category      TEXT NOT NULL DEFAULT 'general',
      severity      TEXT NOT NULL DEFAULT 'warning',
      problem       TEXT NOT NULL,
      resolution    TEXT NOT NULL DEFAULT '',
      effectiveness INTEGER,
      tags_json     TEXT NOT NULL DEFAULT '[]',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_loop_lessons_project
      ON critique_loop_lessons(project_id, category);

    CREATE INDEX IF NOT EXISTS idx_loop_lessons_category
      ON critique_loop_lessons(category, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_loop_lessons_effectiveness
      ON critique_loop_lessons(effectiveness);
  `);
}

// ============================================================================
// 写入操作
// ============================================================================

/** 记录一条经验教训 */
export function recordLesson(
  db: Database,
  lesson: Omit<LoopLesson, 'id' | 'createdAt'>,
): LoopLesson {
  const id = `lesson-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();

  const row = {
    id,
    loop_id: lesson.loopId,
    project_id: lesson.projectId,
    iteration: lesson.iteration,
    category: lesson.category,
    severity: lesson.severity,
    problem: lesson.problem,
    resolution: lesson.resolution,
    effectiveness: lesson.effectiveness,
    tags_json: JSON.stringify(lesson.tags),
    created_at: createdAt,
  };

  db.prepare(`
    INSERT INTO critique_loop_lessons
      (id, loop_id, project_id, iteration, category, severity, problem, resolution, effectiveness, tags_json, created_at)
    VALUES
      (@id, @loop_id, @project_id, @iteration, @category, @severity, @problem, @resolution, @effectiveness, @tags_json, @created_at)
  `).run(row);

  return { ...lesson, id, createdAt };
}

/** 当循环收敛时，标记其修复经验为有效 */
export function markLessonsEffective(
  db: Database,
  loopId: string,
  effectiveness: number,
): void {
  db.prepare(`
    UPDATE critique_loop_lessons
    SET effectiveness = ?
    WHERE loop_id = ? AND effectiveness IS NULL
  `).run(effectiveness, loopId);
}

// ============================================================================
// 查询操作
// ============================================================================

/** 加载项目最近的经验教训 */
export function loadRecentLessons(
  db: Database,
  projectId: string,
  limit = 20,
): LoopLesson[] {
  const rows = db.prepare(`
    SELECT id, loop_id, project_id, iteration, category, severity,
           problem, resolution, effectiveness, tags_json, created_at
    FROM critique_loop_lessons
    WHERE project_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(projectId, limit) as Array<{
    id: string; loop_id: string; project_id: string; iteration: number;
    category: string; severity: string; problem: string; resolution: string;
    effectiveness: number | null; tags_json: string; created_at: string;
  }>;

  return rows.map(toLesson);
}

/** 按类别加载经验教训 */
export function loadLessonsByCategory(
  db: Database,
  projectId: string,
  category: LessonCategory,
  limit = 10,
): LoopLesson[] {
  const rows = db.prepare(`
    SELECT id, loop_id, project_id, iteration, category, severity,
           problem, resolution, effectiveness, tags_json, created_at
    FROM critique_loop_lessons
    WHERE project_id = ? AND category = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(projectId, category, limit) as Array<{
    id: string; loop_id: string; project_id: string; iteration: number;
    category: string; severity: string; problem: string; resolution: string;
    effectiveness: number | null; tags_json: string; created_at: string;
  }>;

  return rows.map(toLesson);
}

/** 按有效性筛选已验证的经验 */
export function loadEffectiveLessons(
  db: Database,
  projectId: string,
  minEffectiveness = 7,
  limit = 20,
): LoopLesson[] {
  const rows = db.prepare(`
    SELECT id, loop_id, project_id, iteration, category, severity,
           problem, resolution, effectiveness, tags_json, created_at
    FROM critique_loop_lessons
    WHERE project_id = ? AND effectiveness >= ?
    ORDER BY effectiveness DESC, created_at DESC
    LIMIT ?
  `).all(projectId, minEffectiveness, limit) as Array<{
    id: string; loop_id: string; project_id: string; iteration: number;
    category: string; severity: string; problem: string; resolution: string;
    effectiveness: number | null; tags_json: string; created_at: string;
  }>;

  return rows.map(toLesson);
}

/** 获取经验总结（用于周期性 review） */
export function getLessonSummary(
  db: Database,
  projectId: string,
): LessonSummary[] {
  const rows = db.prepare(`
    SELECT category,
           COUNT(*) as total,
           MAX(created_at) as last_seen_at,
           GROUP_CONCAT(resolution, '|||') as resolutions
    FROM critique_loop_lessons
    WHERE project_id = ?
    GROUP BY category
    ORDER BY total DESC
  `).all(projectId) as Array<{
    category: string; total: number; last_seen_at: string; resolutions: string | null;
  }>;

  return rows.map((r) => ({
    category: r.category as LessonCategory,
    total: r.total,
    lastSeenAt: r.last_seen_at,
    commonResolutions: (r.resolutions ?? '').split('|||').filter(Boolean),
  }));
}

// ============================================================================
// Markdown 文件持久化（Agent 阅读入口）
// ============================================================================

const LESSONS_FILE = '.loop/lessons.md';

/**
 * 追加经验到 lessons.md 文件
 * 这是 Agent 在每次循环启动时的阅读入口
 */
export async function appendLessonToFile(
  cwd: string,
  lesson: LoopLesson,
): Promise<void> {
  const filePath = path.join(cwd, LESSONS_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const entry = [
    `### ${lesson.severity === 'critical' ? '🚨' : lesson.severity === 'warning' ? '⚠️' : 'ℹ️'} [${lesson.category}] ${lesson.problem}`,
    '',
    `- **修复方案**: ${lesson.resolution}`,
    `- **有效性**: ${lesson.effectiveness !== null ? `${lesson.effectiveness}/10` : '未验证'}`,
    `- **标签**: ${lesson.tags.join(', ')}`,
    `- **时间**: ${lesson.createdAt}`,
    '',
    '---',
    '',
  ].join('\n');

  let existing = '';
  try {
    existing = await fs.readFile(filePath, 'utf-8');
  } catch {
    // 文件不存在，创建新文件
    existing = [
      '# Critique Loop 经验教训',
      '',
      '> 由 Loop Engine 自动维护。每次循环结束时记录踩过的坑和有效的修复方案。',
      `> 最后更新: ${new Date().toISOString()}`,
      '',
      '---',
      '',
    ].join('\n') + '\n';
  }

  // 按类别插入到对应章节
  const section = `## ${lesson.category}`;
  if (existing.includes(section)) {
    const updated = existing.replace(section + '\n\n', section + '\n\n' + entry);
    await fs.writeFile(filePath, updated, 'utf-8');
  } else {
    // 在文件末尾追加新章节
    await fs.writeFile(filePath, existing + '\n' + section + '\n\n' + entry, 'utf-8');
  }
}

/**
 * 读取 lessons.md 并格式化为 Agent 可用的上下文
 */
export async function loadLessonsAsContext(cwd: string): Promise<string | null> {
  const filePath = path.join(cwd, LESSONS_FILE);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    if (content.trim().length === 0) return null;

    return [
      '## 历史经验教训（来自之前的循环）',
      '',
      '以下是在过去的设计评审循环中积累的经验。请在修复设计时参考这些经验，',
      '避免重复已知的错误。优先级：critical > warning > info。',
      '',
      content,
    ].join('\n');
  } catch {
    return null;
  }
}

// ============================================================================
// 格式化函数
// ============================================================================

/**
 * 将经验教训格式化为供 Agent 阅读的紧凑文本
 */
export function formatLessonsAsContext(lessons: LoopLesson[], maxItems = 10): string {
  if (lessons.length === 0) return '';

  const lines: string[] = [
    '## 历史经验教训（Outer Loop Memory）',
    '',
    '以下是在之前的设计评审循环中积累的经验。请在修复时优先参考已验证有效的经验。',
    '',
    '| 类别 | 问题 | 修复方案 | 有效性 |',
    '|------|------|----------|--------|',
  ];

  for (const lesson of lessons.slice(0, maxItems)) {
    const eff = lesson.effectiveness !== null ? `${lesson.effectiveness}/10` : '-';
    lines.push(
      `| ${lesson.category} | ${truncate(lesson.problem, 50)} | ${truncate(lesson.resolution, 60)} | ${eff} |`,
    );
  }

  return lines.join('\n');
}

/**
 * 将经验提炼为 Agent 的 SKILL 指令
 */
export function formatLessonsAsSkillInjection(lessons: LoopLesson[]): string {
  if (lessons.length === 0) return '';

  const effectiveLessons = lessons.filter((l) => (l.effectiveness ?? 0) >= 7);

  const lines: string[] = [
    '## 已验证的设计修复经验',
    '',
    '以下修复方案在之前的循环中被验证为有效（有效性 ≥ 7/10）：',
    '',
  ];

  const grouped = new Map<LessonCategory, LoopLesson[]>();
  for (const lesson of effectiveLessons) {
    if (!grouped.has(lesson.category)) grouped.set(lesson.category, []);
    grouped.get(lesson.category)!.push(lesson);
  }

  for (const [category, items] of grouped) {
    lines.push(`### ${category}`);
    for (const item of items) {
      lines.push(`- 问题: ${item.problem} → **修复**: ${item.resolution}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// 辅助函数
// ============================================================================

function toLesson(row: {
  id: string; loop_id: string; project_id: string; iteration: number;
  category: string; severity: string; problem: string; resolution: string;
  effectiveness: number | null; tags_json: string; created_at: string;
}): LoopLesson {
  return {
    id: row.id,
    loopId: row.loop_id,
    projectId: row.project_id,
    iteration: row.iteration,
    category: row.category as LessonCategory,
    severity: row.severity as LessonSeverity,
    problem: row.problem,
    resolution: row.resolution,
    effectiveness: row.effectiveness,
    tags: JSON.parse(row.tags_json),
    createdAt: row.created_at,
  };
}

function truncate(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + '...';
}
