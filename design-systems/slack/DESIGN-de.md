# Von Slack inspiriertes Design-System

> Category: Produktivität & SaaS
> Plattform für die Kommunikation am Arbeitsplatz. Aubergine als Primärfarbe, mehrfarbige Logo-Palette, helle Oberflächen mit dunkler Seitenleiste, warm und einladend.

## 1. Visuelles Thema und Atmosphäre

Slacks Identität basiert auf der Idee, dass Arbeit menschlich und sogar ein bisschen Spaß machen sollte. Die charakteristische Oberfläche ist **hell** — weiße Inhaltsbereiche mit einer tiefen Aubergine-Seitenleiste (`#4A154B`) — das Gegenteil von dunkel-zuerst-Tools. Dieser Kontrast ist bewusst gewählt: Die Seitenleiste ist ein ruhiger, immer präsenter Navigationsanker, während der Inhaltsbereich hell und offen ist.

Die Logo-Palette — blau, grün, gelb, rot — erscheint hauptsächlich im Hashtag-Icon und in Marketingkontexten, nicht verstreut durch die Benutzeroberfläche. Im Produkt selbst verwendet Slack ein zurückhaltendes, professionelles Farbsystem mit Aubergine als einzigem Markenanker.

**Hauptmerkmale:**
- Helle Inhaltsoberflächen zuerst: Weiß `#FFFFFF` und Nahweiß `#F8F8F8`
- Tiefes Aubergine `#4A154B` in der Seitenleiste — das markanteste UI-Element der Marke
- Vier Logo-Akzentfarben (blau, grün, gelb, rot) nur sparsam als Highlights verwendet
- Larsseit für Überschriften (Marketing), System-Serifenlos für die Benutzeroberfläche
- Abgerundet, aber nicht cartoonartig: 4–8px Radius bei den meisten Komponenten
- Dicht, aber luftig: kompakte Nachrichtenzeilen mit klarer Thread-Hierarchie
- Warmer und gesprächiger Ton — Emojis, Reaktionen und Illustrationen sind erstklassig

---

## 2. Farbpalette und Rollen

### Marken-Primärfarbe
| Token | Hex | Rolle |
|---|---|---|
| `--color-aubergine` | `#4A154B` | Seitenleistenhintergrund, Marken-Primärfarbe |
| `--color-aubergine-dark` | `#350d36` | Hover-Zustände auf Aubergine-Oberflächen |
| `--color-aubergine-light` | `#611f69` | Highlight für aktive Elemente in der Seitenleiste |

### Logo-Akzentfarben (sparsam verwenden — nur für Highlights, Icons, Marketing)
| Token | Hex | Name | Rolle |
|---|---|---|---|
| `--color-blue` | `#36C5F0` | Himmelblau | Kanal-Icons, Links, Info-Zustände |
| `--color-green` | `#2EB67D` | Grünblau | Online-Status, Erfolgszustände |
| `--color-yellow` | `#ECB22E` | Gold | Abwesend-Status, Warnungen, Highlights |
| `--color-red` | `#E01E5A` | Rubin | Benachrichtigungen, Fehler, Erwähnungs-Badge |

### Oberfläche und Hintergrund
| Token | Hex | Rolle |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | Hauptnachrichtenbereich, Modals |
| `--bg-secondary` | `#F8F8F8` | Thread-Panels, sekundäre Oberflächen |
| `--bg-tertiary` | `#F1F1F1` | Eingabehintergründe, Hover-Zustände |
| `--bg-sidebar` | `#4A154B` | Linke Seitenleiste (Aubergine) |
| `--bg-sidebar-hover` | `rgba(255,255,255,0.1)` | Hover auf Seitenleistenelementen |
| `--bg-sidebar-active` | `rgba(255,255,255,0.2)` | Aktives Seitenleistenelement |
| `--bg-message-hover` | `#F8F8F8` | Hover auf Nachrichtenzeilen |

