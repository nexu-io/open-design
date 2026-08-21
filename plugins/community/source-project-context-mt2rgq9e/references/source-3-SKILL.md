# Project As Complete OpenDesign Design System Skill

> A specialized skill for creating technical portfolios and high-impact engineering showcases.

---

## Instructions

This skill governs the creation and refinement of projects using the **Project As Complete OpenDesign Design System**. It enforces the system's visual language, component patterns, and technical standards.

### 1. Bind Design System Tokens

Every project created with this skill must bind the following OKLch tokens to its `:root` block:

```css
:root {
  --bg: oklch(0 0 0);
  --surface: oklch(0.14 0.004 250);
  --fg: oklch(0.97 0.005 80);
  --muted: oklch(0.65 0.01 250);
  --border: oklch(0.26 0.006 250);
  --accent: oklch(0.82 0.16 80);
  --accent-soft: oklch(0.82 0.16 80 / 0.14);
  --fg-soft: oklch(0.97 0.005 80 / 0.06);

  --font-display: 'Space Grotesk', sans-serif;
  --font-body: 'Inter', -apple-system, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

### 2. Follow Component Patterns

| Component | Rule |
|-----------|------|
| **Buttons** | Only one primary button (`.btn-primary`) per viewport. |
| **Cards** | Use `.card` with hover feedback (border color shift to `--accent`). |
| **Navigation**| Fixed top navigation bar (`.topnav`) with backdrop blur. |
| **Forms** | Use `--surface` background for inputs/textareas. |

### 3. Enforce Visual Constraints

- **Accent color:** Use `--accent` sparingly—no more than twice per screen.
- **Typography:** Space Grotesk for headings, Inter for body, JetBrains Mono for mono.
- **Motion:** Subtle, fast for interactions; slow, ambient for background effects.
- **Contrast:** Ensure all text and icons have sufficient contrast in all states.
- **Accessibility:** Use semantic HTML and provide clear focus rings.

### 4. Technical Standards

- **Color space:** Use OKLch for all color values.
- **Framework:** Next.js 16 (App Router) + React 19 + Tailwind CSS 4.
- **Realism:** Use realistic technical imagery and code examples.
- **Security:** Follow security best practices for data handling and bot protection.

---

## Commands

| Command | Purpose |
|---------|---------|
| `/plan` | Generate a task plan for creating or refining a project. |
| `/build`| Build project artifacts based on the design system. |
| `/verify`| Verify project artifacts against design system rules. |
| `/ship` | Finalize and ship project artifacts. |

---

## Summary

This skill is designed to help you create technical portfolios and high-impact engineering showcases that demonstrate production-grade precision and futuristic aesthetics. By following the design system's tokens, component patterns, and visual constraints, you can ensure consistency and authenticity across all projects.

---

**Design system id:** user:web-prototype-design-system  
**Project id:** aeadc299-6651-467a-b576-7c242466acdf