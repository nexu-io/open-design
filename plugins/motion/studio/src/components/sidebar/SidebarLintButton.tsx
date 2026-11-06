import { useI18n } from "../../i18n/I18n";
const ERROR_PULSES_BEFORE_IDLE = 3;

export function SidebarLintButton({
  onLint,
  linting,
  findingCount,
  hasError,
}: {
  onLint: () => void;
  linting: boolean;
  findingCount?: number;
  hasError?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="border-t border-neutral-800 p-2 shrink-0">
      <button
        type="button"
        onClick={onLint}
        disabled={linting}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium text-neutral-500 enabled:hover:text-warning-ink enabled:hover:bg-neutral-800 enabled:active:scale-[0.98] transition-colors disabled:opacity-40"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
        {linting ? t("Linting…") : t("Lint")}
        {!linting && findingCount != null && findingCount > 0 && (
          <span
            key={findingCount}
            data-lint-badge={hasError ? "error" : "warning"}
            style={hasError ? { animationIterationCount: ERROR_PULSES_BEFORE_IDLE } : undefined}
            className={
              hasError
                ? "ml-1 min-w-[16px] rounded-full bg-danger px-1 text-[9px] font-bold text-on-danger animate-pulse motion-reduce:animate-none"
                : "ml-1 min-w-[16px] rounded-full bg-amber-500/20 px-1 text-[9px] font-bold text-warning-ink"
            }
          >
            {findingCount}
            <span className="sr-only">
              {hasError ? t("lint findings, including errors") : t("lint findings, warnings only")}
            </span>
          </span>
        )}
      </button>
    </div>
  );
}
