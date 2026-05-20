// Automations tab: one surface for scheduled routines, Orbit-style digests,
// and live artifact refreshers. The daemon still stores these as routines;
// the UI presents them as scheduled agent conversations.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AutomationContentPacket,
  AutomationEvolutionProposal,
  AutomationEvolutionProposalListResponse,
  AutomationReviewPolicy,
  AutomationSourceIngestionResponse,
  AutomationSourceKind,
  AutomationSourcePacketListResponse,
  AutomationTemplate as ContractAutomationTemplate,
  AutomationTemplateListResponse,
  AutomationTokenCompressionMode,
  ConnectorDetail,
  Routine,
  RoutineRun,
  RoutineRunCrystallizeResponse,
} from '@open-design/contracts';

import { Icon, type IconName } from './Icon';
import { useI18n } from '../i18n';
import { zhCN } from '../i18n/inline';
import type { Locale } from '../i18n/types';
import { navigate } from '../router';
import type { SkillSummary } from '../types';
import { useAnalytics } from '../analytics/provider';
import { trackAutomationsClick, trackPageView } from '../analytics/events';
import {
  NewAutomationModal,
  describeScheduleSummary,
  type AutomationTemplate,
  type AutomationTemplateKind,
} from './NewAutomationModal';

type ProjectSummary = { id: string; name: string };
type TemplateFilter =
  | 'all'
  | AutomationTemplateKind
  | 'memory'
  | 'design-system'
  | 'skills'
  | 'connectors'
  | 'compression'
  | 'release'
  | 'quality';

type Modal =
  | { kind: 'create'; template?: AutomationTemplate }
  | { kind: 'edit'; routine: Routine }
  | null;

interface Props {
  projects?: ProjectSummary[];
  skills?: SkillSummary[];
  designTemplates?: SkillSummary[];
  connectors?: ConnectorDetail[];
  connectorsLoading?: boolean;
}

const STATIC_TEMPLATES: ReadonlyArray<AutomationTemplate> = [
  {
    id: 'memory-refresh',
    category: 'memory',
    kind: 'routine',
    icon: 'sparkles',
    title: 'Refresh project memory from recent work.',
    description: 'Turns repeated decisions, preferences, and feedback into reusable memory updates.',
    defaultName: 'Memory refresh',
    prompt:
      'Review recent chats, PR comments, design feedback, and project changes. Extract durable preferences, repeated decisions, and workflow lessons. Propose concise memory updates with source links and separate one-off notes from reusable guidance.',
  },
  {
    id: 'design-system-refresh',
    category: 'design-system',
    kind: 'routine',
    icon: 'sliders',
    title: 'Update design systems from shipped artifacts.',
    description: 'Finds reusable tokens, components, and rules across recent design work.',
    defaultName: 'Design system maintainer',
    prompt:
      'Inspect recent generated artifacts, review feedback, and accepted revisions. Identify patterns that should become design-system tokens, component rules, examples, or anti-patterns. Draft precise updates to DESIGN.md and call out anything that needs human approval.',
  },
  {
    id: 'live-artifact-registry',
    category: 'live-artifact',
    kind: 'routine',
    icon: 'file-code',
    title: 'Audit live artifacts and refresh stale versions.',
    description: 'Keeps persistent dashboards, reports, and previews current instead of duplicating them.',
    defaultName: 'Live artifact maintainer',
    prompt:
      'List live artifacts for this project, find stale or failed refreshes, and update the highest-value artifact in place. Preserve artifact ids, summarize what changed, and flag artifacts that need connector access or human review.',
  },
  {
    id: 'orbit-dashboard',
    category: 'orbit',
    kind: 'routine',
    icon: 'orbit',
    title: 'Build a connector activity dashboard.',
    description: 'Aggregates selected connectors into an Orbit-style live dashboard.',
    defaultName: 'Connector activity dashboard',
    prompt:
      'Use the selected connectors to build or refresh a live dashboard of recent activity. Group by people, projects, decisions, risks, and follow-ups. Prefer connected read-only tools, cite sources, and keep the dashboard refreshable.',
  },
  {
    id: 'release-notes',
    category: 'release',
    kind: 'routine',
    icon: 'present',
    title: 'Draft release notes from shipped design work.',
    description: 'Connects merged PRs, artifacts, and product-facing changes into release notes.',
    defaultName: 'Weekly release notes',
    prompt:
      "Draft user-facing release notes covering merged PRs, updated artifacts, and design-system changes from the last 7 days. Group by 'New', 'Improved', and 'Fixed'. Include links when available and keep the copy user-readable.",
  },
  {
    id: 'quality-regression-watch',
    category: 'quality',
    kind: 'routine',
    icon: 'bell',
    title: 'Watch for design and implementation regressions.',
    description: 'Compares recent changes against benchmarks, traces, and accepted references.',
    defaultName: 'Regression watch',
    prompt:
      'Compare recent project changes against accepted artifacts, design-system rules, benchmarks, and traces. Flag regressions in behavior, layout, accessibility, or product intent. Suggest the smallest fix and cite the evidence.',
  },
];

const FALLBACK_ORBIT_TEMPLATE: AutomationTemplate = {
  id: 'orbit-daily',
  category: 'orbit',
  kind: 'orbit',
  icon: 'orbit',
  title: 'Daily connector digest.',
  description: 'Refreshes a connector activity digest on a schedule.',
  defaultName: 'Daily connector digest',
  prompt:
    'Survey every connected integration and produce a daily digest of what changed in the last 24 hours. Group the result by people, projects, decisions, and follow-ups. Save the output as a live artifact named `daily_digest.md` and update it in place on each run.',
};

const FALLBACK_LIVE_TEMPLATE: AutomationTemplate = {
  id: 'live-status-board',
  category: 'live-artifact',
  kind: 'live-artifact',
  icon: 'file-code',
  title: 'Keep a live status artifact fresh.',
  description: 'Updates one persistent artifact instead of creating a new report each run.',
  defaultName: 'Live status board',
  prompt:
    "Maintain a single live artifact named `status_board.md`. On each run, update the sections for 'In flight', 'Shipped this week', 'Risks', and 'Decisions made'. Edit in place so the artifact stays stable.",
};

const TEMPLATE_FILTERS: ReadonlyArray<{ id: TemplateFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'orbit', label: 'Orbit' },
  { id: 'live-artifact', label: 'Live artifacts' },
  { id: 'memory', label: 'Memory' },
  { id: 'design-system', label: 'Design systems' },
  { id: 'skills', label: 'Skills' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'compression', label: 'Compression' },
  { id: 'release', label: 'Release' },
  { id: 'quality', label: 'Quality' },
];

