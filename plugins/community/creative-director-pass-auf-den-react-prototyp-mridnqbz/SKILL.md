# Creative-Director-Pass auf den React-Prototyp

**Ziel dieses Dokuments:** Gezielte Creative-Director-Politur und Kritik für einen bestehenden React-Prototyp vor der Umsetzung, bevor tatsächlich etwas verändert wird. Frei editierbar — Abschnitt 6 (offene Fragen) ist der wichtigste Ort zum Reagieren.

**Aktueller Pass:** Der produktive Einstieg `src/main.jsx` rendert die Oberfläche aus `src/App.jsx` und `src/styles.css`. Der nächste bestehende Schritt ist aus der unteren Heute-Landung direkt editierbar; dieser Pass vereinheitlicht zusätzlich Touchziele und Motion-Rhythmus.

**Verhältnis zu `plan.md`:** `plan.md` ist die PRD für das Redesign (Anforderungen, Datenmodell, Akzeptanzkriterien) und bleibt unverändert die Quelle der Wahrheit für *was* gebaut wurde. Dieses Dokument ist eine Ebene darüber: *wie gut* die Umsetzung aussieht/sich anfühlt, aus Sicht des creative-director-Workflows (Diagnose → Stilrichtung → Ressourcenauswahl → Bearbeitung → Überprüfung).

---

## 1. Diagnose — was „gutes Design“ hier bedeutet

Übersetzt aus `plan.md` Abschnitt 3 (Design-Leitplanken) und Abschnitt 4 (Nutzer) in die Diagnose-Sprache des Skills, nicht neu erfunden:

- **Zielgruppe:** eine einzelne Person, die sich selbst einen verbindlichen 8-Wochen-Plan setzt (z. B. Abschlussarbeit). Tägliche, kurze Sessions — kein Team-Tool, kein Sales-Kontext.
- **Geschäftsziel / Job to be done:** sofort zeigen, was jetzt dran ist, plus ein Gefühl für die eigene Position in der Zeit — ohne Kalenderdruck oder Alarmoptik.
- **Markengefühl:** ruhig, präzise und fokussiert — helle neutrale Flächen, Blau nur als klares Handlungssignal, nicht dashboard-artig und nicht verkaufsseiten-glatt.
- **Stilreferenzen:** die App selbst (Weiterentwicklung der bestehenden Papier-Grün-Palette aus dem Referenzcode), keine externen Marken-Vorbilder.
- **Informationsdichte:** bewusst niedrig im Fokus-Bereich (ein Nächster-Schritt-Element), dichter in den Wochenkarten — mit den drei sanften Verdichtungsstufen aus `plan.md` 5.5 als einzigem erlaubten Dichte-Signal.
- **Farbe/Typografie/Motion-Standards:** registrierte Weiß/Grau/Blau-Palette, Inter für Display und UI, Mono für Zahlen/Meta. Motion folgt einem kurzen Ease-out-Rhythmus; reduzierte Bewegung bleibt gewahrt.
- **Zu vermeidende Anti-Patterns:** Warnfarben (Rot/Orange) für Aufgabenstau, generische Emoji-Icons, Countdown-/Uhrzeit-Elemente, Lila/Violett-Verläufe, Designer-/Demo-Controls im Produkt-UI (Viewport-Umschalter, Zustandszähler etc.) — alles bereits in `plan.md` Abschnitt 3/10 festgeschrieben.

## 2. Stilrichtung — bereits gesetzt, nicht neu verhandelt

Die aktive Projektrichtung ist als verbindliche Tokenbasis in `src/styles.css` umgesetzt:

```css
--bg: #ffffff;
--surface: #f7f8fa;
--fg: #111111;
--muted: #6b7280;
--border: #d9dee7;
--accent: #1677ff;
--font-display: Inter, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
--font-body: Inter, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
--font-mono:    ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
```

Eine Politur-Passage darf diese Token nicht durch weitere Farbliterale oder eine neue Stilrichtung erweitern. Blau bleibt ein knappes Signal für Aktion und Fortschritt.

## 3. Ressourcenabgleich — welche Skills aus dem Index tatsächlich passen

Gegen die 161 durchsuchbaren Skills abgeglichen, nicht blind der Standard-Toolbox gefolgt:

