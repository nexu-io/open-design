# Ontwerpsysteem Geïnspireerd door Slack

> Category: Productiviteit & SaaS
> Werkplekcommunicatieplatform. Aubergine als primaire kleur, multi-accentlogo-palet, lichte oppervlakken met donkere zijbalk, warm en toegankelijk.

## 1. Visueel Thema & Sfeer

De identiteit van Slack is gebouwd rond het idee dat werk menselijk moet aanvoelen en zelfs een beetje leuk. Het canonieke oppervlak is **licht** — witte inhoudsgebieden met een diepe aubergine (`#4A154B`) zijbalk — het tegenovergestelde van donker-eerst-tools. Dit contrast is bewust: de zijbalk is een rustig, altijd aanwezig navigatieanker, terwijl het inhoudsgebied helder en open is.

Het logopalet — blauw, groen, geel, rood — verschijnt voornamelijk in het hashtag-icoon en marketingcontexten, niet verspreid door de UI. In het product zelf gebruikt Slack een ingehouden, professioneel kleursysteem met aubergine als enige merkanker.

**Kernkenmerken:**
- Licht-eerst inhoudsoppervlakken: wit `#FFFFFF` en bijna-wit `#F8F8F8`
- Diepe aubergine `#4A154B` zijbalk — het meest herkenbare UI-element van het merk
- Vier logo-accentkleuren (blauw, groen, geel, rood) spaarzaam gebruikt als uitlichting
- Larsseit voor koppen (marketing), systeem sans-serif voor UI
- Afgerond maar niet cartoonesk: 4–8px radius op de meeste componenten
- Compact maar ademend: compacte berichtrijen met duidelijke draadhiërarchie
- Warme en conversationele toon — emoji's, reacties en illustraties zijn eersteklas elementen

---

## 2. Kleurenpalet & Rollen

### Primaire Merkkleur
| Token | Hex | Rol |
|---|---|---|
| `--color-aubergine` | `#4A154B` | Zijbalkachtergrond, primaire merkkleur |
| `--color-aubergine-dark` | `#350d36` | Hoverstatus op aubergine-oppervlakken |
| `--color-aubergine-light` | `#611f69` | Actief item markering in zijbalk |

### Logo-accentkleuren (spaarzaam gebruiken — alleen voor uitlichting, iconen, marketing)
| Token | Hex | Naam | Rol |
|---|---|---|---|
| `--color-blue` | `#36C5F0` | Hemelsblauw | Kanaalpictogrammen, links, informatiestatussen |
| `--color-green` | `#2EB67D` | Teal groen | Online status, successtatussen |
| `--color-yellow` | `#ECB22E` | Goud | Afwezigheidsstatus, waarschuwingen, uitlichtingen |
| `--color-red` | `#E01E5A` | Robijn | Meldingen, fouten, vermeldingsbadge |

### Oppervlak & Achtergrond
| Token | Hex | Rol |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | Hoofd berichtgebied, modals |
| `--bg-secondary` | `#F8F8F8` | Draadpanelen, secundaire oppervlakken |
| `--bg-tertiary` | `#F1F1F1` | Invoerachtergrondsden, hoverstatus |
| `--bg-sidebar` | `#4A154B` | Linkerzijbalk (aubergine) |
| `--bg-sidebar-hover` | `rgba(255,255,255,0.1)` | Hover zijbalkitem |
| `--bg-sidebar-active` | `rgba(255,255,255,0.2)` | Actief zijbalkitem |
| `--bg-message-hover` | `#F8F8F8` | Hover berichtrij |

### Tekstkleuren
| Token | Hex | Rol |
|---|---|---|
| `--text-primary` | `#1D1C1D` | Primaire inhoudstekst (bijna zwart) |
| `--text-secondary` | `#616061` | Tijdstempels, gedempte labels |
| `--text-sidebar` | `rgba(255,255,255,0.9)` | Kanaalnamen in zijbalk |
| `--text-sidebar-muted` | `rgba(255,255,255,0.6)` | Inactieve zijbalkitems |
| `--text-link` | `#1264A3` | Inlinelinks in berichten |
| `--text-mention` | `#1264A3` | Tekstkleur @vermelding |

### Semantische Kleuren
| Token | Hex | Rol |
|---|---|---|
| `--color-success` | `#2EB67D` | Succestoasts, positieve statussen |
| `--color-warning` | `#ECB22E` | Waarschuwingsstatussen |
| `--color-danger` | `#E01E5A` | Foutstatussen, destructieve acties |
| `--color-info` | `#36C5F0` | Informatieve uitlichtingen |