const SOURCE_KIND_OPTIONS: ReadonlyArray<{ id: AutomationSourceKind; label: string }> = [
  { id: 'connector', label: 'Connector' },
  { id: 'url', label: 'URL' },
  { id: 'repo', label: 'Repo' },
  { id: 'artifact', label: 'Artifact' },
  { id: 'chat', label: 'Chat' },
  { id: 'upload', label: 'Upload' },
];

const COMPRESSION_OPTIONS: ReadonlyArray<{ id: AutomationTokenCompressionMode; label: string }> = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'aggressive', label: 'Aggressive' },
  { id: 'off', label: 'Off' },
];

const ZH_TEMPLATE_COPY: Record<string, Partial<Pick<AutomationTemplate, 'title' | 'description' | 'defaultName' | 'prompt'>>> = {
  'memory-refresh': {
    title: '根据近期工作刷新项目记忆。',
    description: '把反复出现的决策、偏好和反馈沉淀成可复用的记忆更新。',
    defaultName: '记忆刷新',
    prompt:
      '回顾近期聊天、PR 评论、设计反馈和项目变更。提取长期有效的偏好、反复出现的决策和工作流经验。提出简洁的记忆更新并附上来源链接，同时区分一次性备注和可复用指南。',
  },
  'design-system-refresh': {
    title: '根据已交付产物更新设计体系。',
    description: '从近期设计工作中找出可复用的 token、组件和规则。',
    defaultName: '设计体系维护',
    prompt:
      '检查近期生成的制品、评审反馈和已采纳的修订。识别应该沉淀为设计体系 token、组件规则、示例或反模式的内容。起草精确的 DESIGN.md 更新，并标出需要人工确认的部分。',
  },
  'live-artifact-registry': {
    title: '审计实时制品并刷新过期版本。',
    description: '持续更新仪表盘、报告和预览，避免每次重复创建。',
    defaultName: '实时制品维护',
    prompt:
      '列出这个项目的实时制品，找出过期或刷新失败的内容，并就地更新价值最高的制品。保留制品 ID，总结改动内容，并标出需要连接器权限或人工审核的制品。',
  },
  'orbit-dashboard': {
    title: '构建连接器活动仪表盘。',
    description: '把选定连接器聚合成 Orbit 风格的实时仪表盘。',
    defaultName: '连接器活动仪表盘',
    prompt:
      '使用选定连接器构建或刷新近期活动的实时仪表盘。按人员、项目、决策、风险和后续事项分组。优先使用已连接的只读工具，注明来源，并保持仪表盘可刷新。',
  },
  'release-notes': {
    title: '根据已交付设计工作起草发布说明。',
    description: '把已合并 PR、制品和面向用户的变更整理成发布说明。',
    defaultName: '每周发布说明',
    prompt:
      '起草面向用户的发布说明，覆盖过去 7 天内已合并的 PR、更新的制品和设计体系变更。按“新增”“改进”“修复”分组。可用时附上链接，并保持文案易读。',
  },
  'quality-regression-watch': {
    title: '监控设计与实现回归。',
    description: '把近期变更与基准、轨迹和已验收参考进行对比。',
    defaultName: '回归监控',
    prompt:
      '将近期项目变更与已验收制品、设计体系规则、基准和轨迹进行对比。标出行为、布局、无障碍或产品意图上的回归。建议最小修复方案并引用证据。',
  },
  'orbit-daily': {
    title: '每日连接器摘要。',
    description: '按计划刷新连接器活动摘要。',
    defaultName: '每日连接器摘要',
    prompt:
      '巡视每个已连接集成，并生成过去 24 小时内变化的每日摘要。按人员、项目、决策和后续事项分组。把输出保存为名为 `daily_digest.md` 的实时制品，并在每次运行时就地更新。',
  },
  'live-status-board': {
    title: '保持实时状态制品更新。',
    description: '每次运行都更新同一个持久制品，而不是创建新报告。',
    defaultName: '实时状态看板',
    prompt:
      '维护一个名为 `status_board.md` 的实时制品。每次运行时更新“In flight”“Shipped this week”“Risks”“Decisions made”几个部分。就地编辑，保持制品稳定。',
  },
  'extract-design-system': {
    title: '提取设计体系',
    description: '根据品牌文档、截图、仓库、连接器、网站或优秀制品起草 DESIGN.md。',
    defaultName: '提取设计体系',
  },
  'ingest-source-memory-tree': {
    title: '接入来源并生成记忆树',
    description: '把连接器、链接、仓库、制品或聊天内容规范化为可审核的演进提案。',
    defaultName: '来源接入',
  },
  'orbit-general': {
    title: 'Orbit 通用摘要',
    description: '连接器达到两个或更多时，由 Orbit 流程选用的摘要技能。读取过去 24 小时的已授权连接器活动，并生成自适应的实时仪表盘。',
    defaultName: 'Orbit 通用摘要',
    prompt: '读取过去 24 小时的已授权连接器活动，按人员、项目、决策、风险和后续事项生成 Orbit 摘要仪表盘。',
  },
  'orbit-github': {
    title: 'GitHub Orbit 摘要',
    description: '当 GitHub 是唯一连接器，或每日摘要明确限定为 GitHub 时，由 Orbit 流程选用的摘要技能。',
    defaultName: 'GitHub Orbit 摘要',
    prompt: '读取过去 24 小时的 GitHub PR、评审请求、Issue、CI 运行和合并记录，生成 Orbit 摘要。',
  },
  'orbit-gmail': {
    title: 'Gmail Orbit 摘要',
    description: '当 Gmail 是唯一连接器，或每日摘要明确限定为 Gmail 时，由 Orbit 流程选用的摘要技能。',
    defaultName: 'Gmail Orbit 摘要',
    prompt: '读取过去 24 小时的 Gmail 收件箱活动，按待回复、提及、抄送和批量邮件生成 Orbit 摘要。',
  },
  'orbit-linear': {
    title: 'Linear Orbit 摘要',
    description: '当 Linear 是唯一连接器，或每日摘要明确限定为 Linear 时，由 Orbit 流程选用的摘要技能。',
    defaultName: 'Linear Orbit 摘要',
    prompt: '读取过去 24 小时的 Linear Issue 流转、状态变化、负责人和周期进度，生成 Orbit 摘要。',
  },
  'orbit-notion': {
    title: 'Notion Orbit 摘要',
    description: '当 Notion 是唯一连接器，或每日摘要明确限定为 Notion 时，由 Orbit 流程选用的摘要技能。',
    defaultName: 'Notion Orbit 摘要',
    prompt: '读取过去 24 小时的 Notion 文档编辑、评论、提及和数据库行变化，生成 Orbit 摘要。',
  },
  'live-artifact': {
    title: '实时制品',
    description: '创建可刷新、可审计的 Open Design 制品，并由连接器或本地数据支撑。适用于实时仪表盘、可刷新报告、同步视图或可复用的数据制品。',
    defaultName: '实时制品',
    prompt: '创建或刷新一个由连接器或本地数据支撑的实时制品，保留可审计来源，并让后续运行能够就地更新。',
  },
  'Baby Health Live': {
    title: '宝宝健康实时看板',
    description: '创建可刷新、可审计的宝宝健康实时制品，并由连接器或本地数据支撑。',
    defaultName: '宝宝健康实时看板',
  },
  'Competitor Radar Live': {
    title: '竞品雷达实时看板',
    description: '创建可刷新、可审计的竞品雷达制品，并由连接器或本地数据支撑。',
    defaultName: '竞品雷达实时看板',
  },
  'Crm Table Live': {
    title: 'CRM 表格实时看板',
    description: '创建可刷新、可审计的 CRM 表格制品，并由连接器或本地数据支撑。',
    defaultName: 'CRM 表格实时看板',
  },
  'Crypto Dashboard': {
    title: '加密货币仪表盘',
    description: '创建可刷新、可审计的加密货币仪表盘，并由连接器或本地数据支撑。',
    defaultName: '加密货币仪表盘',
  },
  'Monday Operator Live': {
    title: 'Monday 操作实时看板',
    description: '创建可刷新、可审计的 Monday 操作制品，并由连接器或本地数据支撑。',
    defaultName: 'Monday 操作实时看板',
  },
  'Stock Dashboard': {
    title: '股票仪表盘',
    description: '创建可刷新、可审计的股票仪表盘，并由连接器或本地数据支撑。',
    defaultName: '股票仪表盘',
  },
};

