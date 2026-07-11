// New / edit automation modal. The persistence layer is /api/routines; the
// user-facing model is a scheduled agent conversation that can start in a new
// project or append a new conversation to an existing project.
import { Icon } from '../../../components/Icon';
import { useI18n, useT } from '../../../i18n';
import { localizePluginDescription, localizePluginTitle } from '../../../components/plugins-home/localization';
import { isContextSelected } from '../rules';
import {
  useWiredAutomationCapabilities,
  type AutomationCapabilitiesController,
} from '../hooks/useAutomationCapabilities.hooks';
import {
  useWiredAutomationModalForm,
  type AutomationModalFormController,
  type UseAutomationModalFormOptions,
} from '../hooks/useAutomationModalForm.hooks';
import type { NewAutomationModalProps } from '../types';
import { MentionItem, MentionSection } from './MentionPickerParts';
import { PillButton, PopoverItem, PopoverMenu } from './PopoverParts';
import { ScheduleSummary } from './ScheduleSummary';
import { SchedulePopover } from './SchedulePopover';
import { TemplatePopover } from './TemplatePopover';

interface NewAutomationModalHooks {
  useCapabilities?: (open: boolean) => AutomationCapabilitiesController;
  useForm?: (options: UseAutomationModalFormOptions) => AutomationModalFormController;
}

