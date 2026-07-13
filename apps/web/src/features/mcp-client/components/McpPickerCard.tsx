// One template card in the "Add server" picker. Presentational: the template
// plus a pick handler in, JSX out.
import type { McpTemplate } from '@open-design/contracts';
import { Icon } from '../../../components/Icon';

export function McpPickerCard({
  tpl,
  onPick,
}: {
  tpl: McpTemplate;
  onPick: () => void;
}) {
  return (
    <div className="mcp-picker-item">
      <button
        type="button"
        className="mcp-picker-item-action"
        onClick={onPick}
        title={tpl.description}
      >
        <span className="mcp-picker-item-head">
          <Icon name="link" size={13} />
          <strong>{tpl.label}</strong>
          <span className="mcp-picker-transport">{tpl.transport}</span>
        </span>
        <span className="mcp-picker-desc">{tpl.description}</span>
        {tpl.example ? (
          <span className="mcp-picker-example">
            <span className="mcp-picker-example-label">Try:</span>
            <span className="mcp-picker-example-text">"{tpl.example}"</span>
          </span>
        ) : null}
      </button>
      {tpl.homepage ? (
        <a
          className="mcp-picker-homepage"
          href={tpl.homepage}
          target="_blank"
          rel="noreferrer noopener"
          title={tpl.homepage}
        >
          <Icon name="external-link" size={11} />
          <span>Homepage</span>
        </a>
      ) : null}
    </div>
  );
}
