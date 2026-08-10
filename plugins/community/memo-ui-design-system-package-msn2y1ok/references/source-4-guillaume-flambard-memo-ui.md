# GitHub Design Evidence: guillaume-flambard/memo-ui

Source: https://github.com/guillaume-flambard/memo-ui
Read method: git-clone
Local clone method: git clone
Ref: default branch
Repository paths discovered: 124
Snapshot files written: 47

## Intake Status

- This-device intake was used through local git or GitHub CLI.

## README (README.md)

```md
# @memo-ui

Personal design system in the Memo Labs portfolio/lab language: warm paper + ink, one condensed grotesque (Oswald), flat (no radius, no shadow). Built to ship fast with a clear visual voice.

**"The engineer who gets design"** — system rigor meeting human warmth.

## Quick start

```bash
pnpm install

# Storybook (docs + a11y + MCP) → http://localhost:6006
pnpm storybook

# Playground (Next.js sandbox) → http://localhost:3001
pnpm --filter @memo-ui/playground exec next dev -p 3001

# Unit tests (Vitest + Testing Library)
pnpm --filter @memo-ui/react test
```

## Stack

| Layer | Choice |
| --- | --- |
| UI | React 19, TypeScript strict |
| Styling | Tailwind CSS v4 (`@theme` + CSS vars) |
| Monorepo | Turborepo + pnpm workspaces |
| Docs | Storybook **10** (CSF 3, autodocs, addon-a11y, addon-mcp) |
| Motion | Motion (micro) + GSAP wrappers (cinematic) |
| Tests | Vitest + Testing Library (`packages/react`) |

## Architecture

```
@memo-ui/
├─ apps/
│  ├─ docs/           # Storybook 10 + MDX foundation pages
│  ├─ playground/     # Next.js sandbox
│  └─ brand/          # Brand showcase (planned)
├─ packages/
│  ├─ core/           # Tokens + Tailwind v4 (no JSX)
│  ├─ react/          # Primitives + Vitest suite
│  ├─ utils/          # cn(), composeRefs, keyboard helpers
│  ├─ motion/         # GSAP + Motion primitives
│  ├─ typography/     # Oswald (display + body) / Geist Mono
│  └─ brand/          # Logo, voice layer
└─ agent/             # Voice/messaging for AI agents
```

### Package map

| Package | Role |
| --- | --- |
| `@memo-ui/core` | Design tokens (`colors`, spacing, radius, shadows, motion) + `tailwind.css` |
| `@memo-ui/react` | Primitives: Button, Input, Text, Icon, Badge, Divider, Card, Stack, Grid, Checkbox, Radio, Modal, Tabs, Select, Tooltip, Toast, Label, Textarea, Switch, Spinner, Avatar, FormField, Link, Breadcrumb, Pagination, Skeleton, Progress, Alert |
| `@memo-ui/utils` | `cn()` and shared helpers |
| `@memo-ui/docs` | Storybook app (`apps/docs`) |

## Design tokens

Three levels: **Foundation → Semantic → Component**.

- Source of truth: `packages/core/src/tokens/` + `packages/core/tailwind.css`
- Brand: paper `#FAF9F7` + encre `#16130F`, accent `#AD4C16` used sparingly
- Text/icon on accent washes: use `accent-ink` / `*-ink` tokens (WCAG AA), not fill accent alone
- Spacing: 4px base (`gap={4}` on Stack/Grid → `1rem`)
- 
...
```

## Source Evidence Inventory

### Product docs and manifests

Use these to understand product purpose, dependency stack, scripts, and public naming.

- packages/utils/package.json -> `context/github/guillaume-flambard-memo-ui/files/packages/utils/package.json` (source)
- apps/docs/package.json -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/package.json` (source)
- apps/playground/package.json -> `context/github/guillaume-flambard-memo-ui/files/apps/playground/package.json` (source)
- package.json -> `context/github/guillaume-flambard-memo-ui/files/package.json` (source)
- packages/core/package.json -> `context/github/guillaume-flambard-memo-ui/files/packages/core/package.json` (source)
- packages/motion/package.json -> `context/github/guillaume-flambard-memo-ui/files/packages/motion/package.json` (source)
- packages/react/package.json -> `context/github/guillaume-flambard-memo-ui/files/packages/react/package.json` (source)

