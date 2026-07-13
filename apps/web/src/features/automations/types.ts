// UI-only types for the automations slice. Wire shapes come from
// `@open-design/contracts` (never redeclared here); these are the local view
// models the slice's hooks and dumb components pass around.
import type {
  AutomationEvolutionProposal,
  AutomationTemplate as ContractAutomationTemplate,
  ConnectorDetail,
  Routine,
  Weekday,
} from '@open-design/contracts';

import type { Dict } from '../../i18n/types';
import type { SkillSummary } from '../../types';
import type { IconName } from '../../components/Icon';

export type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

export interface RoutineProjectSummary {
  id: string;
  name: string;
}

/**
 * Result of the automations snapshot transport, as the slice's port sees it.
 * Structurally identical to the provider adapter's return type —
 * `dependencies.ts` binds the two — but defined in-slice so no feature file
 * imports `providers/` (ADR 0002).
 */
export interface AutomationsSnapshot {
  routines: Routine[];
  projects: RoutineProjectSummary[] | null;
  automationCatalog: ContractAutomationTemplate[] | null;
  proposals: AutomationEvolutionProposal[] | null;
  proposalRefreshFailed: boolean;
}

/** Result of the "run now" transport, as the slice's port sees it. */
export interface RunRoutineResult {
  projectId?: string;
  conversationId?: string | null;
}

export type AutomationTemplateKind = 'routine' | 'orbit' | 'live-artifact';

export interface AutomationTemplate {
  id: string;
  category: string;
  kind: AutomationTemplateKind;
  icon: IconName;
  title: string;
  description: string;
  prompt: string;
  defaultName?: string;
  skillId?: string | null;
}

export type TemplateFilter =
  | 'all'
  | AutomationTemplateKind
  | 'memory'
  | 'design-system'
  | 'skills'
  | 'connectors'
  | 'compression'
  | 'release'
  | 'quality';

export type AutomationModal =
  | { kind: 'create'; template?: AutomationTemplate }
  | { kind: 'edit'; routine: Routine }
  | null;

export interface TasksViewProps {
  projects?: RoutineProjectSummary[];
  skills?: SkillSummary[];
  designTemplates?: SkillSummary[];
  connectors?: ConnectorDetail[];
  connectorsLoading?: boolean;
}

// --- Automation modal (create/edit) ---

export type ScheduleKind = 'hourly' | 'daily' | 'weekdays' | 'weekly';
export type CapabilityKind = 'skills' | 'plugins' | 'mcp' | 'connectors';
export type CapabilityPickerTab = 'all' | CapabilityKind;

export interface ContextMention {
  start: number;
  end: number;
  query: string;
}

export interface SelectedContextItem {
  kind: CapabilityKind;
  id: string;
  label: string;
  meta: string;
  icon: IconName;
}

export interface AutomationFormState {
  name: string;
  prompt: string;
  kind: ScheduleKind;
  minute: number;
  time: string;
  weekday: Weekday;
  timezone: string;
  mode: 'create_each_run' | 'reuse';
  projectId: string;
}

export interface NewAutomationModalProps {
  open: boolean;
  initial?: { template?: AutomationTemplate; routine?: Routine } | null;
  templates: AutomationTemplate[];
  projects: RoutineProjectSummary[];
  skills: SkillSummary[];
  connectors?: ConnectorDetail[];
  onClose: () => void;
  onSaved: (routine: Routine) => void;
}
