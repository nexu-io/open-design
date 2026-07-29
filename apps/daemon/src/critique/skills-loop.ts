/**
 * Skills Loop — Outer Loop 的技能自动提炼层
 *
 * 从累积的经验教训中自动生成 SKILL.md 文件。
 * 当某类问题积累足够经验后，提炼为项目固定的技能知识，
 * 让新启动的 Agent 不需要从头试错。
 *
 * 输出: .claude/skills/critique-fix.md
 *
 * @see specs/current/critique-theater.md § Loop Engineering / Skills
 */

import type Database from 'better-sqlite3';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  loadEffectiveLessons,
  getLessonSummary,
  type LoopLesson,
  type LessonCategory,
} from './lessons-loop.js';

// ============================================================================
// 提炼阈值
// ============================================================================

/** 每个类别至少需要多少条有效经验才开始提炼 */
const MIN_LESSONS_PER_CATEGORY = 3;

/** 经验有效性最低分 */
const MIN_EFFECTIVENESS = 7;

// ============================================================================
// 技能文件生成
// ============================================================================

export interface SkillDistillResult {
  /** 是否生成了技能文件 */
  generated: boolean;
  /** 输出路径 */
  outputPath: string;
  /** 提炼出的经验条数 */
  lessonCount: number;
  /** 覆盖的类別 */
  categories: LessonCategory[];
}

const SKILLS_DIR = '.claude/skills';
const SKILL_FILE = 'critique-fix.md';

/**
 * 从经验数据库中提炼设计修复技能文件
 *
 * 调用时机:
 *   1. 每次循环成功收敛后
 *   2. 手动触发 `od skills distill`
 */
export async function distillSkillsFromLessons(
  db: Database.Database,
  cwd: string,
  projectId: string,
): Promise<SkillDistillResult> {
  const effectiveLessons = loadEffectiveLessons(db, projectId, MIN_EFFECTIVENESS, 100);

  // 按类別分组
  const byCategory = new Map<LessonCategory, LoopLesson[]>();
  for (const lesson of effectiveLessons) {
    if (!byCategory.has(lesson.category)) {
      byCategory.set(lesson.category, []);
    }
    byCategory.get(lesson.category)!.push(lesson);
  }

  // 筛选出达到阈值的类別
  const qualifiedCategories: LessonCategory[] = [];
  for (const [category, lessons] of byCategory) {
    if (lessons.length >= MIN_LESSONS_PER_CATEGORY) {
      qualifiedCategories.push(category);
    }
  }

  if (qualifiedCategories.length === 0) {
    return {
      generated: false,
      outputPath: path.join(cwd, SKILLS_DIR, SKILL_FILE),
      lessonCount: 0,
      categories: [],
    };
  }

  // 生成 SKILL.md 内容
  const summaries = getLessonSummary(db, projectId);
  const content = buildSkillContent(byCategory, summaries, qualifiedCategories);

  // 写入文件
  const outputDir = path.join(cwd, SKILLS_DIR);
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, SKILL_FILE);
  await fs.writeFile(outputPath, content, 'utf-8');

  return {
    generated: true,
    outputPath,
    lessonCount: effectiveLessons.length,
    categories: qualifiedCategories,
  };
}

/**
 * 检查是否需要重新提炼（增量判断）
 */
export function shouldDistillSkills(
  db: Database.Database,
  projectId: string,
): boolean {
  const effectiveLessons = loadEffectiveLessons(db, projectId, MIN_EFFECTIVENESS, 100);
  if (effectiveLessons.length < MIN_LESSONS_PER_CATEGORY) return false;

  // 按类別分组，检查是否有新的经验到达阈值
  const byCategory = new Map<string, number>();
  for (const lesson of effectiveLessons) {
    byCategory.set(lesson.category, (byCategory.get(lesson.category) ?? 0) + 1);
  }

  return [...byCategory.values()].some((count) => count >= MIN_LESSONS_PER_CATEGORY);
}

// ============================================================================
// SKILL.md 内容生成
// ============================================================================

function buildSkillContent(
  byCategory: Map<LessonCategory, LoopLesson[]>,
  summaries: Awaited<ReturnType<typeof getLessonSummary>>,
  qualifiedCategories: LessonCategory[],
): string {
  const now = new Date().toISOString().slice(0, 10);

  const lines: string[] = [
    '---',
    'name: critique-fix',
    'description: 设计评审自动修复经验库 — 从 Critique Loop 中提炼的已验证修复策略',
    `version: 1.0.0`,
    `updated: ${now}`,
    'kind: skill',
    '---',
    '',
    '# 设计评审修复经验库',
    '',
    '> 此文件由 Critique Loop Engine 的 Outer Loop 自动维护。',
    `> 最后更新: ${now}`,
    '> 经验来源: 经过设计评审团验证有效的修复（有效性 ≥ 7/10）',
    '',
    '## 使用方式',
    '',
    '收到设计评审团反馈后，先阅读本文件的对应章节，',
    '优先应用已验证有效的修复方案，避免重复试错。',
    '',
    '---',
    '',
  ];

  // 按类别生成修复指南
  for (const category of qualifiedCategories) {
    const lessons = byCategory.get(category) ?? [];
    const summary = summaries.find((s) => s.category === category);

    lines.push(`## ${categoryLabel(category)}`, '');

    if (summary) {
      lines.push(`共 ${summary.total} 条经验，最近记录于 ${summary.lastSeenAt.slice(0, 10)}`, '');
    }

    lines.push('### 已验证的修复策略', '');

    // 去重合并相似方案
    const uniqueResolutions = deduplicateResolutions(lessons);

    let i = 1;
    for (const { problem, resolution, effectiveness } of uniqueResolutions) {
      const effStr = effectiveness !== null ? `（有效性: ${effectiveness}/10）` : '';
      lines.push(`${i}. **${problem}** ${effStr}`);
      lines.push(`   - 修复: ${resolution}`);
      i++;
    }

    lines.push('');
  }

  // 附录：各类别经验统计
  lines.push('---', '', '## 经验统计', '', '| 类别 | 总经验数 | 最近记录 |', '|------|----------|----------|');

  for (const s of summaries) {
    lines.push(`| ${categoryLabel(s.category)} | ${s.total} | ${s.lastSeenAt.slice(0, 10)} |`);
  }

  return lines.join('\n');
}

// ============================================================================
// 辅助函数
// ============================================================================

const CATEGORY_LABELS: Record<LessonCategory, string> = {
  a11y: '无障碍 (Accessibility)',
  brand: '品牌一致性 (Brand)',
  layout: '布局与排版 (Layout)',
  color: '色彩 (Color)',
  typography: '字体排版 (Typography)',
  copy: '文案 (Copy)',
  style: '样式 (Style)',
  logic: '逻辑与交互 (Logic)',
  perf: '性能 (Performance)',
  general: '通用 (General)',
};

function categoryLabel(category: LessonCategory): string {
  return CATEGORY_LABELS[category] ?? category;
}

/** 合并相似方案，避免重复条目 */
function deduplicateResolutions(
  lessons: LoopLesson[],
): Array<{ problem: string; resolution: string; effectiveness: number | null }> {
  const seen = new Map<string, { problem: string; resolution: string; effectiveness: number | null }>();

  for (const lesson of lessons) {
    const key = lesson.resolution.slice(0, 60).toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, {
        problem: lesson.problem,
        resolution: lesson.resolution,
        effectiveness: lesson.effectiveness,
      });
    }
  }

  return [...seen.values()];
}
