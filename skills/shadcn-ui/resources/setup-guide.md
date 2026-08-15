# shadcn/ui Setup Guide

This guide walks you through setting up shadcn/ui in both new and existing projects.

## Prerequisites

Before you begin, ensure you have:
- **Node.js 18+** installed
- **React 18+** in your project
- **Tailwind CSS 3.0+** configured
- A package manager: npm, yarn, pnpm, or bun

## Quick Start (New Project)

### Option 1: npx shadcn create (Recommended)

The easiest way to start a new project with shadcn/ui is using the `create` command, which allows you to customize everything (framework, library, style, font, etc.).

```bash
npx shadcn@latest create
```

This interactive command will guide you through:
1.  **Project Name**: Directory for your app.
2.  **Visual Style**: Choose from Vega, Nova, Maia, Lyra, Mira, or Classic.
3.  **Base Color**: Select your primary theme color.
4.  **Framework**: Next.js, Vite, Laravel, etc.
5.  **Component Library**: Choose **Radix UI** or **Base UI**.
6.  **RTL Support**: Enable Right-to-Left support if needed.

### Option 2: Classic Manual Setup (Next.js)

```bash
# Create a new Next.js project
npx create-next-app@latest my-app
cd my-app

# Initialize shadcn/ui
npx shadcn@latest init

# Add your first component
npx shadcn@latest add button
```

### Option 3: Classic Manual Setup (Vite + React)

```bash
# Create a new Vite project
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install

# Install Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Initialize shadcn/ui
npx shadcn@latest init

# Add your first component
npx shadcn@latest add button
```

## Existing Project Setup

### Step 1: Ensure Tailwind CSS is Installed

If Tailwind is not installed:

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Configure `tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

### Step 2: Initialize shadcn/ui

Run the initialization command:

```bash
npx shadcn@latest init
```

You'll be asked to configure:

1. **Style**: Choose between `default`, `new-york`, or one of the new styles (Vega, Nova, etc.)
   - `default`: Clean and minimal design
   - `new-york`: More refined with subtle details

2. **Base Color**: Choose your primary color palette
   - slate, gray, zinc, neutral, or stone

3. **CSS Variables**: Recommend `yes` for easier theming

4. **TypeScript**: Recommend `yes` for type safety

5. **Import Alias**: Default is `@/components` (recommended)

6. **React Server Components**: Choose based on your framework
   - `yes` for Next.js 13+ with app directory
   - `no` for Vite, CRA, or Next.js pages directory

7. **RTL Support**: Answer `yes` if you need Right-to-Left layout support (this will use logical properties like `ms-4` instead of `ml-4`).

## Advanced Features

### Visual Styles
shadcn/ui now offers multiple visual styles beyond the defaults:
- **Vega**: The classic shadcn/ui look.
- **Nova**: Reduced padding/margins, compact.
- **Maia**: Soft, rounded, generous spacing.
- **Lyra**: Boxy, sharp, mono font friendly.
- **Mira**: Dense, compact.

### Base UI Support
You can now choose between **Radix UI** and **Base UI** as the underlying primitive library. They share the same component API/abstraction, so your usage remains consistent.


### Step 3: Verify Configuration

The init command creates/updates several files:

**components.json** (root of project):
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib"
  }
}
```

**src/lib/utils.ts**:
```typescript
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**Updated tailwind.config.js**:
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        // ... more colors
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

**Updated globals.css** (or equivalent):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... dark mode variables */
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

### Step 4: Configure Path Aliases

Ensure your `tsconfig.json` includes path aliases:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

For Vite, also update `vite.config.ts`:

```typescript
import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

### Step 5: Add Components

Now you can add components:

```bash
# Add individual components
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add dialog

# Add multiple components at once
npx shadcn@latest add button card dialog input label
```

Components will be added to `src/components/ui/` by default.

## Framework-Specific Considerations

### Next.js App Router

- Set `rsc: true` in `components.json`
- Add `"use client"` to stateful components
- Import components work from server components by default

### Next.js Pages Router

- Set `rsc: false` in `components.json`
- All components are client-side by default

### Vite

- Ensure path aliases are configured in `vite.config.ts`
- Import `globals.css` in your main entry point (`main.tsx`)

### Create React App

- Use `craco` or `react-app-rewired` for path alias support
- Or use relative imports instead of aliases

## Verification Steps

1. **Check file structure**:
   ```
   src/
   ├── components/
   │   └── ui/
   ├── lib/
   │   └── utils.ts
   └── index.css (or globals.css)
   ```

2. **Test a simple component**:
   ```tsx
   import { Button } from "@/components/ui/button"
   
   export default function App() {
     return <Button>Click me</Button>
   }
   ```

3. **Verify Tailwind is working**:
   - Component should render with proper styling
   - Check browser dev tools for applied classes

4. **Test dark mode** (if using CSS variables):
   ```tsx
   <html className="dark">
   ```

## Troubleshooting

### "Cannot find module '@/components/ui/button'"

**Solution**: Check path alias configuration in `tsconfig.json` and framework config.

### Styles not applying

**Solution**: 
- Ensure `globals.css` is imported in your app entry point
- Verify Tailwind config `content` paths include your files
- Check CSS variables are defined in `globals.css`

### TypeScript errors in components

**Solution**:
- Run `npm install` to ensure all dependencies are installed
- Check that `@types/react` is installed
- Restart TypeScript server in your editor

### Components look broken

**Solution**:
- Verify `tailwindcss-animate` is installed: `npm install tailwindcss-animate`
- Check that CSS variables are properly defined
- Ensure you're not overriding component styles globally

## Next Steps

1. Browse the [component catalog](./component-catalog.md)
2. Read the [customization guide](./customization-guide.md)
3. Check out example implementations in `/examples`
4. Join the [shadcn/ui Discord](https://discord.com/invite/vNvTqVaWm6)

## Additional Resources

- [Official Documentation](https://ui.shadcn.com)
- [Component Examples](https://ui.shadcn.com/examples)
- [GitHub Repository](https://github.com/shadcn-ui/ui)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
