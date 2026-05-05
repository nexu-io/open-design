/**
 * <Card>  — neutral surface (border + radius)
 * <CardRow> — flex row variant for list items
 */
"use client";

import * as React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  interactive?: boolean;
}

export function Card({
  padded = true,
  interactive,
  style,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-xl)",
        padding: padded ? 12 : 0,
        cursor: interactive ? "pointer" : undefined,
        transition: interactive
          ? "background var(--duration-2) var(--ease-out)"
          : undefined,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (interactive)
          (e.currentTarget as HTMLDivElement).style.background =
            "var(--card-hover)";
        rest.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (interactive)
          (e.currentTarget as HTMLDivElement).style.background = "var(--card)";
        rest.onMouseLeave?.(e);
      }}
    >
      {children}
    </div>
  );
}
