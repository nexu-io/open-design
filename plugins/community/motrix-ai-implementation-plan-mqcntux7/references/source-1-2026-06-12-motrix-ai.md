# Motrix AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single production-quality `index.html` implementing the Motrix AI desktop download manager — 4 screens with dark/light theme, micro-interactions, and premium design.

**Architecture:** Single self-contained HTML file with inline `<style>` (CSS custom properties for theming, component classes, animations) and inline `<script>` (screen navigation, theme toggle, mock data, micro-interactions). Zero external dependencies beyond Google Fonts.

**Tech Stack:** HTML5 + CSS3 (no frameworks) + vanilla JS. Google Fonts: Inter (display/body) + JetBrains Mono (code/stats).

---

### Task 1: HTML Shell + CSS Design Tokens

**Files:**
- Create: `index.html`

- [ ] **Step 1: Write the HTML shell, font imports, and CSS reset**

```html
<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Motrix AI</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    :root { /* dark tokens */ }
    [data-theme="light"] { /* light override tokens */ }
    body { font-family: 'Inter', system-ui, sans-serif; background: var(--bg); color: var(--fg); }
  </style>
</head>
<body>
  <!-- screen containers -->
  <script>
    // JS lives here
  </script>
</body>
</html>
```

- [ ] **Step 2: Define full CSS custom properties for dark theme**

```css
:root {
  --bg: #0A0A0B;
  --surface: #1F2937;
  --surface-hover: #253244;
  --fg: #F9FAFB;
  --muted: #6B7280;
  --border: #374151;
  --primary: #3B82F6;
  --primary-hover: #2563EB;
  --accent: #10B981;
  --warning: #F59E0B;
  --error: #EF4444;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --font-ui: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.4);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.5);
  --transition: 200ms cubic-bezier(0.2, 0, 0, 1);
}
```

- [ ] **Step 3: Define CSS custom properties for light theme**

```css
[data-theme="light"] {
  --bg: #FAFAFA;
  --surface: #F3F4F6;
  --surface-hover: #E5E7EB;
  --fg: #111827;
  --muted: #6B7280;
  --border: #E5E7EB;
  --primary: #3B82F6;
  --primary-hover: #2563EB;
  --accent: #10B981;
  --warning: #F59E0B;
  --error: #EF4444;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.06);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.08);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.12);
}
```

- [ ] **Step 4: Write global layout + scrollbar styles**

```css
html, body { height: 100%; overflow: hidden; }
body { display: flex; align-items: center; justify-content: center; }
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
```

### Task 2: Screen Navigation System

**Files:**
- Modify: `index.html` (add navigation controls + JS)

- [ ] **Step 1: Add data-view attributes to each screen section**

```html
<section class="screen" data-view="main">...</section>
<section class="screen" data-view="onboarding">...</section>
<!-- settings and detail are modal overlays shown over main -->
```

- [ ] **Step 2: Write navigation JS**

```js
function showView(view) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.querySelector(`[data-view="${view}"]`);
  if (target) target.classList.add('active');
}
```

- [ ] **Step 3: Add CSS for screen transitions and active state**

```css
.screen { display: none; opacity: 0; transition: opacity 300ms ease; }
.screen.active { display: flex; opacity: 1; }
```

### Task 3: Screen 4 — Onboarding Flow

**Files:**
- Modify: `index.html` (add onboarding markup + styles)

- [ ] **Step 1: Write onboarding 3-step wizard markup**

3 steps: Welcome screen → Quick Setup (directory + language) → First-demo prompt.

- [ ] **Step 2: Style onboarding — centered card, step indicators, progress dots**

Centered on dark bg, large logo, subtle slide transition between steps, progress dots at bottom.

- [ ] **Step 3: Write onboarding JS — step navigation + "Get Started" transition**

```js
let onboardingStep = 0;
function nextOnboardingStep() { /* advance, at end → showView('main') */ }
```

### Task 4: Screen 1 — Main Chat View (Left Panel)

**Files:**
- Modify: `index.html` (add main view markup)

- [ ] **Step 1: Write app chrome bar**

Logo "Motrix AI" with download icon, theme toggle (sun/moon SVG), settings gear icon, window controls (minimize/maximize/close dots).

- [ ] **Step 2: Write chat messages area with mock data**

Pre-populated conversation: user messages (right-aligned blue bubbles), AI responses (left-aligned, avatar + surface bubble), resource cards within AI messages showing file name/size/source with "Download" button.

- [ ] **Step 3: Write input bar + quick action chips**

Text input with placeholder "Describe what you want to download...", send button (blue), attachment button. Chips above: "Download from URL", "Check queue", "Pause all".

- [ ] **Step 4: Style left panel — chat bubbles, resource cards, input**