### Textfarben
| Token | Hex | Rolle |
|---|---|---|
| `--text-primary` | `#1D1C1D` | Primärer Fließtext (nahschwarz) |
| `--text-secondary` | `#616061` | Zeitstempel, gedämpfte Beschriftungen |
| `--text-sidebar` | `rgba(255,255,255,0.9)` | Kanalnamen in der Seitenleiste |
| `--text-sidebar-muted` | `rgba(255,255,255,0.6)` | Inaktive Elemente in der Seitenleiste |
| `--text-link` | `#1264A3` | Inline-Links in Nachrichten |
| `--text-mention` | `#1264A3` | @Erwähnungs-Textfarbe |

### Semantische Farben
| Token | Hex | Rolle |
|---|---|---|
| `--color-success` | `#2EB67D` | Erfolgs-Toasts, positive Zustände |
| `--color-warning` | `#ECB22E` | Warnzustände |
| `--color-danger` | `#E01E5A` | Fehlerzustände, destruktive Aktionen |
| `--color-info` | `#36C5F0` | Informations-Highlights |

### Rahmen und Trennlinien
| Token | Hex | Rolle |
|---|---|---|
| `--border-default` | `#DDDDDD` | Standard-Trennlinien, Kartenrahmen |
| `--border-subtle` | `#F1F1F1` | Dezente Trennlinien zwischen Zeilen |
| `--border-focus` | `#1264A3` | Fokusring-Farbe |

---

## 3. Typografie-Regeln

### Schriftarten
| Rolle | Offiziell | Web-Fallback |
|---|---|---|
| Display / Marketing-Überschriften | Larsseit | `'Larsseit', 'Helvetica Neue', Arial, sans-serif` |
| UI / Text / Chrome | Slack Lato (angepasst) | `system-ui, -apple-system, BlinkMacSystemFont, sans-serif` |
| Code / Monospace | — | `'Monaco', 'Menlo', 'Courier New', monospace` |

> Slack verwendet **Larsseit** für Marketing-Überschriften und eine angepasste Lato-Variante für die produktinterne Benutzeroberfläche. Für Web-Einsatz ist `system-ui` der sicherste Fallback.

### Typografische Skala

| Ebene | Größe | Stärke | Zeilenhöhe | Buchstabenabstand | Verwendung |
|---|---|---|---|---|---|
| Display XL | 48px | 800 | 1.1 | -1px | Marketing-Hero-Überschriften |
| Display L | 36px | 700 | 1.15 | -0.5px | Abschnitts-Heroes |
| Heading 1 | 28px | 700 | 1.25 | normal | Modal-Titel, Seitenüberschriften |
| Heading 2 | 22px | 700 | 1.3 | normal | Kartentitel, Einstellungsabschnitte |
| Heading 3 | 18px | 700 | 1.35 | normal | Unterabschnittsüberschriften |
| Body L | 16px | 400 | 1.5 | normal | Nachrichtentext, Beschreibungen |
| Body | 15px | 400 | 1.46667 | normal | Standard-UI-Text (Slacks Basisgröße) |
| Body SM | 13px | 400 | 1.38462 | normal | Sekundäre Metadaten |
| Caption | 12px | 400 | 1.33 | normal | Zeitstempel, Hinweise |
| Code | 12px | 400 | 1.5 | normal | Inline-Code, Code-Blöcke |

### Typografie-Regeln
- Slacks Basis-Textgröße beträgt **15px** — etwas kleiner als 16px für mehr Dichte
- Ungelesene Kanäle: Stärke 700 — Fettschrift ist der primäre Ungelesen-Indikator
- Zeitstempel: 12px `--text-secondary`, nur beim Hover anzeigen
- Code-Blöcke: Hintergrund `#F8F8F8`, Rahmen `1px solid #DDDDDD`, Radius 4px
- Keine Schriftgrößen unter 12px verwenden
- Marketing-Überschriften: Buchstabenabstand `-1px` für große Display-Größen

---

## 4. Komponentenstile

### Schaltflächen

```css
/* Primary */
.btn-primary {
  background: #4A154B;
  color: #FFFFFF;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
  border: none;
}
.btn-primary:hover { background: #611f69; }

/* Secondary */
.btn-secondary {
  background: #FFFFFF;
  color: #1D1C1D;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
}
.btn-secondary:hover { background: #F8F8F8; }

/* Danger */
.btn-danger {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 4px;
}
.btn-danger:hover { background: #B3114A; }
```

