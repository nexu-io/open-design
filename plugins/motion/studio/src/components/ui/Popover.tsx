/**
 * Popover: `Menu`'s floating chrome (`popupSurface`) without item semantics, so arrow keys
 * stay with whatever is focused inside (rename inputs, forms). Only the shadow differs.
 */

import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from "react";
import { cn } from "./cn";
import {
  POPUP_LAYER,
  popupSurface,
  useInlinePortal,
  type PopupPreviewState,
  type PortalContainer,
} from "./Menu";

/** Matches Menu's gap from its trigger, and its viewport margin. */
const SIDE_OFFSET = 6;
const VIEWPORT_MARGIN = 8;

/** The arrow's 14x8 box overlaps the popup's border by 1px, so its fill hides the border where it meets the popup. */
const ARROW_PX = 7;
const ARROW_CORNER_CLEARANCE = 10;
const arrowPlace = cn(
  "data-[side=bottom]:-top-[7px] data-[side=top]:-bottom-[7px] data-[side=top]:rotate-180",
  "data-[side=left]:-right-[10px] data-[side=left]:rotate-90",
  "data-[side=right]:-left-[10px] data-[side=right]:-rotate-90",
);

interface PopoverProps extends Omit<ComponentPropsWithoutRef<typeof BasePopover.Root>, "children"> {
  /** A single element. It becomes the trigger; no wrapper is added around it. */
  trigger: ReactElement;
  /** Arbitrary content. The popover owns none of its keys. */
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  collisionAvoidance?: ComponentPropsWithoutRef<
    typeof BasePopover.Positioner
  >["collisionAvoidance"];
  /** Points the popup at its trigger. Off by default; the default gap from the trigger grows by the arrow's height. */
  arrow?: boolean;
  /** Portal target. Pass the shadow root when the trigger lives in one; `null` keeps it inline. */
  container?: PortalContainer;
  /** Names the popup for assistive tech. */
  "aria-label"?: string;
  "aria-describedby"?: string;
  /**
   * What to focus on open. Defaults to Base UI's behaviour (the first tabbable
   * element), which is what a rename field wants.
   */
  initialFocus?: ComponentPropsWithoutRef<typeof BasePopover.Popup>["initialFocus"];
  className?: string;
  "data-preview-state"?: PopupPreviewState;
}

export function Popover({
  trigger,
  children,
  side = "bottom",
  align = "center",
  arrow = false,
  sideOffset = arrow ? SIDE_OFFSET + ARROW_PX : SIDE_OFFSET,
  collisionAvoidance,
  container,
  className,
  initialFocus,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
  "data-preview-state": previewState,
  ...root
}: PopoverProps) {
  const inline = useInlinePortal(container);
  return (
    <BasePopover.Root {...root}>
      <BasePopover.Trigger render={trigger} aria-describedby={describedBy} />
      {inline.host}
      <BasePopover.Portal {...inline.portal}>
        <BasePopover.Positioner
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={VIEWPORT_MARGIN}
          collisionAvoidance={collisionAvoidance}
          arrowPadding={ARROW_CORNER_CLEARANCE}
          className={POPUP_LAYER}
        >
          <BasePopover.Popup
            aria-label={ariaLabel}
            initialFocus={initialFocus}
            data-preview-state={previewState}
            className={cn(popupSurface, "p-3 text-step-11 text-text-1 shadow-popover", className)}
          >
            {arrow && (
              <BasePopover.Arrow className={arrowPlace}>
                <svg width="14" height="8" viewBox="0 0 14 8" aria-hidden="true" className="block">
                  <path d="M0 8 L7 1 L14 8" className="fill-surface stroke-border-input" />
                </svg>
              </BasePopover.Arrow>
            )}
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
