import { useI18n } from "../../i18n/I18n";
export function GpuEncodingToggle({
  format,
  checked,
  disabled,
  onToggle,
}: {
  format: "mp4" | "webm" | "mov" | "gif";
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  // GPU encoders exist for H.264/H.265 only, so only MP4 can use one.
  if (format !== "mp4") return null;
  return (
    <label
      className={`flex items-center gap-2 text-step-10 text-text-4 ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className="accent-studio-accent"
      />
      <span>{t("Use GPU encoding")}</span>
    </label>
  );
}