### Eingabefelder
```css
.input {
  background: #FFFFFF;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  color: #1D1C1D;
  font-size: 15px;
  padding: 8px 12px;
  height: 36px;
}
.input:focus {
  border-color: #1264A3;
  box-shadow: 0 0 0 2px rgba(18,100,163,0.25);
  outline: none;
}
```

### Seitenleisten-Kanalelement
```css
.channel-item {
  height: 28px;
  padding: 0 16px;
  border-radius: 6px;
  color: rgba(255,255,255,0.7);
  font-size: 15px;
  font-weight: 400;
}
.channel-item:hover {
  background: rgba(255,255,255,0.1);
  color: #FFFFFF;
}
.channel-item.active {
  background: rgba(255,255,255,0.2);
  color: #FFFFFF;
}
.channel-item.unread {
  color: #FFFFFF;
  font-weight: 700;
}
```

### Ungelesen-Badge
```css
.badge {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  min-width: 18px;
}
```

### Nachrichten-Anhänge / Karten
```css
.attachment {
  border-left: 4px solid #DDDDDD;
  background: #F8F8F8;
  border-radius: 0 4px 4px 0;
  padding: 8px 12px;
  margin: 4px 0;
}
```

### Reaktionen
```css
.reaction {
  border: 1px solid #DDDDDD;
  border-radius: 24px;
  background: #F8F8F8;
  padding: 2px 8px;
  font-size: 13px;
  cursor: pointer;
}
.reaction:hover { background: #F1F1F1; }
.reaction.active {
  background: rgba(18,100,163,0.1);
  border-color: #1264A3;
}
```

---

## 5. Layout-Prinzipien

### Dreispaltiges Layout
```
┌──────────────┬──────────────────────────────┬─────────────┐
│   Sidebar    │        Message Area          │   Thread    │
│   (240px)    │          (flex: 1)           │  (400px)    │
│  #4A154B     │          #FFFFFF             │  optional   │
└──────────────┴──────────────────────────────┴─────────────┘
```

### Abstands-System (Basis 4px)
| Token | Wert | Verwendung |
|---|---|---|
| `--space-1` | 4px | Enge Abstände |
| `--space-2` | 8px | Komponenten-Padding |
| `--space-3` | 12px | Eingabe-Padding |
| `--space-4` | 16px | Standard-Padding |
| `--space-6` | 24px | Karten-Padding |
| `--space-8` | 32px | Abschnittsabstände |

### Seitenleisten-Struktur
```
[Arbeitsbereichsname ▼]
────────────────────
Threads
All DMs
Drafts & Sent
────────────────────
▼ Channels
  # general
  # random
  # design  ● (unread)
────────────────────
▼ Direct Messages
  John Doe
  Jane Smith
```

### Nachrichten-Eingabebereich
- Am unteren Rand des Nachrichtenbereichs fixiert
- `border: 1px solid #DDDDDD`, `border-radius: 8px`, `margin: 0 16px 16px`
- Werkzeugleiste: Emoji, Anhang, Formatierung, Senden-Schaltfläche

---

## 6. Tiefe und Elevation

Slack verwendet helle Schatten auf heller Oberfläche:

| Ebene | Verwendung | Schatten |
|---|---|---|
| Flach | Nachrichtenzeilen, Seitenleistenelemente | none |
| Niedrig | Karten, Eingaben | `0 1px 3px rgba(0,0,0,0.08)` |
| Mittel | Dropdowns, Popovers | `0 4px 12px rgba(0,0,0,0.12)` |
| Hoch | Modals, Dialoge | `0 8px 24px rgba(0,0,0,0.15)` |
| Overlay | Modal-Hintergründe | `rgba(0,0,0,0.5)` |

---

## 7. Dos und Don'ts

### ✅ Do
- Aubergine `#4A154B` für die Seitenleiste verwenden — das ikonischste UI-Element von Slack
- Den Hauptinhaltsbereich weiß und hell halten
- `#1D1C1D` (Nahschwarz) für den gesamten Fließtext verwenden, nicht reines Schwarz
- Kanalnamen fett setzen, um den Ungelesen-Status anzuzeigen — die Schriftstärke ist der Indikator
- Die vier Akzentfarben nur für semantische Rollen verwenden (Erfolg, Warnung, Gefahr, Info)
- `border-left: 4px` auf Nachrichten-Anhängen und Einbettungen anwenden
- Zeitstempel nur beim Hover anzeigen
- `#1264A3` für Links und Fokus-Zustände verwenden
- Seitenleistenelemente kompakt halten: 28px Höhe, 6px Rahmenradius

