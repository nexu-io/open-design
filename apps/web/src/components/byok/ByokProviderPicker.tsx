import type { KnownProvider } from '../../state/config';

interface ByokProviderPickerProps {
  label: string;
  customProviderLabel: string;
  providers: KnownProvider[];
  selectedProviderIndex: number;
  onCustomProviderSelect: () => void;
  onProviderSelect: (provider: KnownProvider) => void;
}

export function ByokProviderPicker({
  label,
  customProviderLabel,
  providers,
  selectedProviderIndex,
  onCustomProviderSelect,
  onProviderSelect,
}: ByokProviderPickerProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        value={selectedProviderIndex >= 0 ? String(selectedProviderIndex) : ''}
        onChange={(e) => {
          if (e.target.value === '') {
            onCustomProviderSelect();
            return;
          }
          const idx = Number(e.target.value);
          if (!isNaN(idx) && providers[idx]) {
            onProviderSelect(providers[idx]!);
          }
        }}
      >
        <option value="">{customProviderLabel}</option>
        {providers.map((p, i) => (
          <option key={p.label} value={i}>{p.label}</option>
        ))}
      </select>
    </label>
  );
}
