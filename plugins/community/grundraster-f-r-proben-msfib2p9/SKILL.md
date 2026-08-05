---
name: RASTER.md
zweck: Grundraster für Live-Artefakte — was eine Probe ist, wie sie gebaut wird, wie sie geprüft wird
stand: 2026-08-02
herkunft: E-023 (Beispiele vor der Entscheidung), Regel 10, E-015. Erfahrungsgrundlage ist
  Probe P-01; der dort gefundene Bemaßungsfehler ist der Anlass für den Prüfblock.
---

# Grundraster für Proben

Gilt für jedes Live-Artefakt unter `arbeit/proben/`. **Kein Planschritt** — Proben bekommen keine
Schrittnummer, sondern eine P-Nummer.

## 1 · Was eine Probe ist — und was sie nicht ist

> **Eine Probe zeigt einen Unterschied, kein Ergebnis. Sie entscheidet nichts.**

Das ist keine Bescheidenheitsformel, sondern die Anwendung von **E-015**: Die Entscheidung liegt
beim Menschen. Eine Probe, die nur eine Fassung zeigt, ist keine Wahl — sie ist ein Vorschlag,
und ein Vorschlag nimmt die Entscheidung vorweg.

**Die Probe ist selbst ein Anwendungsfall des Kernbausteins.** E-015 verlangt von der Rahmung,
dass sie „Fassung, Datum, offene Punkte und gemeinsam getroffene Entscheidungen" zeigt statt eines
fertigen Urteils. Genau das leistet eine Probe. Was hier über Proben gelernt wird, geht in
Schritt 6/7 in den Kernbaustein ein — nicht umgekehrt.

| eine Probe | kein Entwurf |
|---|---|
| zeigt **mindestens zwei** Fassungen | zeigt eine Lösung |
| benennt, was sie **nicht** zeigt | wirkt vollständig |
| trägt ihren Vorbehalt sichtbar | trägt ihn in einer Fußnote |
| stellt am Ende eine Frage | zieht am Ende ein Fazit |
| darf **Gegenbilder** enthalten | zeigt nur Erwünschtes |

**Gegenbilder** sind der eigentliche Gewinn: eine Fassung, die eine Regel bricht, macht die Regel
sichtbar. Sie werden **immer markiert** — in P-01 durchgestrichen und mit „Gegenbild" oder
„verworfen" beschriftet — und stehen nie zur Wahl.

## 2 · Die sechs Teile eines Probenblatts

Feste Reihenfolge. Fehlt einer, ist es keine Probe.

1. **Kopf** — P-Nummer · Titel · `Arbeitsstand <Datum> · nicht abgenommen`.
   Die Zeile „nicht abgenommen" steht immer, bis Jonas entschieden hat.
