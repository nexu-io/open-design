import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Renders the New session sidebar icon as a plus inside a rounded square. */
export function NewSessionIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-5 -mx-0.5 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-foreground",
        className
      )}
      aria-hidden="true"
    >
      <Plus className="size-4" />
    </span>
  );
}
