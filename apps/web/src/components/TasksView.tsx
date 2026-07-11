// Automations tab: one surface for scheduled routines, Orbit-style digests,
// and live artifact refreshers. The daemon still stores these as routines;
// the UI presents them as scheduled agent conversations.
//
// The automations slice's public API is its barrel; this orchestrator reaches
// slice internals only through it (ADR 0002, enforced by
// check-web-slice-boundaries).
import { useT } from '../i18n';
import {
  AutomationsHero,
  AutomationsSavedSection,
  NewAutomationModal,
  ProposalsSection,
  TemplatesSection,
  buildModalInitial,
  sortRoutinesNewestFirst,
  useWiredAutomationsDashboard,
  type AutomationsDashboardController,
  type TasksViewProps,
  type UseAutomationsDashboardOptions,
} from '../features/automations';

export { sortRoutinesNewestFirst };

// Injectable hook for the orchestrator. Defaults to the real wired hook, so
// production callers pass nothing while tests swap in a fake controller.
interface TasksViewHooks {
  useDashboard?: (options: UseAutomationsDashboardOptions) => AutomationsDashboardController;
}

export function TasksView({
  skills = [],
  designTemplates = [],
  connectors = [],
  useDashboard = useWiredAutomationsDashboard,
}: TasksViewProps & TasksViewHooks) {
  const t = useT();
  const dashboard = useDashboard({ skills, designTemplates, connectors });

  return (
    <section className="automations-view" aria-labelledby="automations-title" data-testid="tasks-view">
      <AutomationsHero
        activeCount={dashboard.activeCount}
        pausedCount={dashboard.pausedCount}
        templateCount={dashboard.templates.length}
        onNewAutomation={() => dashboard.openCreateModal()}
        t={t}
      />

      {dashboard.error ? (
        <div className="automations-view__error" role="alert">
          {dashboard.error}
        </div>
      ) : null}

      <AutomationsSavedSection
        loading={dashboard.loading}
        routines={dashboard.sortedRoutines}
        projectsById={dashboard.projectsById}
        expandedId={dashboard.expandedId}
        focusRoutineId={dashboard.focusRoutineId}
        historyTick={dashboard.historyTick}
        busyId={dashboard.busyId}
        crystallizingRunId={dashboard.crystallizingRunId}
        fireClick={dashboard.fireClick}
        routineRowRefs={dashboard.routineRowRefs}
        onNewAutomation={() => dashboard.openCreateModal()}
        onRun={dashboard.runNow}
        onToggleHistory={dashboard.toggleHistory}
        onEdit={dashboard.openEditModal}
        onTogglePaused={dashboard.togglePaused}
        onDelete={dashboard.remove}
        onCrystallizeRun={dashboard.crystallizeRun}
        t={t}
      />

      <ProposalsSection
        proposals={dashboard.proposals}
        proposalBusyId={dashboard.proposalBusyId}
        onReview={dashboard.reviewProposal}
        t={t}
      />

      <TemplatesSection
        templates={dashboard.templates}
        filteredTemplates={dashboard.filteredTemplates}
        templateFilter={dashboard.templateFilter}
        onSelectFilter={dashboard.selectTemplateFilter}
        onSelectTemplate={(template) => dashboard.openCreateModal(template)}
        t={t}
      />

      <NewAutomationModal
        open={dashboard.modal !== null}
        initial={buildModalInitial(dashboard.modal)}
        templates={dashboard.templates}
        projects={dashboard.projects}
        skills={skills}
        connectors={connectors}
        onClose={dashboard.closeModal}
        onSaved={dashboard.onSaved}
      />
    </section>
  );
}
