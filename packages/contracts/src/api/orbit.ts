export interface OrbitRunSummary {
  id?: string;
  startedAt?: string;
  completedAt: string;
  trigger?: 'manual' | 'scheduled';
  templateSkillId?: string | null;
  connectorsChecked: number;
  connectorsSucceeded: number;
  connectorsFailed: number;
  connectorsSkipped: number;
  artifactId?: string | null;
  artifactProjectId?: string | null;
  agentRunId?: string | null;
  markdown: string;
}

export interface OrbitStatusResponse {
  running?: boolean;
  nextRunAt?: string | null;
  lastRun?: OrbitRunSummary | null;
  lastRunsByTemplate?: Record<string, OrbitRunSummary>;
}