### Theme, tokens, and styling

Extract concrete color, typography, spacing, radius, shadow, and theme-variable values from these files.

- apps/playground/app/globals.css -> `context/github/guillaume-flambard-memo-ui/files/apps/playground/app/globals.css` (source)
- packages/utils/src/index.ts -> `context/github/guillaume-flambard-memo-ui/files/packages/utils/src/index.ts` (source)
- .cursor/agents/tokens.md -> `context/github/guillaume-flambard-memo-ui/files/.cursor/agents/tokens.md` (source)
- packages/core/src/tokens/colors.ts -> `context/github/guillaume-flambard-memo-ui/files/packages/core/src/tokens/colors.ts` (source)
- packages/core/src/tokens/typography.ts -> `context/github/guillaume-flambard-memo-ui/files/packages/core/src/tokens/typography.ts` (source)
- packages/core/tailwind.css -> `context/github/guillaume-flambard-memo-ui/files/packages/core/tailwind.css` (source)
- packages/utils/tsconfig.json -> `context/github/guillaume-flambard-memo-ui/files/packages/utils/tsconfig.json` (source)

### App shell and navigation

Use these to recreate the product frame, navigation density, sidebars, window chrome, and layout rhythm.

- apps/playground/app/layout.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/playground/app/layout.tsx` (source)
- apps/playground/app/page.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/playground/app/page.tsx` (source)
- apps/docs/stories/layout/Grid.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/layout/Grid.stories.tsx` (source)
- apps/docs/stories/layout/Stack.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/layout/Stack.stories.tsx` (source)

### Reusable components

Use these to derive buttons, inputs, cards, dialogs, avatars, selectors, menus, and feedback states.

