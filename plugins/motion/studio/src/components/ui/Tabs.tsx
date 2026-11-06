/**
 * Tabs — Base UI's tabs wearing Studio's tokens; replaces six hand-rolled
 * strips with one implementation (roving tabindex, arrow/Home/End, `aria-controls`).
 */

import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "./cn";
import type { PreviewState } from "./Button";

/**
 * Base UI lets `className` be a function of the part's state. Studio's parts
 * merge a string with `cn`, so the string form is the one they accept.
 */
type StyledProps<T extends ElementType> = Omit<ComponentPropsWithoutRef<T>, "className"> & {
  className?: string;
};

/**
 * Groups a tab list with its panels. Uncontrolled by default; pass `value` and
 * `onValueChange` for a strip whose selection lives in a store.
 */
export function Tabs(props: ComponentPropsWithoutRef<typeof BaseTabs.Root>) {
  return <BaseTabs.Root {...props} />;
}

/** The strip. Give it an `aria-label`: a tablist with no name is unlabelled. */
export function TabsList({ className, ...props }: StyledProps<typeof BaseTabs.List>) {
  return (
    <BaseTabs.List
      // Arrow keys move selection, matching today's sidebar strip.
      activateOnFocus
      className={cn("inline-flex items-center gap-0.5 rounded-lg bg-surface-alt p-1", className)}
      {...props}
    />
  );
}

interface TabProps extends StyledProps<typeof BaseTabs.Tab> {
  value: string;
  "data-preview-state"?: PreviewState;
}

/**
 * aria-selected drives the selected look (Base UI sets it) so assistive tech
 * and sighted users match. data-preview-state is for gallery shots only.
 */
export function Tab({ value, className, ...props }: TabProps) {
  return (
    <BaseTabs.Tab
      value={value}
      data-tab-id={value}
      className={cn(
        "inline-flex h-ctl-sm cursor-pointer select-none items-center justify-center rounded-sm px-2.5",
        "text-step-11 font-semibold whitespace-nowrap text-text-3",
        "transition-[background-color,color] ease-out-quint duration-hover",
        "hover:text-text-1 data-[preview-state=hover]:text-text-1",
        "aria-selected:bg-hover aria-selected:text-text-0",
        "outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
        "data-[preview-state=focus]:outline-solid data-[preview-state=focus]:outline-2 data-[preview-state=focus]:outline-offset-1 data-[preview-state=focus]:outline-accent",
        className,
      )}
      {...props}
    />
  );
}

/** The panel for one tab. Base UI wires `aria-labelledby` back to its tab. */
export function TabPanel({ className, ...props }: StyledProps<typeof BaseTabs.Panel>) {
  return <BaseTabs.Panel className={cn("outline-hidden", className)} {...props} />;
}
