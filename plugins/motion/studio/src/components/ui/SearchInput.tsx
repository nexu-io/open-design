// fallow-ignore-file unused-file
// (consumers land in the sidebar/panels PR later in this stack)
import { type InputHTMLAttributes } from "react";

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Accessible name — placeholder alone is not one. */
  "aria-label": string;
}

/**
 * Shared search input — one visual system (panel-input tokens) for every
 * panel search box, with a required accessible name.
 */
export function SearchInput({ className = "", ...props }: SearchInputProps) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-md bg-panel-input px-2.5 py-[5px] ${className}`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 256 256"
        fill="none"
        className="shrink-0"
        aria-hidden="true"
      >
        <circle
          cx="116"
          cy="116"
          r="76"
          stroke="currentColor"
          strokeWidth="22"
          className="text-panel-text-5"
        />
        <line
          x1="170"
          y1="170"
          x2="232"
          y2="232"
          stroke="currentColor"
          strokeWidth="22"
          strokeLinecap="round"
          className="text-panel-text-5"
        />
      </svg>
      <input
        type="text"
        className="min-w-0 w-full bg-transparent text-[11px] text-panel-text-1 outline-hidden placeholder:text-panel-text-5"
        {...props}
      />
    </div>
  );
}
