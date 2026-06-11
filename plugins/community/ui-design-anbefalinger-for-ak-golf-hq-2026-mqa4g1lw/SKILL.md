# UI Design Anbefalinger for AK Golf HQ (2026)

> Basert på web-research og ui-ux-pro-max skill. Oppdatert juni 2026.

---

## 1. Sports/Fitness App UI — Beste Praksis

### Designprinsipper

| Prinsipp | Beskrivelse |
|----------|-------------|
| **Minimalisme** | Ikke overbelast med unødvendige detaljer — fokus på klarhet |
| **Personalisering** | Tilpass innhold til spiller (HCP, mål, treningshistorikk) |
| **Konsistens** | Samme mønstre på tvers av alle skjermer |
| **Sterke visuelle elementer** | Klare grafer, tydelige KPIer, meningsfulle ikoner |

### Nøkkelfunksjoner for golf-app

1. **Personlig dashboard** — Vis HCP-utvikling, treningsmål, kommende økter
2. **Aktivitetstracking** — Integrer med HealthKit/Google Fit for helsedata
3. **Sosial deling** — La spillere dele prestasjoner og runder
4. **Kartvisualisering** — Vis baner, dispersion, slagplassering
5. **Wearable-integrasjon** — Apple Watch, Garmin for sanntidsdata

### Progress-visualisering

- **Sirkulære fremgangs-indikatorer** (Apple Watch-stil) er gullstandarden
- Kommuniserer fremgang intuitivt med ett blikk
- Vibrant farger: **grønn** (fremgang), **oransje** (energi), **blå** (data)

---

## 2. Dashboard Design Patterns

### Layout-prinsipper

```
┌─────────────────────────────────────────────┐
│  HEADER: Hilsen + Dato + Primær CTA         │
├─────────────────────────────────────────────┤
│  KPI-STRIPE: 3-4 nøkkeltall                 │
├─────────────────────────────────────────────┤
│  HOVEDINNHOLD: Kalender / Aktiviteter       │
├─────────────────────────────────────────────┤
│  SEKUNDÆRT: Oppfølging / Varsler            │
└─────────────────────────────────────────────┘
```

### KPI-kort beste praksis

- **Tabular nums** (`font-variant-numeric: tabular-nums`) for tall
- **Trend-indikator** (↑/↓) med farge (grønn/rød)
- **Eyebrow** label i mono-font, uppercase
- **Max 4 KPIer** per stripe — mer er overveldende

### Data-visualisering

| Datatype | Anbefalt chart |
|----------|----------------|
| Trend over tid | Line chart |
| Sammenligning | Bar chart |
| Fordeling | Donut/Pie (maks 5 kategorier) |
| Prestasjon vs mål | Progress bar / Gauge |
| Dispersion | Scatter plot |

---

## 3. Mobile-First Design

### Touch Targets

- **Minimum 44×44pt** (iOS) / **48×48dp** (Android)
- **8px+ mellomrom** mellom touch targets
- Bruk `hitSlop` hvis visuelt ikon er mindre

### Navigasjon

- **Bottom tab bar**: maks 5 items med ikon + label
- **Aktiv state**: tydelig markert med primary-farge
- **Badge** på Coach-tab for uleste meldinger

### Thumb-zone

```
┌─────────────────────┐
│    ████ HARD ████   │  ← Sekundært innhold
│                     │
│    ████ OK ████     │  ← Hovedinnhold
│                     │
│  ████ EASY ████     │  ← Primærhandlinger
│  [Tab] [Tab] [Tab]  │
└─────────────────────┘
```

### Gestures

- Swipe-back for navigasjon (iOS standard)
- Pull-to-refresh på lister
- Swipe-to-dismiss på modaler

---

## 4. Dark Mode Best Practices

### Farger

| Element | Light Mode | Dark Mode |
|---------|------------|-----------|
| Bakgrunn | #FAFAF7 (cream) | #0A0F0D (mørk grønn) |
| Card | #FFFFFF | #141A17 |
| Tekst | #0A1F17 | #E8E6E1 |
| Border | #E5E3DD | #1E2620 |
| Muted | #F1EEE5 | #2A3530 |

### Regler

