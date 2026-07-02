export type PlanBadgeSize = 'sm' | 'md';

/**
 * The Open Design plan nameplate — one source of truth for the
 * free / plus / pro / max tier pill so Settings, the model switcher, and the
 * avatar menu all render the same shape. `plan` is the raw tier string (e.g.
 * "plus" or "Plus"); the label capitalizes via CSS. Color follows the active
 * brand theme. Renders nothing for an empty plan so callers can pass through an
 * unresolved value directly. Styles live in the global `styles/plan-badge.css`
 * (intentionally not a CSS Module — see that file for why).
 */
export function PlanBadge({
  plan,
  size = 'md',
  className,
  title,
}: {
  plan: string | null | undefined;
  size?: PlanBadgeSize;
  className?: string;
  title?: string;
}) {
  const label = plan?.trim();
  if (!label) return null;
  return (
    <span
      className={['plan-badge', `plan-badge--${size}`, className]
        .filter(Boolean)
        .join(' ')}
      data-plan={label.toLowerCase()}
      title={title}
    >
      {label}
    </span>
  );
}