type SourceIngestionForm = {
  templateId: string;
  sourceKind: AutomationSourceKind;
  sourceRef: string;
  title: string;
  bodyMarkdown: string;
  connectorId: string;
  tokenCompression: AutomationTokenCompressionMode;
};

const DEFAULT_SOURCE_FORM: SourceIngestionForm = {
  templateId: 'ingest-source-memory-tree',
  sourceKind: 'connector',
  sourceRef: '',
  title: '',
  bodyMarkdown: '',
  connectorId: '',
  tokenCompression: 'balanced',
};

function scheduleStatusLabel(routine: Routine, locale: Locale): string {
  if (!routine.enabled) return zhCN(locale, 'Paused', '已暂停');
  return describeScheduleSummary(routine.schedule, locale);
}

function nextRunLabel(routine: Routine, locale: Locale): string {
  if (!routine.enabled) return zhCN(locale, 'Manual only', '仅手动运行');
  if (!routine.nextRunAt) return zhCN(locale, 'Scheduled', '已排程');
  const date = new Date(routine.nextRunAt);
  return `${zhCN(locale, 'Next', '下次')} ${date.toLocaleString(locale === 'zh-CN' ? 'zh-CN' : undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })}`;
}

function formatAutomationTimestamp(ts: number | null | undefined, locale: Locale): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatRunDuration(run: RoutineRun, locale: Locale): string {
  if (!run.completedAt) return zhCN(locale, 'In progress', '进行中');
  const seconds = Math.max(1, Math.round((run.completedAt - run.startedAt) / 1000));
  if (seconds < 60) return locale === 'zh-CN' ? `${seconds} 秒` : `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (locale === 'zh-CN') {
    return remainder > 0 ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分`;
  }
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function statusLabel(status: RoutineRun['status'], locale: Locale): string {
  if (status === 'succeeded') return zhCN(locale, 'Succeeded', '已成功');
  if (status === 'failed') return zhCN(locale, 'Failed', '失败');
  if (status === 'running') return zhCN(locale, 'Running', '运行中');
  if (status === 'queued') return zhCN(locale, 'Queued', '排队中');
  return zhCN(locale, 'Canceled', '已取消');
}

function StatusPill({ status, locale }: { status: RoutineRun['status']; locale: Locale }) {
  return <span className={`automation-status is-${status}`}>{statusLabel(status, locale)}</span>;
}

function templateFromSkill(skill: SkillSummary, kind: AutomationTemplateKind): AutomationTemplate {
  const category = kind === 'orbit' ? 'orbit' : 'live-artifact';
  return {
    id: `skill-${skill.id}`,
    category,
    kind,
    icon: kind === 'orbit' ? 'orbit' : 'file-code',
    title: skill.name,
    description: skill.description || skill.id,
    defaultName: skill.name,
    prompt: skill.examplePrompt || skill.description || `Run ${skill.name}.`,
    skillId: skill.id,
  };
}

function automationTemplateCategory(template: ContractAutomationTemplate): string {
  const tags = new Set(template.tags ?? []);
  if (template.outputSinks.includes('design-system') || tags.has('design-system')) {
    return 'design-system';
  }
  if (template.outputSinks.includes('skill') || tags.has('skills')) {
    return 'skills';
  }
  if (
    tags.has('connectors') ||
    (template.sourceKinds.length > 0 && template.sourceKinds.every((kind) => kind === 'connector'))
  ) {
    return 'connectors';
  }
  if (
    template.tokenCompression === 'aggressive' ||
    tags.has('compression') ||
    tags.has('tokens')
  ) {
    return 'compression';
  }
  if (template.outputSinks.includes('memory') || tags.has('memory')) {
    return 'memory';
  }
  return 'routine';
}

function automationTemplateIcon(category: string): IconName {
  if (category === 'design-system') return 'sliders';
  if (category === 'skills') return 'sparkles';
  if (category === 'connectors') return 'link';
  if (category === 'compression') return 'reload';
  if (category === 'memory') return 'history';
  return 'history';
}

function automationTemplatePrompt(template: ContractAutomationTemplate): string {
  const stages = template.stages.map((stage) => stage.title).join(' -> ');
  return [
    `Use Automation template "${template.id}".`,
    `Purpose: ${template.purpose}`,
    `Sources: ${template.sourceKinds.join(', ')}.`,
    `Trigger modes: ${template.triggerKinds.join(', ')}.`,
    `Pipeline: ${stages}.`,
    `Outputs: ${template.outputSinks.join(', ')}.`,
    `Review policy: ${template.reviewPolicy}. Token compression: ${template.tokenCompression}.`,
    'Produce reviewable proposals with provenance before applying durable memory, skill, automation, or design-system changes.',
  ].join('\n');
}

