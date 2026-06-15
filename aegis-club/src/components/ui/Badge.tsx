import { cn } from "@/lib/utils";

type Tone =
  | "neutral"
  | "aegis"
  | "radiant"
  | "dire"
  | "good"
  | "warn"
  | "bad";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-hover text-zinc-300 border-surface-border",
  aegis: "bg-aegis/15 text-aegis border-aegis/30",
  radiant: "bg-radiant/15 text-radiant border-radiant/30",
  dire: "bg-dire/15 text-dire-soft border-dire/30",
  good: "bg-behavior-good/15 text-behavior-good border-behavior-good/30",
  warn: "bg-behavior-warn/15 text-behavior-warn border-behavior-warn/30",
  bad: "bg-behavior-bad/15 text-behavior-bad border-behavior-bad/30",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