- packages/react/src/primitives/avatar.tsx -> `context/github/guillaume-flambard-memo-ui/files/packages/react/src/primitives/avatar.tsx` (source)
- packages/react/src/primitives/badge.tsx -> `context/github/guillaume-flambard-memo-ui/files/packages/react/src/primitives/badge.tsx` (source)
- packages/react/src/primitives/button.tsx -> `context/github/guillaume-flambard-memo-ui/files/packages/react/src/primitives/button.tsx` (source)
- packages/react/src/primitives/card.tsx -> `context/github/guillaume-flambard-memo-ui/files/packages/react/src/primitives/card.tsx` (source)
- packages/react/src/primitives/input.tsx -> `context/github/guillaume-flambard-memo-ui/files/packages/react/src/primitives/input.tsx` (source)
- packages/react/src/primitives/modal.tsx -> `context/github/guillaume-flambard-memo-ui/files/packages/react/src/primitives/modal.tsx` (source)
- packages/react/src/primitives/tabs.tsx -> `context/github/guillaume-flambard-memo-ui/files/packages/react/src/primitives/tabs.tsx` (source)
- packages/react/src/primitives/toast.tsx -> `context/github/guillaume-flambard-memo-ui/files/packages/react/src/primitives/toast.tsx` (source)
- apps/docs/stories/components/Alert.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Alert.stories.tsx` (source)
- apps/docs/stories/components/Avatar.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Avatar.stories.tsx` (source)
- apps/docs/stories/components/Badge.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Badge.stories.tsx` (source)
- apps/docs/stories/components/Breadcrumb.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Breadcrumb.stories.tsx` (source)
- apps/docs/stories/components/Button.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Button.stories.tsx` (source)
- apps/docs/stories/components/Card.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Card.stories.tsx` (source)
- apps/docs/stories/components/Checkbox.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Checkbox.stories.tsx` (source)
- apps/docs/stories/components/Divider.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Divider.stories.tsx` (source)
- apps/docs/stories/components/FormField.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/FormField.stories.tsx` (source)
- apps/docs/stories/components/Icon.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Icon.stories.tsx` (source)
- apps/docs/stories/components/Input.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Input.stories.tsx` (source)
- apps/docs/stories/components/Label.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Label.stories.tsx` (source)
- apps/docs/stories/components/Link.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Link.stories.tsx` (source)
- apps/docs/stories/components/Modal.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Modal.stories.tsx` (source)
- apps/docs/stories/components/Pagination.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Pagination.stories.tsx` (source)
- apps/docs/stories/components/Progress.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Progress.stories.tsx` (source)
- apps/docs/stories/components/Radio.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Radio.stories.tsx` (source)
- apps/docs/stories/components/Select.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Select.stories.tsx` (source)
- apps/docs/stories/components/Skeleton.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Skeleton.stories.tsx` (source)
- apps/docs/stories/components/Spinner.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Spinner.stories.tsx` (source)
- apps/docs/stories/components/Switch.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Switch.stories.tsx` (source)


## Files Inspected

- apps/playground/app/layout.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/playground/app/layout.tsx` (1241 bytes, git-clone)
- packages/utils/package.json -> `context/github/guillaume-flambard-memo-ui/files/packages/utils/package.json` (514 bytes, git-clone)
- apps/playground/app/globals.css -> `context/github/guillaume-flambard-memo-ui/files/apps/playground/app/globals.css` (238 bytes, git-clone)
- packages/react/src/primitives/avatar.tsx -> `context/github/guillaume-flambard-memo-ui/files/packages/react/src/primitives/avatar.tsx` (2192 bytes, git-clone)
- packages/react/src/primitives/badge.tsx -> `context/github/guillaume-flambard-memo-ui/files/packages/react/src/primitives/badge.tsx` (1887 bytes, git-clone)
- packages/react/src/primitives/button.tsx -> `context/github/guillaume-flambard-memo-ui/files/packages/react/src/primitives/button.tsx` (2859 bytes, git-clone)
- packages/react/src/primitives/card.tsx -> `context/github/guillaume-flambard-memo-ui/files/packages/react/src/primitives/card.tsx` (2963 bytes, git-clone)
- packages/react/src/primitives/input.tsx -> `context/github/guillaume-flambard-memo-ui/files/packages/react/src/primitives/input.tsx` (1736 bytes, git-clone)
- packages/react/src/primitives/modal.tsx -> `context/github/guillaume-flambard-memo-ui/files/packages/react/src/primitives/modal.tsx` (4045 bytes, git-clone)
- packages/react/src/primitives/tabs.tsx -> `context/github/guillaume-flambard-memo-ui/files/packages/react/src/primitives/tabs.tsx` (2069 bytes, git-clone)
- packages/react/src/primitives/toast.tsx -> `context/github/guillaume-flambard-memo-ui/files/packages/react/src/primitives/toast.tsx` (4203 bytes, git-clone)
- packages/utils/src/index.ts -> `context/github/guillaume-flambard-memo-ui/files/packages/utils/src/index.ts` (818 bytes, git-clone)
- apps/playground/app/page.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/playground/app/page.tsx` (22057 bytes, git-clone)
- .cursor/agents/tokens.md -> `context/github/guillaume-flambard-memo-ui/files/.cursor/agents/tokens.md` (3111 bytes, git-clone)
- apps/docs/package.json -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/package.json` (1043 bytes, git-clone)
- apps/playground/package.json -> `context/github/guillaume-flambard-memo-ui/files/apps/playground/package.json` (613 bytes, git-clone)
- package.json -> `context/github/guillaume-flambard-memo-ui/files/package.json` (665 bytes, git-clone)
- packages/core/package.json -> `context/github/guillaume-flambard-memo-ui/files/packages/core/package.json` (528 bytes, git-clone)
- packages/core/src/tokens/colors.ts -> `context/github/guillaume-flambard-memo-ui/files/packages/core/src/tokens/colors.ts` (2197 bytes, git-clone)
- packages/core/src/tokens/typography.ts -> `context/github/guillaume-flambard-memo-ui/files/packages/core/src/tokens/typography.ts` (1507 bytes, git-clone)
- packages/core/tailwind.css -> `context/github/guillaume-flambard-memo-ui/files/packages/core/tailwind.css` (9571 bytes, git-clone)
- packages/motion/package.json -> `context/github/guillaume-flambard-memo-ui/files/packages/motion/package.json` (614 bytes, git-clone)
- packages/react/package.json -> `context/github/guillaume-flambard-memo-ui/files/packages/react/package.json` (1234 bytes, git-clone)
- packages/utils/tsconfig.json -> `context/github/guillaume-flambard-memo-ui/files/packages/utils/tsconfig.json` (522 bytes, git-clone)
- apps/docs/stories/layout/Grid.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/layout/Grid.stories.tsx` (2034 bytes, git-clone)
- apps/docs/stories/layout/Stack.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/layout/Stack.stories.tsx` (2119 bytes, git-clone)
- apps/docs/stories/components/Alert.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Alert.stories.tsx` (2476 bytes, git-clone)
- apps/docs/stories/components/Avatar.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Avatar.stories.tsx` (1492 bytes, git-clone)
- apps/docs/stories/components/Badge.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Badge.stories.tsx` (1778 bytes, git-clone)
- apps/docs/stories/components/Breadcrumb.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Breadcrumb.stories.tsx` (1556 bytes, git-clone)
- apps/docs/stories/components/Button.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Button.stories.tsx` (3167 bytes, git-clone)
- apps/docs/stories/components/Card.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Card.stories.tsx` (1878 bytes, git-clone)
- apps/docs/stories/components/Checkbox.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Checkbox.stories.tsx` (1448 bytes, git-clone)
- apps/docs/stories/components/Divider.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Divider.stories.tsx` (1949 bytes, git-clone)
- apps/docs/stories/components/FormField.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/FormField.stories.tsx` (2216 bytes, git-clone)
- apps/docs/stories/components/Icon.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Icon.stories.tsx` (1773 bytes, git-clone)
- apps/docs/stories/components/Input.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Input.stories.tsx` (2165 bytes, git-clone)
- apps/docs/stories/components/Label.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Label.stories.tsx` (1604 bytes, git-clone)
- apps/docs/stories/components/Link.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Link.stories.tsx` (1745 bytes, git-clone)
- apps/docs/stories/components/Modal.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Modal.stories.tsx` (1139 bytes, git-clone)
- apps/docs/stories/components/Pagination.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Pagination.stories.tsx` (1422 bytes, git-clone)
- apps/docs/stories/components/Progress.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Progress.stories.tsx` (1320 bytes, git-clone)
- apps/docs/stories/components/Radio.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Radio.stories.tsx` (1868 bytes, git-clone)
- apps/docs/stories/components/Select.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Select.stories.tsx` (1415 bytes, git-clone)
- apps/docs/stories/components/Skeleton.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Skeleton.stories.tsx` (2052 bytes, git-clone)
- apps/docs/stories/components/Spinner.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Spinner.stories.tsx` (1365 bytes, git-clone)
- apps/docs/stories/components/Switch.stories.tsx -> `context/github/guillaume-flambard-memo-ui/files/apps/docs/stories/components/Switch.stories.tsx` (1846 bytes, git-clone)