### Rand & Verdeler
| Token | Hex | Rol |
|---|---|---|
| `--border-default` | `#DDDDDD` | Standaard scheidingslijnen, kaartrandlingen |
| `--border-subtle` | `#F1F1F1` | Subtiele scheidingslijnen tussen rijen |
| `--border-focus` | `#1264A3` | Focusring kleur |

---

## 3. Typografieregels

### Lettertypen
| Rol | Officieel | Web-terugval |
|---|---|---|
| Display / Marketingkoppen | Larsseit | `'Larsseit', 'Helvetica Neue', Arial, sans-serif` |
| UI / Inhoud / Chrome | Slack Lato (aangepast) | `system-ui, -apple-system, BlinkMacSystemFont, sans-serif` |
| Code / Monospace | — | `'Monaco', 'Menlo', 'Courier New', monospace` |

> Slack gebruikt **Larsseit** voor marketingkoppen en een aangepaste Lato-variant voor de UI in het product. Voor webgebruik is `system-ui` de veiligste terugval.

### Typografieschaal

| Niveau | Grootte | Gewicht | Regelhoogte | Letterafstand | Gebruik |
|---|---|---|---|---|---|
| Display XL | 48px | 800 | 1.1 | -1px | Marketing hero-koppen |
| Display L | 36px | 700 | 1.15 | -0.5px | Sectie-hero's |
| Kop 1 | 28px | 700 | 1.25 | normal | Modaltitels, paginakoppen |
| Kop 2 | 22px | 700 | 1.3 | normal | Kaartitels, instellingssecties |
| Kop 3 | 18px | 700 | 1.35 | normal | Subsectiekoppen |
| Inhoud L | 16px | 400 | 1.5 | normal | Berichttekst, beschrijvingen |
| Inhoud | 15px | 400 | 1.46667 | normal | Standaard UI-tekst (basisgrootte van Slack) |
| Inhoud SM | 13px | 400 | 1.38462 | normal | Secundaire metadata |
| Bijschrift | 12px | 400 | 1.33 | normal | Tijdstempels, hints |
| Code | 12px | 400 | 1.5 | normal | Inlinecode, codeblokken |

### Typografieregels
- De basisinhoudsgrootte van Slack is **15px** — iets kleiner dan 16px voor dichtheid
- Ongelezen kanalen: gewicht 700 — vet is de primaire ongelezen indicator
- Tijdstempels: 12px `--text-secondary`, alleen weergeven bij hover
- Codeblokken: achtergrond `#F8F8F8`, rand `1px solid #DDDDDD`, border-radius 4px
- Gebruik nooit lettergroottes onder 12px
- Marketingkoppen: letter-spacing `-1px` voor grote displayformaten

---

## 4. Componentstijlen

### Knoppen

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

### Invoervelden
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

### Zijbalkkanaalitem
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

### Ongelezen Badge
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

### Berichtbijlagen / Kaarten
```css
.attachment {
  border-left: 4px solid #DDDDDD;
  background: #F8F8F8;
  border-radius: 0 4px 4px 0;
  padding: 8px 12px;
  margin: 4px 0;
}
```

### Reacties
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

## 5. Lay-outprincipes

### Driekolomslay-out
```
┌──────────────┬──────────────────────────────┬─────────────┐
│   Zijbalk    │        Berichtgebied          │   Draad     │
│   (240px)    │          (flex: 1)           │  (400px)    │
│  #4A154B     │          #FFFFFF             │  optioneel  │
└──────────────┴──────────────────────────────┴─────────────┘
```

### Ruimtesysteem (4px basis)
| Token | Waarde | Gebruik |
|---|---|---|
| `--space-1` | 4px | Nauwe tussenruimtes |
| `--space-2` | 8px | Componentopvulling |
| `--space-3` | 12px | Invoervulling |
| `--space-4` | 16px | Standaardopvulling |
| `--space-6` | 24px | Kaartopvulling |
| `--space-8` | 32px | Sectietussenruimtes |

### Zijbalkstructuur
```
[Werkruimtenaam ▼]
────────────────────
Draden
Alle DM's
Concepten & Verzonden
────────────────────
▼ Kanalen
  # general
  # random
  # design  ● (ongelezen)
────────────────────
▼ Directe berichten
  John Doe
  Jane Smith
```

### Berichtcomponist
- Vastgemaakt aan de onderkant van het berichtgebied
- `border: 1px solid #DDDDDD`, `border-radius: 8px`, `margin: 0 16px 16px`
- Werkbalk: emoji, bijlage, opmaak, verzendknop

---

## 6. Diepte & Elevatie

Slack gebruikt lichte schaduwen op een licht oppervlak:

