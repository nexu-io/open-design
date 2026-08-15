# shadcn/ui Component Catalog

Complete reference of all available shadcn/ui components, organized by category.

> **Note**: This catalog lists dependencies based on **Radix UI**. If you are using **Base UI**, the `add` command will handle the correct dependencies automatically.

## Layout Components

### Accordion
Collapsible content sections.
```bash
npx shadcn@latest add accordion
```
**Use cases**: FAQs, settings panels, navigation menus
**Key props**: `type` (single/multiple), `collapsible`
**Dependencies**: @radix-ui/react-accordion

### Card
Container for grouping related content.
```bash
npx shadcn@latest add card
```
**Sub-components**: CardHeader, CardTitle, CardDescription, CardContent, CardFooter
**Use cases**: Product cards, profile cards, dashboard widgets
**Dependencies**: None

### Separator
Visual divider between content sections.
```bash
npx shadcn@latest add separator
```
**Props**: `orientation` (horizontal/vertical), `decorative`
**Dependencies**: @radix-ui/react-separator

### Tabs
Organize content into multiple panels, one visible at a time.
```bash
npx shadcn@latest add tabs
```
**Sub-components**: TabsList, TabsTrigger, TabsContent
**Use cases**: Settings pages, dashboards, multi-step forms
**Dependencies**: @radix-ui/react-tabs

### Collapsible
Show/hide content with smooth animation.
```bash
npx shadcn@latest add collapsible
```
**Props**: `open`, `onOpenChange`, `disabled`
**Dependencies**: @radix-ui/react-collapsible

## Form Components

### Button
Clickable button with variants and sizes.
```bash
npx shadcn@latest add button
```
**Variants**: default, destructive, outline, secondary, ghost, link
**Sizes**: default, sm, lg, icon
**Dependencies**: @radix-ui/react-slot

### Input
Text input field.
```bash
npx shadcn@latest add input
```
**Types**: text, email, password, number, tel, url
**Use cases**: Forms, search bars, filters
**Dependencies**: None

### Label
Accessible label for form fields.
```bash
npx shadcn@latest add label
```
**Use with**: All form inputs for accessibility
**Dependencies**: @radix-ui/react-label

### Textarea
Multi-line text input.
```bash
npx shadcn@latest add textarea
```
**Props**: `rows`, `cols`, `resize` (via className)
**Dependencies**: None

### Checkbox
Binary toggle control.
```bash
npx shadcn@latest add checkbox
```
**Props**: `checked`, `onCheckedChange`, `disabled`
**Dependencies**: @radix-ui/react-checkbox

### Radio Group
Select one option from a set.
```bash
npx shadcn@latest add radio-group
```
**Sub-components**: RadioGroupItem
**Dependencies**: @radix-ui/react-radio-group

### Select
Dropdown selection control.
```bash
npx shadcn@latest add select
```
**Sub-components**: SelectTrigger, SelectContent, SelectItem, SelectValue
**Use cases**: Country selectors, category filters
**Dependencies**: @radix-ui/react-select

### Switch
Binary toggle with visual feedback.
```bash
npx shadcn@latest add switch
```
**Props**: `checked`, `onCheckedChange`, `disabled`
**Use cases**: Settings toggles, feature flags
**Dependencies**: @radix-ui/react-switch

### Slider
Select value from a range.
```bash
npx shadcn@latest add slider
```
**Props**: `min`, `max`, `step`, `value`, `onValueChange`
**Use cases**: Volume controls, filters, settings
**Dependencies**: @radix-ui/react-slider

### Form
Comprehensive form component with validation.
```bash
npx shadcn@latest add form
```
**Sub-components**: FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage
**Best used with**: react-hook-form, zod
**Dependencies**: @radix-ui/react-label, @radix-ui/react-slot

## Data Display

### Table
Display structured data in rows and columns.
```bash
npx shadcn@latest add table
```
**Sub-components**: TableHeader, TableBody, TableHead, TableRow, TableCell, TableFooter, TableCaption
**Best used with**: @tanstack/react-table
**Dependencies**: None