## Design-Relevant Excerpts

### apps/playground/app/layout.tsx

```tsx
import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'memo-ui Playground',
  description: 'Design system with soul: precision + warmth',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const tokenFonts = {
    '--font-sans': 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
    '--font-mono': 'var(--font-geist-mono), ui-monospace, monospace',
    '--font-display': 'var(--font-space-grotesk), "Space Grotesk", ui-sans-serif, sans-serif',
  } as CSSProperties;

  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body
        className={`${GeistSans.className} min-h-screen bg-[var(--color-paper)] text-[var(--color-encre)] antialiased`}
        style={tokenFonts}
      >
        {children}
      </body>
    </html>
  );
}

```

### packages/utils/package.json

```json
{
  "name": "@memo-ui/utils",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.6.0"
  },
  "devDependencies": {
    "typescript": "^6.0.3"
  }
}
```

### apps/playground/app/globals.css

```css
@import '@memo-ui/core/tailwind.css';

/* Scan component packages — Tailwind v4 ignores sibling packages otherwise */
@source "../../../packages/react/src";
@source "../../../packages/react/dist";
@source "../../../packages/utils/src";

```

### packages/react/src/primitives/avatar.tsx

```tsx
'use client';

/**
 * memo-ui Avatar — user image with initials fallback.
 */

import React, { forwardRef, useState } from 'react';
import { cn } from '@memo-ui/utils';

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Image URL. Falls back to initials when missing or on load error. */
  src?: string;
  /** Alt text for the image. Defaults to empty (decorative) when fallback shows. */
  alt?: string;
  /** Initials or short text when image is unavailable. */
  fallback?: string;
  /** Avatar diameter. `@default md` */
  size?: 'sm' | 'md' | 'lg';
}

const avatarSizes = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-base',
} as const;

function initialsFrom(fallback?: string): string {
  if (!fallback) return '?';
  const parts = fallback.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

/**
 * Circular avatar. Shows `src` when it loads; otherwise renders `fallback` initials.
 */
export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(
  ({ src, alt = '', fallback, size = 'md', className, ...props }, ref) => {
    const [failed, setFailed] = useState(false);
    const showImage = Boolean(src) && !failed;
    const initials = initialsFrom(fallback);

    return (
      <span
        ref={ref}
        className={cn(
          'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
          'border border-[var(--avatar-border)] bg-[var(--avatar-bg)]',
          'font-medium text-[var(--avatar-fg)]',
          'select-none',
          avatarSizes[size],
          className
        )}
        {...props}
      >
        {showImage ? (
          <img
            src={src}
            alt={alt}
            className="size-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <span aria-hidden={!fallback} className="leading-none tracking-wide">
            {initials}
          </span>
        )}
      </span>
    );
  }
);

Avatar.displayName = 'Avatar';

```

