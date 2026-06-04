import type { KnownProvider } from '../../state/config';
import { SearchableModelSelect } from '../modelOptions';

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
  const options = [
    { id: '', label: customProviderLabel },
    ...providers.map((provider, index) => ({
      id: String(index),
      label: provider.label,
    })),
  ];

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <SearchableModelSelect
        className="inline-switcher__select settings-model-select settings-model-select--byok"
        aria-label={label}
        searchPlaceholder={label}
        popoverTestId="settings-byok-provider-preset-popover"
        popoverClassName="settings-byok-select-popover"
        minSearchableOptions={Number.POSITIVE_INFINITY}
        models={options}
        value={selectedProviderIndex >= 0 ? String(selectedProviderIndex) : ''}
        onChange={(value) => {
          if (value === '') {
            onCustomProviderSelect();
            return;
          }
          const idx = Number(value);
          if (!isNaN(idx) && providers[idx]) {
            onProviderSelect(providers[idx]!);
          }
        }}
      />
    </label>
  );
}
