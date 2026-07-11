// Feature-local hook for the automations dashboard: the saved-routine list,
// the evolution-proposal review queue, and the template catalog. Its
// transport dependency is INJECTED as the slice port, so it holds no provider
// import and unit-tests against a hand-written fake `RoutinesDashboardPort`.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type {
  AutomationEvolutionProposal,
  AutomationTemplate as ContractAutomationTemplate,
  ConnectorDetail,
  Routine,
} from '@open-design/contracts';

import { navigate } from '../../../router';
import { useT } from '../../../i18n';
import type { SkillSummary } from '../../../types';
import type { AutomationDomPort, RoutinesDashboardPort } from '../ports';
import { automationDomPort, routinesDashboardPort } from '../dependencies';
import {
  buildAutomationTemplates,
  buildProjectsById,
  errorMessage,
  filterTemplates,
  mergeAutomationProposals,
  sortRoutinesNewestFirst,
} from '../rules';
import type { AutomationModal, AutomationTemplate, RoutineProjectSummary, TemplateFilter } from '../types';
import { useAutomationAnalytics } from './useAutomationAnalytics.hooks';

export interface UseAutomationsDashboardOptions {
  skills: SkillSummary[];
  designTemplates: SkillSummary[];
  connectors: ConnectorDetail[];
}

export interface AutomationsDashboardController {
  loading: boolean;
  error: string | null;
  busyId: string | null;
  modal: AutomationModal;
  sortedRoutines: Routine[];
  projects: RoutineProjectSummary[];
  projectsById: Map<string, string>;
  activeCount: number;
  pausedCount: number;
  templates: AutomationTemplate[];
  filteredTemplates: AutomationTemplate[];
  templateFilter: TemplateFilter;
  selectTemplateFilter: (filter: TemplateFilter) => void;
  automationCatalog: ContractAutomationTemplate[];
  proposals: AutomationEvolutionProposal[];
  proposalBusyId: string | null;
  crystallizingRunId: string | null;
  expandedId: string | null;
  focusRoutineId: string | null;
  routineRowRefs: MutableRefObject<Record<string, HTMLLIElement | null>>;
  historyTick: number;
  fireClick: ReturnType<typeof useAutomationAnalytics>['fireClick'];
  openCreateModal: (template?: AutomationTemplate) => void;
  openEditModal: (routine: Routine) => void;
  closeModal: () => void;
  onSaved: (routine: Routine) => void;
  reviewProposal: (id: string, action: 'apply' | 'reject') => Promise<void>;
  runNow: (id: string) => Promise<void>;
  crystallizeRun: (routineId: string, runId: string) => Promise<void>;
  togglePaused: (routine: Routine) => Promise<void>;
  remove: (id: string) => Promise<void>;
  toggleHistory: (id: string) => void;
}

