# shadcn/ui Customization Guide

Learn how to customize shadcn/ui components to match your brand and design requirements.

## Theming Approach

shadcn/ui uses a CSS variable-based theming system, making it easy to customize colors, spacing, and other design tokens globally.

## Color Customization

### Understanding the Color System

shadcn/ui uses HSL color values stored as CSS variables. Each color has a base value and a foreground variant for text/content that appears on top of it.

**Base Color Variables** (in `globals.css`):
```css
:root {
  --background: 0 0% 100%;        /* Page background */
  --foreground: 222.2 84% 4.9%;   /* Primary text color */
  --primary: 221.2 83.2% 53.3%;   /* Primary brand color */
  --primary-foreground: 210 40% 98%; /* Text on primary */
  --secondary: 210 40% 96.1%;     /* Secondary actions */
  --accent: 210 40% 96.1%;        /* Accent highlights */
  --muted: 210 40% 96.1%;         /* Muted backgrounds */
  --destructive: 0 84.2% 60.2%;   /* Error/danger */
  --border: 214.3 31.8% 91.4%;    /* Border colors */
  --input: 214.3 31.8% 91.4%;     /* Input borders */
  --ring: 221.2 83.2% 53.3%;      /* Focus rings */
}
```

### Changing Brand Colors

To match your brand, update the primary color:

```css
:root {
  /* Original blue */
  --primary: 221.2 83.2% 53.3%;
  
  /* Change to brand purple */
  --primary: 270 91% 65%;
  
  /* Adjust foreground for contrast */
  --primary-foreground: 0 0% 100%;
}
```

**HSL Format**: `hue saturation lightness`
- Hue: 0-360 (color wheel position)
- Saturation: 0-100% (color intensity)
- Lightness: 0-100% (brightness)

### Tools for Color Selection

1. **HSL Color Picker**: https://hslpicker.com/
2. **Shadcn Theme Generator**: https://ui.shadcn.com/themes
3. **Coolors**: https://coolors.co/ (generates palettes)

### Creating a Color Scheme

Start with your primary brand color, then derive other colors:

```css
:root {
  /* 1. Primary brand color */
  --primary: 230 90% 60%;
  --primary-foreground: 0 0% 100%;
  
  /* 2. Lighter variant for secondary */
  --secondary: 230 30% 95%;
  --secondary-foreground: 230 90% 30%;
  
  /* 3. Subtle accent (shift hue slightly) */
  --accent: 200 90% 60%;
  --accent-foreground: 0 0% 100%;
  
  /* 4. Muted backgrounds (low saturation) */
  --muted: 230 20% 96%;
  --muted-foreground: 230 20% 40%;
  
  /* 5. Keep destructive red-based */
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;
}
```

## Dark Mode

### Setting Up Dark Mode

shadcn/ui includes dark mode support out of the box. Add dark mode colors:

```css
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  /* ... all color variables */
}
```

### Toggle Dark Mode

**Next.js with next-themes**:
```bash
npm install next-themes
```

```tsx
// app/providers.tsx
"use client"

import { ThemeProvider } from "next-themes"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  )
}

// app/layout.tsx
import { Providers } from "./providers"

export default function RootLayout({ children }) {
  return (
    <html suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

// components/theme-toggle.tsx
"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
```

## Component Customization

### Using Variants

shadcn/ui components use `class-variance-authority` (cva) for variants. Example from Button:

```typescript
// components/ui/button.tsx
import { cva, type VariantProps } from "class-variance-authority"

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

### Adding Custom Variants

To add a new variant, edit the component file in `components/ui/`:

```typescript
// Add new "success" variant to button
const buttonVariants = cva(
  "...",
  {
    variants: {
      variant: {
        default: "...",
        destructive: "...",
        // Add new variant
        success: "bg-green-600 text-white hover:bg-green-700",
      },
      // Add new size
      size: {
        default: "...",
        xl: "h-12 rounded-md px-10 text-base",
      },
    },
  }
)

// Update TypeScript interface
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}
```

Usage:
```tsx
<Button variant="success" size="xl">Save Changes</Button>
```

### Creating Composite Components

Don't modify `components/ui/` directly. Instead, create wrapper components:

```tsx
// components/loading-button.tsx
import { Button, ButtonProps } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

interface LoadingButtonProps extends ButtonProps {
  loading?: boolean
}