1. **Unngå ren svart** (#000000) — bruk mørk grå eller navy
2. **Unngå ren hvit tekst** (#FFFFFF) — bruk off-white (#E8E6E1)
3. **Kontrast ≥ 4.5:1** for normal tekst, ≥ 3:1 for stor tekst
4. **Dempede accent-farger** — neon på mørk bakgrunn er for sterkt
5. **Design med hensikt** — ikke bare inverter lyst tema

### Elevation i Dark Mode

```
Level 0: #0A0F0D (bakgrunn)
Level 1: #141A17 (cards)
Level 2: #1E2620 (elevated cards)
Level 3: #2A3530 (hover states)
Level 4: #374151 (aktiv/selected)
```

---

## 5. Anbefalt Typografi

### Font-pairing for Sports/Fitness

| Heading | Body | Mono | Bruk |
|---------|------|------|------|
| **Inter Tight** | **Inter** | **JetBrains Mono** | AK Golf (nåværende) |
| **Barlow Condensed** | **Barlow** | **Space Mono** | Mer atletisk/energisk |
| **Outfit** | **Inter** | **IBM Plex Mono** | Modern SaaS |

### Typeskala

```css
--text-xs: 12px;    /* labels, meta */
--text-sm: 14px;    /* secondary */
--text-base: 16px;  /* body */
--text-lg: 18px;    /* lead */
--text-xl: 20px;    /* section title */
--text-2xl: 24px;   /* card title */
--text-3xl: 32px;   /* page title */
--text-4xl: 48px;   /* hero */
```

---

## 6. Animasjon og Motion

### Timing

| Type | Varighet | Easing |
|------|----------|--------|
| Micro-interaction | 150-200ms | ease-out |
| State change | 200-300ms | ease-in-out |
| Page transition | 300-400ms | spring |
| Modal enter | 250ms | ease-out |
| Modal exit | 150ms | ease-in |

### Regler

- **`prefers-reduced-motion`** — alltid respekter
- **Exit raskere enn enter** (60-70% av enter-varighet)
- **Interruptible** — animasjoner må kunne avbrytes
- **Transform/opacity** — unngå å animere width/height

---

## 7. Accessibility Checklist

- [ ] Kontrast ≥ 4.5:1 for tekst
- [ ] Touch targets ≥ 44×44pt
- [ ] Focus states synlige (ring)
- [ ] Alt-tekst på bilder
- [ ] Aria-labels på icon-only buttons
- [ ] Keyboard-navigerbar
- [ ] Screen reader-vennlig rekkefølge
- [ ] Farge ikke eneste indikator
- [ ] Respekter Dynamic Type (iOS)
- [ ] Respekter reduced-motion

---

## 8. Pre-Delivery Sjekkliste

### Visuell kvalitet
- [ ] Ingen emojis som ikoner (bruk Lucide SVG)
- [ ] Konsistent ikon-familie
- [ ] Offisielle brand assets
- [ ] Hover/pressed states uten layout-shift

### Interaksjon
- [ ] Tydelig pressed feedback (150-200ms)
- [ ] Touch targets oppfyller minimum
- [ ] Disabled states er klare
- [ ] Screen reader focus order matcher visuell

### Layout
- [ ] Safe areas respektert
- [ ] Testet på 375px, 768px, 1024px, 1440px
- [ ] 8px spacing rhythm
- [ ] Ingen horisontal scroll på mobil

---

## Kilder

- [Fitness App UI/UX Design 2026 | Fireart](https://fireart.studio/blog/user-interface-design-for-a-fitness-app/)
- [Dark Mode Done Right: Best Practices for 2026 | Medium](https://medium.com/@social_7132/dark-mode-done-right-best-practices-for-2026-c223a4b92417)
- [Golf App designs | Dribbble](https://dribbble.com/tags/golf-app)
- [Golf App UI Design | Behance](https://www.behance.net/search/projects/golf%20app%20ui%20design)
- [Fitness App UI | Mobbin](https://mobbin.com/explore/mobile/app-categories/health-fitness)
- [Dark Mode Dashboard Design | Qodequay](https://www.qodequay.com/dark-mode-dashboards)
- [60+ Best Mobile apps 2026 | Muzli](https://muz.li/inspiration/mobile-app-design-inspiration/)

---

*Generert juni 2026 med ui-ux-pro-max skill + web research*

## Provenance

Formalized by Open Design from candidate c6c16ba5-8d23-4dae-9f94-1e98378c9b2e.
