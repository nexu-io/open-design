/**
 * <PageHeader>   — top-level app header (logo + title + actions, 56px sticky)
 * <DetailHeader> — back-arrow header used on inner pages
 */
"use client";

import * as React from "react";
import { ChevronLeft, MoreHorizontal } from "lucide-react";
import { IconButton } from "./Button";

export function PageHeader({
  title,
  leading,
  actions,
}: {
  title: React.ReactNode;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        height: 56,
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "var(--header-bg)",
        backdropFilter: "blur(var(--blur-md))",
        WebkitBackdropFilter: "blur(var(--blur-md))",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {leading ?? (
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: "var(--primary)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: -0.3,
          }}
        >
          KH
        </div>
      )}
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--foreground)",
          letterSpacing: -0.2,
        }}
      >
        {title}
      </div>
      <div style={{ flex: 1 }} />
      {actions}
    </header>
  );
}

export function DetailHeader({
  back = "Back",
  actions,
}: {
  back?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        height: 56,
        padding: "0 8px 0 4px",
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: "var(--header-bg)",
        backdropFilter: "blur(var(--blur-md))",
        WebkitBackdropFilter: "blur(var(--blur-md))",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <IconButton icon={ChevronLeft} label="Back" />
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: "var(--muted)",
          letterSpacing: -0.1,
        }}
      >
        {back}
      </div>
      <div style={{ flex: 1 }} />
      {actions}
      <IconButton icon={MoreHorizontal} label="More" />
    </header>
  );
}
