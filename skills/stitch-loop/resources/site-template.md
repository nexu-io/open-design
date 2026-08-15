# Site Template

Use these templates when setting up a new project for the build loop.

## SITE.md Template

```markdown
# Project Vision & Constitution

> **AGENT INSTRUCTION:** Read this file before every iteration. It serves as the project's "Long-Term Memory."

## 1. Core Identity
* **Project Name:** [Your project name]
* **Stitch Project ID:** [Your Stitch project ID]
* **Mission:** [What the site achieves]
* **Target Audience:** [Who uses this site]
* **Voice:** [Tone and personality descriptors]

## 2. Visual Language
*Reference these descriptors when prompting Stitch.*

* **The "Vibe" (Adjectives):**
    * *Primary:* [Main aesthetic keyword]
    * *Secondary:* [Supporting aesthetic]
    * *Tertiary:* [Additional flavor]

## 3. Architecture & File Structure
* **Root:** `site/public/`
* **Asset Flow:** Stitch generates to `queue/` → Validate → Move to `site/public/`
* **Navigation Strategy:** [How nav works]

## 4. Live Sitemap (Current State)
*Update this when a new page is successfully merged.*

* [x] `index.html` - [Description]
* [ ] `about.html` - [Description]

## 5. The Roadmap (Backlog)
*Pick the next task from here if available.*

### High Priority
- [ ] [Task description]
- [ ] [Task description]

### Medium Priority
- [ ] [Task description]

## 6. Creative Freedom Guidelines
*When the backlog is empty, follow these guidelines to innovate.*

1. **Stay On-Brand:** New pages must fit the established vibe
2. **Enhance the Core:** Support the site mission
3. **Naming Convention:** Use lowercase, descriptive filenames

### Ideas to Explore
*Pick one, build it, then REMOVE it from this list.*

- [ ] `stats.html` - [Description]
- [ ] `settings.html` - [Description]

## 7. Rules of Engagement
1. Do not recreate pages in Section 4
2. Always update `next-prompt.md` before completing
3. Consume ideas from Section 6 when you use them
```

## DESIGN.md Template

Generate this using the `design-md` skill from an existing Stitch screen, or create manually:

```markdown
# Design System: [Project Name]
**Project ID:** [Stitch Project ID]

## 1. Visual Theme & Atmosphere
[Describe mood, density, aesthetic philosophy]

## 2. Color Palette & Roles
- **[Descriptive Name]** (#hexcode) – [Functional role]
- **[Descriptive Name]** (#hexcode) – [Functional role]

## 3. Typography Rules
[Font family, weights, sizes, spacing]

## 4. Component Stylings
* **Buttons:** [Shape, color, behavior]
* **Cards:** [Corners, background, shadows]
* **Inputs:** [Stroke, background, focus states]

## 5. Layout Principles
[Whitespace strategy, margins, grid alignment]

## 6. Design System Notes for Stitch Generation
**Copy this block into every baton prompt:**

**DESIGN SYSTEM (REQUIRED):**
- Platform: [Web/Mobile], [Desktop/Mobile]-first
- Theme: [Dark/Light], [descriptors]
- Background: [Description] (#hex)
- Primary Accent: [Description] (#hex)
- Text Primary: [Description] (#hex)
- Font: [Description]
- Layout: [Description]
```
