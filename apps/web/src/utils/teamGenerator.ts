/**
 * Front-end team generator — mirrors the Go profiler's capability scoring
 * and role assignment logic. Given a list of locally installed CLI agents,
 * generates preset teams for each collaboration mode.
 */

export interface AgentCapabilityScores {
  creativeDesign: number;
  codeGen: number;
  contentWriting: number;
  criticalReview: number;
  systemOps: number;
  fastIteration: number;
  deepReasoning: number;
  chineseContent: number;
}

export interface TeamAssignment {
  agentId: string;
  agentType: string;
  agentName: string;
  role: string;
  score: number;
  reason: string;
}

export interface GeneratedTeam {
  id: string;
  mode: string;
  name: string;
  description: string;
  assignments: TeamAssignment[];
}

/** Hardcoded capability scores per agent type — matches Go profiler profile.go */
const CAPABILITY_TABLE: Record<string, AgentCapabilityScores> = {
  claude:        { creativeDesign: 100, codeGen: 75,  contentWriting: 85,  criticalReview: 80,  systemOps: 65,  fastIteration: 70,  deepReasoning: 85,  chineseContent: 60 },
  codex:         { creativeDesign: 60,  codeGen: 100, contentWriting: 60,  criticalReview: 70,  systemOps: 90,  fastIteration: 65,  deepReasoning: 90,  chineseContent: 40 },
  gemini:        { creativeDesign: 70,  codeGen: 60,  contentWriting: 100, criticalReview: 75,  systemOps: 55,  fastIteration: 80,  deepReasoning: 70,  chineseContent: 50 },
  'cursor-agent':{ creativeDesign: 60,  codeGen: 90,  contentWriting: 55,  criticalReview: 80,  systemOps: 70,  fastIteration: 60,  deepReasoning: 75,  chineseContent: 40 },
  kimi:          { creativeDesign: 50,  codeGen: 50,  contentWriting: 85,  criticalReview: 60,  systemOps: 40,  fastIteration: 55,  deepReasoning: 50,  chineseContent: 95 },
  qwen:          { creativeDesign: 60,  codeGen: 85,  contentWriting: 80,  criticalReview: 60,  systemOps: 55,  fastIteration: 60,  deepReasoning: 70,  chineseContent: 90 },
  deepseek:      { creativeDesign: 55,  codeGen: 95,  contentWriting: 60,  criticalReview: 70,  systemOps: 65,  fastIteration: 60,  deepReasoning: 85,  chineseContent: 85 },
  opencode:      { creativeDesign: 65,  codeGen: 80,  contentWriting: 70,  criticalReview: 75,  systemOps: 80,  fastIteration: 75,  deepReasoning: 80,  chineseContent: 50 },
  copilot:       { creativeDesign: 55,  codeGen: 85,  contentWriting: 60,  criticalReview: 65,  systemOps: 60,  fastIteration: 70,  deepReasoning: 65,  chineseContent: 40 },
  hermes:        { creativeDesign: 60,  codeGen: 70,  contentWriting: 65,  criticalReview: 70,  systemOps: 85,  fastIteration: 75,  deepReasoning: 75,  chineseContent: 45 },
};

const DEFAULT_SCORES: AgentCapabilityScores = {
  creativeDesign: 50, codeGen: 50, contentWriting: 50, criticalReview: 50,
  systemOps: 50, fastIteration: 50, deepReasoning: 50, chineseContent: 50,
};

const ROLE_LABELS: Record<string, string> = {
  designer: '设计师',
  developer: '开发者',
  copywriter: '文案写手',
  reviewer: '评审者',
  polisher: '精修者',
  generator: '生成器',
  synthesizer: '综合器',
};

const MODE_LABELS: Record<string, string> = {
  parallel: '并行模式',
  serial: '串行模式',
  genetic: '遗传模式',
  inheritance: '继承模式',
  hybrid: '混合模式',
  complementary: '互补模式',
  cycle: '循环模式',
};

const MODE_DESCRIPTIONS: Record<string, string> = {
  parallel: '同层级 Agent 并行执行不同维度，适用多视角设计',
  serial: '链式执行，每阶段输出作为下阶段输入',
  genetic: '多变体并行生成 + 评分选择 + 优化迭代',
  inheritance: '父 Agent 产出继承给子 Agent，逐步细化',
  hybrid: '串行主干 + 阶段内并行，适用复杂项目',
  complementary: '多专家视角链式协作，覆盖全生命周期',
  cycle: '生成器与评审者循环求精，直到达标',
};

interface AgentInfo {
  id: string;
  name: string;
  available: boolean;
}

function getScores(agentType: string): AgentCapabilityScores {
  return CAPABILITY_TABLE[agentType] ?? DEFAULT_SCORES;
}

function scoreForRole(scores: AgentCapabilityScores, role: string): number {
  switch (role) {
    case 'designer':   return scores.creativeDesign * 0.6 + scores.contentWriting * 0.2 + scores.fastIteration * 0.2;
    case 'developer':  return scores.codeGen * 0.6 + scores.systemOps * 0.2 + scores.deepReasoning * 0.2;
    case 'copywriter': return scores.contentWriting * 0.6 + scores.chineseContent * 0.2 + scores.creativeDesign * 0.2;
    case 'reviewer':   return scores.criticalReview * 0.5 + scores.deepReasoning * 0.3 + scores.codeGen * 0.1 + scores.creativeDesign * 0.1;
    case 'polisher':   return scores.creativeDesign * 0.5 + scores.contentWriting * 0.3 + scores.fastIteration * 0.2;
    case 'generator':  return scores.creativeDesign * 0.3 + scores.codeGen * 0.3 + scores.deepReasoning * 0.4;
    case 'synthesizer':return scores.deepReasoning * 0.4 + scores.contentWriting * 0.3 + scores.creativeDesign * 0.3;
    default:           return 50;
  }
}

