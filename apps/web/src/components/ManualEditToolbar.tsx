import { type CSSProperties } from 'react';
import { useT } from '../i18n';

export type DrawTool = 'rect' | 'circle' | 'text' | 'line' | 'image' | null;

export interface ManualEditToolbarProps {
  activeTool: DrawTool;
  onSelectTool: (tool: DrawTool) => void;
}

const base: CSSProperties = {
  background: 'none',
  border: '1px solid var(--separator)',
  borderRadius: 4,
  cursor: 'pointer',
  padding: '4px 8px',
  fontSize: 16,
  lineHeight: '20px',
  color: 'var(--fg)',
  minWidth: 32,
  textAlign: 'center',
};

const toolIcons: Record<NonNullable<DrawTool> | 'select', string> = {
  select: '↖',
  rect: '▭',
  circle: '○',
  text: 'T',
  line: '╱',
  image: '🖼',
};

export function ManualEditToolbar({ activeTool, onSelectTool }: ManualEditToolbarProps) {
  const t = useT();
  const tools: Array<{ tool: DrawTool; label: string; title: string }> = [
    { tool: null, label: toolIcons.select, title: t('manualEdit.toolSelect') },
    { tool: 'rect', label: toolIcons.rect, title: t('manualEdit.toolRect') },
    { tool: 'circle', label: toolIcons.circle, title: t('manualEdit.toolCircle') },
    { tool: 'text', label: toolIcons.text, title: t('manualEdit.toolText') },
    { tool: 'line', label: toolIcons.line, title: t('manualEdit.toolLine') },
    { tool: 'image', label: toolIcons.image, title: t('manualEdit.toolImage') },
  ];
  return (
    <div role="toolbar" aria-label={t('manualEdit.drawingTools')} style={{ display: 'flex', gap: 2, padding: 4 }}>
      {tools.map(({ tool, label, title }) => (
        <button
          key={tool ?? '__select__'}
          type="button"
          title={title}
          style={{ ...base, ...(activeTool === tool ? { background: 'var(--accent-tint)', borderColor: 'var(--accent)' } : {}) }}
          onClick={() => onSelectTool(tool)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