Chat bubbles: user = `var(--primary)` bg, right-aligned, radius 8px. AI = `var(--surface)` bg, left-aligned with 32px avatar circle. Resource cards = elevated `var(--surface)` with border, action buttons = primary outline. Input = `var(--surface)` with `var(--border)` outline, focus ring `var(--primary)`.

### Task 5: Screen 1 — Task List (Right Sidebar)

**Files:**
- Modify: `index.html` (add sidebar markup)

- [ ] **Step 1: Write sidebar header + filter tabs**

Header: "Downloads" with count badge (blue pill). Tabs: All | Active | Completed | Failed.

- [ ] **Step 2: Write task cards with mock data**

5-6 mock tasks: file icon (by type: video, doc, torrent), title, animated gradient progress bar, speed (↓ XX MB/s), percentage, status badge (colored pill). Status colors match spec: downloading=blue, paused=amber, completed=green, failed=red.

- [ ] **Step 3: Write hover states for task cards**

On hover: reveal action buttons (pause/play, retry, delete) in a row at the bottom of each card.

- [ ] **Step 4: Write sidebar bottom bar + empty state**

Bottom: total speed indicator + "3 active tasks" text. Empty state for when no downloads exist (hidden by default): illustration placeholder + "No downloads yet" message.

- [ ] **Step 5: Style sidebar + animated progress bars**

Progress bar: height 4px, `var(--primary)` gradient fill, rounded ends, `@keyframes shimmer` for animated gradient sweep. Task cards: `var(--surface)` bg, `var(--radius-md)`, padding 16px, `var(--shadow-sm)`.

### Task 6: Screen 2 — Task Detail Modal

**Files:**
- Modify: `index.html` (add task detail panel/modal)

- [ ] **Step 1: Write task detail overlay markup**

Full-screen backdrop with centered/right-slide panel. Large animated SVG progress ring. Stats grid: Downloaded/Total, Speed, ETA, Connections, Seeders, Leechers.

- [ ] **Step 2: Write file list + timeline + action bar**

File list rows for multi-file torrent (checkbox + filename + size). Timeline cards showing lifecycle events. Action buttons: Pause, Resume, Retry Priority, Cancel (danger).

- [ ] **Step 3: Animate progress ring**

SVG circle with `stroke-dasharray`/`stroke-dashoffset` animation. CSS transition on the circumference.

- [ ] **Step 4: Style detail panel**

Panel: `var(--surface)` bg, `var(--radius-lg)`, side padding. Progress ring centered at top. Stats in a 3×2 CSS grid. Timeline entries with connecting dots.

### Task 7: Screen 3 — Settings

**Files:**
- Modify: `index.html` (add settings screen)

- [ ] **Step 1: Write settings layout — sidebar tabs + content area**

Left sidebar (240px): vertical tab list — AI Model, Downloads, Schedule, Disk Protection, Subtitles, Devices, Appearance. Right panel: scrollable content.

- [ ] **Step 2: Write each tab's content**

AI Model: current model display, selector dropdown, BYOK API key inputs.
Downloads: directory path with "Change" button, file-type mapping table.
Schedule: visual 24h timeline with draggable speed-limit segments.
Disk Protection: threshold sliders with current value labels.
Subtitles: language priority list with drag handles, source toggles.
Devices: NAS connection card (host + path inputs, "Test Connection" button).
Appearance: theme radio cards (Dark/Light/System), accent color swatches.

- [ ] **Step 3: Style settings — tabs, form controls, schedule bar**

Tab active state: left border accent (`var(--primary)`). Form controls: dark inputs at `var(--surface)`, focus ring. Schedule bar: horizontal 24h strip with segmented colored blocks.

### Task 8: Polish — Animations, Transitions, Micro-interactions

**Files:**
- Modify: `index.html` (add animations)

- [ ] **Step 1: Add message entrance animation**

Chat bubbles slide in from bottom with `@keyframes messageIn { from { transform: translateY(12px); opacity: 0; } }`.

- [ ] **Step 2: Add modal spring animation**

```css
@keyframes modalIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
```

- [ ] **Step 3: Add progress bar shimmer**

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

- [ ] **Step 4: Add hover + focus + active micro-interactions**

Button scale on press (transform: scale(0.97)), card lift on hover (translateY(-2px)), focus ring with `box-shadow` transition.

### Task 9: Self-Check + Critique

**Files:**
- Read: `index.html`

- [ ] **Step 1: Verify all 4 screens render correctly**

Check: onboarding flow → main chat view → task detail modal → settings. Verify navigation works.

- [ ] **Step 2: Verify dark/light theme toggle**

Check: all CSS variables switch correctly. No hardcoded colors outside `:root`.

- [ ] **Step 3: 5-dimension critique**

Score each: Philosophy (premium not utility?), Hierarchy (one focal point per screen?), Execution (spacing, alignment, contrast?), Specificity (no filler copy?), Restraint (one accent at most twice?). Fix any < 3/5.

- [ ] **Step 4: Emit `<artifact>` with final `index.html`**