### ❌ Don't
- Keinen dunklen Hauptinhaltsbereich verwenden — Slack ist hell-zuerst
- Blau/Grün/Gelb/Rot nicht als dekorative Akzente verstreuen
- Kein reines Schwarz `#000000` für Text verwenden
- Keine Sprechblasen verwenden — Nachrichten sind flache Zeilen
- Schaltflächen nicht mit großem Radius gestalten — 4px ist Standard
- Zeitstempel nicht dauerhaft anzeigen
- Kanalnamen nicht in GROSSBUCHSTABEN schreiben
- Keine Schriftgrößen unter 12px verwenden

---

## 8. Responsives Verhalten

### Haltepunkte
| Haltepunkt | Breite | Layout |
|---|---|---|
| Mobil | < 768px | Einzelnes Panel, Seitenleiste als linke Schublade |
| Tablet | 768–1024px | Seitenleiste + nur Nachrichtenbereich |
| Desktop | > 1024px | Vollständiges dreispaltiges Layout |

### Mobile Anpassungen
- Seitenleiste: Linke Schublade, nach rechts wischen zum Öffnen
- Untere Tab-Leiste: Home, DMs, Aktivität, Profil
- Thread-Panel: Vollbild-Overlay
- Eingabebereich: Über der Tastatur fixiert
- Kanallistenelemente: 44px Touch-Zielhöhe
- Aubergine-Top-Header-Leiste auf Mobilgeräten beibehalten

---

## 9. Agent-Prompt-Leitfaden

Beim Erstellen von Slack-ähnlichen Designs diesen Ansatz befolgen:

**Farbverwendung:**
> `background: #FFFFFF` als Hauptleinwand setzen. `#4A154B` (Aubergine) für die Seitenleiste verwenden. Der gesamte Primärtext ist `#1D1C1D`. Links und Fokusringe verwenden `#1264A3`. Die vier Logo-Farben — `#36C5F0`, `#2EB67D`, `#ECB22E`, `#E01E5A` — sind nur semantisch: Info, Erfolg, Warnung, Gefahr.

**Typografie:**
> `system-ui, -apple-system, sans-serif` für die gesamte Benutzeroberfläche verwenden. Basisgröße ist 15px. Ungelesene Kanäle: Stärke 700. Fließtext: Stärke 400. Zeitstempel: 12px `#616061`, nur beim Hover. Code: `Monaco, Menlo, monospace`, 12px, Hintergrund `#F8F8F8`.

**Layout:**
> Drei Spalten: 240px Aubergine-Seitenleiste + flexibler weißer Nachrichtenbereich + optionales 400px Thread-Panel. Seitenleistenelemente: 28px Höhe, 6px Radius, fett wenn ungelesen. Eingabebereich: unten fixiert, `border: 1px solid #DDDDDD`, `border-radius: 8px`.

**Komponenten:**
> Schaltflächen: 4px Radius, 36px Höhe, Aubergine als Primärfarbe. Eingaben: `1px solid #DDDDDD` Rahmen, `#1264A3` Fokusring. Nachrichtenzeilen: flach, keine Sprechblasen, 36px kreisförmiger Avatar. Reaktionen: Pille `border: 1px solid #DDDDDD`, `border-radius: 24px`.

**Ton:**
> Slack ist warm, professionell und menschlich. Leere Zustände verwenden freundliche Illustrationen. CTAs sind direkt: „Send message", „Get started". Fehlermeldungen sind klar und hilfreich. Niemals beunruhigend.

**Zu vermeidende Anti-Patterns:**
> Kein dunkler Inhaltsbereich. Keine Sprechblasen. Kein reiner schwarzer Text. Keine verstreuten Mehrfarb-Akzente. Keine Kanalnamen in GROSSBUCHSTABEN. Keine Schrift unter 12px. Kein großer Schaltflächen-Radius.
