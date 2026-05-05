/**
 * <ChipStrip> — horizontal scrollable chips (TOC, filters).
 *               Uses `.kh-scroll-x` from globals.css to hide scrollbars.
 */
"use client";

import * as React from "react";

export interface ChipItem {
  id: string;
  label: string;
}

export function ChipStrip({
  items,
  active,
  onSelect,
}: {
  items: ChipItem[];
  active?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="kh-scroll-x" style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 6, padding: "0 16px" }}>
        {items.map(({ id, label }) => {
          const on = id === active;
          return (
            <button
              key={id}
              onClick={() => onSelect?.(id)}
              style={{
                flexShrink: 0,
                height: 28,
                padding: "0 12px",
                borderRadius: 14,
                display: "inline-flex",
                alignItems: "center",
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: "var(--tracking-flat)",
                background: on ? "var(--primary-tint)" : "var(--pill-bg)",
                color: on ? "var(--primary)" : "var(--muted)",
                border: `1px solid ${on ? "transparent" : "var(--border)"}`,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