export function LoadingButton({ 
  loading, 
  children, 
  disabled,
  ...props 
}: LoadingButtonProps) {
  return (
    <Button disabled={loading || disabled} {...props}>
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </Button>
  )
}
```

## Typography Customization

### Font Family

Update `tailwind.config.js`:

```javascript
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Poppins', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
    },
  },
}
```

Import fonts in your layout:

```tsx
// app/layout.tsx
import { Inter, Poppins } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const poppins = Poppins({ 
  weight: ['600', '700'], 
  subsets: ['latin'],
  variable: '--font-heading',
})

export default function RootLayout({ children }) {
  return (
    <html className={`${inter.variable} ${poppins.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  )
}
```

Use in components:
```tsx
<h1 className="font-heading text-3xl">Heading</h1>
<p className="font-sans">Body text</p>
```

### Font Sizes

Extend Tailwind's font scale:

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      fontSize: {
        'xs': '0.75rem',     // 12px
        'sm': '0.875rem',    // 14px
        'base': '1rem',      // 16px
        'lg': '1.125rem',    // 18px
        'xl': '1.25rem',     // 20px
        '2xl': '1.5rem',     // 24px
        '3xl': '1.875rem',   // 30px
        '4xl': '2.25rem',    // 36px
        '5xl': '3rem',       // 48px
        '6xl': '3.75rem',    // 60px
        '7xl': '4.5rem',     // 72px
      },
    },
  },
}
```

## Spacing & Layout

### Border Radius

Customize roundedness globally:

```css
/* globals.css */
:root {
  --radius: 0.5rem;  /* Default (8px) */
  
  /* More rounded */
  --radius: 1rem;    /* 16px */
  
  /* Sharp edges */
  --radius: 0;       /* No rounding */
  
  /* Very rounded */
  --radius: 1.5rem;  /* 24px */
}
```

This affects all components using `rounded-lg`, `rounded-md`, `rounded-sm`.

### Custom Spacing

Extend Tailwind's spacing scale:

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      spacing: {
        '72': '18rem',
        '84': '21rem',
        '96': '24rem',
      },
    },
  },
}
```

## Animation Customization

### Adjusting Existing Animations

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      keyframes: {
        // Make accordion faster
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
        "accordion-down": "accordion-down 0.15s ease-out", // Faster
        "accordion-up": "accordion-up 0.15s ease-out",
      },
    },
  },
}
```

### Adding New Animations

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      keyframes: {
        "fade-in": {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        "slide-in-bottom": {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in-bottom": "slide-in-bottom 0.3s ease-out",
      },
    },
  },
}
```

Use in components:
```tsx
<div className="animate-fade-in">Content</div>
```

## Advanced Customization

### Creating a Design System

Structure your customizations:

```
src/
├── styles/
│   ├── globals.css          # CSS variables & base styles
│   ├── themes/
│   │   ├── default.css      # Default theme
│   │   └── brand.css        # Brand-specific overrides
│   └── components/
│       └── custom.css       # Component-specific styles
├── lib/
│   └── design-tokens.ts     # Shared constants
└── components/
    ├── ui/                  # shadcn components (don't modify)
    └── custom/              # Your wrapper components
```

### Design Tokens File

```typescript
// lib/design-tokens.ts
export const designTokens = {
  colors: {
    brand: {
      primary: 'hsl(230, 90%, 60%)',
      secondary: 'hsl(230, 30%, 95%)',
    },
  },
  spacing: {
    section: '5rem',
    card: '1.5rem',
  },
  radius: {
    card: '1rem',
    button: '0.5rem',
  },
  typography: {
    h1: 'text-5xl font-heading font-bold',
    h2: 'text-4xl font-heading font-semibold',
    h3: 'text-3xl font-heading font-semibold',
    body: 'text-base font-sans',
    small: 'text-sm text-muted-foreground',
  },
} as const
```

Use in components:
```tsx
import { designTokens } from "@/lib/design-tokens"

<h1 className={designTokens.typography.h1}>Title</h1>
```

## Best Practices

1. **Don't modify `components/ui/` files directly**: Create wrapper components instead
2. **Use CSS variables for theming**: Easier to maintain and switch themes
3. **Leverage Tailwind's `extend`**: Don't replace defaults, extend them
4. **Keep variants in component files**: Co-locate variant logic with components
5. **Test dark mode**: Ensure all customizations work in both themes
6. **Document custom variants**: Add comments for custom additions
7. **Use consistent spacing**: Stick to Tailwind's spacing scale
8. **Maintain accessibility**: Don't sacrifice contrast for aesthetics

## Resources

- [Tailwind CSS Customization](https://tailwindcss.com/docs/theme)
- [CVA Documentation](https://cva.style/docs)
- [Radix UI Theming](https://www.radix-ui.com/themes/docs/theme/overview)
- [HSL Color Theory](https://www.w3.org/TR/css-color-3/#hsl-color)
