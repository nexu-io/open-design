/**
 * <Button>, <IconButton>
 *
 * Variants: primary | ghost | outline | danger
 * Sizes:    sm (28) | md (32, default) | lg (44)
 *
 * Uses lucide-react for icons by convention. Pass any LucideIcon as `icon`.
 */
"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";

type Variant = "primary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, { h: number; px: number; fs: number; gap: number }> = {
  sm: { h: 28, px: 10, fs: 12, gap: 5 },
  md: { h: 32, px: 12, fs: 13, gap: 6 },
  lg: { h: 44, px: 16, fs: 14, gap: 8 },
};

function variantStyle(v: Variant): React.CSSProperties {
  switch (v) {
    case "primary":
      return { background: "var(--primary)", color: "var(--primary-foreground)", border: "1px solid transparent" };
    case "ghost":
      return { background: "transparent", color: "var(--foreground)", border: "1px solid transparent" };
    case "outline":
      return { background: "transparent", color: "var(--foreground)", border: "1px solid var(--border)" };
    case "danger":
      return { background: "var(--danger)", color: "#fff", border: "1px solid transparent" };
  }
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "ghost",
      size = "md",
      icon: Icon,
      iconRight: IconRight,
      fullWidth,
      style,
      children,
      ...rest
    },
    ref,
  ) {
    const s = SIZES[size];
    return (
      <button
        ref={ref}
        {...rest}
        style={{
          height: s.h,
          padding: `0 ${s.px}px`,
          borderRadius: "var(--radius-md)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: s.gap,
          fontFamily: "inherit",
          fontSize: s.fs,
          fontWeight: 500,
          letterSpacing: "var(--tracking-flat)",
          whiteSpace: "nowrap",
          cursor: "pointer",
          transition: "background var(--duration-2) var(--ease-out)",
          width: fullWidth ? "100%" : undefined,
          ...variantStyle(variant),
          ...style,
        }}
      >
        {Icon && <Icon size={s.fs} strokeWidth={1.6} />}
        {children}
        {IconRight && <IconRight size={s.fs} strokeWidth={1.6} />}
      </button>
    );
  },
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  size?: Size;
  label: string; // a11y
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ icon: Icon, size = "md", label, style, ...rest }, ref) {
    const dim = size === "sm" ? 28 : size === "lg" ? 44 : 36;
    const ic = size === "sm" ? 14 : size === "lg" ? 20 : 17;
    return (
      <button
        ref={ref}
        aria-label={label}
        {...rest}
        style={{
          width: dim,
          height: dim,
          borderRadius: "var(--radius-md)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--foreground)",
          background: "transparent",
          ...style,
        }}
      >
        <Icon size={ic} strokeWidth={1.6} />
      </button>
    );
  },
);
