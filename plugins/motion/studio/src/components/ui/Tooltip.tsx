/**
 * Tooltip: Base UI's tooltip in Studio tokens. The trigger is a box-less
 * `display: contents` wrapper so a disabled control still gets hover.
 */

import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import {
  cloneElement,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { cn } from "./cn";
import { floatingMotion, POPUP_LAYER } from "./Menu";

interface TooltipProps {
  label: string;
  /** A single element, wrapped in a box-less span so a disabled one still gets hover. */
  children: ReactElement<{ "aria-describedby"?: string }>;
  /** Hover delay in ms. */
  delay?: number;
  disabled?: boolean;
  side?: "top" | "bottom" | "left" | "right";
  /** Wraps a long label at a reading width and cuts it at this many lines with an ellipsis. Unset, one line. */
  lines?: number;
}

/** Matches the old bubble's gap from its trigger, and its viewport margin. */
const SIDE_OFFSET = 6;
const VIEWPORT_MARGIN = 8;

export function Tooltip({
  label,
  children,
  delay = 400,
  side = "top",
  disabled = false,
  lines,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();

  return (
    <BaseTooltip.Root open={open} onOpenChange={setOpen} disabled={disabled}>
      <BaseTooltip.Trigger delay={delay} render={<span ref={boxRef} className="contents" />}>
        {cloneElement(children, {
          "aria-describedby": open && !disabled ? tooltipId : children.props["aria-describedby"],
        })}
      </BaseTooltip.Trigger>
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner
          anchor={() => boxRef.current?.firstElementChild ?? null}
          side={side}
          sideOffset={SIDE_OFFSET}
          collisionPadding={VIEWPORT_MARGIN}
          className={POPUP_LAYER}
        >
          <BaseTooltip.Popup
            id={tooltipId}
            role="tooltip"
            className={cn(
              "pointer-events-none rounded-md border border-border-input bg-surface px-2 py-1 text-step-10 font-medium text-text-1 shadow-menu",
              lines ? "max-w-[300px] whitespace-normal break-words" : "whitespace-nowrap",
              floatingMotion("duration-tooltip"),
            )}
          >
            {lines ? (
              <span
                className="line-clamp-(--tooltip-lines)"
                style={{ "--tooltip-lines": lines } as CSSProperties}
              >
                {label}
              </span>
            ) : (
              label
            )}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