export function NewAutomationModal({
  open,
  initial,
  templates,
  projects,
  skills,
  connectors = [],
  onClose,
  onSaved,
  useCapabilities = useWiredAutomationCapabilities,
  useForm = useWiredAutomationModalForm,
}: NewAutomationModalProps & NewAutomationModalHooks) {
  const t = useT();
  const { locale } = useI18n();
  const { plugins, mcpServers } = useCapabilities(open);
  const form = useForm({
    open,
    initial,
    templates,
    projects,
    skills,
    plugins,
    mcpServers,
    connectors,
    locale,
    onClose,
    onSaved,
  });

  if (!open) return null;

  return (
    <div
      className="automation-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={form.editingId ? t('automations.edit') : t('automations.newAutomation')}
      data-testid="automation-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onMouseDown={() => form.setPopover(null)}
    >
      <form className="automation-modal" onSubmit={form.submit} onMouseDown={(e) => e.stopPropagation()}>
        <header className="automation-modal__head">
          <input
            ref={form.titleRef}
            type="text"
            className="automation-modal__title-input"
            placeholder={t('routines.fieldNamePlaceholder')}
            value={form.form.name}
            onChange={(e) => form.setForm((current) => ({ ...current, name: e.target.value }))}
            aria-label={t('routines.fieldName')}
            data-testid="automation-modal-title"
          />
          <div className="automation-modal__head-actions">
            <div className="automation-pill__wrap">
              <button
                type="button"
                className={`automation-template-trigger${form.popover === 'template' ? ' is-active' : ''}`}
                onClick={() => form.setPopover(form.popover === 'template' ? null : 'template')}
              >
                <Icon name="sparkles" size={13} />
                <span>{form.selectedTemplate?.title ?? form.selectedTemplate?.defaultName ?? t('automations.useTemplate')}</span>
                <Icon name="chevron-down" size={11} />
              </button>
              {form.popover === 'template' ? (
                <TemplatePopover
                  templates={templates}
                  selectedId={form.selectedTemplateId}
                  onSelect={(template) => form.applyTemplate(template, { closePopover: true })}
                />
              ) : null}
            </div>
            <button type="button" className="automation-modal__close" onClick={onClose} aria-label={t('common.close')}>
              <Icon name="close" size={14} />
            </button>
          </div>
        </header>

        <div className="automation-modal__body">
          <div className={`automation-modal__prompt-wrap${form.mention ? ' is-mentioning' : ''}`}>
            <textarea
              ref={form.promptRef}
              className="automation-modal__prompt"
              placeholder={t('automations.promptPlaceholder')}
              value={form.form.prompt}
              // A mounted <textarea>'s selectionStart is always a number, never null.
              onChange={(e) => form.updatePrompt(e.target.value, e.target.selectionStart!)}
              onClick={form.refreshMentionFromPrompt}
              onFocus={() => form.setPopover(null)}
              onKeyDown={form.handlePromptKeyDown}
              onKeyUp={form.refreshMentionFromPrompt}
              rows={8}
              aria-controls={form.mention ? 'automation-context-picker' : undefined}
              aria-expanded={Boolean(form.mention)}
              data-testid="automation-modal-prompt"
            />
          </div>

          {form.mention ? (
            <div
              id="automation-context-picker"
              className="automation-mention-popover"
              role="listbox"
              aria-label={t('homeHero.contextSearchResults')}
              data-testid="automation-mention-popover"
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="automation-mention-tabs" role="tablist" aria-label={t('chat.mentionTabsAria')}>
                {(
                  [
                    ['all', t('chat.mentionTabAll')],
                    ['skills', t('chat.mentionTabSkills')],
                    ['plugins', t('chat.mentionTabPlugins')],
                    ['mcp', t('chat.mentionTabMcp')],
                    ['connectors', t('chat.mentionTabConnectors')],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={form.mentionTab === id}
                    className={`automation-mention-tab${form.mentionTab === id ? ' is-active' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      form.setMentionTab(id);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="automation-mention-results">
                {!form.hasMentionResults ? (
                  <div className="automation-mention-empty">
                    {form.mention.query
                      ? t('chat.mentionNoResults', { query: form.mention.query })
                      : t('chat.mentionSearchPrompt')}
                  </div>
                ) : null}
                {form.showSkills && form.filteredSkills.length > 0 ? (
                  <MentionSection label={t('chat.mentionSectionSkills')}>
                    {form.filteredSkills.map((skill) => (
                      <MentionItem
                        key={`skill-${skill.id}`}
                        icon="file"
                        label={skill.name}
                        meta={skill.description || skill.mode}
                        selected={isContextSelected(form.selectedContextItems, 'skills', skill.id)}
                        onPick={() => form.pickSkill(skill)}
                      />
                    ))}
                  </MentionSection>
                ) : null}
                {form.showPlugins && form.filteredPlugins.length > 0 ? (
                  <MentionSection label={t('chat.mentionSectionPlugins')}>
                    {form.filteredPlugins.map((plugin) => (
                      <MentionItem
                        key={`plugin-${plugin.id}`}
                        icon="sparkles"
                        label={localizePluginTitle(locale, plugin)}
                        meta={localizePluginDescription(locale, plugin) || plugin.id}
                        selected={isContextSelected(form.selectedContextItems, 'plugins', plugin.id)}
                        onPick={() => form.pickPlugin(plugin)}
                      />
                    ))}
                  </MentionSection>
                ) : null}
                {form.showMcp && form.filteredMcp.length > 0 ? (
                  <MentionSection label={t('chat.mentionSectionMcp')}>
                    {form.filteredMcp.map((server) => (
                      <MentionItem
                        key={`mcp-${server.id}`}
                        icon="link"
                        label={server.label || server.id}
                        meta={server.url || server.command || server.transport}
                        selected={isContextSelected(form.selectedContextItems, 'mcp', server.id)}
                        onPick={() => form.pickMcp(server)}
                      />
                    ))}
                  </MentionSection>
                ) : null}
                {form.showConnectors && form.filteredConnectors.length > 0 ? (
                  <MentionSection label={t('chat.mentionSectionConnectors')}>
                    {form.filteredConnectors.map((connector) => (
                      <MentionItem
                        key={`connector-${connector.id}`}
                        icon="link"
                        label={connector.name}
                        meta={connector.accountLabel ?? connector.provider ?? connector.id}
                        selected={isContextSelected(form.selectedContextItems, 'connectors', connector.id)}
                        onPick={() => form.pickConnector(connector)}
                      />
                    ))}
                  </MentionSection>
                ) : null}
              </div>
            </div>
          ) : null}

          {form.selectedContextItems.length > 0 ? (
            <div className="automation-selected-context" aria-label={t('homeHero.contextSurfaces')}>
              {form.selectedContextItems.map((item) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  className={`automation-selected-context__chip is-${item.kind}`}
                  onClick={() => form.removeSelectedContext(item.kind, item.id)}
                  title={t('chat.removeAria', { name: item.label })}
                >
                  <Icon name={item.icon} size={11} />
                  <span>{item.label}</span>
                  <Icon name="close" size={10} />
                </button>
              ))}
            </div>
          ) : null}

          {form.error ? (
            <div className="automation-modal__error" role="alert">
              {form.error}
            </div>
          ) : null}
        </div>

        <footer className="automation-modal__foot">
          <div className="automation-modal__pills">
            <PillButton
              icon="folder"
              active={form.popover === 'project'}
              label={form.projectLabel}
              onClick={() => form.setPopover(form.popover === 'project' ? null : 'project')}
            >
              {form.popover === 'project' ? (
                <PopoverMenu>
                  <PopoverItem
                    selected={form.form.mode === 'create_each_run'}
                    onClick={() => {
                      form.setForm((current) => ({ ...current, mode: 'create_each_run', projectId: '' }));
                      form.setPopover(null);
                    }}
                    label={t('automations.targetCreateEachRun')}
                    hint={t('routines.modeCreateHint')}
                  />
                  {projects.length > 0 ? (
                    <>
                      <div className="automation-popover__section-label">{t('routines.fieldsetProject')}</div>
                      {projects.map((p) => (
                        <PopoverItem
                          key={p.id}
                          selected={form.form.mode === 'reuse' && form.form.projectId === p.id}
                          onClick={() => {
                            form.setForm((current) => ({ ...current, mode: 'reuse', projectId: p.id }));
                            form.setPopover(null);
                          }}
                          label={p.name}
                          title={p.name}
                        />
                      ))}
                    </>
                  ) : null}
                </PopoverMenu>
              ) : null}
            </PillButton>

            <PillButton
              icon="history"
              active={form.popover === 'schedule'}
              label={<ScheduleSummary parts={form.scheduleParts} />}
              aria-label={form.scheduleLabel}
              onClick={() => form.setPopover(form.popover === 'schedule' ? null : 'schedule')}
            >
              {form.popover === 'schedule' ? (
                <SchedulePopover
                  form={form.form}
                  setForm={form.setForm}
                  timezones={form.timezones}
                  onDone={() => form.setPopover(null)}
                />
              ) : null}
            </PillButton>
          </div>

          <div className="automation-modal__actions">
            <button type="button" className="automation-modal__cancel" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="automation-modal__submit" disabled={form.submitting}>
              {form.editingId
                ? form.submitting
                  ? t('common.loading')
                  : t('common.save')
                : form.submitting
                  ? t('common.loading')
                  : t('common.create')}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