### packages/react/src/primitives/badge.tsx

```tsx
"use client";

/**
 * memo-ui Badge — compact status / meta label.
 * Accent variant is scarce punctuation, not a default chrome color.
 */

import React, { forwardRef } from 'react';
import { cn } from '@memo-ui/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Color treatment. Use `accent` sparingly. `@default default` */
  variant?: 'default' | 'accent' | 'outline' | 'success' | 'warning' | 'error';
  /** Compact (`sm`) or default (`md`) height. `@default md` */
  size?: 'sm' | 'md';
}

const badgeVariants = {
  default:
    'bg-[var(--badge-bg-default)] text-[var(--badge-fg-default)] border-[var(--badge-border-default)]',
  accent:
    'bg-[var(--badge-bg-accent)] text-[var(--badge-fg-accent)] border-[var(--badge-border-accent)]',
  outline:
    'bg-[var(--badge-bg-outline)] text-[var(--badge-fg-outline)] border-[var(--badge-border-outline)]',
  success:
    'bg-[var(--badge-bg-success)] text-[var(--badge-fg-success)] border-[var(--badge-border-success)]',
  warning:
    'bg-[var(--badge-bg-warning)] text-[var(--badge-fg-warning)] border-[var(--badge-border-warning)]',
  error:
    'bg-[var(--badge-bg-error)] text-[var(--badge-fg-error)] border-[var(--badge-border-error)]',
} as const;

const badgeSizes = {
  sm: 'h-5 px-1.5 text-[11px]',
  md: 'h-6 px-2 text-xs',
} as const;

/** Non-interactive label chip. Foreground colors use AA ink tokens. */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'default', size = 'md', className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-1 rounded-full border font-medium tracking-wide',
          badgeVariants[variant],
          badgeSizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';

```

### packages/react/src/primitives/button.tsx