| Niveau | Gebruik | Schaduw |
|---|---|---|
| Vlak | Berichtrijen, zijbalkitems | none |
| Laag | Kaarten, invoervelden | `0 1px 3px rgba(0,0,0,0.08)` |
| Midden | Dropdowns, popovers | `0 4px 12px rgba(0,0,0,0.12)` |
| Hoog | Modals, dialoogvensters | `0 8px 24px rgba(0,0,0,0.15)` |
| Overlay | Modalachtergronden | `rgba(0,0,0,0.5)` |

---

## 7. Aanbevelingen & Waarschuwingen

### ✅ Doe Dit
- Gebruik aubergine `#4A154B` voor de zijbalk — dit is het meest iconische UI-element van Slack
- Houd het hoofdinhoudsgebied wit en licht
- Gebruik `#1D1C1D` (bijna zwart) voor alle inhoudstekst, niet puur zwart
- Maak kanaalnamen vet om de ongelezen status te tonen — gewicht is de indicator
- Gebruik de vier accentkleuren alleen voor semantische rollen (succes, waarschuwing, gevaar, informatie)
- Pas `border-left: 4px` toe op berichtbijlagen en ingesloten elementen
- Toon tijdstempels alleen bij hover
- Gebruik `#1264A3` voor links en focusstatussen
- Houd zijbalkitems compact: 28px hoogte, 6px border-radius

### ❌ Doe Dit Niet
- Gebruik geen donker hoofdinhoudsgebied — Slack is licht-eerst
- Verspreid blauw/groen/geel/rood niet als decoratieve accenten
- Gebruik geen puur zwart `#000000` voor tekst
- Gebruik geen tekstballonnen — berichten zijn platte rijen
- Maak knoppen niet groot-radius — 4px is standaard
- Toon tijdstempels niet permanent
- Gebruik geen HOOFDLETTERS voor kanaalnamen
- Gebruik geen lettergroottes onder 12px

---

## 8. Responsief Gedrag

### Breekpunten
| Breekpunt | Breedte | Lay-out |
|---|---|---|
| Mobiel | < 768px | Enkel paneel, zijbalk als linkerpaneel |
| Tablet | 768–1024px | Alleen zijbalk + berichtgebied |
| Desktop | > 1024px | Volledige driekolomslay-out |

### Mobiele Aanpassingen
- Zijbalk: linkerpaneel, veeg naar rechts om te openen
- Onderste tabbalk: Start, DM's, Activiteit, Jij
- Draadpaneel: volledig-scherm overlay
- Componist: vastgemaakt boven toetsenbord
- Kanalenlijstitems: 44px aanraakvlak hoogte
- Aubergine bovenste headerbalk behouden op mobiel

---

## 9. Agentpromptgids

Bij het genereren van Slack-stijl ontwerpen, volg deze aanpak:

**Kleurtoepassing:**
> Stel `background: #FFFFFF` in als het hoofdcanvas. Gebruik `#4A154B` (aubergine) voor de zijbalk. Alle primaire tekst is `#1D1C1D`. Links en focusringen gebruiken `#1264A3`. De vier logokleuren — `#36C5F0`, `#2EB67D`, `#ECB22E`, `#E01E5A` — zijn uitsluitend semantisch: informatie, succes, waarschuwing, gevaar.

**Typografie:**
> Gebruik `system-ui, -apple-system, sans-serif` voor alle UI. Basisgrootte is 15px. Ongelezen kanalen: gewicht 700. Inhoudstekst: gewicht 400. Tijdstempels: 12px `#616061`, alleen bij hover. Code: `Monaco, Menlo, monospace`, 12px, achtergrond `#F8F8F8`.

**Lay-out:**
> Drie kolommen: aubergine zijbalk 240px + flexibel wit berichtgebied + optioneel draadpaneel 400px. Zijbalkitems: 28px hoogte, 6px radius, vet wanneer ongelezen. Componist: vastgemaakt onderaan, `border: 1px solid #DDDDDD`, `border-radius: 8px`.

**Componenten:**
> Knoppen: 4px radius, 36px hoogte, aubergine primair. Invoervelden: rand `1px solid #DDDDDD`, focusring `#1264A3`. Berichtrijen: plat, geen tekstballonnen, cirkelavatar 36px. Reacties: pill `border: 1px solid #DDDDDD`, `border-radius: 24px`.

**Toon:**
> Slack is warm, professioneel en menselijk. Lege staten gebruiken vriendelijke illustraties. CTA's zijn direct: "Stuur bericht", "Aan de slag". Foutmeldingen zijn duidelijk en behulpzaam. Nooit alarmerend.

**Te vermijden antipatronen:**
> Geen donker inhoudsgebied. Geen tekstballonnen. Geen puur zwarte tekst. Geen verspreide meerkleurige accenten. Geen HOOFDLETTERS in kanaalnamen. Geen lettertype onder 12px. Geen grote knopradius.
