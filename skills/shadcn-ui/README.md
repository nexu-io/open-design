# shadcn/ui Integration Skill

## Install

```bash
npx skills add google-labs-code/stitch-skills --skill shadcn-ui --global
```

## What It Does

This skill provides expert guidance for integrating shadcn/ui components into your React applications. It helps you discover, install, customize, and optimize shadcn/ui components while following best practices.

## Example Prompts

```text
Help me set up shadcn/ui in my Next.js project

Add a data table component with sorting and filtering to my app

Show me how to customize the button component with a new variant

Create a login form using shadcn/ui components with validation

Build a dashboard layout with sidebar navigation using shadcn/ui blocks
```

## What is shadcn/ui?

shadcn/ui is a collection of beautifully designed, accessible, and customizable components built with:
- **Radix UI or Base UI**: Unstyled, accessible component primitives
- **Tailwind CSS**: Utility-first styling framework
- **TypeScript**: Full type safety

**Key Difference**: Unlike traditional component libraries, shadcn/ui copies components directly into your project. This gives you:
- Full control over the code
- No version lock-in
- Complete customization freedom
- Zero runtime overhead

## Skill Structure

```text
skills/shadcn-ui/
├── SKILL.md              — Core instructions & workflow
├── README.md             — This file
├── examples/             — Example implementations
│   ├── form-pattern.tsx       — Form with validation
│   ├── data-table.tsx         — Advanced table with sorting
│   └── auth-layout.tsx        — Authentication flow
├── resources/            — Reference documentation
│   ├── setup-guide.md         — Project initialization
│   ├── component-catalog.md   — Component reference
│   ├── customization-guide.md — Theming patterns
│   └── migration-guide.md     — Migration from other libraries
└── scripts/              — Utility scripts
    └── verify-setup.sh        — Validate project configuration
```

## How It Works

When activated, the agent follows this workflow:

### 1. **Discovery & Planning**
- Lists available components using shadcn MCP tools
- Identifies required dependencies
- Plans component composition strategy

### 2. **Setup & Configuration**
- Verifies or initializes `components.json`
- Checks Tailwind CSS configuration
- Validates import aliases and paths

### 3. **Component Integration**
- Retrieves component source code
- Installs via CLI or manual integration
- Handles dependency installation

### 4. **Customization**
- Applies theme customization
- Creates component variants
- Extends components with custom logic

### 5. **Quality Assurance**
- Validates TypeScript types
- Checks accessibility compliance
- Verifies responsive behavior

## Prerequisites

Your project should have:
- **React 18+**
- **Tailwind CSS 3.0+**
- **TypeScript** (recommended)
- **Node.js 18+**

## Quick Start

### For New Projects

```bash
# Create Next.js project with shadcn/ui
npx create-next-app@latest my-app
cd my-app
npx shadcn@latest init

# Add components
npx shadcn@latest add button
npx shadcn@latest add card
```

### For Existing Projects

```bash
# Initialize shadcn/ui
npx shadcn@latest init

# Configure when prompted:
# - Choose style (default/new-york)
# - Select base color
# - Configure CSS variables
# - Set import aliases

# Add your first component
npx shadcn@latest add button
```

## Available Components

shadcn/ui provides 50+ components including:

**Layout**: Accordion, Card, Separator, Tabs, Collapsible  
**Forms**: Button, Input, Label, Checkbox, Radio Group, Select, Textarea  
**Data Display**: Table, Badge, Avatar, Progress, Skeleton  
**Overlays**: Dialog, Sheet, Popover, Tooltip, Dropdown Menu  
**Navigation**: Navigation Menu, Tabs, Breadcrumb, Pagination  
**Feedback**: Alert, Alert Dialog, Toast, Command  

Plus complete **Blocks** like:
- Authentication forms
- Dashboard layouts
- Calendar interfaces
- Sidebar navigation
- E-commerce components

## Customization Approach

### Theme-Level Customization
Modify CSS variables in `globals.css`:
```css
:root {
  --primary: 221.2 83.2% 53.3%;
  --secondary: 210 40% 96.1%;
  /* ... */
}
```

### Component-Level Customization
Components use `class-variance-authority` for variants:
```typescript
const buttonVariants = cva(
  "base-classes",
  {
    variants: {
      variant: { default: "...", destructive: "..." },
      size: { default: "...", sm: "..." },
    }
  }
)
```

### Composition
Create higher-level components:
```typescript
// Compose existing components
export function FeatureCard({ title, description, icon }) {
  return (
    <Card>
      <CardHeader>
        {icon}
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{description}</p>
      </CardContent>
    </Card>
  )
}
```

## Integration with MCP Tools

This skill leverages shadcn MCP server capabilities:

- `list_components` - Browse component catalog
- `get_component` - Retrieve component source
- `get_component_metadata` - View props and dependencies
- `get_component_demo` - See usage examples
- `list_blocks` - Browse UI blocks
- `get_block` - Retrieve block source with all files
- `search_items_in_registries` - Find components in custom registries

## Best Practices

1. **Keep `ui/` pure**: Don't modify components in `components/ui/` directly
2. **Compose, don't fork**: Create wrapper components instead of editing originals
3. **Use the CLI**: Let `shadcn add` handle dependencies and updates
4. **Maintain consistency**: Use the `cn()` utility for all class merging
5. **Respect accessibility**: Preserve ARIA attributes and keyboard handlers
6. **Test responsiveness**: shadcn components are responsive by default—keep it that way

## Troubleshooting

### "Module not found" errors
Check your `tsconfig.json` includes path aliases:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Styles not applying
- Import `globals.css` in your root layout
- Verify Tailwind config includes component paths
- Check CSS variable definitions match component expectations

### TypeScript errors
- Ensure all Radix UI peer dependencies are installed
- Run `npm install` after adding components via CLI
- Check that React types are up to date

## Further Reading

- [Official Documentation](https://ui.shadcn.com)
- [Component Source](https://github.com/shadcn-ui/ui)
- [Radix UI Docs](https://www.radix-ui.com)
- [Tailwind CSS Docs](https://tailwindcss.com)

## Contributing

Contributions to improve this skill are welcome! See the root [CONTRIBUTING.md](../../../../CONTRIBUTING.md) for guidelines.

## License

See [LICENSE](../../../../LICENSE) in the repository root.
