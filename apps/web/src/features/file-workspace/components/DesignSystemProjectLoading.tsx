// Design-system project tab loading/generating stage: emblem, kicker/title/
// subtitle copy, a determinate-or-indeterminate progress bar, and a skeleton
// row. Fully dumb (props in, JSX out) — moved verbatim out of
// `components/FileWorkspace.tsx` as part of the ADR-0002 vertical-slice
// decomposition.
import { Icon } from '../../../components/Icon';

export function DesignSystemProjectLoading({
  kicker,
  title,
  subtitle,
  progress,
  progressLabel,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  progress?: number;
  progressLabel: string;
}) {
  const hasProgress = typeof progress === 'number' && Number.isFinite(progress);
  const clampedProgress = hasProgress
    ? Math.max(0, Math.min(100, Math.round(progress)))
    : undefined;
  return (
    <div className="ds-project-loading-stage" role="status" aria-live="polite">
      <div className="ds-project-loading-emblem" aria-hidden="true">
        <span className="ds-project-loading-emblem__grid" />
        <span className="ds-project-loading-mark">
          <Icon name="blocks" size={28} />
        </span>
      </div>
      <div className="ds-project-loading-copy">
        <span className="ds-project-loading-kicker">{kicker}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div
        className={`ds-project-loading-progress ${hasProgress ? 'is-determinate' : 'is-indeterminate'}`}
        role="progressbar"
        aria-label={progressLabel}
        aria-valuemin={hasProgress ? 0 : undefined}
        aria-valuemax={hasProgress ? 100 : undefined}
        aria-valuenow={clampedProgress}
      >
        <span style={hasProgress ? { width: `${clampedProgress}%` } : undefined} />
      </div>
      <div className="ds-project-loading-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