```tsx
"use client";

/**
 * memo-ui Button — primary action with scarce accent fill. Flat (no radius),
 * motion under 300ms on colour/border only.
 */

import React, { forwardRef } from 'react';
import { cn } from '@memo-ui/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. `@default primary` */
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  /** Control height and padding. `@default md` */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Shows a spinner, sets `aria-busy`, and disables the control.
   * Accessible name is preserved via visually hidden children.
   * `@default false`
   */
  loading?: boolean;
}

const buttonVariants = {
  primary:
    'bg-[var(--color-accent)] text-[var(--color-on-accent)] border-transparent hover:bg-[var(--color-accent-deep)]',
  secondary:
    'bg-[var(--color-surface)] text-[var(--color-encre)] border-[var(--color-line)] hover:border-[var(--color-line2)] hover:bg-[var(--color-surface2)]',
  ghost:
    'bg-transparent text-[var(--color-encre)] border-transparent hover:bg-[var(--color-accent-soft)]',
  outline:
    'bg-transparent text-[var(--color-encre)] border-[var(--color-line)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent-ink)]',
} as const;

const buttonSizes = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
} as const;

/**
 * Clickable action control. Prefer `primary` for the single strongest CTA on a surface.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      className,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex items-center justify-center gap-2',
          'border font-medium',
          'transition-[background-color,border-color,color] duration-[var(--duration-normal)] ease-in-out',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-paper)]',
          'disabled:pointer-events-none disabled:opacity-50',
          'aria-busy:pointer-events-none',
          buttonVariants[variant],
          but
...
```

### packages/react/src/primitives/card.tsx

```tsx
"use client";

/**
 * memo-ui Card — flat surface container. No radius, no shadow — structure via
 * 1px hairlines. Compose with CardHeader, CardTitle, CardDescription,
 * CardContent, CardFooter.
 */

import React, { forwardRef } from 'react';
import { cn } from '@memo-ui/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Border treatment. `@default default` */
  variant?: 'default' | 'outlined' | 'surface';
}

const cardVariants = {
  default: 'border-[var(--color-line)] bg-[var(--color-surface)]',
  outlined: 'border-[var(--color-line2)] bg-[var(--color-surface)]',
  surface: 'border-[var(--color-line)] bg-[var(--color-surface2)]',
} as const;

/** Bordered surface. Prefer for interactive groupings, not decorative chrome alone. */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'border',
          'transition-colors duration-[var(--duration-normal)] ease-in-out',
          'hover:bg-[var(--color-surface2)]',
          cardVariants[variant],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

/** Top block: title + description stack. */
export const CardHeader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 px-5 pt-5', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

/** Card heading (`h3`). */
export const CardTitle = forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        'font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-[var(--color-encre)]',
        className
      )}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

/** Supporting text under the title. */
export const CardDescription = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm leading-relaxed text-[var(--color-ink3)]', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

/** Main body padding. */
expo
...
```

### packages/react/src/primitives/input.tsx

```tsx
"use client";

/**
 * memo-ui Input — single-line text field on paper/surface tokens.
 */

import React, { forwardRef } from 'react';
import { cn } from '@memo-ui/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /**
   * Visual + a11y error treatment. When `error`, sets `aria-invalid`
   * unless overridden. `@default default`
   */
  variant?: 'default' | 'error';
}

const inputVariants = {
  default:
    'border-[var(--color-line)] focus:border-[var(--color-accent)] focus:ring-[var(--color-accent)]',
  error:
    'border-[var(--color-error)] focus:border-[var(--color-error)] focus:ring-[var(--color-error)]',
} as const;

/**
 * Native `<input>` with memo-ui chrome.
 * Always provide an accessible name (`aria-label`, `aria-labelledby`, or `<label>`).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      variant = 'default',
      className,
      type = 'text',
      'aria-invalid': ariaInvalid,
      ...props
    },
    ref
  ) => {
    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={ariaInvalid ?? (variant === 'error' ? true : undefined)}
        className={cn(
          'flex h-11 w-full rounded-none border bg-[var(--color-surface)] px-3.5',
          'text-sm text-[var(--color-encre)] placeholder:text-[var(--color-ink3)]',
          'transition-[border-color] duration-[var(--duration-micro)] ease-[var(--ease-out-expo)]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-0',
          'disabled:cursor-not-allowed disabled:opacity-50',
          inputVariants[variant],
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

```

