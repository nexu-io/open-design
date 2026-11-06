import { memo } from "react";

export type DiamondState = "active" | "inactive" | "ghost";

interface KeyframeDiamondProps {
  state: DiamondState;
  onClick: () => void;
  title?: string;
  size?: number;
  isHold?: boolean;
}

// fallow-ignore-next-line complexity
export const KeyframeDiamond = memo(function KeyframeDiamond({
  state,
  onClick,
  title,
  size = 10,
  isHold = false,
}: KeyframeDiamondProps) {
  const isFilled = state === "active";
  const color = {
    active: "text-accent",
    inactive: "text-text-2 hover:text-text-0",
    ghost: "text-text-off hover:text-text-0",
  }[state];

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`relative shrink-0 p-0.5 transition-colors before:absolute before:-inset-1.5 before:content-[''] ${color}`}
      title={title}
      aria-label={title}
      aria-pressed={state === "active"}
    >
      <svg width={size} height={size} viewBox="0 0 10 10">
        {isHold ? (
          <rect
            x="2"
            y="2"
            width="6"
            height="6"
            rx="0.5"
            fill={isFilled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.2"
          />
        ) : (
          <rect
            x="5"
            y="0.7"
            width="6"
            height="6"
            rx="1"
            transform="rotate(45 5 0.7)"
            fill={isFilled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.2"
          />
        )}
      </svg>
    </button>
  );
});
