# Von Airtable inspiriertes Designsystem

> Category: Design & Kreatives
> Hybrid aus Tabellenkalkulation und Datenbank. Farbenfroh, freundlich, strukturierte Datenästhetik.

## 1. Visuelles Thema & Atmosphäre

Airtables Website ist eine klare, unternehmensfreundliche Plattform, die durch eine weiße Leinwand mit tiefem Marineblau-Text (`#181d26`) und Airtable Blue (`#1b61c9`) als primären interaktiven Akzent „anspruchsvolle Schlichtheit" vermittelt. Die Haas-Schriftfamilie (Display- + Text-Varianten) schafft mit durchgehend positivem Buchstabenabstand ein typografisches System in Schweizer Präzisionsmanier.

**Hauptmerkmale:**
- Weiße Leinwand mit tiefem Marineblau-Text (`#181d26`)
- Airtable Blue (`#1b61c9`) als primäre CTA- und Link-Farbe
- Duales Schriftsystem Haas + Haas Groot Disp
- Positiver Buchstabenabstand im Fließtext (0.08px–0.28px)
- Buttons mit 12px Radius, Karten 16px–32px
- Blaugetöntes Mehrschicht-Schatten: `rgba(45,127,249,0.28) 0px 1px 3px`
- Semantische Theme-Tokens: `--theme_*` CSS-Variablennamensgebung

## 2. Farbpalette & Rollen

### Primär
- **Tiefes Marineblau** (`#181d26`): Primärer Text
- **Airtable Blue** (`#1b61c9`): CTA-Buttons, Links
- **Weiß** (`#ffffff`): Primäre Oberfläche
- **Spotlight** (`rgba(249,252,255,0.97)`): `--theme_button-text-spotlight`

### Semantisch
- **Erfolgsgrün** (`#006400`): `--theme_success-text`
- **Schwacher Text** (`rgba(4,14,32,0.69)`): `--theme_text-weak`
- **Sekundär Aktiv** (`rgba(7,12,20,0.82)`): `--theme_button-text-secondary-active`

### Neutral
- **Dunkelgrau** (`#333333`): Sekundärer Text
- **Mittelblau** (`#254fad`): Link-/Akzentblau-Variante
- **Rahmen** (`#e0e2e6`): Kartenrahmen
- **Helle Oberfläche** (`#f8fafc`): Subtile Oberfläche

### Schatten
- **Blaugetönt** (`rgba(0,0,0,0.32) 0px 0px 1px, rgba(0,0,0,0.08) 0px 0px 2px, rgba(45,127,249,0.28) 0px 1px 3px, rgba(0,0,0,0.06) 0px 0px 0px 0.5px inset`)
- **Weich** (`rgba(15,48,106,0.05) 0px 0px 20px`)

## 3. Typografieregeln

### Schriftfamilien
- **Primär**: `Haas`, Fallbacks: `-apple-system, system-ui, Segoe UI, Roboto`
- **Display**: `Haas Groot Disp`, Fallback: `Haas`

### Hierarchie

| Rolle | Schrift | Größe | Stärke | Zeilenhöhe | Buchstabenabstand |
|------|------|------|--------|-------------|----------------|
| Display Hero | Haas | 48px | 400 | 1.15 | normal |
| Display Fett | Haas Groot Disp | 48px | 900 | 1.50 | normal |
| Abschnittsüberschrift | Haas | 40px | 400 | 1.25 | normal |
| Unterüberschrift | Haas | 32px | 400–500 | 1.15–1.25 | normal |
| Kartentitel | Haas | 24px | 400 | 1.20–1.30 | 0.12px |
| Feature | Haas | 20px | 400 | 1.25–1.50 | 0.1px |
| Fließtext | Haas | 18px | 400 | 1.35 | 0.18px |
| Fließtext Medium | Haas | 16px | 500 | 1.30 | 0.08–0.16px |
| Button | Haas | 16px | 500 | 1.25–1.30 | 0.08px |
| Bildunterschrift | Haas | 14px | 400–500 | 1.25–1.35 | 0.07–0.28px |

## 4. Komponenten-Styling

### Buttons
- **Primär Blau**: `#1b61c9`, weißer Text, 16px 24px Innenabstand, 12px Radius
- **Weiß**: weißer Hintergrund, `#181d26`-Text, 12px Radius, 1px weißer Rahmen
- **Cookie-Zustimmung**: `#1b61c9`-Hintergrund, 2px Radius (scharf)

### Karten: `1px solid #e0e2e6`, 16px–24px Radius
### Eingabefelder: Standard-Haas-Styling

## 5. Layout
- Abstände: 1–48px (8px Basis)
- Radius: 2px (klein), 12px (Buttons), 16px (Karten), 24px (Abschnitte), 32px (groß), 50% (Kreise)

## 6. Tiefe
- Blaugetöntes Mehrschicht-Schatten-System
- Weicher Umgebungsschatten: `rgba(15,48,106,0.05) 0px 0px 20px`

## 7. Empfehlungen und Verbote
### Empfohlen: Airtable Blue für CTAs verwenden, Haas mit positivem Tracking, 12px-Radius-Buttons
### Verboten: Positiven Buchstabenabstand weglassen, schwere Schatten verwenden

## 8. Responsives Verhalten
Breakpoints: 425–1664px (23 Breakpoints)

## 9. Agent-Prompt-Leitfaden
- Text: Tiefes Marineblau (`#181d26`)
- CTA: Airtable Blue (`#1b61c9`)
- Hintergrund: Weiß (`#ffffff`)
- Rahmen: `#e0e2e6`
