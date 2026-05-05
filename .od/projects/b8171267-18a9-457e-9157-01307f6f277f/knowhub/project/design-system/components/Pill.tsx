/**
 * <Pill> — small chip for tags, kinds, status.
 * <Tag>  — # prefix, used for topics.
 */
"use client";

import * as React from "react";

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "primary" | "success" | "info" | "warning" | "danger";
  size?: "xs" | "sm";
  active?: boolean;
}

export function Pill({
  tone = "neutral",
  size = "sm",
  active,
  style,
  children,
  ...rest
}: PillProps) {
  const h = size === "xs" ? 20 : 22;
  const fs = size === "xs" ? 10 : 11;
  const bg =
    active ? "var(--primary-tint)" :
    tone === "primary" ? "var(--primary-tint)" :
    "var(--pill-bg)";
  const color =
    active ? "var(--primary)" :
    tone === "primary" ? "var(--primary)" :
    tone === "success" ? "var(--success)" :
    tone === "info"    ? "var(--info)" :
    tone === "warning" ? "var(--warning)" :
    tone === "danger"  ? "var(--danger)" :
    "var(--foreground-dim)";
  return (
    <span
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: h,
        padding: "0 8px",
        borderRadius: "var(--radius-full)",
        fontSize: fs,
        fontWeight: 500,
        letterSpacing: "var(--tracking-wide)",
        background: bg,
        color,
        border: `1px solid ${active ? "transparent" : "var(--border)"}`,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Tag({ children, ...rest }: PillProps) {
  return <Pill {...rest}>#{children}</Pill>;
}