| Skill | Warum relevant | Wofür genau |
|---|---|---|
| **creative-director** | bereits aktiv gewählt | orchestriert diesen gesamten Ablauf |
| **design-review** | strukturierte Design-Review-Methodik, passt direkt auf „Überprüfung" (Abschnitt 5) | liefert das Bewertungsraster für die Politur-Ergebnisse |
| **color-expert** | prüft Kontrast/Palette-Disziplin gegen echte Werte statt Bauchgefühl | Kontrastcheck von `--muted`/`--border` auf `--bg`, insbesondere für die drei Verdichtungsstufen (5.5-Regel: „keine Warnfarbe" muss messbar eingehalten werden, nicht nur optisch) |
| **frontend-design** *(falls im vollen Index vorhanden)* | Leitplanken für Typografie-/Spacing-Entscheidungen abseits von Templates | Feinschliff der Serif/Sans/Mono-Paarung, Abstandsskala |

Bewusst **nicht** herangezogen: `brand-guidelines`/`brandkit`/`brand-extract` (kein externes Marken-Onboarding nötig, Richtung ist bereits produktintern gesetzt), alle Deck-/Video-/Audio-Skills (falsches Medium), `apple-hig` (kein natives iOS-Target).

Keine Plugins, MCP-Server oder Connectors aus dem Index sind für eine reine HTML/CSS/JS-Politur-Passage einschlägig (0 aktivierte MCP, 0 verbundene Connectors laut Ressourcenindex) — die Arbeit bleibt vollständig im Dateisystem.

## 4. Geplante Bearbeitung — konkret, aber noch nicht ausgeführt

Kandidatenliste für die tatsächliche Politur-Passage im Design-Modus, sortiert nach den drei Dateien:

**`8-wochen-organizer.css`**
- Kontrastprüfung `--muted`/`--border` auf `--bg` mit `color-expert` verifizieren statt schätzen (siehe 3).
- Density-Token (`--dense-1`/`--dense-2`) noch einmal gegen echte Screenshots prüfen — sind die drei Stufen (normal/dicht/sehr dicht) *sichtbar unterscheidbar*, ohne dass „sehr dicht" wie eine Warnfarbe wirkt?
- Fokusring/Hover-States für Tastaturbedienung der Wochenkarten/Buttons systematisch durchgehen (aktuell nur punktuell vorhanden).

**`8-wochen-organizer.js`**
- Leerzustände (kein Ziel gesetzt, keine Aufgaben) noch einmal auf Tonalität prüfen — passen die Platzhaltertexte zur ruhigen Markenstimme oder klingen sie technisch?
- Prüfen, ob die Demo-Seed-Daten (nur beim allerersten Laden) klar als Beispiel erkennbar bleiben und nicht mit echten Nutzerdaten verwechselt werden können.

**Übergreifend**
- Ein *einzelner* bewusster Bewegungsmoment zusätzlich zum Ziel-Horizont-Transform (Prinzip „ein entscheidender Flourish, nicht drei") — Kandidat: sanftes Einblenden beim Erledigen einer Aufgabe. Nur EIN Kandidat umsetzen, nicht mehrere gleichzeitig.
- Kein neuer Screen, kein neues File — reine Verfeinerung der drei bestehenden Dateien.

## 5. Überprüfungskriterien — adaptierte 3-Achsen-Bewertung

Der Skill bewertet normalerweise gegen Cannes/D&AD/HumanKind-Maßstäbe (Kampagnen-Kontext) — für ein persönliches Utility-Produkt wird das auf drei sinngemäße Achsen übersetzt:

1. **Kraft der Idee** — liest sich die „Ziel kommt näher"-Metapher (5.1) beim ersten Blick, oder erklärt sie sich nur auf Nachfrage?
2. **Handwerk** — Typografie-Rhythmus, Abstände, Kontrast, der eine Bewegungsmoment: exakt oder nur „nah dran"?
3. **Relevanz** — bleibt es bei ruhiger, nicht-einengender Produkt-UI, oder schleicht sich AI-Slop (Abschnitt 1, Anti-Patterns) wieder ein?

Jede Achse unter 3/5 gilt als Regression und wird vor Abschluss nachgebessert (gleiche Konvention wie die 5-Dimensionen-Kritik in `plan.md`).

## 6. Offene Fragen — bitte hier direkt beantworten

- **6.1 — Umfang:** `plan.md` 12.1 (Blickrichtung), 12.3 (datenfreie Planstart-Auswahl) und 12.4 (Startseiten-Position) sind inzwischen entschieden und in `8-wochen-organizer.html/.js` umgesetzt (Startseite sitzt jetzt unter Woche 1, Tage je Wochenkarte gespiegelt, Planstart sichtbar nur relativ) — bleibt es bei reiner visueller Politur (Abschnitt 4), oder soll die verbleibende offene Frage aus `plan.md` 12.2 (Mehrfachziele) gleich mit entschieden werden?
- **6.2 — Konkrete Schwachstellen:** Gibt es bereits Stellen im laufenden Prototyp, die dir beim Anschauen negativ aufgefallen sind? Ohne das arbeite ich die Kandidatenliste aus Abschnitt 4 komplett ab statt gezielt nachzubessern.
- **6.3 — Bewegungsmoment:** Passt der Vorschlag „sanftes Einblenden beim Erledigen" als der eine erlaubte Flourish, oder lieber ein anderer Moment (z. B. der Näher-rücken-Button)?
- **6.4 — Zieldatei:** Politur direkt in den bestehenden drei Dateien, oder als versionierte Kopie (`8-wochen-organizer-v2.*`) parallel zum aktuellen Stand?

## 7. Nächster Schritt

Abschnitt 6 durchgehen — ohne Antwort wird nach den in Abschnitt 4 gelisteten Kandidaten und den in Abschnitt 6.3/6.4 genannten Standardannahmen (ein Flourish: Erledigt-Einblendung; Politur direkt in den bestehenden Dateien) gearbeitet. Danach übernimmt der Design-Modus die eigentliche Bearbeitung: `color-expert` für den Kontrastcheck, `design-review` für die Abschluss-Bewertung, Änderungen direkt in `8-wochen-organizer.css`/`.js`.

## Provenance

Formalized by Open Design from candidate ba52ac4d-2a4c-4bc9-ac7e-b47916ec0763.
