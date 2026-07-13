import { Icon } from '../../../components/Icon';
import { useT } from '../../../i18n';
import { kindLabel } from '../rules';
import type { AutomationTemplate } from '../types';

export function TemplatePopover({
  templates,
  selectedId,
  onSelect,
}: {
  templates: AutomationTemplate[];
  selectedId: string | null;
  onSelect: (template: AutomationTemplate) => void;
}) {
  const t = useT();

  return (
    <div className="automation-popover automation-popover--templates">
      {templates.map((template) => (
        <button
          type="button"
          key={template.id}
          className={`automation-template-option${selectedId === template.id ? ' is-selected' : ''}`}
          onClick={() => onSelect(template)}
        >
          <span className={`automation-template-option__icon is-${template.kind}`}>
            <Icon name={template.icon} size={14} />
          </span>
          <span className="automation-template-option__body">
            <span className="automation-template-option__title">{template.title ?? template.defaultName}</span>
            <span className="automation-template-option__meta">{kindLabel(template.kind, t)}</span>
          </span>
          {selectedId === template.id ? <Icon name="check" size={13} /> : null}
        </button>
      ))}
    </div>
  );
}
