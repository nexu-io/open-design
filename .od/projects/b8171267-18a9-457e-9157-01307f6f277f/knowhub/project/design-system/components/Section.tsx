/**
 * <SectionLabel>   — uppercase eyebrow above content groups (lists, sections)
 * <DetailSection>  — labelled section block used inside detail pages
 */
"use client";

import * as React from "react";

export function SectionLabel({
  label,
  count,
  trailing,
  inset = true,
}: {
  label: string;
  count?: string | number;
  trailing?: React.ReactNode;
  inset?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        padding: inset ? "0 16px" : 0,
        marginTop: 20,
        marginBottom: 8,
      }}
    >
      <div
        style={{
          fontSize: "var(--text-xs)",
          fontWeight: 600,
          letterSpacing: "var(--tracking-caps)",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        {label}
      </div>
      {(count !== undefined || trailing) && (
        <div
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--muted-dim)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {trailing ?? count}
        </div>
      )}
    </div>
  );
}

export function DetailSection({
  label,
  trailing,
  children,
}: {
  label: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 28, padding: "0 16px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            letterSpacing: "var(--tracking-caps)",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          {label}
        </div>
        {trailing}
      </div>
      {children}
    </section>
  );
}