export function useAutomationsDashboard(
  port: RoutinesDashboardPort,
  domPort: AutomationDomPort,
  options: UseAutomationsDashboardOptions,
): AutomationsDashboardController {
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;
  const { skills, designTemplates, connectors } = options;
  const { fireClick } = useAutomationAnalytics();

  const [routines, setRoutines] = useState<Routine[]>([]);
  const [projects, setProjects] = useState<RoutineProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<AutomationModal>(null);
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>('all');
  const [automationCatalog, setAutomationCatalog] = useState<ContractAutomationTemplate[]>([]);
  const [proposals, setProposals] = useState<AutomationEvolutionProposal[]>([]);
  const [proposalBusyId, setProposalBusyId] = useState<string | null>(null);
  const [crystallizingRunId, setCrystallizingRunId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [focusRoutineId, setFocusRoutineId] = useState<string | null>(null);
  const routineRowRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const [historyTick, setHistoryTick] = useState(0);

  const templates = useMemo(
    () => buildAutomationTemplates(designTemplates, automationCatalog, tRef.current),
    [automationCatalog, designTemplates],
  );
  const filteredTemplates = useMemo(
    () => filterTemplates(templates, templateFilter),
    [templates, templateFilter],
  );

  const refresh = useCallback(async (): Promise<{ proposalRefreshFailed: boolean }> => {
    try {
      const snapshot = await port.fetchAutomationsSnapshot();
      setRoutines(snapshot.routines);
      if (snapshot.projects) setProjects(snapshot.projects);
      if (snapshot.automationCatalog) setAutomationCatalog(snapshot.automationCatalog);
      if (snapshot.proposals) setProposals(snapshot.proposals);
      setError(null);
      return { proposalRefreshFailed: snapshot.proposalRefreshFailed };
    } catch (err) {
      setError(errorMessage(err));
      return { proposalRefreshFailed: false };
    } finally {
      setLoading(false);
    }
  }, [port]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const projectsById = useMemo(() => buildProjectsById(projects), [projects]);

  const sortedRoutines = useMemo(() => sortRoutinesNewestFirst(routines), [routines]);

  useEffect(() => {
    if (!focusRoutineId) return;
    const node = routineRowRefs.current[focusRoutineId];
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return domPort.scheduleTimeout(() => setFocusRoutineId(null), 4000);
  }, [domPort, focusRoutineId, sortedRoutines]);

  const activeCount = sortedRoutines.filter((routine) => routine.enabled).length;
  const pausedCount = sortedRoutines.length - activeCount;

  const openCreateModal = useCallback((template?: AutomationTemplate) => {
    fireClick(template ? 'type_card' : 'new_automation', template ? { template_kind: template.kind } : undefined);
    setModal({ kind: 'create', template });
  }, [fireClick]);

  const openEditModal = useCallback((routine: Routine) => {
    fireClick('edit');
    setModal({ kind: 'edit', routine });
  }, [fireClick]);

  const closeModal = useCallback(() => setModal(null), []);

  const onSaved = useCallback((routine: Routine) => {
    void (async () => {
      await refresh();
      setExpandedId(routine.id);
      setFocusRoutineId(routine.id);
    })();
  }, [refresh]);

  const reviewProposal = useCallback(async (id: string, action: 'apply' | 'reject') => {
    fireClick(action === 'apply' ? 'proposal_apply' : 'proposal_reject');
    setProposalBusyId(id);
    setError(null);
    try {
      await port.reviewAutomationProposal(id, action, tRef.current('automations.proposalsDismissReason'));
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProposalBusyId(null);
    }
  }, [fireClick, port, refresh]);

  const runNow = useCallback(async (id: string) => {
    fireClick('run_now');
    setBusyId(id);
    setError(null);
    try {
      const result = await port.runRoutineNow(id);
      if (result?.projectId) {
        navigate({
          kind: 'project',
          projectId: result.projectId,
          conversationId: result.conversationId ?? null,
          fileName: null,
        });
        return;
      }
      void refresh();
      setExpandedId(id);
      setHistoryTick((tick) => tick + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }, [fireClick, port, refresh]);

  // `crystallize` analytics fires from the `AutomationRunHistory` button
  // itself (via the `fireClick` passed through as `onFireClick`), alongside
  // its sibling `view_progress` action which has no dashboard-level function
  // of its own — so it is not re-fired here.
  const crystallizeRun = useCallback(async (routineId: string, runId: string) => {
    setCrystallizingRunId(runId);
    setError(null);
    try {
      const json = await port.crystallizeRoutineRun(routineId, runId);
      const createdProposals = Array.isArray(json.proposals) ? json.proposals : [];
      if (createdProposals.length > 0) {
        setProposals((current) => mergeAutomationProposals(current, createdProposals));
      }
      const { proposalRefreshFailed } = await refresh();
      if (proposalRefreshFailed) {
        setError(
          createdProposals.length > 0
            ? tRef.current('automations.crystallizePartialSuccess')
            : tRef.current('automations.crystallizeRefreshFailed'),
        );
      } else if (createdProposals.length === 0) {
        setError(tRef.current('automations.crystallizeNoProposals'));
      }
    } catch (err) {
      setError(tRef.current('automations.crystallizeFailed', { error: errorMessage(err) }));
    } finally {
      setCrystallizingRunId(null);
    }
  }, [port, refresh]);

  const togglePaused = useCallback(async (routine: Routine) => {
    fireClick(routine.enabled ? 'pause' : 'resume');
    setBusyId(routine.id);
    try {
      await port.toggleRoutinePaused(routine);
      void refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }, [fireClick, port, refresh]);

  const remove = useCallback(async (id: string) => {
    fireClick('delete');
    if (!domPort.confirmDialog(tRef.current('automations.deleteConfirm'))) return;
    setBusyId(id);
    try {
      await port.deleteRoutine(id);
      if (expandedId === id) setExpandedId(null);
      void refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }, [domPort, expandedId, fireClick, port, refresh]);

  const selectTemplateFilter = useCallback((filter: TemplateFilter) => {
    fireClick('filter_tab', { filter_id: filter });
    setTemplateFilter(filter);
  }, [fireClick]);

  const toggleHistory = useCallback((id: string) => {
    fireClick('history');
    setExpandedId((current) => {
      const next = current === id ? null : id;
      if (next) setHistoryTick((tick) => tick + 1);
      return next;
    });
  }, [fireClick]);

  return {
    loading,
    error,
    busyId,
    modal,
    sortedRoutines,
    projects,
    projectsById,
    activeCount,
    pausedCount,
    templates,
    filteredTemplates,
    templateFilter,
    selectTemplateFilter,
    automationCatalog,
    proposals,
    proposalBusyId,
    crystallizingRunId,
    expandedId,
    focusRoutineId,
    routineRowRefs,
    historyTick,
    fireClick,
    openCreateModal,
    openEditModal,
    closeModal,
    onSaved,
    reviewProposal,
    runNow,
    crystallizeRun,
    togglePaused,
    remove,
    toggleHistory,
  };
}

export function useWiredAutomationsDashboard(
  options: UseAutomationsDashboardOptions,
): AutomationsDashboardController {
  return useAutomationsDashboard(routinesDashboardPort, automationDomPort, options);
}
