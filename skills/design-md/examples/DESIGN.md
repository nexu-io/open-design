# Design System: Furniture Collections List
**Project ID:** 13534454087919359824

## 1. Visual Theme & Atmosphere

The Furniture Collections List embodies a **sophisticated, minimalist sanctuary** that marries the pristine simplicity of Scandinavian design with the refined visual language of luxury editorial presentation. The interface feels **spacious and tranquil**, prioritizing breathing room and visual clarity above all else. The design philosophy is gallery-like and photography-first, allowing each furniture piece to command attention as an individual art object.

The overall mood is **airy yet grounded**, creating an aspirational aesthetic that remains approachable and welcoming. The interface feels **utilitarian in its restraint** but elegant in its execution, with every element serving a clear purpose while maintaining visual sophistication. The atmosphere evokes the serene ambiance of a high-end furniture showroom where customers can browse thoughtfully without visual overwhelm.

**Key Characteristics:**
- Expansive whitespace creating generous breathing room between elements
- Clean, architectural grid system with structured content blocks
- Photography-first presentation with minimal UI interference
- Whisper-soft visual hierarchy that guides without shouting
- Refined, understated interactive elements
- Professional yet inviting editorial tone

## 2. Color Palette & Roles

### Primary Foundation
- **Warm Barely-There Cream** (#FCFAFA) – Primary background color. Creates an almost imperceptible warmth that feels more inviting than pure white, serving as the serene canvas for the entire experience.
- **Crisp Very Light Gray** (#F5F5F5) – Secondary surface color used for card backgrounds and content areas. Provides subtle visual separation while maintaining the airy, ethereal quality.

### Accent & Interactive
- **Deep Muted Teal-Navy** (#294056) – The sole vibrant accent in the palette. Used exclusively for primary call-to-action buttons (e.g., "Shop Now", "View all products"), active navigation links, selected filter states, and subtle interaction highlights. This sophisticated anchor color creates visual focus points without disrupting the serene neutral foundation.

### Typography & Text Hierarchy
- **Charcoal Near-Black** (#2C2C2C) – Primary text color for headlines and product names. Provides strong readable contrast while being softer and more refined than pure black.
- **Soft Warm Gray** (#6B6B6B) – Secondary text used for body copy, product descriptions, and supporting metadata. Creates clear typographic hierarchy without harsh contrast.
- **Ultra-Soft Silver Gray** (#E0E0E0) – Tertiary color for borders, dividers, and subtle structural elements. Creates separation so gentle it's almost imperceptible.

### Functional States (Reserved for system feedback)
- **Success Moss** (#10B981) – Stock availability, confirmation states, positive indicators
- **Alert Terracotta** (#EF4444) – Low stock warnings, error states, critical alerts
- **Informational Slate** (#64748B) – Neutral system messages, informational callouts

## 3. Typography Rules

**Primary Font Family:** Manrope  
**Character:** Modern, geometric sans-serif with gentle humanist warmth. Slightly rounded letterforms that feel contemporary yet approachable.

### Hierarchy & Weights
- **Display Headlines (H1):** Semi-bold weight (600), generous letter-spacing (0.02em for elegance), 2.75-3.5rem size. Used sparingly for hero sections and major page titles.
- **Section Headers (H2):** Semi-bold weight (600), subtle letter-spacing (0.01em), 2-2.5rem size. Establishes clear content zones and featured collections.
- **Subsection Headers (H3):** Medium weight (500), normal letter-spacing, 1.5-1.75rem size. Product names and category labels.
- **Body Text:** Regular weight (400), relaxed line-height (1.7), 1rem size. Descriptions and supporting content prioritize comfortable readability.
- **Small Text/Meta:** Regular weight (400), slightly tighter line-height (1.5), 0.875rem size. Prices, availability, and metadata remain legible but visually recessive.
- **CTA Buttons:** Medium weight (500), subtle letter-spacing (0.01em), 1rem size. Balanced presence without visual aggression.

### Spacing Principles
- Headers use slightly expanded letter-spacing for refined elegance
- Body text maintains generous line-height (1.7) for effortless reading
- Consistent vertical rhythm with 2-3rem between related text blocks
- Large margins (4-6rem) between major sections to reinforce spaciousness

## 4. Component Stylings

### Buttons
- **Shape:** Subtly rounded corners (8px/0.5rem radius) – approachable and modern without appearing playful or childish
- **Primary CTA:** Deep Muted Teal-Navy (#294056) background with pure white text, comfortable padding (0.875rem vertical, 2rem horizontal)
- **Hover State:** Subtle darkening to deeper navy, smooth 250ms ease-in-out transition
- **Focus State:** Soft outer glow in the primary color for keyboard navigation accessibility
- **Secondary CTA (if needed):** Outlined style with Deep Muted Teal-Navy border, transparent background, hover fills with whisper-soft teal tint

### Cards & Product Containers
- **Corner Style:** Gently rounded corners (12px/0.75rem radius) creating soft, refined edges
- **Background:** Alternates between Warm Barely-There Cream and Crisp Very Light Gray based on layering needs
- **Shadow Strategy:** Flat by default. On hover, whisper-soft diffused shadow appears (`0 2px 8px rgba(0,0,0,0.06)`) creating subtle depth
- **Border:** Optional hairline border (1px) in Ultra-Soft Silver Gray for delicate definition when shadows aren't present
- **Internal Padding:** Generous 2-2.5rem creating comfortable breathing room for content
- **Image Treatment:** Full-bleed at the top of cards, square or 4:3 ratio, seamless edge-to-edge presentation

### Navigation
- **Style:** Clean horizontal layout with generous spacing (2-3rem) between menu items
- **Typography:** Medium weight (500), subtle uppercase, expanded letter-spacing (0.06em) for refined sophistication
- **Default State:** Charcoal Near-Black text
- **Active/Hover State:** Smooth 200ms color transition to Deep Muted Teal-Navy
- **Active Indicator:** Thin underline (2px) in Deep Muted Teal-Navy appearing below current section
- **Mobile:** Converts to elegant hamburger menu with sliding drawer

### Inputs & Forms
- **Stroke Style:** Refined 1px border in Soft Warm Gray
- **Background:** Warm Barely-There Cream with transition to Crisp Very Light Gray on focus
- **Corner Style:** Matching button roundness (8px/0.5rem) for visual consistency
- **Focus State:** Border color shifts to Deep Muted Teal-Navy with subtle outer glow
- **Padding:** Comfortable 0.875rem vertical, 1.25rem horizontal for touch-friendly targets
- **Placeholder Text:** Ultra-Soft Silver Gray, elegant and unobtrusive

### Product Cards (Specific Pattern)
- **Image Area:** Square (1:1) or landscape (4:3) ratio filling card width completely
- **Content Stack:** Product name (H3), brief descriptor, material/finish, price
- **Price Display:** Emphasized with semi-bold weight (600) in Charcoal Near-Black
- **Hover Behavior:** Gentle lift effect (translateY -4px) combined with enhanced shadow
- **Spacing:** Consistent 1.5rem internal padding below image

## 5. Layout Principles

### Grid & Structure
- **Max Content Width:** 1440px for optimal readability and visual balance on large displays
- **Grid System:** Responsive 12-column grid with fluid gutters (24px mobile, 32px desktop)
- **Product Grid:** 4 columns on large desktop, 3 on desktop, 2 on tablet, 1 on mobile
- **Breakpoints:** 
  - Mobile: <768px
  - Tablet: 768-1024px  
  - Desktop: 1024-1440px
  - Large Desktop: >1440px

### Whitespace Strategy (Critical to the Design)
- **Base Unit:** 8px for micro-spacing, 16px for component spacing
- **Vertical Rhythm:** Consistent 2rem (32px) base unit between related elements
- **Section Margins:** Generous 5-8rem (80-128px) between major sections creating dramatic breathing room
- **Edge Padding:** 1.5rem (24px) mobile, 3rem (48px) tablet/desktop for comfortable framing
- **Hero Sections:** Extra-generous top/bottom padding (8-12rem) for impactful presentation

### Alignment & Visual Balance
- **Text Alignment:** Left-aligned for body and navigation (optimal readability), centered for hero headlines and featured content
- **Image to Text Ratio:** Heavily weighted toward imagery (70-30 split) reinforcing photography-first philosophy
- **Asymmetric Balance:** Large hero images offset by compact, refined text blocks
- **Visual Weight Distribution:** Strategic use of whitespace to draw eyes to hero products and primary CTAs
- **Reading Flow:** Clear top-to-bottom, left-to-right pattern with intentional focal points

### Responsive Behavior & Touch
- **Mobile-First Foundation:** Core experience designed and perfected for smallest screens first
- **Progressive Enhancement:** Additional columns, imagery, and details added gracefully at larger breakpoints
- **Touch Targets:** Minimum 44x44px for all interactive elements (WCAG AAA compliant)
- **Image Optimization:** Responsive images with appropriate resolutions for each breakpoint, lazy-loading for performance
- **Collapsing Strategy:** Navigation collapses to hamburger, grid reduces columns, padding scales proportionally

## 6. Design System Notes for Stitch Generation

When creating new screens for this project using Stitch, reference these specific instructions:

### Language to Use
- **Atmosphere:** "Sophisticated minimalist sanctuary with gallery-like spaciousness"
- **Button Shapes:** "Subtly rounded corners" (not "rounded-md" or "8px")
- **Shadows:** "Whisper-soft diffused shadows on hover" (not "shadow-sm")
- **Spacing:** "Generous breathing room" and "expansive whitespace"

### Color References
Always use the descriptive names with hex codes:
- Primary CTA: "Deep Muted Teal-Navy (#294056)"
- Backgrounds: "Warm Barely-There Cream (#FCFAFA)" or "Crisp Very Light Gray (#F5F5F5)"
- Text: "Charcoal Near-Black (#2C2C2C)" or "Soft Warm Gray (#6B6B6B)"

### Component Prompts
- "Create a product card with gently rounded corners, full-bleed square product image, and whisper-soft shadow on hover"
- "Design a primary call-to-action button in Deep Muted Teal-Navy (#294056) with subtle rounded corners and comfortable padding"
- "Add a navigation bar with generous spacing between items, using medium-weight Manrope with subtle uppercase and expanded letter-spacing"

### Incremental Iteration
When refining existing screens:
1. Focus on ONE component at a time (e.g., "Update the product grid cards")
2. Be specific about what to change (e.g., "Increase the internal padding of product cards from 1.5rem to 2rem")
3. Reference this design system language consistently
