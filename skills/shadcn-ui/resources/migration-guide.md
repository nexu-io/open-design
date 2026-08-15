# Migration Guide to shadcn/ui

This guide helps you migrate from other UI libraries to shadcn/ui.

## Why Migrate to shadcn/ui?

- **Full ownership**: Code lives in your project, not node_modules
- **Customizable**: Modify any component to fit your needs
- **No breaking changes**: Update components individually
- **Smaller bundles**: Only include what you use
- **Modern stack**: Built with Radix UI and Tailwind CSS
- **Type-safe**: Full TypeScript support

## Migration Strategies

### Strategy 1: Incremental Migration (Recommended)

Gradually replace components over time:

1. Install shadcn/ui alongside existing library
2. Replace components page by page or feature by feature
3. Remove old library once migration is complete

**Pros**: Low risk, can be done alongside feature work
**Cons**: Temporary bundle size increase

### Strategy 2: Big Bang Migration

Replace all components at once:

1. Set up shadcn/ui
2. Create component mapping document
3. Replace all components in one effort
4. Test thoroughly

**Pros**: Clean cutover, no mixed UI
**Cons**: High risk, requires dedicated time

## Internal Migrations (shadcn specific)

### RTL Support Migration
If you need to support RTL languages (like Arabic or Hebrew) in an existing shadcn/ui project:

```bash
npx shadcn@latest migrate rtl
```

This CLI command transforms your components to use **logical properties**:
- `ml-4` -> `ms-4` (margin-start)
- `pl-4` -> `ps-4` (padding-start)
- `text-left` -> `text-start`

It ensures your UI adapts correctly to layout direction without manual refactoring.

## From Material-UI (MUI)

### Component Mapping

| MUI Component | shadcn/ui Equivalent | Notes |
|---------------|----------------------|-------|
| Button | Button | Similar API |
| TextField | Input + Label | Separate components |
| Select | Select | Different structure |
| Dialog | Dialog | Similar concept |
| Drawer | Sheet | Side panel |
| Card | Card | Very similar |
| Table | Table | Use with TanStack Table |
| Checkbox | Checkbox | Similar API |
| Switch | Switch | Similar API |
| Tabs | Tabs | Similar structure |
| Tooltip | Tooltip | Simpler API |
| Menu | Dropdown Menu | Different trigger model |
| Snackbar | Toast | Different implementation |
| Autocomplete | Combobox | Use with Command |

### Key Differences

**1. Import Structure**
```tsx
// MUI
import Button from '@mui/material/Button'

// shadcn/ui
import { Button } from '@/components/ui/button'
```

**2. Form Components**
```tsx
// MUI
<TextField
  label="Email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  error={!!errors.email}
  helperText={errors.email}
/>

// shadcn/ui
<div className="space-y-2">
  <Label htmlFor="email">Email</Label>
  <Input
    id="email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
  />
  {errors.email && (
    <p className="text-sm text-destructive">{errors.email}</p>
  )}
</div>

// Or with Form component
<FormField
  control={form.control}
  name="email"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Email</FormLabel>
      <FormControl>
        <Input {...field} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

**3. Theming**
```tsx
// MUI
import { ThemeProvider, createTheme } from '@mui/material/styles'

const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
  },
})

<ThemeProvider theme={theme}>
  <App />
</ThemeProvider>

// shadcn/ui
// Edit globals.css
:root {
  --primary: 215 100% 50%;
}
```

**4. Styling Approach**
```tsx
// MUI (sx prop)
<Button sx={{ px: 4, py: 2, borderRadius: 2 }}>
  Click me
</Button>

// shadcn/ui (Tailwind classes)
<Button className="px-4 py-2 rounded-lg">
  Click me
</Button>
```

### Migration Example: Login Form

**Before (MUI)**:
```tsx
import { TextField, Button, Box } from '@mui/material'

export function LoginForm() {
  return (
    <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <TextField label="Email" type="email" required />
      <TextField label="Password" type="password" required />
      <Button variant="contained" type="submit">
        Sign In
      </Button>
    </Box>
  )
}
```

**After (shadcn/ui)**:
```tsx
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export function LoginForm() {
  return (
    <form className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" required />
      </div>
      <Button type="submit">Sign In</Button>
    </form>
  )
}
```

## From Chakra UI

### Component Mapping

| Chakra UI | shadcn/ui | Notes |
|-----------|-----------|-------|
| Button | Button | Similar variants |
| Input | Input | More basic |
| Select | Select | Different structure |
| Modal | Dialog | Similar concept |
| Drawer | Sheet | Very similar |
| Box | div | Use Tailwind classes |
| Flex | div | Use flex utilities |
| Stack | div | Use space-y-* classes |
| Text | p/span | Use typography classes |
| Heading | h1/h2/etc | Use typography classes |
| useToast | useToast | Different API |
| Menu | Dropdown Menu | Similar |

### Key Differences

**1. Layout Components**
```tsx
// Chakra UI
<Stack spacing={4} direction="column">
  <Box>Item 1</Box>
  <Box>Item 2</Box>
</Stack>

// shadcn/ui
<div className="flex flex-col space-y-4">
  <div>Item 1</div>
  <div>Item 2</div>
