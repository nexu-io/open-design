# Knowledge Hub — Design System

Dark-first, quiet operational UI. Compact information density, restrained
indigo primary, no marketing-style hero/card-heavy layouts.

This folder is the **source of truth** for tokens and component primitives.
Drop it into the Next.js app at `app/design-system/` (or `src/design-system/`)
and import from it.

## Structure

```
design-system/
├── tokens.css            ← CSS variables (shadcn-style names)
├── tokens.ts             ← Typed tokens for runtime use
├── globals.css           ← Imports tokens.css + base styles + reset
├── components/
│   ├── ThemeProvider.tsx
│   ├── Button.tsx        ← Button, IconButton
│   ├── Pill.tsx          ← Pill, Tag
│   ├── Card.tsx
│   ├── Section.tsx       ← SectionLabel, DetailSection
│   ├── Header.tsx        ← PageHeader, DetailHeader
│   ├── BottomNav.tsx
│   ├── ChipStrip.tsx
│   ├── Display.tsx       ← KVGrid, Quote, Callout
│   └── index.ts          ← barrel
├── spec.html             ← live docs page (sidebar nav)
└── README.md             ← this file
```

## Install (Next.js app router)

1. Copy `design-system/` into your app, e.g. `src/design-system/`.
2. Add to `app/layout.tsx`:

   ```tsx
   import "@/design-system/globals.css";
   import { Inter } from "next/font/google";
   import { GeistMono } from "geist/font/mono";
   import { ThemeProvider } from "@/design-system/components";

   const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

   export default function RootLayout({ children }: { children: React.ReactNode }) {
     return (
       <html lang="en" suppressHydrationWarning>
         <body className={`${inter.variable} ${GeistMono.variable}`}>
           <ThemeProvider>{children}</ThemeProvider>
         </body>
       </html>
     );
   }
   ```

3. Override the sans/mono families in `tokens.css` if you wire `next/font`
   variables instead of bare family names:

   ```css
   :root {
     --font-sans: var(--font-inter), -apple-system, system-ui, sans-serif;
     --font-mono: var(--font-geist-mono), ui-monospace, Menlo, monospace;
   }
   ```

4. Install runtime dep: `pnpm add lucide-react`.

## Themes

- Default = **system preference** (`prefers-color-scheme`).
- Manual override = `data-theme="dark" | "light"` on `<html>` (set by
  `ThemeProvider`).
- Persisted in `localStorage` under `kh-theme`. Clear it to fall back to system.

## Token contract

Names follow shadcn conventions so component APIs stay portable:

| Token                   | Purpose                                    |
| ----------------------- | ------------------------------------------ |
| `--background`          | page surface                               |
| `--background-elev`     | sticky bars, sheets                        |
| `--card` / `--popover`  | content surfaces                           |
| `--foreground`          | primary text                               |
| `--foreground-dim`      | body / secondary text                      |
| `--muted`               | meta / labels                              |
| `--muted-dim`           | tertiary / timestamps                      |
| `--border`              | hairline                                   |
| `--border-strong`       | divider / handle                           |
| `--primary`             | brand action color (indigo)                |
| `--primary-tint`        | primary at low opacity (chips, callouts)   |
| `--ring`                | focus ring                                 |
| `--success/info/warning/danger` | status                             |

See `tokens.css` for the full list incl. type, spacing, radius, shadows,
z-layers, motion.

## Usage rules

- Prefer CSS variables in components (`color: var(--foreground)`); reach for
  the TS module only when you need a value at runtime.
- Density is intentional: `--row-default = 56px`, `--hit-min = 44px`. Don't
  invent looser variants without a reason.
- One indigo only. Status colors carry meaning; never use them for emphasis.
- Mono is reserved for IDs, timestamps, code, and ops surfaces — apply via
  `.kh-mono` or `font-family: var(--font-mono)`.
- Borders, not shadows. Shadows are for the FAB and modal layers only.

## Live spec

Open `design-system/spec.html` to browse every token + component with
copyable values. The page reads tokens from `tokens.css` so switching theme
re-renders all swatches.