### Badge
Highlight status or category.
```bash
npx shadcn@latest add badge
```
**Variants**: default, secondary, destructive, outline
**Use cases**: Status indicators, tags, notifications
**Dependencies**: None

### Avatar
Display user profile images with fallback.
```bash
npx shadcn@latest add avatar
```
**Sub-components**: AvatarImage, AvatarFallback
**Dependencies**: @radix-ui/react-avatar

### Progress
Visual indicator of task completion.
```bash
npx shadcn@latest add progress
```
**Props**: `value` (0-100)
**Dependencies**: @radix-ui/react-progress

### Skeleton
Loading placeholder with animation.
```bash
npx shadcn@latest add skeleton
```
**Use cases**: Content loading states
**Dependencies**: None

### Calendar
Date selection interface.
```bash
npx shadcn@latest add calendar
```
**Props**: `mode` (single/multiple/range), `selected`, `onSelect`
**Dependencies**: react-day-picker

## Overlay Components

### Dialog
Modal dialog overlay.
```bash
npx shadcn@latest add dialog
```
**Sub-components**: DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription
**Use cases**: Confirmations, forms, detailed views
**Dependencies**: @radix-ui/react-dialog

### Sheet
Side panel that slides in from edge.
```bash
npx shadcn@latest add sheet
```
**Sides**: top, right, bottom, left
**Sub-components**: SheetTrigger, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription
**Use cases**: Navigation menus, filters, settings
**Dependencies**: @radix-ui/react-dialog

### Popover
Floating content container.
```bash
npx shadcn@latest add popover
```
**Sub-components**: PopoverTrigger, PopoverContent
**Use cases**: Tooltips with actions, mini forms
**Dependencies**: @radix-ui/react-popover

### Tooltip
Contextual information on hover.
```bash
npx shadcn@latest add tooltip
```
**Sub-components**: TooltipProvider, TooltipTrigger, TooltipContent
**Props**: `side`, `sideOffset`, `delayDuration`
**Dependencies**: @radix-ui/react-tooltip

### Dropdown Menu
Context menu with actions.
```bash
npx shadcn@latest add dropdown-menu
```
**Sub-components**: DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuSeparator, DropdownMenuLabel
**Use cases**: Action menus, settings
**Dependencies**: @radix-ui/react-dropdown-menu

### Context Menu
Right-click menu.
```bash
npx shadcn@latest add context-menu
```
**Sub-components**: Similar to DropdownMenu
**Use cases**: Right-click actions, advanced UIs
**Dependencies**: @radix-ui/react-context-menu

### Menubar
Horizontal menu bar.
```bash
npx shadcn@latest add menubar
```
**Sub-components**: MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem
**Use cases**: Application menus (File, Edit, View)
**Dependencies**: @radix-ui/react-menubar

### Alert Dialog
Modal dialog for important confirmations.
```bash
npx shadcn@latest add alert-dialog
```
**Sub-components**: AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel
**Use cases**: Delete confirmations, destructive actions
**Dependencies**: @radix-ui/react-alert-dialog

### Hover Card
Content card revealed on hover.
```bash
npx shadcn@latest add hover-card
```
**Sub-components**: HoverCardTrigger, HoverCardContent
**Use cases**: User previews, detailed information
**Dependencies**: @radix-ui/react-hover-card

## Navigation

### Navigation Menu
Accessible navigation with dropdowns.
```bash
npx shadcn@latest add navigation-menu
```
**Sub-components**: NavigationMenuList, NavigationMenuItem, NavigationMenuTrigger, NavigationMenuContent, NavigationMenuLink
**Use cases**: Main site navigation
**Dependencies**: @radix-ui/react-navigation-menu

### Breadcrumb
Show current page location in hierarchy.
```bash
npx shadcn@latest add breadcrumb
```
**Sub-components**: BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator
**Use cases**: Multi-level navigation
**Dependencies**: None

### Pagination
Navigate through pages of content.
```bash
npx shadcn@latest add pagination
```
**Sub-components**: PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis
**Dependencies**: None

## Feedback Components

