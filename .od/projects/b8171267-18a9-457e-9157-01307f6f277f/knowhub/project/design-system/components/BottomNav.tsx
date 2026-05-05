/**
 * <BottomNav> — fixed 4-item nav, 64px tall, blurred bg.
 */
"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";

export interface BottomNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export function BottomNav({
  items,
  active,
  onSelect,
}: {
  items: BottomNavItem[];
  active: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <nav
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 64,
        paddingBottom: "env(safe-area-inset-bottom, 0)",
        borderTop: "1px solid var(--border)",
        background: "var(--nav-bg)",
        backdropFilter: "blur(var(--blur-lg))",
        WebkitBackdropFilter: "blur(var(--blur-lg))",
        display: "flex",
        zIndex: 30,
      }}
    >
      {items.map(({ id, label, icon: Icon }) => {
        const on = id === active;
        return (
          <button
            key={id}
            onClick={() => onSelect?.(id)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              color: on ? "var(--primary)" : "var(--muted)",
            }}
          >
            <Icon size={20} strokeWidth={on ? 2 : 1.6} />
            <span
              style={{
                fontSize: 11,
                fontWeight: on ? 600 : 500,
                letterSpacing: 0.1,
                lineHeight: 1,
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
