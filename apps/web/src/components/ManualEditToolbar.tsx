import { type CSSProperties } from 'react';

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

const tools: Array<{ tool: DrawTool; label: string; title: string }> = [
  { tool: null, label: '↖', title: 'Select (Esc)' },
  { tool: 'rect', label: '▭', title: 'Rectangle' },
  { tool: 'circle', label: '○', title: 'Circle' },
  { tool: 'text', label: 'T', title: 'Text' },
  { tool: 'line', label: '╱', title: 'Line' },
  { tool: 'image', label: '🖼', title: 'Image (URL)' },
];

export function ManualEditToolbar({ activeTool, onSelectTool }: ManualEditToolbarProps) {
  return (
    <div role="toolbar" aria-label="Drawing tools" style={{ display: 'flex', gap: 2, padding: 4 }}>
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
