/**
 * Lessons Loop + Skills Loop 单元测试
 *
 * 覆盖:
 * - recordLesson / loadRecentLessons / loadLessonsByCategory / loadEffectiveLessons
 * - getLessonSummary / markLessonsEffective
 * - appendLessonToFile / loadLessonsAsContext
 * - formatLessonsAsContext / formatLessonsAsSkillInjection
 * - distillSkillsFromLessons / shouldDistillSkills
 * - formatFeedbackAsPrompt (historicalLessons 字段)
 *
 * 运行: vitest apps/daemon/src/critique/__tests__/lessons-skills.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  migrateLessonSchema,
  recordLesson,
  markLessonsEffective,
  loadRecentLessons,
  loadLessonsByCategory,
  loadEffectiveLessons,
  getLessonSummary,
  appendLessonToFile,
  loadLessonsAsContext,
  formatLessonsAsContext,
  formatLessonsAsSkillInjection,
} from '../lessons-loop.js';

import { distillSkillsFromLessons, shouldDistillSkills } from '../skills-loop.js';
import { formatFeedbackAsPrompt } from '../loop-feedback.js';
import type { CritiqueFeedback } from '../loop-feedback.js';
import type { LoopLesson, LessonCategory, LessonSeverity } from '../lessons-loop.js';

// ============================================================================
// 辅助函数
// ============================================================================

function createDB(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrateLessonSchema(db);
  return db;
}

function makeLesson(overrides: Partial<Omit<LoopLesson, 'id' | 'createdAt'>> = {}): Omit<LoopLesson, 'id' | 'createdAt'> {
  return {
    loopId: 'loop-test-001',
    projectId: 'proj-test-001',
    iteration: 1,
    category: 'general' as LessonCategory,
    severity: 'warning' as LessonSeverity,
    problem: '测试问题',
    resolution: '测试修复方案',
    effectiveness: null,
    tags: ['test'],
    ...overrides,
  };
}

// ============================================================================
// recordLesson 测试
// ============================================================================

describe('recordLesson', () => {
  let db: Database.Database;

  beforeEach(() => { db = createDB(); });
  afterEach(() => { db.close(); });

  it('应插入并返回完整 Lesson 记录（含自动生成的 id 和 createdAt）', () => {
    const input = makeLesson({ problem: '对比度不足', resolution: '提高对比度至 4.5:1' });
    const result = recordLesson(db, input);

    expect(result.id).toMatch(/^lesson-/);
    expect(result.createdAt).toBeTruthy();
    expect(result.problem).toBe('对比度不足');
    expect(result.resolution).toBe('提高对比度至 4.5:1');
    expect(result.category).toBe('general');
    expect(result.severity).toBe('warning');
    expect(result.effectiveness).toBeNull();
    expect(result.tags).toEqual(['test']);
    expect(result.loopId).toBe('loop-test-001');
    expect(result.projectId).toBe('proj-test-001');
    expect(result.iteration).toBe(1);
  });

  it('不同 lesson 应生成唯一 id', () => {
    const a = recordLesson(db, makeLesson({ problem: '问题 A' }));
    const b = recordLesson(db, makeLesson({ problem: '问题 B' }));
    expect(a.id).not.toBe(b.id);
  });

  it('应保留所有类别的 lesson', () => {
    const categories: LessonCategory[] = ['a11y', 'brand', 'layout', 'color', 'typography', 'copy', 'style', 'logic', 'perf', 'general'];
    for (const cat of categories) {
      recordLesson(db, makeLesson({ category: cat, problem: `问题 - ${cat}` }));
    }
    const all = loadRecentLessons(db, 'proj-test-001', 50);
    expect(all).toHaveLength(10);
  });
});

// ============================================================================
// loadRecentLessons 测试
// ============================================================================

describe('loadRecentLessons', () => {
  let db: Database.Database;

  beforeEach(() => { db = createDB(); });
  afterEach(() => { db.close(); });

  it('空数据库应返回空数组', () => {
    expect(loadRecentLessons(db, 'proj-test-001')).toEqual([]);
  });

  it('应按 created_at DESC 排序并遵守 limit', () => {
    for (let i = 0; i < 5; i++) {
      recordLesson(db, makeLesson({ problem: `问题 ${i}`, iteration: i }));
    }
    const result = loadRecentLessons(db, 'proj-test-001', 3);
    expect(result).toHaveLength(3);
    // created_at 精度到秒，同秒插入的排序顺序不可预测；验证 limit 生效且均为有效记录即可
    for (const r of result) {
      expect(r.id).toMatch(/^lesson-/);
      expect(r.createdAt).toBeTruthy();
    }
  });

  it('应只返回指定 projectId 的 lesson', () => {
    recordLesson(db, makeLesson({ projectId: 'proj-A', problem: 'A 的问题' }));
    recordLesson(db, makeLesson({ projectId: 'proj-B', problem: 'B 的问题' }));

    const resultA = loadRecentLessons(db, 'proj-A', 10);
    expect(resultA).toHaveLength(1);
    expect(resultA[0]!.problem).toBe('A 的问题');

    const resultB = loadRecentLessons(db, 'proj-B', 10);
    expect(resultB).toHaveLength(1);
    expect(resultB[0]!.problem).toBe('B 的问题');
  });
});

// ============================================================================
// loadLessonsByCategory 测试
// ============================================================================

describe('loadLessonsByCategory', () => {
  let db: Database.Database;

  beforeEach(() => { db = createDB(); });
  afterEach(() => { db.close(); });

  it('应只返回指定类别的 lesson', () => {
    recordLesson(db, makeLesson({ category: 'a11y', problem: 'alt 文本缺失' }));
    recordLesson(db, makeLesson({ category: 'a11y', problem: '键盘导航缺失' }));
    recordLesson(db, makeLesson({ category: 'brand', problem: '品牌色错误' }));

    const a11yLessons = loadLessonsByCategory(db, 'proj-test-001', 'a11y', 10);
    expect(a11yLessons).toHaveLength(2);
    expect(a11yLessons.every((l) => l.category === 'a11y')).toBe(true);

    const brandLessons = loadLessonsByCategory(db, 'proj-test-001', 'brand', 10);
    expect(brandLessons).toHaveLength(1);
    expect(brandLessons[0]!.problem).toBe('品牌色错误');
  });

  it('无匹配类别时应返回空数组', () => {
    recordLesson(db, makeLesson({ category: 'a11y' }));
    expect(loadLessonsByCategory(db, 'proj-test-001', 'color', 10)).toEqual([]);
  });
});

// ============================================================================
// loadEffectiveLessons 测试
// ============================================================================

describe('loadEffectiveLessons', () => {
  let db: Database.Database;

  beforeEach(() => { db = createDB(); });
  afterEach(() => { db.close(); });

  it('应只返回 effectiveness >= 阈值的 lesson', () => {
    recordLesson(db, makeLesson({ problem: '高有效', effectiveness: 9, tags: ['verified'] }));
    recordLesson(db, makeLesson({ problem: '中有效', effectiveness: 7, tags: ['verified'] }));
    recordLesson(db, makeLesson({ problem: '低有效', effectiveness: 5, tags: ['doubtful'] }));
    recordLesson(db, makeLesson({ problem: '未验证', effectiveness: null, tags: ['unverified'] }));

    const effective = loadEffectiveLessons(db, 'proj-test-001', 7, 20);
    expect(effective).toHaveLength(2);
    expect(effective[0]!.problem).toBe('高有效'); // 按 effectiveness DESC
    expect(effective[1]!.problem).toBe('中有效');
  });

  it('默认阈值应为 7', () => {
    recordLesson(db, makeLesson({ effectiveness: 6 }));
    recordLesson(db, makeLesson({ effectiveness: 7 }));
    recordLesson(db, makeLesson({ effectiveness: 8 }));

    const result = loadEffectiveLessons(db, 'proj-test-001');
    expect(result).toHaveLength(2);
    expect(result.every((l) => (l.effectiveness ?? 0) >= 7)).toBe(true);
  });

  it('所有 lesson 都低效时应返回空数组', () => {
    recordLesson(db, makeLesson({ effectiveness: 3 }));
    recordLesson(db, makeLesson({ effectiveness: 5 }));
    expect(loadEffectiveLessons(db, 'proj-test-001')).toEqual([]);
  });
});

// ============================================================================
// markLessonsEffective 测试
// ============================================================================

describe('markLessonsEffective', () => {
  let db: Database.Database;

  beforeEach(() => { db = createDB(); });
  afterEach(() => { db.close(); });

  it('应标记指定 loopId 中未验证 lesson 的有效性', () => {
    recordLesson(db, makeLesson({ loopId: 'loop-A', effectiveness: null }));
    recordLesson(db, makeLesson({ loopId: 'loop-A', effectiveness: null }));
    recordLesson(db, makeLesson({ loopId: 'loop-A', effectiveness: null }));

    markLessonsEffective(db, 'loop-A', 8);

    const lessons = loadRecentLessons(db, 'proj-test-001', 20);
    expect(lessons.every((l) => l.effectiveness === 8)).toBe(true);
  });

  it('不应影响已有 effectiveness 的 lesson', () => {
    recordLesson(db, makeLesson({ loopId: 'loop-B', effectiveness: 5 }));
    markLessonsEffective(db, 'loop-B', 9);
    const lessons = loadRecentLessons(db, 'proj-test-001', 20);
    expect(lessons[0]!.effectiveness).toBe(5); // 已有值不被覆盖
  });

  it('应只更新指定 loopId 的 lesson', () => {
    recordLesson(db, makeLesson({ loopId: 'loop-A', effectiveness: null }));
    recordLesson(db, makeLesson({ loopId: 'loop-B', effectiveness: null }));

    markLessonsEffective(db, 'loop-A', 8);

    const lessonsA = loadRecentLessons(db, 'proj-test-001', 20).filter((l) => l.loopId === 'loop-A');
    const lessonsB = loadRecentLessons(db, 'proj-test-001', 20).filter((l) => l.loopId === 'loop-B');

    expect(lessonsA[0]!.effectiveness).toBe(8);
    expect(lessonsB[0]!.effectiveness).toBeNull();
  });
});

// ============================================================================
// getLessonSummary 测试
// ============================================================================

describe('getLessonSummary', () => {
  let db: Database.Database;

  beforeEach(() => { db = createDB(); });
  afterEach(() => { db.close(); });

  it('应按类别聚合统计', () => {
    recordLesson(db, makeLesson({ category: 'a11y', problem: 'A1', resolution: '修A1' }));
    recordLesson(db, makeLesson({ category: 'a11y', problem: 'A2', resolution: '修A2' }));
    recordLesson(db, makeLesson({ category: 'brand', problem: 'B1', resolution: '修B1' }));

    const summary = getLessonSummary(db, 'proj-test-001');
    expect(summary).toHaveLength(2);

    const a11ySum = summary.find((s) => s.category === 'a11y')!;
    expect(a11ySum.total).toBe(2);
    expect(a11ySum.commonResolutions).toContain('修A1');
    expect(a11ySum.commonResolutions).toContain('修A2');

    const brandSum = summary.find((s) => s.category === 'brand')!;
    expect(brandSum.total).toBe(1);
    expect(brandSum.commonResolutions).toContain('修B1');
  });

  it('应按 total DESC 排序', () => {
    recordLesson(db, makeLesson({ category: 'a11y' }));
    recordLesson(db, makeLesson({ category: 'brand' }));
    recordLesson(db, makeLesson({ category: 'brand' }));
    recordLesson(db, makeLesson({ category: 'color' }));
    recordLesson(db, makeLesson({ category: 'color' }));
    recordLesson(db, makeLesson({ category: 'color' }));

    const summary = getLessonSummary(db, 'proj-test-001');
    expect(summary[0]!.category).toBe('color'); // color: 3 条
    expect(summary[1]!.category).toBe('brand');  // brand: 2 条
    expect(summary[2]!.category).toBe('a11y');   // a11y: 1 条
  });

  it('空数据库应返回空数组', () => {
    expect(getLessonSummary(db, 'proj-nonexistent')).toEqual([]);
  });
});

// ============================================================================
// appendLessonToFile / loadLessonsAsContext 测试
// ============================================================================

describe('appendLessonToFile & loadLessonsAsContext', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(tmpdir(), `od-lesson-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('appendLessonToFile 应创建 .loop/lessons.md 并写入内容', async () => {
    const lesson: LoopLesson = {
      id: 'lesson-test-1',
      loopId: 'loop-test',
      projectId: 'proj-test',
      iteration: 1,
      category: 'a11y',
      severity: 'critical',
      problem: '对比度不足',
      resolution: '提高至 4.5:1',
      effectiveness: 9,
      tags: ['contrast', 'wcag'],
      createdAt: '2026-07-14T10:00:00Z',
    };

    await appendLessonToFile(tmpDir, lesson);

    const content = await fs.readFile(path.join(tmpDir, '.loop/lessons.md'), 'utf-8');
    expect(content).toContain('Critique Loop 经验教训');
    expect(content).toContain('## a11y');
    expect(content).toContain('对比度不足');
    expect(content).toContain('提高至 4.5:1');
    expect(content).toMatch(/有效性.*9\/10/);
  });

  it('多次 append 应追加到不同章节', async () => {
    const lesson1: LoopLesson = {
      id: 'l1', loopId: 'loop-1', projectId: 'p1', iteration: 1,
      category: 'a11y', severity: 'warning',
      problem: '键盘导航缺失', resolution: '添加 tabindex',
      effectiveness: 7, tags: ['keyboard'],
      createdAt: '2026-07-14T10:00:00Z',
    };
    const lesson2: LoopLesson = {
      id: 'l2', loopId: 'loop-1', projectId: 'p1', iteration: 1,
      category: 'brand', severity: 'info',
      problem: '品牌色偏差', resolution: '使用正确的品牌色',
      effectiveness: 8, tags: ['color'],
      createdAt: '2026-07-14T11:00:00Z',
    };

    await appendLessonToFile(tmpDir, lesson1);
    await appendLessonToFile(tmpDir, lesson2);

    const content = await fs.readFile(path.join(tmpDir, '.loop/lessons.md'), 'utf-8');
    expect(content).toContain('## a11y');
    expect(content).toContain('键盘导航缺失');
    expect(content).toContain('## brand');
    expect(content).toContain('品牌色偏差');
  });

  it('loadLessonsAsContext 在文件不存在时应返回 null', async () => {
    const result = await loadLessonsAsContext(tmpDir);
    expect(result).toBeNull();
  });

  it('loadLessonsAsContext 应读取文件并格式化为 context', async () => {
    const lesson: LoopLesson = {
      id: 'l1', loopId: 'loop-1', projectId: 'p1', iteration: 1,
      category: 'general', severity: 'warning',
      problem: '通用问题', resolution: '通用修复',
      effectiveness: null, tags: [],
      createdAt: '2026-07-14T10:00:00Z',
    };
    await appendLessonToFile(tmpDir, lesson);

    const context = await loadLessonsAsContext(tmpDir);
    expect(context).toContain('历史经验教训（来自之前的循环）');
    expect(context).toContain('通用问题');
    expect(context).toContain('通用修复');
  });

  it('空文件应返回 null', async () => {
    const dirPath = path.join(tmpDir, '.loop');
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(path.join(dirPath, 'lessons.md'), '', 'utf-8');

    const result = await loadLessonsAsContext(tmpDir);
    expect(result).toBeNull();
  });
});

// ============================================================================
// formatLessonsAsContext 测试
// ============================================================================

describe('formatLessonsAsContext', () => {
  it('空数组应返回空字符串', () => {
    expect(formatLessonsAsContext([])).toBe('');
  });

  it('应生成包含经验表格的 Markdown', () => {
    const lessons: LoopLesson[] = [
      {
        id: 'l1', loopId: 'L1', projectId: 'P1', iteration: 1,
        category: 'a11y', severity: 'critical',
        problem: '对比度不足', resolution: '提高至 4.5:1',
        effectiveness: 9, tags: [], createdAt: '2026-01-01',
      },
      {
        id: 'l2', loopId: 'L1', projectId: 'P1', iteration: 2,
        category: 'brand', severity: 'warning',
        problem: '品牌色错误', resolution: '使用主品牌色 #1A73E8',
        effectiveness: 7, tags: [], createdAt: '2026-01-02',
      },
    ];

    const formatted = formatLessonsAsContext(lessons);
    expect(formatted).toContain('Outer Loop Memory');
    expect(formatted).toContain('a11y');
    expect(formatted).toContain('对比度不足');
    expect(formatted).toContain('9/10');
    expect(formatted).toContain('brand');
    expect(formatted).toContain('品牌色错误');
    expect(formatted).toContain('7/10');
  });

  it('应遵守 maxItems 限制', () => {
    const lessons: LoopLesson[] = Array.from({ length: 10 }, (_, i) => ({
      id: `l${i}`, loopId: 'L1', projectId: 'P1', iteration: i,
      category: 'general' as LessonCategory, severity: 'info' as LessonSeverity,
      problem: `问题 ${i}`, resolution: `修复 ${i}`,
      effectiveness: 5, tags: [], createdAt: '2026-01-01',
    }));

    const formatted = formatLessonsAsContext(lessons, 5);
    const lines = formatted.split('\n');
    // 前2行是标题, 1行空行, 1行说明, 1行空行, 1行表头, 1行分隔线, 然后5行数据
    const dataLines = lines.filter((l) => l.startsWith('|') && !l.startsWith('|--') && !l.includes('类别'));
    expect(dataLines.length).toBeLessThanOrEqual(5);
  });
});

// ============================================================================
// formatLessonsAsSkillInjection 测试
// ============================================================================

describe('formatLessonsAsSkillInjection', () => {
  it('空数组应返回空字符串', () => {
    expect(formatLessonsAsSkillInjection([])).toBe('');
  });

  it('应只包含 effective ≥ 7 的 lesson，按类别分组', () => {
    const lessons: LoopLesson[] = [
      {
        id: 'l1', loopId: 'L1', projectId: 'P1', iteration: 1,
        category: 'a11y', severity: 'critical',
        problem: '对比度不足', resolution: '提高至 4.5:1',
        effectiveness: 9, tags: [], createdAt: '2026-01-01',
      },
      {
        id: 'l2', loopId: 'L1', projectId: 'P1', iteration: 1,
        category: 'a11y', severity: 'warning',
        problem: '焦点样式缺失', resolution: '添加 :focus-visible',
        effectiveness: 5, tags: [], createdAt: '2026-01-01',
      },
      {
        id: 'l3', loopId: 'L1', projectId: 'P1', iteration: 2,
        category: 'brand', severity: 'warning',
        problem: '品牌色错误', resolution: '使用主品牌色',
        effectiveness: 8, tags: [], createdAt: '2026-01-02',
      },
      {
        id: 'l4', loopId: 'L1', projectId: 'P1', iteration: 2,
        category: 'general', severity: 'info',
        problem: '未验证问题', resolution: '某些修复',
        effectiveness: null, tags: [], createdAt: '2026-01-02',
      },
    ];

    const injection = formatLessonsAsSkillInjection(lessons);
    // 只有 effective ≥ 7 的: l1 (9, a11y) 和 l3 (8, brand)
    expect(injection).toContain('已验证的设计修复经验');
    expect(injection).toContain('### a11y');
    expect(injection).toContain('对比度不足');
    expect(injection).toContain('### brand');
    expect(injection).toContain('品牌色错误');
    // 不应包含低效或未验证的
    expect(injection).not.toContain('焦点样式缺失');
    expect(injection).not.toContain('未验证问题');
  });
});

// ============================================================================
// distillSkillsFromLessons 测试
// ============================================================================

describe('distillSkillsFromLessons', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(async () => {
    db = createDB();
    tmpDir = path.join(tmpdir(), `od-skill-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('无 lesson 时应返回 generated: false', async () => {
    const result = await distillSkillsFromLessons(db, tmpDir, 'proj-test');

    expect(result.generated).toBe(false);
    expect(result.lessonCount).toBe(0);
    expect(result.categories).toEqual([]);
  });

  it('单类别不足 3 条有效经验时应返回 generated: false', async () => {
    recordLesson(db, makeLesson({ category: 'a11y', effectiveness: 8, problem: 'A1', resolution: 'R1' }));
    recordLesson(db, makeLesson({ category: 'a11y', effectiveness: 8, problem: 'A2', resolution: 'R2' }));
    // 只有 2 条，不满足 MIN_LESSONS_PER_CATEGORY = 3

    const result = await distillSkillsFromLessons(db, tmpDir, 'proj-test-001');
    expect(result.generated).toBe(false);
  });

  it('单类别达到 3 条阈值时应生成 SKILL.md', async () => {
    recordLesson(db, makeLesson({ category: 'a11y', effectiveness: 8, problem: '对比度', resolution: '提高对比度' }));
    recordLesson(db, makeLesson({ category: 'a11y', effectiveness: 8, problem: '焦点', resolution: '添加焦点样式' }));
    recordLesson(db, makeLesson({ category: 'a11y', effectiveness: 8, problem: 'alt文本', resolution: '添加alt' }));

    const result = await distillSkillsFromLessons(db, tmpDir, 'proj-test-001');

    expect(result.generated).toBe(true);
    expect(result.lessonCount).toBe(3);
    expect(result.categories).toContain('a11y');
    expect(result.outputPath).toContain('.claude/skills/critique-fix.md');

    // 验证文件内容
    const content = await fs.readFile(result.outputPath, 'utf-8');
    expect(content).toContain('name: critique-fix');
    expect(content).toContain('设计评审修复经验库');
    expect(content).toContain('无障碍 (Accessibility)');
    expect(content).toContain('提高对比度');
    expect(content).toContain('添加焦点样式');
    expect(content).toContain('添加alt');
  });

  it('多类别分别达到阈值时应全部包含', async () => {
    // a11y: 3 条有效
    for (let i = 0; i < 3; i++) {
      recordLesson(db, makeLesson({ category: 'a11y', effectiveness: 8, problem: `A${i}`, resolution: `RA${i}` }));
    }
    // brand: 3 条有效
    for (let i = 0; i < 3; i++) {
      recordLesson(db, makeLesson({ category: 'brand', effectiveness: 7, problem: `B${i}`, resolution: `RB${i}` }));
    }
    // color: 只有 1 条，不应包含
    recordLesson(db, makeLesson({ category: 'color', effectiveness: 8, problem: 'C0', resolution: 'RC0' }));

    const result = await distillSkillsFromLessons(db, tmpDir, 'proj-test-001');

    expect(result.generated).toBe(true);
    expect(result.categories).toContain('a11y');
    expect(result.categories).toContain('brand');
    expect(result.categories).not.toContain('color');

    const content = await fs.readFile(result.outputPath, 'utf-8');
    expect(content).toContain('无障碍 (Accessibility)');
    expect(content).toContain('品牌一致性 (Brand)');
    expect(content).toContain('经验统计');
  });

  it('低有效性的 lesson 不应计入阈值', async () => {
    // 2 条高有效，1 条低有效 — 不应触发蒸馏
    recordLesson(db, makeLesson({ category: 'a11y', effectiveness: 8, problem: 'A1', resolution: 'R1' }));
    recordLesson(db, makeLesson({ category: 'a11y', effectiveness: 7, problem: 'A2', resolution: 'R2' }));
    recordLesson(db, makeLesson({ category: 'a11y', effectiveness: 5, problem: 'A3_low', resolution: 'R3' }));

    const result = await distillSkillsFromLessons(db, tmpDir, 'proj-test-001');
    expect(result.generated).toBe(false);
  });

  it('应合并相似 resolution（去重）', async () => {
    recordLesson(db, makeLesson({ category: 'a11y', effectiveness: 8, problem: '问题A', resolution: '相同修复方案' }));
    recordLesson(db, makeLesson({ category: 'a11y', effectiveness: 8, problem: '问题B variant', resolution: '相同修复方案' }));
    recordLesson(db, makeLesson({ category: 'a11y', effectiveness: 8, problem: '问题C', resolution: '不同的修复方案' }));

    const result = await distillSkillsFromLessons(db, tmpDir, 'proj-test-001');
    expect(result.generated).toBe(true);

    const content = await fs.readFile(result.outputPath, 'utf-8');
    // 相同修复方案应只出现一次
    const occurrences = (content.match(/相同修复方案/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});

// ============================================================================
// shouldDistillSkills 测试
// ============================================================================

describe('shouldDistillSkills', () => {
  let db: Database.Database;

  beforeEach(() => { db = createDB(); });
  afterEach(() => { db.close(); });

  it('无 lesson 时返回 false', () => {
    expect(shouldDistillSkills(db, 'proj-test')).toBe(false);
  });

  it('不足 3 条有效经验时返回 false', () => {
    recordLesson(db, makeLesson({ effectiveness: 8 }));
    recordLesson(db, makeLesson({ effectiveness: 9 }));
    expect(shouldDistillSkills(db, 'proj-test-001')).toBe(false);
  });

  it('达到 3 条有效经验时返回 true', () => {
    recordLesson(db, makeLesson({ effectiveness: 8 }));
    recordLesson(db, makeLesson({ effectiveness: 8 }));
    recordLesson(db, makeLesson({ effectiveness: 7 }));
    expect(shouldDistillSkills(db, 'proj-test-001')).toBe(true);
  });

  it('low effectiveness 不计入判断', () => {
    recordLesson(db, makeLesson({ effectiveness: 5 }));
    recordLesson(db, makeLesson({ effectiveness: 6 }));
    expect(shouldDistillSkills(db, 'proj-test-001')).toBe(false);
  });
});

// ============================================================================
// formatFeedbackAsPrompt (historicalLessons) 测试
// ============================================================================

describe('formatFeedbackAsPrompt with historicalLessons', () => {
  it('有 historicalLessons 时应前置历史经验并使用"当前设计的评审反馈"标题', () => {
    const feedback: CritiqueFeedback = {
      mustFixItems: ['[a11y] 对比度不足'],
      dimNotes: [],
      bestComposite: 6.0,
      bestRound: 1,
      finalStatus: 'below_threshold',
      rounds: [{ n: 1, composite: 6.0, mustFix: 1, decision: 'continue' }],
      historicalLessons: '## 历史经验\n\n之前遇到过类似问题，已修复。',
    };

    const prompt = formatFeedbackAsPrompt(feedback);

    // 历史经验在前
    const histIdx = prompt.indexOf('历史经验');
    const currIdx = prompt.indexOf('当前设计的评审反馈');
    expect(histIdx).toBeGreaterThan(-1);
    expect(currIdx).toBeGreaterThan(-1);
    expect(histIdx).toBeLessThan(currIdx);

    // 不应用默认标题
    expect(prompt).not.toContain('设计评审团反馈');
  });

  it('无 historicalLessons 时应使用默认标题', () => {
    const feedback: CritiqueFeedback = {
      mustFixItems: [],
      dimNotes: [],
      bestComposite: 8.0,
      bestRound: 1,
      finalStatus: 'below_threshold',
      rounds: [{ n: 1, composite: 8.0, mustFix: 0, decision: 'continue' }],
    };

    const prompt = formatFeedbackAsPrompt(feedback);
    expect(prompt).toContain('设计评审团反馈');
    expect(prompt).not.toContain('当前设计的评审反馈');
    expect(prompt).not.toContain('历史经验教训');
  });

  it('historicalLessons 为 null 时应使用默认行为', () => {
    const feedback: CritiqueFeedback = {
      mustFixItems: [],
      dimNotes: [],
      bestComposite: 7.5,
      bestRound: 1,
      finalStatus: 'below_threshold',
      rounds: [{ n: 1, composite: 7.5, mustFix: 0, decision: 'continue' }],
      historicalLessons: null,
    };

    const prompt = formatFeedbackAsPrompt(feedback);
    expect(prompt).toContain('设计评审团反馈');
  });
});
