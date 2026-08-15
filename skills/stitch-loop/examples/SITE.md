---
stitch-project-id: 13534454087919359824
---
# Project Vision & Constitution

> **AGENT INSTRUCTION:** Read this file before every iteration. It serves as the project's "Long-Term Memory." If `next-prompt.md` is empty, pick the highest priority item from Section 5 OR invent a new page that fits the project vision.

## 1. Core Identity
* **Project Name:** Oakwood Furniture Co.
* **Stitch Project ID:** `13534454087919359824`
* **Mission:** A premium online furniture showroom showcasing handcrafted, sustainable wood furniture.
* **Target Audience:** Design-conscious homeowners, interior designers, eco-minded buyers.
* **Voice:** Warm, refined, artisanal, and trustworthy.

## 2. Visual Language (Stitch Prompt Strategy)
*Strictly adhere to these descriptive rules when prompting Stitch. Do NOT use code.*

* **The "Vibe" (Adjectives):**
    * *Primary:* **Warm** (Inviting, cozy, natural materials).
    * *Secondary:* **Minimal** (Clean layouts, breathing room, gallery-like).
    * *Tertiary:* **Artisanal** (Handcrafted feel, attention to detail).

* **Color Philosophy (Semantic):**
    * **Backgrounds:** Warm barely-there cream (#FCFAFA). Soft, inviting canvas.
    * **Accents:** Deep muted teal-navy (#294056) for CTAs and highlights.
    * **Text:** Charcoal near-black (#2C2C2C) for headlines, soft gray (#6B6B6B) for body.

## 3. Architecture & File Structure
* **Root:** `site/public/`
* **Asset Flow:** Stitch generates to `queue/` -> Validate -> Move to `site/public/`.
* **Navigation Strategy:**
    * **Global Header:** Logo, Shop, Collections, About, Contact.
    * **Global Footer:** Sustainability, Craftsmanship, Shipping Info, Social Links.

## 4. Live Sitemap (Current State)
*The Agent MUST update this section when a new page is successfully merged.*

* [x] `index.html` - Homepage with hero and featured collections.
* [x] `collections.html` - Overview of furniture categories.
* [x] `about.html` - Our story and craftsmanship philosophy.
* [ ] `contact.html` - Contact form and showroom locations.

## 5. The Roadmap (Backlog)
*If `next-prompt.md` is empty or completed, pick the next task from here.*

### High Priority
- [ ] **Product Detail Page:** Template for individual furniture items.
- [ ] **Contact Page:** Contact form with showroom map.

### Medium Priority
- [ ] **Sustainability Page:** Our commitment to eco-friendly practices.
- [ ] **Care Guide:** How to maintain wood furniture.

## 6. Creative Freedom Guidelines
*When the backlog is empty, follow these guidelines to innovate.*

1. **Stay On-Brand:** New pages must fit the "Warm + Minimal + Artisanal" vibe.
2. **Enhance the Core:** Support the furniture shopping experience.
3. **Naming Convention:** Use lowercase, descriptive filenames.

### Ideas to Explore
*Pick one, build it, then REMOVE it from this list.*

- [ ] `materials.html` - Showcase of wood types and finishes
- [ ] `custom.html` - Custom furniture ordering process
- [ ] `gallery.html` - Customer homes featuring our furniture
- [ ] `blog.html` - Design tips and furniture care articles

## 7. Rules of Engagement
1. Do not recreate pages in Section 4.
2. Always update `next-prompt.md` before completing.
3. Consume ideas from Section 6 when you use them.
4. Keep the loop moving.