function templateFromAutomationCatalog(
  template: ContractAutomationTemplate,
): AutomationTemplate {
  const category = automationTemplateCategory(template);
  return {
    id: template.id,
    category,
    kind: 'routine',
    icon: automationTemplateIcon(category),
    title: template.title,
    description: template.description,
    defaultName: template.title,
    prompt: automationTemplatePrompt(template),
  };
}

function dedupeTemplates(templates: AutomationTemplate[]): AutomationTemplate[] {
  const seen = new Set<string>();
  return templates.filter((template) => {
    if (seen.has(template.id)) return false;
    seen.add(template.id);
    return true;
  });
}

function buildAutomationTemplates(
  designTemplates: SkillSummary[],
  automationCatalog: ContractAutomationTemplate[],
): AutomationTemplate[] {
  const orbit = designTemplates
    .filter((skill) => skill.scenario === 'orbit')
    .map((skill) => templateFromSkill(skill, 'orbit'));
  const live = designTemplates
    .filter((skill) => skill.scenario === 'live')
    .map((skill) => templateFromSkill(skill, 'live-artifact'));

  return dedupeTemplates([
    ...automationCatalog.map(templateFromAutomationCatalog),
    ...(orbit.length > 0 ? orbit : [FALLBACK_ORBIT_TEMPLATE]),
    ...(live.length > 0 ? live : [FALLBACK_LIVE_TEMPLATE]),
    ...STATIC_TEMPLATES,
  ]);
}

function filterTemplates(templates: AutomationTemplate[], filter: TemplateFilter) {
  if (filter === 'all') return templates;
  if (filter === 'orbit' || filter === 'live-artifact') {
    return templates.filter((template) => template.kind === filter);
  }
  return templates.filter((template) => template.category === filter);
}

function localizeAutomationTemplate(locale: Locale, template: AutomationTemplate): AutomationTemplate {
  if (locale !== 'zh-CN') return template;
  const copy = ZH_TEMPLATE_COPY[template.id] ?? ZH_TEMPLATE_COPY[template.title];
  if (!copy) return template;
  return {
    ...template,
    ...copy,
  };
}

function templateFilterLabel(locale: Locale, filter: { id: TemplateFilter; label: string }): string {
  if (filter.id === 'all') return zhCN(locale, filter.label, '全部');
  if (filter.id === 'orbit') return zhCN(locale, filter.label, 'Orbit');
  if (filter.id === 'live-artifact') return zhCN(locale, filter.label, '实时制品');
  if (filter.id === 'memory') return zhCN(locale, filter.label, '记忆');
  if (filter.id === 'design-system') return zhCN(locale, filter.label, '设计体系');
  if (filter.id === 'skills') return zhCN(locale, filter.label, '技能');
  if (filter.id === 'connectors') return zhCN(locale, filter.label, '连接器');
  if (filter.id === 'compression') return zhCN(locale, filter.label, '压缩');
  if (filter.id === 'release') return zhCN(locale, filter.label, '发布');
  return zhCN(locale, filter.label, '质量');
}

function sourceKindLabel(locale: Locale, kind: string, fallback = kind): string {
  if (kind === 'connector') return zhCN(locale, fallback, '连接器');
  if (kind === 'url') return zhCN(locale, fallback, 'URL');
  if (kind === 'repo') return zhCN(locale, fallback, '仓库');
  if (kind === 'artifact') return zhCN(locale, fallback, '制品');
  if (kind === 'chat') return zhCN(locale, fallback, '聊天');
  if (kind === 'upload') return zhCN(locale, fallback, '上传');
  return fallback;
}

function compressionLabel(locale: Locale, mode: AutomationTokenCompressionMode, fallback: string): string {
  if (mode === 'balanced') return zhCN(locale, fallback, '平衡');
  if (mode === 'aggressive') return zhCN(locale, fallback, '强压缩');
  return zhCN(locale, fallback, '关闭');
}

function reviewPolicyLabel(locale: Locale, policy: AutomationReviewPolicy): string {
  if (policy === 'always') return zhCN(locale, policy, '总是审核');
  if (policy === 'trusted-source') return zhCN(locale, policy, '可信来源');
  if (policy === 'auto-apply') return zhCN(locale, policy, '自动应用');
  return policy;
}

function localizeCatalogTemplateTitle(locale: Locale, template: ContractAutomationTemplate): string {
  if (locale !== 'zh-CN') return template.title;
  return ZH_TEMPLATE_COPY[template.id]?.title ?? template.title;
}

function localizeTemplateIdTitle(locale: Locale, id: string): string {
  if (locale !== 'zh-CN') return id;
  return ZH_TEMPLATE_COPY[id]?.title ?? id;
}

function kindLabel(kind: AutomationTemplateKind, locale: Locale): string {
  if (kind === 'orbit') return 'Orbit';
  if (kind === 'live-artifact') return zhCN(locale, 'Live artifact', '实时制品');
  return zhCN(locale, 'Automation', '自动化');
}

function kindIcon(kind: AutomationTemplateKind): IconName {
  if (kind === 'orbit') return 'orbit';
  if (kind === 'live-artifact') return 'file-code';
  return 'history';
}

function proposalTargetLabel(target: AutomationEvolutionProposal['targetKind'], locale: Locale): string {
  if (target === 'memory-node') return zhCN(locale, 'Memory', '记忆');
  if (target === 'design-system') return zhCN(locale, 'Design system', '设计体系');
  if (target === 'skill') return zhCN(locale, 'Skill', '技能');
  return zhCN(locale, 'Automation template', '自动化模板');
}

function proposalActionLabel(action: AutomationEvolutionProposal['action'], locale: Locale): string {
  if (action === 'create') return zhCN(locale, 'Create', '创建');
  if (action === 'update') return zhCN(locale, 'Update', '更新');
  if (action === 'merge') return zhCN(locale, 'Merge', '合并');
  if (action === 'move') return zhCN(locale, 'Move', '移动');
  if (action === 'delete') return zhCN(locale, 'Delete', '删除');
  return zhCN(locale, 'Promote', '提升');
}

