import { useState, type CSSProperties } from 'react';

const PRESET_COLORS = [
  '#000000','#ffffff','#f87171','#fb923c','#facc15','#4ade80','#2dd4bf','#38bdf8',
  '#818cf8','#c084fc','#e879f9','#f472b6','#94a3b8','#64748b','#334155','#1e293b',
];

export function ColorPicker({ value, onChange, compact }: { value: string; onChange: (v: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);

  const swatch: CSSProperties = {
    width: compact ? 20 : 24,
    height: compact ? 20 : 24,
    borderRadius: 4,
    border: '1px solid var(--separator)',
    background: value || 'transparent',
    cursor: 'pointer',
    flexShrink: 0,
  };

  const pop: CSSProperties = {
    position: 'absolute',
    zIndex: 9999,
    top: '100%',
    left: 0,
    background: 'var(--bg-panel)',
    border: '1px solid var(--separator)',
    borderRadius: 6,
    padding: 6,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    width: 152,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    marginTop: 4,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
      <div style={swatch} onClick={() => setOpen(!open)} title="Pick color" />
      {!compact ? (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          style={{ fontSize: 11, width: 70, background: 'var(--bg-input)', color: 'var(--fg)', border: '1px solid var(--separator)', borderRadius: 4, padding: '2px 4px' }}
          placeholder="hex"
        />
      ) : null}
      {open ? (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div style={pop}>
            {PRESET_COLORS.map((c) => (
              <div
                key={c}
                style={{ width: 16, height: 16, borderRadius: 2, background: c, cursor: 'pointer', border: value === c ? '2px solid var(--accent)' : '1px solid transparent' }}
                onClick={() => { onChange(c); setOpen(false); }}
                title={c}
              />
            ))}
            <input
              type="color"
              value={value || '#000000'}
              onChange={(e) => onChange(e.target.value)}
              style={{ width: 148, height: 24, marginTop: 4, border: 'none', cursor: 'pointer' }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
