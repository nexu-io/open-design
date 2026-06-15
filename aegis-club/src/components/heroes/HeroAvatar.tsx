/* eslint-disable @next/next/no-img-element */
import { heroImageUrl } from "@/data/heroes";
import { cn } from "@/lib/utils";

const sizes = {
  sm: "h-9 w-16",
  md: "h-14 w-24",
  lg: "h-20 w-36",
};

export function HeroAvatar({
  slug,
  name,
  size = "md",
  className,
}: {
  slug: string;
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <img
      src={heroImageUrl(slug)}
      alt={name}
      loading="lazy"
      className={cn(
        "rounded-lg border border-surface-border object-cover",
        sizes[size],
        className,
      )}
    />
  );
}
