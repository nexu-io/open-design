import { useI18n } from "../../i18n/I18n";
export function isInvalidGifLoop(format: string, value: string): boolean {
  return format === "gif" && !isValidGifLoop(value);
}

function isValidGifLoop(value: string): boolean {
  const count = Number(value);
  return value.trim() !== "" && Number.isInteger(count) && count >= 0 && count <= 65535;
}

export function GifLoopInput({
  format,
  value,
  disabled,
  invalid,
  onChange,
}: {
  format: string;
  value: string;
  disabled: boolean;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  if (format !== "gif") return null;
  return (
    <label className="flex flex-col gap-1 text-step-10 text-text-4">
      {t("GIF loop count (0 = forever, max 65535)")}{" "}<input
        type="number"
        min={0}
        max={65535}
        step={1}
        value={value}
        disabled={disabled}
        aria-invalid={invalid}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-sm bg-input border border-border-input px-2 py-1 text-text-1"
      />
    </label>
  );
}