</div>
```

**2. Responsive Styles**
```tsx
// Chakra UI
<Box display={{ base: 'block', md: 'flex' }} />

// shadcn/ui
<div className="block md:flex" />
```

**3. Color Mode**
```tsx
// Chakra UI
import { useColorMode } from '@chakra-ui/react'

const { colorMode, toggleColorMode } = useColorMode()

// shadcn/ui (with next-themes)
import { useTheme } from 'next-themes'

const { theme, setTheme } = useTheme()
```

## From Ant Design

### Component Mapping

| Ant Design | shadcn/ui | Notes |
|------------|-----------|-------|
| Button | Button | Similar |
| Input | Input | More basic |
| Form | Form | Different approach |
| Table | Table | Use TanStack Table |
| Modal | Dialog | Similar |
| Drawer | Sheet | Similar |
| Select | Select | Different API |
| DatePicker | Calendar + Popover | More manual |
| Menu | Navigation Menu | Different |
| message | Toast | Different API |
| notification | Toast | Similar concept |

### Key Differences

**1. Form Handling**
```tsx
// Ant Design
<Form
  form={form}
  onFinish={onSubmit}
>
  <Form.Item name="email" rules={[{ required: true }]}>
    <Input />
  </Form.Item>
  <Form.Item>
    <Button type="primary" htmlType="submit">Submit</Button>
  </Form.Item>
</Form>

// shadcn/ui (with react-hook-form)
<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormField
      control={form.control}
      name="email"
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <Input {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
    <Button type="submit">Submit</Button>
  </form>
</Form>
```

**2. Notifications**
```tsx
// Ant Design
import { message } from 'antd'

message.success('Success!')

// shadcn/ui
import { useToast } from '@/components/ui/use-toast'

const { toast } = useToast()

toast({
  title: "Success!",
  description: "Operation completed.",
})
```

## From Bootstrap

### Component Mapping

| Bootstrap | shadcn/ui | Notes |
|-----------|-----------|-------|
| btn | Button | Similar variants |
| form-control | Input | Similar |
| card | Card | Very similar structure |
| modal | Dialog | Different API |
| dropdown | Dropdown Menu | Similar concept |
| nav/navbar | Navigation Menu | Different |
| alert | Alert | Similar |
| badge | Badge | Similar |
| table | Table | Use with TanStack Table |

### Key Differences

**1. Class-Based vs Component-Based**
```tsx
// Bootstrap
<button className="btn btn-primary btn-lg">
  Click me
</button>

// shadcn/ui
<Button variant="default" size="lg">
  Click me
</Button>
```

**2. Cards**
```html
<!-- Bootstrap -->
<div class="card">
  <div class="card-header">Title</div>
  <div class="card-body">Content</div>
  <div class="card-footer">Footer</div>
</div>

<!-- shadcn/ui -->
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content</CardContent>
  <CardFooter>Footer</CardFooter>
</Card>
```

## Migration Checklist

### Before Migration

- [ ] Audit current component usage
- [ ] Set up shadcn/ui in a test branch
- [ ] Create component mapping document
- [ ] Plan migration order (start with simple components)
- [ ] Set up Tailwind CSS properly
- [ ] Configure path aliases

### During Migration

- [ ] Install shadcn/ui components as needed
- [ ] Replace components incrementally
- [ ] Update styling to use Tailwind classes
- [ ] Test each page/feature after migration
- [ ] Update tests to match new components
- [ ] Handle form validation (switch to react-hook-form + zod)
- [ ] Migrate theme/color variables

### After Migration

- [ ] Remove old UI library dependencies
- [ ] Clean up unused imports
- [ ] Optimize bundle size
- [ ] Update documentation
- [ ] Review and update design system
- [ ] Train team on new components

## Common Pitfalls

### 1. Not Setting Up Tailwind Properly

shadcn/ui requires Tailwind. Ensure:
- `tailwind.config.js` includes correct content paths
- CSS variables are defined in `globals.css`
- Tailwind plugins are installed (e.g., `tailwindcss-animate`)

### 2. Forgetting Path Aliases

Components use `@/` imports. Configure:
- `tsconfig.json` with path aliases
- Vite/Next.js config for runtime resolution

### 3. Trying to Match Old Library Exactly

Don't force shadcn/ui to work like your old library. Embrace the new patterns:
- Use composition over configuration
- Leverage Tailwind utilities
- Create wrapper components for custom needs

### 4. Not Using Form Libraries

shadcn/ui form components are basic. For complex forms, use:
- `react-hook-form` for form state
- `zod` for validation
- shadcn's `Form` component for integration

### 5. Ignoring Accessibility

While shadcn/ui is accessible by default, custom modifications can break this. Test with:
- Keyboard navigation
- Screen readers
- ARIA attribute validation

## Getting Help

- **Discord**: [shadcn/ui Discord](https://discord.com/invite/vNvTqVaWm6)
- **GitHub Discussions**: [shadcn/ui Discussions](https://github.com/shadcn-ui/ui/discussions)
- **Documentation**: [ui.shadcn.com](https://ui.shadcn.com)

## Next Steps

After migration:
1. Review the [Customization Guide](./customization-guide.md)
2. Explore the [Component Catalog](./component-catalog.md)
3. Check out [Examples](../examples/)
4. Consider building a component library on top of shadcn/ui