2. **Vorbehalt** — was Platzhalter ist und was fehlt, mit E-Nummer. Sichtbar umrandet, nicht
   kleingesetzt. Herkunft: **D-2** („Der Baustein ‚Grenzen' steht in derselben Größenordnung wie
   der Baustein ‚Leistungen' — gleiche Schriftgröße, gleiche Ebene, nicht eingeklappt").
3. **Leitsatz je Teil** — ein Satz, der sagt, was in diesem Teil variiert und was konstant bleibt.
   Ohne ihn vergleicht man zwei Dinge, die sich in mehr als einer Größe unterscheiden.
4. **Die Fassungen** — je Nummer, Name, Zeichnung, Maß, ein Satz zur Wirkung, Herkunft.
5. **Die Frage** — was an dieser Probe entscheidbar ist, nummeriert. Und der Satz, dass die
   Antwort als Entscheidung eingetragen und nicht aus der Probe abgelesen wird.
6. **Fuß** — was ausgeschlossen ist, je mit E-Nummer, plus die Bewegungsangabe.

## 3 · Was in einer Probe gesperrt ist

Diese Liste ist der Grund, warum Proben vor Schritt 5 und 8 überhaupt möglich sind: Sie zeigen
**Struktur ohne Oberfläche**.

| gesperrt | Herkunft | was stattdessen |
|---|---|---|
| jeder Farbwert als Gestaltungsmittel | E-004 | **Dichte, Maß, Anordnung, Überlappung** |
| jede Schriftwahl | E-011 | Systemstack, im Blatt als Platzhalter markiert |
| Impulse, solange kein echtes Bild vorliegt | E-020, O-017 | nichts — `m = 0` ist der richtige Stand |
| ein zweites Theme | E-017 | ein Theme; eine zweite Lichtsituation wäre eine zweite Grundlage |
| Flächenbehandlung, Filter, Tönung über alles | Regel 7, Schritt 1 Abschnitt 3 | — |
| Bemaßung, die nichts misst | **H-2** | keine Bemaßung, plus der Satz warum |
| Kundenstimme, Logowand, Kennzahl, Laufband | Regel 12, `ZIEL.md` Nicht-Ziele | — |
| „Architekt" in jeder Wortverbindung | Regel 13 | — |

**Platzhalter-Token heißen `--pl-*`, nicht `--color-*` oder `--token-*`.** Der Präfix ist kein
Geschmack: Er macht bei jedem späteren Blick sofort sichtbar, dass hier **kein** Systemwert steht.
Wenn in Schritt 8 die Werteschicht entsteht, ist maschinell prüfbar, dass kein `--pl-` in sie
gelangt ist.

## 4 · Was jede Probe an Bewegung erklären muss

Regel 8 gilt auch, wenn sich nichts bewegt. „Statisch" ist eine Angabe, keine Auslassung. Der Fuß
nennt deshalb immer: **Anlass · Richtung · Dauer · Kurve · Ersatzverhalten**. Bei einer statischen
Probe lautet die Antwort fünfmal „keine" plus der Satz, dass bei reduzierter Bewegung nichts an
die Stelle tritt, **weil nichts wegfällt**.

Das Verbot aus Schritt 2 gilt in jeder Probe: kein Element mit eigener Bewegung relativ zu seiner
Fläche, kein bildlauffester Effekt (dort hatte die Referenz ihren greifbarsten Fehler).

## 5 · Der Prüfblock — die Probe misst sich selbst

**Anlass:** In P-01 stand unter der harten Kante eine Maßkette mit der Beschriftung „0", die
tatsächlich 64 px breit war. Durch Lesen wäre das nie aufgefallen — es fiel beim Messen auf. Genau
dieser Fehlertyp ist in einem Planblatt-Register der schwerste, weil H-2 ihn ausdrücklich
verbietet: „Keine Bemaßung, die nichts misst."

**Regel: Jede Probe wird im gerenderten Zustand gemessen, bevor sie Jonas erreicht.** Nicht im
Quelltext — im Blatt.

Der Prüfblock, im Browser gegen die geöffnete Probe:

```js
(() => {
  // GÜLTIGKEIT ZUERST. Ist der Browser-Pane nicht dargestellt, ist clientWidth 0 —
  // dann sind alle Breitenmessungen wertlos und melden falsche Überhänge.
  const sichtbar = document.documentElement.clientWidth > 0;

  const ketten = [...document.querySelectorAll('.mass-mitte')];
  const paare = ketten.map(k => ({
    beschriftet: k.textContent.trim(),
    gemessen: Math.round(k.getBoundingClientRect().width)
  }));

  return {
    messungGueltig: sichtbar,
    // Breitenabhängige Werte nur melden, wenn wirklich gemessen werden konnte:
    luegendeBemassung: sichtbar ? paare.filter(p => Number(p.beschriftet) !== p.gemessen) : 'nicht gemessen',
    bodyScrolltSeitwaerts: sichtbar ? document.body.scrollWidth > document.documentElement.clientWidth : 'nicht gemessen',
    // Breitenunabhängig, immer gültig:
    bewegteElemente: [...document.querySelectorAll('*')].filter(e => {
      const s = getComputedStyle(e);
      return s.animationName !== 'none'
          || (s.transitionDuration !== '0s' && s.transitionProperty !== 'none');
    }).length,
    fassungen: document.querySelectorAll('.fall').length,
    platzhalterHinweise: document.body.innerHTML.match(/Platzhalter/gi)?.length ?? 0
  };
})()
```

**`messungGueltig: false` heißt: die Prüfung hat nicht stattgefunden.** Dann den Browser-Pane
öffnen und erneut messen — nicht etwa die Probe „reparieren". Das ist keine Formalie: Beim ersten
Einsatz dieses Blocks meldete er an der eigenen Vorlage einen seitwärts scrollenden Body. Der
Befund war falsch — der Pane war nur nicht dargestellt, `clientWidth` also 0, und damit **jede**
Breite ein scheinbarer Überhang. Ein Prüfer, der nicht sagen kann, ob er messen konnte, erzeugt
Arbeit statt sie zu ersparen (dieselbe Lehre wie im UFW-Fall vom 2026-07-17, `QUALITY.md`).

**Abnahmeschwellen:**

- `messungGueltig` — **muss true sein.** Sonst zählt keine der Breitenmessungen.
- `luegendeBemassung` — **muss leer sein.** Jede Abweichung ist ein H-2-Verstoß.
- `bodyScrolltSeitwaerts` — **muss false sein.** Sonst ist die Probe auf dem Handy unbrauchbar,
  und Jonas soll sie dort ansehen können.
- `bewegteElemente` — muss zur Angabe im Fuß passen. Steht dort „keine Bewegung", muss hier 0
  stehen.
- `fassungen` — **mindestens 2** (E-023, `ZIEL.md` Muss-Ziele).
- `platzhalterHinweise` — **mindestens 1.** Eine Probe ohne sichtbaren Platzhalterhinweis
  verstößt gegen die Logik von E-014.

Dazu die übliche Regelprüfung gegen die Diff, nicht gegen die ganze Datei: Farbwerte, Schriftnamen,
Sperrbegriffe, Wirkbehauptungen, frühere Designstände.

## 6 · Veröffentlichung und Live-Verfolgung

**Jede Probe wird als Artifact veröffentlicht**, damit Jonas sie am Gerät ansehen kann — auch vom
Smartphone. Das ist nicht Bequemlichkeit: `ZIEL.md` Erfolgskriterium 12 verlangt Wiedererkennung
**am Gerät**, und Kriterium 11 die Abnahme am gebauten Stand statt an seiner Beschreibung. Eine
Probe, die nur im Editor existiert, kann beides nicht leisten.

**Dieselbe Datei behält dieselbe Adresse.** Wird eine Probe überarbeitet, wird sie unter derselben
URL erneut veröffentlicht — kein neuer Link. Eine neue P-Nummer bekommt eine neue Adresse.

**Was nicht veröffentlicht wird:** nichts mit echten Kundendaten, keine Visualisierung eines
realen Projekts ohne Jonas' ausdrückliche Freigabe. Bis Schritt 9 ist das gegenstandslos —
es gibt nur Platzhalter (O-007).

**Der lokale Weg bleibt offen:** Ein Dev-Server im WLAN wäre technisch möglich, verlangt aber
Änderungen an Bindung und Firewall. Das ist eine Systemänderung und braucht Jonas' ausdrückliches
Wort (`CLAUDE.md`, Sicherheitsregeln).

## 7 · Wann daraus ein Skill wird — noch nicht

`SKILL_POLICY.md`: Skills entstehen aus echter, wiederkehrender Arbeit, **nicht auf Vorrat**. Eine
Probe ist noch keine Wiederkehr. Dieses Raster ist deshalb eine **Vorlage im Projekt**, kein Skill.

**Auslöser für die Skill-Frage:** wenn dieses Raster zum dritten Mal angewandt wurde und der
Prüfblock dabei mindestens einmal einen echten Fehler gefunden hat. Dann ist belegt, dass sich das
Verfahren lohnt — und erst dann wird es vorgelegt.

## 8 · Vor jeder Probe: Ordnungsfrage oder Materialfrage?

**Nachgetragen am 2026-08-02 nach der ersten Anwendung.** E-023 nahm an, Proben ohne Oberfläche
seien immer entscheidbar („Was ohne Farbe trägt, trägt"). Probe P-01 hat gezeigt, dass das zu
allgemein war — Jonas konnte nicht wählen, weil die Antwort am Material hängt (**E-024**, O-020).

**Deshalb steht vor jeder Probe eine Frage an die Frage:**

| | Ordnungsfrage | Materialfrage |
|---|---|---|
| **worum es geht** | Reihenfolge, Anschluss, Maßverhältnis, Dichte, Staffelung, Gliederung | Wirkung an einer Materialgrenze, Ton, Oberfläche, Licht |
| **ohne Oberfläche entscheidbar?** | **ja** | **nein** |
| **was die Probe dann leistet** | die Entscheidung | den Möglichkeitsraum und eine präzisere Frage |
| **Beispiel** | „Welche Reihenfolge ist ablesbar?" | „Wie weich ist der Übergang?" (P-01) |

**Eine Materialfrage ist trotzdem eine gute Probe** — nur mit anderem Ziel. Sie wird gebaut, um
den Raum abzustecken, und ausdrücklich mit dem Vermerk versehen, dass die Wahl vertagt ist. Was
sie nicht darf: so tun, als sei sie entscheidbar.

**Im Zweifel Materialfrage annehmen.** Eine vertagte Entscheidung kostet nichts; eine getroffene,
der die Grundlage fehlt, vererbt sich.

## 9 · Was dieses Raster nicht regelt

- **Wie eine Probe aussieht.** Das Register ist das Planblatt (E-010), aber Anordnung, Dichte und
  Verhältnisse entstehen je Probe aus ihrer Frage.
- **Wann eine Probe fällig ist.** E-023 sagt „vor jeder folgenreichen Festlegung" — was
  folgenreich ist, entscheidet sich am Gegenstand.
- **Wie viele Fassungen.** Mindestens zwei; die Obergrenze ergibt sich daraus, wie viele
  Unterschiede man auf einem Blatt noch unterscheiden kann.
- **Nichts über Farbe, Schrift oder Impulse.** Die bleiben gesperrt, bis ihre Schritte sie
  herleiten.

## Provenance

Formalized by Open Design from candidate f3f44dd2-1e0f-4587-ae1f-8d4f8a75e6e3.
