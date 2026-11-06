export function MotionIcon({ name, size = 16 }: { name: string; size?: number }) {
  return <svg width={size} height={size} className="motion-icon" aria-hidden="true"><use href={`/web/design-system/icons.svg#icon-${name}`} /></svg>;
}