### packages/react/src/primitives/modal.tsx

```tsx
"use client";

/**
 * memo-ui Modal — Radix Dialog for focus trap / a11y; chrome from tokens.
 */

import React, { forwardRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@memo-ui/utils';
import { Button } from './button';

export const ModalRoot = Dialog.Root;
export const ModalTrigger = Dialog.Trigger;
export const ModalClose = Dialog.Close;
export const ModalPortal = Dialog.Portal;

export interface ModalProps {
  /** Controlled open state. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element that opens the modal (`asChild` friendly). */
  trigger?: React.ReactNode;
  /** Dialog title (required for a11y — also set via ModalTitle). */
  title: React.ReactNode;
  /** Optional description. */
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Footer actions. Defaults to a Close button if omitted. */
  footer?: React.ReactNode;
  /** Content className. */
  className?: string;
}

/**
 * Accessible modal dialog. Uses Radix Dialog for behavior; visuals are tokens.
 * Prefer composing ModalRoot / ModalContent for advanced layouts.
 */
export function Modal({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  return (
    <Dialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <ModalContent className={className} title={title} description={description} footer={footer}>
        {children}
      </ModalContent>
    </Dialog.Root>
  );
}

Modal.displayName = 'Modal';

export interface ModalContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Dialog.Content>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
}

export const ModalContent = forwardRef<
  React.ElementRef<typeof Dialog.Content>,
  ModalContentProps
>(({ className, title, description, footer, children, ...props }, ref) => (
  <Dialog.Portal>
    <Dialog.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-[var(--modal-overlay)]',
        'data-[state=open]:animate-[fade-in_var(--duration-micro)_var(--ease-out-expo)]',
        'data-[state=closed]:animate-[fade-out_var(--duration-micro)_var(--ease-out-expo)]'
      )}
    />
    <Dialog.Content
      ref
...
```

### packages/react/src/primitives/tabs.tsx

```tsx
"use client";

/**
 * memo-ui Tabs — Radix Tabs for keyboard/a11y; chrome from tokens.
 */

import React, { forwardRef } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@memo-ui/utils';

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex items-center gap-1 rounded-none border border-[var(--tabs-list-border)] bg-[var(--tabs-list-bg)] p-1',
      className
    )}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center rounded-none px-3 py-1.5 text-sm font-medium',
      'text-[var(--tabs-trigger-fg)]',
      'transition-[background-color,color,transform] duration-[var(--duration-micro)] ease-[var(--ease-out-expo)]',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
      'disabled:pointer-events-none disabled:opacity-50',
      'data-[state=active]:bg-[var(--tabs-trigger-bg-active)] data-[state=active]:text-[var(--tabs-trigger-fg-active)]',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-paper)]',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';

```

### packages/react/src/primitives/toast.tsx

```tsx
"use client";

/**
 * memo-ui Toast — custom provider + viewport (no Radix). Opacity/transform only.
 */

import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { cn } from '@memo-ui/utils';

export type ToastTone = 'default' | 'success' | 'warning' | 'error';

export type ToastItem = {
  id: string;
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
};

type ToastContextValue = {
  toasts: ToastItem[];
  toast: (input: Omit<ToastItem, 'id'> & { id?: string }) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let toastCount = 0;

export interface ToastProviderProps {
  children: React.ReactNode;
  /** Max visible toasts. `@default 3` */
  max?: number;
}

/** Provides toast state. Mount once near the app root with `ToastViewport`. */
export function ToastProvider({ children, max = 3 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: Omit<ToastItem, 'id'> & { id?: string }) => {
      const id = input.id ?? `toast-${++toastCount}`;
      setToasts((prev) => [{ ...input, id, tone: input.tone ?? 'default' }, ...prev].slice(0, max));
      return id;
    },
    [max]
  );

  const value = useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

/** Access toast / dismiss. Must be under `ToastProvider`. */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}

const toneBorder: Record<ToastTone, string> = {
  default: 'border-[var(--toast-border)]',
  success: 'border-[var(--color-success-ink)]',
  warning: 'border-[var(--color-warning-ink)]',
  error: 'border-[var(--color-error-ink)]',
};

export type ToastViewportProps = React.HTMLAttributes<HTMLDivElement>;

/** Renders active toasts. Place once under `ToastProvider`. */
export const ToastViewport = forwardRef<HTMLDivElement, ToastViewportProps>(
  ({ className, ...props }, ref) => {
    const { toasts, dismiss } = useToast();

    retur
...
```

