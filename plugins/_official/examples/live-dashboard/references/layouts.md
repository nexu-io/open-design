# Layouts

Pick exactly **one** layout. State your choice in your reply before
emitting `index.html`.

All three share the same shell from `assets/template.html`:
`grid-template-columns: 240px 1fr` (sidebar + main), a 44px topbar, a
56px page top padding, and a max-width of 1100px on the page column.

---

## A · Classic dashboard (default)

Vertical stack inside the page column, in this order:

1. **Page header** (emoji + title + meta row)
2. **Live-Artifact callout**
3. **KPI grid** — 1 row × N (where N = `inputs.kpi_count`),
   1px hairline grid
4. **Two-column block** — `1.1fr 1fr`:
   - left: **Tasks created · last 7 days** sparkline card
   - right: **Recent activity** feed card
5. **Linked database** — `Tasks · Active sprint`
6. **Footer**

Use this when:
- The user said "team dashboard" / "ops dashboard" without further qualifier.
- The user wants a generalist Notion-like landing page for a team
  workspace.

This is what `example.html` ships.

---

## B · Kanban-flavored

Same shell, but replace the linked database (step 5) with a **3-column
kanban board**:

```
┌── To do ───────┐ ┌── In progress ─┐ ┌── In review ───┐
│ card           │ │ card           │ │ card           │
│ card           │ │ card (changed) │ │ card           │
│ + add          │ │ card           │ │ card           │
└────────────────┘ └────────────────┘ └────────────────┘
```

Cards are 1px-bordered, 12px padding, with: emoji row + title (medium
weight) + assignee chip + due date.

Use this when:
- The user explicitly said "kanban", "sprint board", "backlog view".
- `inputs.include_task_table` is true *and* the user mentioned drag /
  swimlane / column.

The Live behavior stays the same: cards animate from one column to the
next on refresh (250ms ease-out translate, plus a 600ms accent
left-border on the moved card).

---

## C · KPI-only hero

Drop the database entirely. The page is **just**:

1. Page header
2. Callout (slightly taller — explain the data range)
3. **Hero KPI grid**: 2 × 2 with 32px → 56px font-size on the numbers
   (use `display_scale` parameter)
4. The sparkline spans full width (no two-column split)
5. Activity feed becomes a single horizontal ticker (3 visible rows max,
   auto-scrolls every 8s)
6. Footer

Use this when:
- `inputs.include_task_table === false`.
- The user said "exec summary", "morning standup", "weekly snapshot".
- The user wants something to throw on a TV in the office.

---

## Density & responsive notes (apply to all three)

- The `density` parameter controls the gap between blocks (callout →
  KPIs → two-column → DB) — 8px low, 36px high. Default 18.
- Below 980px viewport, sidebar hides, the page padding drops to 20px,
  KPI grid becomes 2-up, and the two-column block stacks.
- Below 640px, the linked database hides `due` and `priority` columns
  and the kanban becomes a 1-column vertical scroll.
- Honor `prefers-reduced-motion: reduce` everywhere — disable tweens,
  pulses, kanban-card translate, ticker auto-scroll, and the live-pill
  pulse.
