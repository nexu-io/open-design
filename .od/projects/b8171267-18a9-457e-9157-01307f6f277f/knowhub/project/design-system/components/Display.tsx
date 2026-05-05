/**
 * <KVGrid> — two-column key/value grid used in detail metadata blocks.
 * <Quote>  — left-rule blockquote, optionally tinted with primary.
 * <Callout> — info / warning / danger soft surface.
 */
"use client";

import * as React from "react";

export function KVGrid({
  items,
  columns = 2,
}: {
  items: ReadonlyArray<readonly [string, React.ReactNode]>;
  columns?: 1 | 2 | 3;
}) {
  return (
    <div
      style={{
        padding: 12,
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-xl)",
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: "10px 16px",
      }}
    >
      {items.map(([k, v]) => (
        <div key={k}>
          <div
            style={{
              fontSize: 10,
              color: "var(--muted-dim)",
              letterSpacing: "var(--tracking-caps)",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            {k}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--foreground-dim)",
              marginTop: 2,
              letterSpacing: "var(--tracking-flat)",
            }}
          >
            {v}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Quote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote
      style={{
        margin: 0,
        padding: "10px 14px",
        borderLeft: "2px solid var(--primary)",
        background: "var(--card)",
        borderRadius: "0 var(--radius-xl) var(--radius-xl) 0",
        fontSize: 14,
        fontStyle: "italic",
        lineHeight: "var(--leading-normal)",
        color: "var(--foreground-dim)",
        letterSpacing: "var(--tracking-flat)",
      }}
    >
      {children}
    </blockquote>
  );
}

type CalloutTone = "info" | "success" | "warning" | "danger" | "primary";

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: CalloutTone;
  title?: React.ReactNode;
  children: React.ReactNode;
}) {
  const accent =
    tone === "success" ? "var(--success)" :
    tone === "warning" ? "var(--warning)" :
    tone === "danger"  ? "var(--danger)" :
    tone === "primary" ? "var(--primary)" :
    "var(--info)";
  return (
    <div
      style={{
        padding: 12,
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderLeft: `2px solid ${accent}`,
        borderRadius: "var(--radius-xl)",
        fontSize: 13,
        lineHeight: "var(--leading-normal)",
        color: "var(--foreground-dim)",
        letterSpacing: "var(--tracking-flat)",
      }}
    >
      {title && (
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--foreground)",
            marginBottom: 4,
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
