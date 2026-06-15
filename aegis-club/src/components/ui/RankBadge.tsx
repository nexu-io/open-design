import { Medal } from "lucide-react";
import { rankTier } from "@/lib/ranking";
import { cn } from "@/lib/utils";

export function RankBadge({
  points,
  showPoints = false,
  className,
}: {
  points: number;
  showPoints?: boolean;
  className?: string;
}) {
  const tier = rankTier(points);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Medal className={cn("h-4 w-4", tier.color)} />
      <span className={cn("text-sm font-semibold", tier.color)}>
        {tier.name}
        {tier.division > 0 && (
          <span className="ml-1 text-aegis">{"★".repeat(tier.division)}</span>
        )}
      </span>
      {showPoints && (
        <span className="text-xs text-zinc-500">({points} pts)</span>
      )}
    </span>
  );
}
