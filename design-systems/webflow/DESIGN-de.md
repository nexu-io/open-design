# Von Webflow inspiriertes Designsystem

> Category: Design & Kreatives
> Visueller Web-Builder. Blau-akzentuierte, polierte Marketing-Site-Ästhetik.

## 1. Visuelles Thema & Atmosphäre

Die Webflow-Website ist eine visuell reichhaltige, werkzeugorientierte Plattform, die „Design ohne Code" durch saubere weiße Oberflächen, das charakteristische Webflow-Blau（`#146ef5`）und eine reichhaltige sekundäre Farbpalette（Lila, Pink, Grün, Orange, Gelb, Rot）kommuniziert. Die benutzerdefinierte Schrift WF Visual Sans Variable schafft mit Stärke 600 für Display-Text und 500 für den Fließtext ein selbstbewusstes, präzises Typografiesystem.

**Hauptmerkmale：**
- Weißes Canvas mit nahezu schwarzem（`#080808`）Text
- Webflow-Blau（`#146ef5`）als primäre Marken- und Interaktionsfarbe
- WF Visual Sans Variable——benutzerdefinierte variable Schrift mit Stärke 500–600
- Reichhaltige Sekundärpalette：Lila `#7a3dff`, Pink `#ed52cb`, Grün `#00d722`, Orange `#ff6b00`, Gelb `#ffae13`, Rot `#ee1d36`
- Konservative Rahmenradien von 4px–8px——scharf, nicht gerundet
- Mehrstufige Schatten-Stacks（5-schichtige kaskadierte Schatten）
- Großbuchstaben-Labels：10px–15px, Stärke 500–600, großzügiger Buchstabenabstand（0,6px–1,5px）
- translate(6px)-Hover-Animation auf Schaltflächen

## 2. Farbpalette & Rollen

### Primär
- **Nahezu Schwarz**（`#080808`）：Primärer Text
- **Webflow-Blau**（`#146ef5`）：`--_color---primary--webflow-blue`, primärer CTA und Links
- **Blau 400**（`#3b89ff`）：`--_color---primary--blue-400`, helleres interaktives Blau
- **Blau 300**（`#006acc`）：`--_color---blue-300`, dunklere Blauvariante
- **Schaltflächen-Hover-Blau**（`#0055d4`）：`--mkto-embed-color-button-hover`

### Sekundäre Akzente
- **Lila**（`#7a3dff`）：`--_color---secondary--purple`
- **Pink**（`#ed52cb`）：`--_color---secondary--pink`
- **Grün**（`#00d722`）：`--_color---secondary--green`
- **Orange**（`#ff6b00`）：`--_color---secondary--orange`
- **Gelb**（`#ffae13`）：`--_color---secondary--yellow`
- **Rot**（`#ee1d36`）：`--_color---secondary--red`

### Neutral
- **Grau 800**（`#222222`）：Dunkler Sekundärtext
- **Grau 700**（`#363636`）：Mittlerer Text
- **Grau 300**（`#ababab`）：Gedämpfter Text, Platzhalter
- **Mittelgrau**（`#5a5a5a`）：Linktext
- **Rahmengrau**（`#d8d8d8`）：Rahmen, Trennlinien
- **Rahmen-Hover**（`#898989`）：Hover-Rahmen

### Schatten
- **5-schichtiger Kaskade**：`rgba(0,0,0,0) 0px 84px 24px, rgba(0,0,0,0.01) 0px 54px 22px, rgba(0,0,0,0.04) 0px 30px 18px, rgba(0,0,0,0.08) 0px 13px 13px, rgba(0,0,0,0.09) 0px 3px 7px`

## 3. Typografieregeln

### Schrift：`WF Visual Sans Variable`, Fallback：`Arial`

| Rolle | Größe | Stärke | Zeilenhöhe | Buchstabenabstand | Hinweise |
|------|------|--------|-------------|----------------|-------|
| Display-Hero | 80px | 600 | 1,04 | -0,8px | |
| Abschnittsüberschrift | 56px | 600 | 1,04 | normal | |
| Unterüberschrift | 32px | 500 | 1,30 | normal | |
| Feature-Titel | 24px | 500–600 | 1,30 | normal | |
| Fließtext | 20px | 400–500 | 1,40–1,50 | normal | |
| Standard-Fließtext | 16px | 400–500 | 1,60 | -0,16px | |
| Schaltfläche | 16px | 500 | 1,60 | -0,16px | |
| Großbuchstaben-Label | 15px | 500 | 1,30 | 1,5px | uppercase |
| Beschriftung | 14px | 400–500 | 1,40–1,60 | normal | |
| Badge-Großbuchstaben | 12,8px | 550 | 1,20 | normal | uppercase |
| Mikro-Großbuchstaben | 10px | 500–600 | 1,30 | 1px | uppercase |
| Code：Inconsolata（begleitende Monospace-Schrift）

## 4. Komponenten-Styling

### Schaltflächen
- Transparent：Text `#080808`, translate(6px) beim Hover
- Weißer Kreis：Radius 50%, weißer Hintergrund
- Blauer Badge：`#146ef5` Hintergrund, Radius 4px, Stärke 550

### Karten：`1px solid #d8d8d8`, Radius 4px–8px
### Badges：Blaustichiger Hintergrund bei 10% Deckkraft, Radius 4px

## 5. Layout
- Abstände：Bruchzahlskala（1px, 2,4px, 3,2px, 4px, 5,6px, 6px, 7,2px, 8px, 9,6px, 12px, 16px, 24px）
- Radius：2px, 4px, 8px, 50%——konservativ, scharf
- Breakpoints：479px, 768px, 992px

## 6. Tiefe：5-schichtiges kaskadiertes Schattensystem

## 7. Was man tun und lassen sollte
- Tun：WF Visual Sans Variable mit Stärke 500–600 verwenden. Blau（`#146ef5`）für CTAs. Radius 4px. translate(6px) beim Hover.
- Lassen：Funktionale Elemente nicht über 8px runden. Sekundärfarben nicht für primäre CTAs verwenden.

## 8. Responsiv：479px, 768px, 992px

## 9. Agent-Prompt-Leitfaden
- Text：Nahezu Schwarz（`#080808`）
- CTA：Webflow-Blau（`#146ef5`）
- Hintergrund：Weiß（`#ffffff`）
- Rahmen：`#d8d8d8`
- Sekundär：Lila `#7a3dff`, Pink `#ed52cb`, Grün `#00d722`