function findBestAgent(agents: AgentInfo[], role: string, exclude: Set<string>): TeamAssignment | null {
  let best: TeamAssignment | null = null;
  for (const agent of agents) {
    if (exclude.has(agent.id)) continue;
    const scores = getScores(agent.id);
    const score = scoreForRole(scores, role);
    if (!best || score > best.score) {
      best = {
        agentId: agent.id,
        agentType: agent.id,
        agentName: agent.name,
        role,
        score: Math.round(score),
        reason: `最佳 ${ROLE_LABELS[role] ?? role} 角色匹配`,
      };
    }
  }
  return best;
}

/**
 * Generate preset teams from a list of locally installed CLI agents.
 * Produces teams for each of the 7 collaboration modes, skipping modes
 * that don't have enough agents.
 */
export function generateTeams(agents: AgentInfo[]): GeneratedTeam[] {
  const available = agents.filter((a) => a.available);
  if (available.length === 0) return [];

  const teams: GeneratedTeam[] = [];

  // Parallel: best-fit per role (designer, developer, copywriter)
  if (available.length >= 2) {
    const used = new Set<string>();
    const designer = findBestAgent(available, 'designer', used);
    if (designer) used.add(designer.agentId);
    const developer = findBestAgent(available, 'developer', used);
    if (developer) used.add(developer.agentId);
    const copywriter = findBestAgent(available, 'copywriter', used);
    const assignments = [designer, developer, copywriter].filter(Boolean) as TeamAssignment[];
    if (assignments.length >= 2) {
      teams.push({
        id: 'team-parallel',
        mode: 'parallel',
        name: `${MODE_LABELS.parallel} · ${assignments.length} Agent`,
        description: MODE_DESCRIPTIONS.parallel,
        assignments,
      });
    }
  }

  // Serial: chain of experts (designer → polisher → developer)
  if (available.length >= 2) {
    const used = new Set<string>();
    const roles = ['designer', 'polisher', 'developer'];
    const assignments: TeamAssignment[] = [];
    for (const role of roles) {
      const pick = findBestAgent(available, role, used);
      if (pick) { used.add(pick.agentId); assignments.push(pick); }
    }
    if (assignments.length >= 2) {
      teams.push({
        id: 'team-serial',
        mode: 'serial',
        name: `${MODE_LABELS.serial} · ${assignments.length} 阶段`,
        description: MODE_DESCRIPTIONS.serial,
        assignments,
      });
    }
  }

  // Genetic: single best all-rounder
  {
    const best = findBestAgent(available, 'generator', new Set());
    if (best) {
      teams.push({
        id: 'team-genetic',
        mode: 'genetic',
        name: `${MODE_LABELS.genetic} · ${best.agentName}`,
        description: MODE_DESCRIPTIONS.genetic,
        assignments: [best],
      });
    }
  }

  // Inheritance: root(designer) → child(polisher) → leaf(developer)
  if (available.length >= 2) {
    const used = new Set<string>();
    const roles = ['designer', 'polisher', 'developer'];
    const assignments: TeamAssignment[] = [];
    for (const role of roles) {
      const pick = findBestAgent(available, role, used);
      if (pick) { used.add(pick.agentId); assignments.push(pick); }
    }
    if (assignments.length >= 2) {
      teams.push({
        id: 'team-inheritance',
        mode: 'inheritance',
        name: `${MODE_LABELS.inheritance} · ${assignments.length} 层`,
        description: MODE_DESCRIPTIONS.inheritance,
        assignments,
      });
    }
  }

  // Complementary: diverse experts (design → copy → dev → review)
  if (available.length >= 3) {
    const used = new Set<string>();
    const roles = ['designer', 'copywriter', 'developer', 'reviewer'];
    const assignments: TeamAssignment[] = [];
    for (const role of roles) {
      const pick = findBestAgent(available, role, used);
      if (pick) { used.add(pick.agentId); assignments.push(pick); }
    }
    if (assignments.length >= 3) {
      teams.push({
        id: 'team-complementary',
        mode: 'complementary',
        name: `${MODE_LABELS.complementary} · ${assignments.length} 专家`,
        description: MODE_DESCRIPTIONS.complementary,
        assignments,
      });
    }
  }

  // Cycle: generator + reviewer (different agents)
  if (available.length >= 2) {
    const used = new Set<string>();
    const generator = findBestAgent(available, 'generator', used);
    if (generator) used.add(generator.agentId);
    const reviewer = findBestAgent(available, 'reviewer', used);
    if (generator && reviewer) {
      teams.push({
        id: 'team-cycle',
        mode: 'cycle',
        name: `${MODE_LABELS.cycle} · ${generator.agentName} ↔ ${reviewer.agentName}`,
        description: MODE_DESCRIPTIONS.cycle,
        assignments: [generator, reviewer],
      });
    }
  }

  // Hybrid: layered best-fit
  if (available.length >= 2) {
    const used = new Set<string>();
    const designer = findBestAgent(available, 'designer', used);
    if (designer) used.add(designer.agentId);
    const developer = findBestAgent(available, 'developer', used);
    if (developer) used.add(developer.agentId);
    const copywriter = findBestAgent(available, 'copywriter', used);
    const assignments = [designer, developer, copywriter].filter(Boolean) as TeamAssignment[];
    if (assignments.length >= 2) {
      teams.push({
        id: 'team-hybrid',
        mode: 'hybrid',
        name: `${MODE_LABELS.hybrid} · ${assignments.length} Agent`,
        description: MODE_DESCRIPTIONS.hybrid,
        assignments,
      });
    }
  }

  return teams;
}