export function TasksView({ skills = [], designTemplates = [], connectors = [] }: Props) {
  const analytics = useAnalytics();
  // P2 page_view page_name=automations. Ref-keyed so re-renders don't
  // double-fire while the user is on the page.
  const pageViewFiredRef = useState<{ fired: boolean }>(() => ({ fired: false }))[0];
  useEffect(() => {
    if (pageViewFiredRef.fired) return;
    pageViewFiredRef.fired = true;
    trackPageView(analytics.track, { page_name: 'automations' });
  }, [analytics.track, pageViewFiredRef]);
  const { locale } = useI18n();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>('all');
  const [automationCatalog, setAutomationCatalog] = useState<ContractAutomationTemplate[]>([]);
  const [proposals, setProposals] = useState<AutomationEvolutionProposal[]>([]);
  const [sourcePackets, setSourcePackets] = useState<AutomationContentPacket[]>([]);
  const [sourceForm, setSourceForm] = useState<SourceIngestionForm>(DEFAULT_SOURCE_FORM);
  const [proposalBusyId, setProposalBusyId] = useState<string | null>(null);
  const [ingestingSource, setIngestingSource] = useState(false);
  const [crystallizingRunId, setCrystallizingRunId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [focusRoutineId, setFocusRoutineId] = useState<string | null>(null);
  const routineRowRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const [historyTick, setHistoryTick] = useState(0);

  const templates = useMemo(
    () => buildAutomationTemplates(designTemplates, automationCatalog),
    [automationCatalog, designTemplates],
  );
  const localizedTemplates = useMemo(
    () => templates.map((template) => localizeAutomationTemplate(locale, template)),
    [locale, templates],
  );
  const filteredTemplates = useMemo(
    () => filterTemplates(localizedTemplates, templateFilter),
    [localizedTemplates, templateFilter],
  );

  const refresh = useCallback(async () => {
    try {
      const templateRequest = fetch('/api/automation-templates')
        .then(async (res) => {
          if (!res.ok) return null;
          return (await res.json()) as AutomationTemplateListResponse;
        })
        .catch(() => null);
      const proposalRequest = fetch('/api/automation-proposals?status=pending-review')
        .then(async (res) => {
          if (!res.ok) return null;
          return (await res.json()) as AutomationEvolutionProposalListResponse;
        })
        .catch(() => null);
      const sourcePacketRequest = fetch('/api/automation-source-packets?limit=3')
        .then(async (res) => {
          if (!res.ok) return null;
          return (await res.json()) as AutomationSourcePacketListResponse;
        })
        .catch(() => null);
      const [rRes, pRes, tJson, proposalJson, sourcePacketJson] = await Promise.all([
        fetch('/api/routines'),
        fetch('/api/projects'),
        templateRequest,
        proposalRequest,
        sourcePacketRequest,
      ]);
      if (!rRes.ok) throw new Error(`routines: ${rRes.status}`);
      const rJson = await rRes.json();
      setRoutines(rJson.routines ?? []);
      if (pRes.ok) {
        const pJson = await pRes.json();
        setProjects(
          (pJson.projects ?? []).map((p: ProjectSummary) => ({
            id: p.id,
            name: p.name,
          })),
        );
      }
      if (tJson) {
        setAutomationCatalog(Array.isArray(tJson.templates) ? tJson.templates : []);
      }
      if (proposalJson) {
        setProposals(Array.isArray(proposalJson.proposals) ? proposalJson.proposals : []);
      }
      if (sourcePacketJson) {
        setSourcePackets(Array.isArray(sourcePacketJson.packets) ? sourcePacketJson.packets : []);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const projectsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.name);
    return map;
  }, [projects]);

  // Sort routines by creation time, newest first
  const sortedRoutines = useMemo(
    () => sortRoutinesNewestFirst(routines),
    [routines],
  );

  useEffect(() => {
    if (!focusRoutineId) return;
    const node = routineRowRefs.current[focusRoutineId];
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const timer = window.setTimeout(() => setFocusRoutineId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [focusRoutineId, sortedRoutines]);

  const activeCount = sortedRoutines.filter((routine) => routine.enabled).length;
  const pausedCount = sortedRoutines.length - activeCount;
  const sourceIngestionTemplates = useMemo(
    () =>
      automationCatalog.filter((template) =>
        template.stages.some((stage) => stage.kind === 'ingest' || stage.kind === 'propose'),
      ),
    [automationCatalog],
  );

  const patchSourceForm = (patch: Partial<SourceIngestionForm>) => {
    setSourceForm((current) => ({ ...current, ...patch }));
  };

  const submitSourceIngestion = async () => {
    if (!sourceForm.bodyMarkdown.trim()) {
      setError(zhCN(locale, 'Paste source content before ingesting it.', '请先粘贴要接入的来源内容。'));
      return;
    }
    setIngestingSource(true);
    setError(null);
    try {
      const res = await fetch('/api/automation-ingestions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          templateId: sourceForm.templateId || undefined,
          sourceKind: sourceForm.sourceKind,
          sourceRef: sourceForm.sourceRef || undefined,
          title: sourceForm.title || undefined,
          bodyMarkdown: sourceForm.bodyMarkdown,
          connectorId:
            sourceForm.sourceKind === 'connector' && sourceForm.connectorId
              ? sourceForm.connectorId
              : undefined,
          tokenCompression: sourceForm.tokenCompression,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || zhCN(locale, `ingestion failed: ${res.status}`, `接入失败：${res.status}`));
      }
      const json = (await res.json()) as AutomationSourceIngestionResponse;
      setSourcePackets((current) => [json.packet, ...current].slice(0, 3));
      setSourceForm((current) => ({
        ...current,
        title: '',
        sourceRef: '',
        bodyMarkdown: '',
      }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIngestingSource(false);
    }
  };

  const reviewProposal = async (id: string, action: 'apply' | 'reject') => {
    setProposalBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/automation-proposals/${id}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: action === 'reject' ? JSON.stringify({ reason: 'Dismissed in Automations' }) : '{}',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || zhCN(locale, `${action} failed: ${res.status}`, `${action === 'apply' ? '应用' : '拒绝'}失败：${res.status}`));
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProposalBusyId(null);
    }
  };

  const runNow = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/routines/${id}/run`, { method: 'POST' });
      if (!res.ok && res.status !== 202) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || zhCN(locale, `run failed: ${res.status}`, `运行失败：${res.status}`));
      }
      const j = await res.json().catch(() => null);
      if (j?.projectId) {
        navigate({
          kind: 'project',
          projectId: j.projectId,
          conversationId: j.conversationId ?? null,
          fileName: null,
        });
        return;
      }
      void refresh();
      setExpandedId(id);
      setHistoryTick((tick) => tick + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const crystallizeRun = async (routineId: string, runId: string) => {
    setCrystallizingRunId(runId);
    setError(null);
    try {
      const res = await fetch(`/api/routines/${routineId}/runs/${runId}/crystallize`, {
        method: 'POST',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || zhCN(locale, `crystallize failed: ${res.status}`, `结晶失败：${res.status}`));
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCrystallizingRunId(null);
    }
  };

  const togglePaused = async (routine: Routine) => {
    setBusyId(routine.id);
    try {
      const res = await fetch(`/api/routines/${routine.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !routine.enabled }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || zhCN(locale, `update failed: ${res.status}`, `更新失败：${res.status}`));
      }
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(zhCN(locale, 'Delete this automation? Past runs and their projects are kept.', '删除这个自动化？历史运行和对应项目会保留。')))
      return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/routines/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || zhCN(locale, `delete failed: ${res.status}`, `删除失败：${res.status}`));
      }
      if (expandedId === id) setExpandedId(null);
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="automations-view" aria-labelledby="automations-title" data-testid="tasks-view">
      <header className="automations-hero">
        <div className="automations-hero__copy">
          <span className="automations-hero__eyebrow">{zhCN(locale, 'Scheduled agent sessions', '计划中的代理会话')}</span>
          <h1 id="automations-title" className="automations-hero__title">
            {zhCN(locale, 'Automations', '自动化')}
          </h1>
          <p className="automations-hero__lede">
            {zhCN(locale, 'Plan recurring conversations for project work, Orbit digests, and live artifacts.', '为项目工作、Orbit 摘要和实时制品规划周期性对话。')}
          </p>
        </div>
        <div className="automations-hero__actions">
          <div className="automations-metrics" aria-label={zhCN(locale, 'Automation summary', '自动化概览')}>
            <Metric label={zhCN(locale, 'Active', '活跃')} value={activeCount} />
            <Metric label={zhCN(locale, 'Paused', '已暂停')} value={pausedCount} />
            <Metric label={zhCN(locale, 'Templates', '模板')} value={templates.length} />
          </div>
          <button
            type="button"
            className="automations-view__new"
            onClick={() => setModal({ kind: 'create' })}
            data-testid="automations-new"
          >
            <Icon name="plus" size={14} />
            <span>{zhCN(locale, 'New automation', '新建自动化')}</span>
          </button>
        </div>
      </header>

      {error ? (
        <div className="automations-view__error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="automations-saved" aria-label={zhCN(locale, 'Your automations', '你的自动化')}>
        <div className="automations-section-head">
          <h2 className="automations-section__label">{zhCN(locale, 'Your automations', '你的自动化')}</h2>
          {loading ? <span className="automations-section__meta">{zhCN(locale, 'Loading', '加载中')}</span> : null}
        </div>
        {!loading && sortedRoutines.length === 0 ? (
          <button
            type="button"
            className="automation-empty"
            onClick={() => setModal({ kind: 'create' })}
          >
            <span className="automation-empty__icon">
              <Icon name="plus" size={16} />
            </span>
            <span className="automation-empty__body">
              <strong>{zhCN(locale, 'No automations yet', '还没有自动化')}</strong>
              <span>{zhCN(locale, 'Create one from a template or start with a blank schedule.', '从模板创建一个，或从空白计划开始。')}</span>
            </span>
          </button>
        ) : null}
        {sortedRoutines.length > 0 ? (
          <ul className="automations-saved__list">
            {sortedRoutines.map((r) => {
              const isBusy = busyId === r.id;
              const targetLabel =
                r.target.mode === 'reuse'
                  ? projectsById.get(r.target.projectId) ?? r.target.projectId
                  : zhCN(locale, 'New project each run', '每次运行新建项目');
              const isExpanded = expandedId === r.id;
              return (
                <li
                  key={r.id}
                  ref={(node) => {
                    routineRowRefs.current[r.id] = node;
                  }}
                  data-testid={`automation-row-${r.id}`}
                  className={`automation-row${r.enabled ? '' : ' is-paused'}${focusRoutineId === r.id ? ' is-focused' : ''}`}
                >
                  <div className="automation-row__main">
                    <span className="automation-row__icon">
                      <Icon name={r.skillId ? 'sparkles' : 'history'} size={15} />
                    </span>
                    <span className="automation-row__content">
                      <span className="automation-row__title">{r.name}</span>
                      <span className="automation-row__meta">
                        <span>{scheduleStatusLabel(r, locale)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{targetLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{nextRunLabel(r, locale)}</span>
                      </span>
                      {r.prompt ? (
                        <span className="automation-row__prompt">{r.prompt}</span>
                      ) : null}
                      {r.lastRun ? (
                        <span className="automation-row__last-run">
                          <StatusPill status={r.lastRun.status} locale={locale} />
                          <span>{zhCN(locale, 'Last run', '上次运行')} {formatAutomationTimestamp(r.lastRun.startedAt, locale)}</span>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            className="automation-inline-link"
                            onClick={() =>
                              navigate({
                                kind: 'project',
                                projectId: r.lastRun!.projectId,
                                conversationId: r.lastRun!.conversationId,
                                fileName: null,
                              })
                            }
                          >
                            {zhCN(locale, 'Open result', '打开结果')}
                          </button>
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="automation-row__actions">
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => runNow(r.id)}
                      disabled={isBusy}
                      title={zhCN(locale, 'Run now and open the conversation', '立即运行并打开对话')}
                    >
                      <Icon name="play" size={12} />
                      <span>{zhCN(locale, 'Run', '运行')}</span>
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => {
                        setExpandedId(isExpanded ? null : r.id);
                        if (!isExpanded) setHistoryTick((tick) => tick + 1);
                      }}
                      aria-expanded={isExpanded}
                    >
                      <Icon name="history" size={12} />
                      <span>{isExpanded ? zhCN(locale, 'Hide history', '隐藏历史') : zhCN(locale, 'History', '历史记录')}</span>
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => setModal({ kind: 'edit', routine: r })}
                      disabled={isBusy}
                    >
                      <Icon name="edit" size={12} />
                      <span>{zhCN(locale, 'Edit', '编辑')}</span>
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => togglePaused(r)}
                      disabled={isBusy}
                    >
                      {r.enabled ? zhCN(locale, 'Pause', '暂停') : zhCN(locale, 'Resume', '继续')}
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn automation-row__btn--danger"
                      onClick={() => remove(r.id)}
                      disabled={isBusy}
                      aria-label={zhCN(locale, 'Delete automation', '删除自动化')}
                      title={zhCN(locale, 'Delete this automation', '删除这个自动化')}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                  {isExpanded ? (
                    <AutomationRunHistory
                      routineId={r.id}
                      refreshKey={historyTick}
                      crystallizingRunId={crystallizingRunId}
                      onCrystallizeRun={crystallizeRun}
                      locale={locale}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {proposals.length > 0 ? (
        <section className="automations-saved" aria-label={zhCN(locale, 'Automation evolution proposals', '自动化演进提案')}>
          <div className="automations-section-head">
            <div>
              <h2 className="automations-section__label">{zhCN(locale, 'Evolution proposals', '演进提案')}</h2>
              <p className="automations-section__sub">
                {zhCN(locale, 'Review automation output before it changes memory, skills, or design systems.', '在自动化输出改变记忆、技能或设计体系之前先审核。')}
              </p>
            </div>
            <span className="automations-section__meta">
              {zhCN(locale, `${proposals.length} pending`, `${proposals.length} 个待处理`)}
            </span>
          </div>
          <ul className="automations-saved__list">
            {proposals.map((proposal) => {
              const isBusy = proposalBusyId === proposal.id;
              return (
                <li key={proposal.id} className="automation-row">
                  <div className="automation-row__main">
                    <span className="automation-row__icon">
                      <Icon
                        name={proposal.targetKind === 'design-system' ? 'sliders' : 'sparkles'}
                        size={15}
                      />
                    </span>
                    <span className="automation-row__content">
                      <span className="automation-row__title">{proposal.title}</span>
                      <span className="automation-row__meta">
                        <span>{proposalTargetLabel(proposal.targetKind, locale)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{proposalActionLabel(proposal.action, locale)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{reviewPolicyLabel(locale, proposal.reviewPolicy)}</span>
                      </span>
                      <span className="automation-row__prompt">{proposal.summary}</span>
                      {proposal.patch.diffSummary ? (
                        <span className="automation-row__last-run">
                          {proposal.patch.diffSummary}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="automation-row__actions">
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => reviewProposal(proposal.id, 'apply')}
                      disabled={isBusy}
                    >
                      <Icon name="check" size={12} />
                      <span>{zhCN(locale, 'Apply', '应用')}</span>
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn automation-row__btn--danger"
                      onClick={() => reviewProposal(proposal.id, 'reject')}
                      disabled={isBusy}
                    >
                      {zhCN(locale, 'Reject', '拒绝')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="automations-ingest" aria-label={zhCN(locale, 'Source ingestion', '来源接入')}>
        <div className="automations-section-head">
          <div>
            <h2 className="automations-section__label">{zhCN(locale, 'Ingest source', '接入来源')}</h2>
            <p className="automations-section__sub">
              {zhCN(locale, 'Turn connector, repo, artifact, or chat context into reviewable evolution proposals.', '把连接器、仓库、制品或聊天上下文转换成可审核的演进提案。')}
            </p>
          </div>
          <span className="automations-section__meta">
            {zhCN(locale, `${sourcePackets.length} recent`, `${sourcePackets.length} 条最近记录`)}
          </span>
        </div>
        <div className="automation-ingest-panel">
          <div className="automation-ingest-controls">
            <label className="automation-ingest-field">
              <span>{zhCN(locale, 'Template', '模板')}</span>
              <select
                value={sourceForm.templateId}
                onChange={(event) => patchSourceForm({ templateId: event.currentTarget.value })}
              >
                {sourceIngestionTemplates.length === 0 ? (
                  <option value={sourceForm.templateId}>{localizeTemplateIdTitle(locale, sourceForm.templateId)}</option>
                ) : null}
                {sourceIngestionTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {localizeCatalogTemplateTitle(locale, template)}
                  </option>
                ))}
              </select>
            </label>
            <label className="automation-ingest-field">
              <span>{zhCN(locale, 'Source', '来源')}</span>
              <select
                value={sourceForm.sourceKind}
                onChange={(event) =>
                  patchSourceForm({ sourceKind: event.currentTarget.value as AutomationSourceKind })
                }
              >
                {SOURCE_KIND_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {sourceKindLabel(locale, option.id, option.label)}
                  </option>
                ))}
              </select>
            </label>
            <label className="automation-ingest-field">
              <span>{zhCN(locale, 'Compression', '压缩')}</span>
              <select
                value={sourceForm.tokenCompression}
                onChange={(event) =>
                  patchSourceForm({
                    tokenCompression: event.currentTarget.value as AutomationTokenCompressionMode,
                  })
                }
              >
                {COMPRESSION_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {compressionLabel(locale, option.id, option.label)}
                  </option>
                ))}
              </select>
            </label>
            {sourceForm.sourceKind === 'connector' ? (
              <label className="automation-ingest-field">
                <span>{zhCN(locale, 'Connector', '连接器')}</span>
                <select
                  value={sourceForm.connectorId}
                  onChange={(event) => patchSourceForm({ connectorId: event.currentTarget.value })}
                >
                  <option value="">{zhCN(locale, 'Any connected source', '任意已连接来源')}</option>
                  {connectors.map((connector) => (
                    <option key={connector.id} value={connector.id}>
                      {connector.name}
                      {connector.accountLabel ? ` · ${connector.accountLabel}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <div className="automation-ingest-fields">
            <label className="automation-ingest-field">
              <span>{zhCN(locale, 'Title', '标题')}</span>
              <input
                value={sourceForm.title}
                onChange={(event) => patchSourceForm({ title: event.currentTarget.value })}
                placeholder={zhCN(locale, 'Decision, brand notes, workflow pattern...', '决策、品牌备注、工作流模式...')}
              />
            </label>
            <label className="automation-ingest-field">
              <span>{zhCN(locale, 'Source ref', '来源引用')}</span>
              <input
                value={sourceForm.sourceRef}
                onChange={(event) => patchSourceForm({ sourceRef: event.currentTarget.value })}
                placeholder={zhCN(locale, 'URL, repo path, connector event id, artifact id...', 'URL、仓库路径、连接器事件 ID、制品 ID...')}
              />
            </label>
          </div>
          <label className="automation-ingest-field automation-ingest-field--body">
            <span>{zhCN(locale, 'Content', '内容')}</span>
            <textarea
              value={sourceForm.bodyMarkdown}
              onChange={(event) => patchSourceForm({ bodyMarkdown: event.currentTarget.value })}
              placeholder={zhCN(locale, 'Paste the content to canonicalize into a source packet and proposals.', '粘贴要规范化为来源包和提案的内容。')}
            />
          </label>
          <div className="automation-ingest-footer">
            {sourcePackets.length > 0 ? (
              <ul className="automation-ingest-recent" aria-label={zhCN(locale, 'Recent source packets', '最近来源包')}>
                {sourcePackets.map((packet) => (
                  <li key={packet.id}>
                    <span>{packet.title}</span>
                    <small>
                      {sourceKindLabel(locale, packet.sourceKind)} · {packet.tokenStats.originalTokens} {zhCN(locale, 'tokens', '个 token')}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="automation-ingest-empty">{zhCN(locale, 'No source packets yet.', '还没有来源包。')}</span>
            )}
            <button
              type="button"
              className="automations-view__new"
              onClick={submitSourceIngestion}
              disabled={ingestingSource}
            >
              <Icon name="sparkles" size={14} />
              <span>{ingestingSource ? zhCN(locale, 'Ingesting', '接入中') : zhCN(locale, 'Ingest', '接入')}</span>
            </button>
          </div>
        </div>
      </section>

      <section className="automations-templates" aria-label={zhCN(locale, 'Automation templates', '自动化模板')}>
        <div className="automations-templates__head">
          <div className="automations-templates__head-copy">
            <h2 className="automations-section__label">{zhCN(locale, 'Templates', '模板')}</h2>
            <p className="automations-section__sub">
              {zhCN(locale, 'Orbit and live artifacts are templates inside the same automation flow.', 'Orbit 和实时制品都是同一个自动化流程里的模板。')}
            </p>
          </div>
          <span className="automations-section__meta">
            {zhCN(locale, `${filteredTemplates.length} of ${templates.length}`, `${filteredTemplates.length} / ${templates.length}`)}
          </span>
        </div>
        <div
          className="automations-template-tabs"
          role="tablist"
          aria-label={zhCN(locale, 'Template filters', '模板筛选')}
        >
          {TEMPLATE_FILTERS.map((filter) => {
            const count = filterTemplates(templates, filter.id).length;
            const isActive = templateFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`automations-template-tab${isActive ? ' is-active' : ''}`}
                onClick={() => setTemplateFilter(filter.id)}
              >
                <span className="automations-template-tab__label">{templateFilterLabel(locale, filter)}</span>
                <span className="automations-template-tab__count">{count}</span>
              </button>
            );
          })}
        </div>

        {filteredTemplates.length === 0 ? (
          <div className="automations-templates__empty" role="status">
            <span className="automations-templates__empty-icon" aria-hidden="true">
              <Icon name="sparkles" size={16} />
            </span>
            <div>
              <strong>{zhCN(locale, 'No templates in this category yet.', '这个分类下还没有模板。')}</strong>
              <p>{zhCN(locale, 'Try a different filter, or start from a blank automation.', '换一个筛选条件，或从空白自动化开始。')}</p>
            </div>
          </div>
        ) : null}
        <div className="automations-templates__grid">
          {filteredTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`automation-template-card is-${template.kind}`}
              onClick={() => setModal({ kind: 'create', template })}
            >
              <span className="automation-template-card__icon" aria-hidden="true">
                <Icon name={template.icon} size={16} />
              </span>
              <span className="automation-template-card__body">
                <span className="automation-template-card__kicker">
                  <Icon name={kindIcon(template.kind)} size={11} />
                  {kindLabel(template.kind, locale)}
                </span>
                <span className="automation-template-card__title">{template.title}</span>
                <span className="automation-template-card__desc">{template.description}</span>
                <span className="automation-template-card__cta">
                  {zhCN(locale, 'Use template', '使用模板')}
                  <Icon name="chevron-right" size={12} />
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <NewAutomationModal
        open={modal !== null}
        initial={
          modal?.kind === 'edit'
            ? { routine: modal.routine }
            : modal?.kind === 'create' && modal.template
              ? { template: modal.template }
              : null
        }
        templates={localizedTemplates}
        projects={projects}
        skills={skills}
        connectors={connectors}
        onClose={() => setModal(null)}
        onSaved={(routine) => {
          void (async () => {
            await refresh();
            setExpandedId(routine.id);
            setFocusRoutineId(routine.id);
          })();
        }}
      />
    </section>
  );
}

export function sortRoutinesNewestFirst(routines: Routine[]): Routine[] {
  return [...routines].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="automations-metric">
      <span className="automations-metric__value">{value}</span>
      <span className="automations-metric__label">{label}</span>
    </div>
  );
}

function AutomationRunHistory({
  routineId,
  refreshKey,
  crystallizingRunId,
  onCrystallizeRun,
  locale,
}: {
  routineId: string;
  refreshKey: number;
  crystallizingRunId: string | null;
  onCrystallizeRun: (routineId: string, runId: string) => void;
  locale: Locale;
}) {
  const [runs, setRuns] = useState<RoutineRun[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRuns(null);
    void (async () => {
      try {
        const res = await fetch(`/api/routines/${routineId}/runs?limit=10`);
        if (!res.ok) throw new Error(`runs: ${res.status}`);
        const json = await res.json();
        if (!cancelled) setRuns(json.runs ?? []);
      } catch {
        if (!cancelled) setRuns([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, routineId]);

  if (runs === null) {
    return <div className="automation-history automation-history--empty">{zhCN(locale, 'Loading run history...', '正在加载运行历史...')}</div>;
  }

  if (runs.length === 0) {
    return <div className="automation-history automation-history--empty">{zhCN(locale, 'No runs yet.', '还没有运行。')}</div>;
  }

  return (
    <div className="automation-history" aria-label={zhCN(locale, 'Automation run history', '自动化运行历史')}>
      <div className="automation-history__head">
        <span>{zhCN(locale, 'Run history', '运行历史')}</span>
        <span>{zhCN(locale, 'Latest 10', '最近 10 次')}</span>
      </div>
      <ul className="automation-history__list">
        {runs.map((run) => (
          <li key={run.id} className="automation-history__row">
            <div className="automation-history__status">
              <StatusPill status={run.status} locale={locale} />
              <span>{run.trigger}</span>
            </div>
            <div className="automation-history__meta">
              <span>{formatAutomationTimestamp(run.startedAt, locale)}</span>
              <span aria-hidden="true">·</span>
              <span>{formatRunDuration(run, locale)}</span>
              <span aria-hidden="true">·</span>
              <span>{run.agentRunId}</span>
            </div>
            {run.summary || run.error ? (
              <div className={`automation-history__message${run.error ? ' is-error' : ''}`}>
                {run.error ?? run.summary}
              </div>
            ) : null}
            <div className="automation-history__actions">
              {run.status === 'succeeded' ? (
                <button
                  type="button"
                  className="automation-history__open"
                  onClick={() => onCrystallizeRun(routineId, run.id)}
                  disabled={crystallizingRunId === run.id}
                  title={zhCN(locale, 'Draft skill and memory proposals from this run', '从这次运行起草技能和记忆提案')}
                >
                  <Icon name="sparkles" size={12} />
                  <span>{crystallizingRunId === run.id ? zhCN(locale, 'Crystallizing', '结晶中') : zhCN(locale, 'Crystallize', '结晶')}</span>
                </button>
              ) : null}
              <button
                type="button"
                className="automation-history__open"
                onClick={() =>
                  navigate({
                    kind: 'project',
                    projectId: run.projectId,
                    conversationId: run.conversationId,
                    fileName: null,
                  })
                }
              >
                {zhCN(locale, 'Open conversation', '打开对话')}
                <Icon name="chevron-right" size={12} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
