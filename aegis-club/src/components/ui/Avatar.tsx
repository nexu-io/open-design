/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

const sizes = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-24 w-24 text-2xl",
};

export function Avatar({
  src,
  name,
  size = "md",
  className,
}: {
  src?: string | null;
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-surface-border bg-surface-hover font-semibold text-aegis",
        sizes[size],
        className,
      )}
    >
      {src ? (
        // Avatares vêm de domínios variados (Steam); <img> evita config extra.
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span>{initials || "?"}</span>
      )}
    </span>
  );
}