### packages/utils/src/index.ts

```ts
/**
 * memo-ui Utils
 * Core utilities for memo-ui components
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes with clsx
 * Standard utility for conditional className composition
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Keyboard key codes for keyboard navigation
 */
export const keyboardKeys = {
  Enter: 'Enter',
  Escape: 'Escape',
  Space: ' ',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Tab: 'Tab',
  Home: 'Home',
  End: 'End',
} as const;

/**
 * Check if a key is a keyboard key
 */
export function isKeyboardKey(key: string): key is keyof typeof keyboardKeys {
  return Object.values(keyboardKeys).includes(key as any);
}

```


## Package Files Materialized

- `source_examples/apps/playground/app/layout.tsx`
- `source_examples/apps/docs/stories/layout/Grid.stories.tsx`
- `source_examples/apps/docs/stories/layout/Stack.stories.tsx`
- `source_examples/packages/react/src/primitives/avatar.tsx`
- `source_examples/packages/react/src/primitives/badge.tsx`
- `source_examples/packages/react/src/primitives/tabs.tsx`

## Next Design-System Work

- Use these source paths and snapshots as evidence before writing `DESIGN.md`.
- Convert the inventory above into a Claude Design-style package: `README.md`, `SKILL.md`, `colors_and_type.css`, `preview/colors-*`, `preview/typography-specimens.html`, `preview/spacing-*`, `preview/components-*`, `preview/brand-assets.html`, `ui_kits/app/`, and preserved `assets/`, `build/`, or `fonts/` when evidence exists.
- `ui_kits/app/index.html` must be a browser-reviewable component entry: load `../../colors_and_type.css`, load or import at least three files from `ui_kits/app/components/`, and mount the composed UI through ReactDOM/Babel or compiled browser-ready JavaScript. Do not duplicate a static HTML mock when modular component files exist.
- `ui_kits/app/components/App.jsx` (or equivalent app shell) must compose source-backed role components such as Sidebar, AssistantsList, ChatArea, InputBar, and MessageBubble, not merely list their filenames.
- Claude-style UI-kit entry skeleton for direct JSX kits:
  - `<script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>`
  - `<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>`
  - `<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>`
  - `<link rel="stylesheet" href="../../colors_and_type.css">`
  - `<div id="root"></div>`
  - Load role components from `components/*.jsx` with `<script type="text/babel" src="components/ComponentName.jsx"></script>`.
  - Mount with `const { App } = window; const root = ReactDOM.createRoot(document.getElementById("root")); root.render(<App />);`.
- Preserve at least three high-signal source examples outside `context/` under `source_examples/` when reusable component snapshots exist, so future agents can compare generated components against original source structure.
- When a captured asset path begins with `build/`, copy the snapshot back into a root `build/` path with its original filename, such as `context/.../files/build/icon.png` -> `build/icon.png`. Do not satisfy build/runtime icon evidence by only renaming those files into `assets/`.
- Make `preview/brand-assets.html` visibly load preserved asset files from `assets/` or `build/`; do not redraw captured logos/icons as inline placeholders.
- Extract concrete colors, typography, spacing, radius, component behavior, assets, and product tone only when supported by inspected files.
- If evidence is missing or ambiguous, mark that uncertainty instead of inventing tokens.
