import { Icon } from '../../../components/Icon';
import { filterTemplates, kindIcon, kindLabel, templateFilters } from '../rules';
import type { AutomationTemplate, TemplateFilter, TranslateFn } from '../types';

export function TemplatesSection({
  templates,
  filteredTemplates,
  templateFilter,
  onSelectFilter,
  onSelectTemplate,
  t,
}: {
  templates: AutomationTemplate[];
  filteredTemplates: AutomationTemplate[];
  templateFilter: TemplateFilter;
  onSelectFilter: (filter: TemplateFilter) => void;
  onSelectTemplate: (template: AutomationTemplate) => void;
  t: TranslateFn;
}) {
  return (
    <section className="automations-templates" aria-label={t('automations.templatesAria')}>
      <div className="automations-templates__head">
        <div className="automations-templates__head-copy">
          <h2 className="automations-section__label">{t('automations.templatesTitle')}</h2>
          <p className="automations-section__sub">{t('automations.templatesSub')}</p>
        </div>
        <span className="automations-section__meta">
          {t('automations.templatesCount', { filtered: filteredTemplates.length, total: templates.length })}
        </span>
      </div>
      <div className="automations-template-tabs" role="tablist" aria-label={t('automations.templateFiltersAria')}>
        {templateFilters(t).map((filter) => {
          const count = filterTemplates(templates, filter.id).length;
          const isActive = templateFilter === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`automations-template-tab${isActive ? ' is-active' : ''}`}
              onClick={() => onSelectFilter(filter.id)}
            >
              <span className="automations-template-tab__label">{filter.label}</span>
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
            <strong>{t('automations.templatesEmptyTitle')}</strong>
            <p>{t('automations.templatesEmptyBody')}</p>
          </div>
        </div>
      ) : null}
      <div className="automations-templates__grid" key={templateFilter}>
        {filteredTemplates.map((template) => (
          <button
            key={template.id}
            type="button"
            className={`automation-template-card is-${template.kind}`}
            onClick={() => onSelectTemplate(template)}
          >
            <span className="automation-template-card__icon" aria-hidden="true">
              <Icon name={template.icon} size={16} />
            </span>
            <span className="automation-template-card__body">
              <span className="automation-template-card__kicker">
                <Icon name={kindIcon(template.kind)} size={11} />
                {kindLabel(template.kind, t)}
              </span>
              <span className="automation-template-card__title">{template.title}</span>
              <span className="automation-template-card__desc">{template.description}</span>
              <span className="automation-template-card__cta">
                {t('automations.useTemplate')}
                <Icon name="chevron-right" size={12} />
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
