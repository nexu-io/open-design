import { behaviorTier, BEHAVIOR_MAX } from "@/lib/reputation";
import { cn } from "@/lib/utils";

export function BehaviorMeter({
  score,
  showLabel = true,
  className,
}: {
  score: number;
  showLabel?: boolean;
  className?: string;
}) {
  const tier = behaviorTier(score);
  const pct = Math.round((score / BEHAVIOR_MAX) * 100);

  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="text-zinc-400">Conduta</span>
          <span className={cn("font-semibold", tier.color)}>{tier.label}</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-border">
        <div
          className={cn("h-full rounded-full transition-all", tier.barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <p className="mt-1 text-xs text-zinc-500">{tier.description}</p>
      )}
    </div>
  );
}