### Alert
Display important messages.
```bash
npx shadcn@latest add alert
```
**Variants**: default, destructive
**Sub-components**: AlertTitle, AlertDescription
**Use cases**: Error messages, warnings, info
**Dependencies**: None

### Toast
Temporary notification message.
```bash
npx shadcn@latest add toast
```
**Props**: `title`, `description`, `action`, `variant`
**Usage**: Via `useToast()` hook
**Dependencies**: @radix-ui/react-toast

### Sonner
Alternative toast implementation.
```bash
npx shadcn@latest add sonner
```
**Better for**: Rich notifications, multiple toasts
**Dependencies**: sonner

## Command & Search

### Command
Command palette with search and keyboard navigation.
```bash
npx shadcn@latest add command
```
**Sub-components**: CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator
**Use cases**: Command palettes, search interfaces
**Dependencies**: cmdk

### Combobox
Searchable select dropdown.
```bash
npx shadcn@latest add combobox
```
**Use cases**: Autocomplete, country selectors
**Dependencies**: cmdk (via command)

## Utility Components

### Aspect Ratio
Maintain consistent width-height ratio.
```bash
npx shadcn@latest add aspect-ratio
```
**Props**: `ratio` (e.g., 16/9, 4/3)
**Dependencies**: @radix-ui/react-aspect-ratio

### Scroll Area
Custom scrollbar styling.
```bash
npx shadcn@latest add scroll-area
```
**Use cases**: Custom scrollable areas
**Dependencies**: @radix-ui/react-scroll-area

### Resizable
Resizable panel layout.
```bash
npx shadcn@latest add resizable
```
**Sub-components**: ResizablePanelGroup, ResizablePanel, ResizableHandle
**Use cases**: Split views, adjustable layouts
**Dependencies**: react-resizable-panels

## Date & Time

### Date Picker
Select dates with calendar popup.
```bash
npx shadcn@latest add date-picker
```
**Variants**: Single date, date range
**Dependencies**: react-day-picker, date-fns

## Advanced Components

### Carousel
Slideshow component.
```bash
npx shadcn@latest add carousel
```
**Sub-components**: CarouselContent, CarouselItem, CarouselPrevious, CarouselNext
**Dependencies**: embla-carousel-react

### Drawer
Bottom drawer for mobile interfaces.
```bash
npx shadcn@latest add drawer
```
**Best for**: Mobile-first designs
**Dependencies**: vaul

## Component Composition Patterns

### Form + Validation Pattern
```bash
npx shadcn@latest add form input label button
npm install react-hook-form zod @hookform/resolvers
```

### Data Table Pattern
```bash
npx shadcn@latest add table button dropdown-menu
npm install @tanstack/react-table
```

### Dashboard Layout Pattern
```bash
npx shadcn@latest add card tabs badge avatar
```

### Authentication Pattern
```bash
npx shadcn@latest add card input label button tabs
```

## Quick Reference

| Component | Category | Complexity | Dependencies |
|-----------|----------|------------|--------------|
| Button | Form | Simple | radix-slot |
| Input | Form | Simple | None |
| Card | Layout | Simple | None |
| Dialog | Overlay | Medium | radix-dialog |
| Table | Data | Simple | None |
| Form | Form | Complex | radix-label/slot |
| Command | Search | Complex | cmdk |
| Calendar | Date | Medium | react-day-picker |

## Installation Shortcuts

Common component bundles:

```bash
# Essential forms
npx shadcn@latest add form input label button select checkbox

# Data display
npx shadcn@latest add table badge avatar progress skeleton

# Overlay/modal components
npx shadcn@latest add dialog sheet popover tooltip alert-dialog

# Navigation
npx shadcn@latest add navigation-menu breadcrumb pagination

# Layout
npx shadcn@latest add card accordion tabs separator
```

## Component Updates

To update components to the latest version:

```bash
# Re-add component (will prompt to overwrite)
npx shadcn@latest add button

# Or use diff command to see changes
npx shadcn@latest diff button
```

## Further Reading

- [Official Component Docs](https://ui.shadcn.com/docs/components)
- [Component Examples](https://ui.shadcn.com/examples)
- [Radix UI Primitives](https://www.radix-ui.com/primitives)
