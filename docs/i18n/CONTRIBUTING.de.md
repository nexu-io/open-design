# Zu Open Design beitragen

Danke, dass Sie über einen Beitrag nachdenken. OD ist bewusst klein gehalten — der größte Teil des Werts steckt in **Dateien** (Skills, Designsysteme, Prompt-Fragmente) statt in Framework-Code. Die wirkungsvollsten Beiträge sind deshalb oft ein Ordner, eine Markdown-Datei oder ein PR-großer Adapter.

Dieser Leitfaden zeigt, wo Sie für welche Art Beitrag suchen sollten und welche Messlatte ein PR vor dem Merge erfüllen muss.

<p align="center"><a href="../../CONTRIBUTING.md">English</a> · <a href="CONTRIBUTING.pt-BR.md">Português (Brasil)</a> · <b>Deutsch</b> · <a href="CONTRIBUTING.fr.md">Français</a> · <a href="CONTRIBUTING.zh-CN.md">简体中文</a> · <a href="CONTRIBUTING.ja-JP.md">日本語</a> · <a href="CONTRIBUTING.ko.md">한국어</a> · <a href="CONTRIBUTING.th.md">ภาษาไทย</a></p>

---

## Drei Dinge, die Sie an einem Nachmittag liefern können

| Wenn Sie möchten… | Fügen Sie eigentlich hinzu | Ort | Umfang |
|---|---|---|---|
| OD eine neue Artifact-Art rendern lassen (Rechnung, iOS Settings Screen, One-Pager…) | ein **Design-Template** | [`design-templates/<your-template>/`](../../design-templates/) | ein Ordner mit `SKILL.md` und Render-Assets |
| Eine funktionale Fähigkeit ergänzen, die Agents während einer Aufgabe aufrufen | einen **Skill** | [`skills/<your-skill>/`](../../skills/) | ein Ordner mit `SKILL.md` und optionalen Ressourcen |
| OD die visuelle Sprache einer neuen Marke sprechen lassen | ein **Design System** | [`design-systems/<brand>/`](../../design-systems/) | ein Paket: `manifest.json`, `DESIGN.md` und `tokens.css` |
| Eine neue coding-agent CLI anbinden | einen **Agent adapter** | [`apps/daemon/src/runtimes/defs/`](../../apps/daemon/src/runtimes/defs/) | eine Definition plus Registry-Eintrag |
| Feature ergänzen, Bug fixen, UX-Pattern aus [`open-codesign`][ocod] übernehmen | Code | `apps/web/src/`, `apps/daemon/` | normaler PR |
| Dokumentation verbessern, Französisch / Deutsch / 中文 ergänzen, Tippfehler fixen | Dokumentation | `README.md`, `README.fr.md`, `README.de.md`, `README.zh-CN.md`, `docs/`, `QUICKSTART.md` | ein PR |

Wenn Sie nicht sicher sind, in welchen Bereich Ihre Idee fällt, [öffnen Sie zuerst eine Discussion / Issue](https://github.com/nexu-io/open-design/issues/new). Wir zeigen Ihnen dann die passende Oberfläche.

---

## Lokales Setup

Das vollständige One-Page-Setup steht in [`QUICKSTART.de.md`](QUICKSTART.de.md). TL;DR für Mitwirkende:

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable           # wählt das gepinnte pnpm aus packageManager
pnpm install
pnpm tools-dev run web    # daemon + web foreground loop
pnpm typecheck            # tsc -b --noEmit
pnpm --filter @open-design/web build  # Web-Paket bei Bedarf bauen
```

Node `~24` und pnpm `10.33.x` sind erforderlich. `nvm` / `fnm` sind optional; nutzen Sie `nvm install 24 && nvm use 24` oder `fnm install 24 && fnm use 24`, wenn Sie Node so verwalten. macOS, Linux und WSL2 sind die primären Pfade. Windows nativ wird unterstützt; siehe [`docs/windows-troubleshooting.md`](../../docs/windows-troubleshooting.md) für die häufigsten Setup-Stolpersteine.

Sie brauchen keine Agent-CLI im `PATH`, um OD selbst zu entwickeln. Der daemon meldet dann "no agents found" und fällt auf den **Anthropic API · BYOK** Pfad zurück, der oft die schnellste Dev-Schleife ist.

---

## Ein neues Design-Template hinzufügen

Ein Design-Template ist ein Ordner unter [`design-templates/`](../../design-templates/) mit `SKILL.md` im Root. Es folgt der Claude Code [`SKILL.md` Konvention][skill] plus optionaler `od:` Erweiterung und bündelt Form sowie Render-Ressourcen eines Artifacts für die Templates-Galerie.

### → Der vollständige Leitfaden steht in [`docs/skills-contributing.md`](../../docs/skills-contributing.md)

### Design-Template-Ordnerlayout

```text
design-templates/your-template/
├── SKILL.md                    # erforderlich
├── assets/template.html        # optional, aber empfohlen — Seed-Datei
├── references/                 # optional — Wissensdateien für den Agent
│   ├── layouts.md
│   ├── components.md
│   └── checklist.md
└── example.html                # stark empfohlen — echtes, handgebautes Beispiel
```

### `SKILL.md` Frontmatter

Die ersten drei Keys sind die Claude Code Basis-Spec: `name`, `description`, `triggers`. Alles unter `od:` ist OD-spezifisch und optional, aber **`od.mode`** bestimmt, in welcher Gruppe das Template erscheint.

```yaml
---
name: your-template
description: |
  One-paragraph elevator pitch. The agent reads this verbatim to decide
  if the user's brief matches. Be concrete: surface, audience, what's in
  the artifact, what's not.
triggers:
  - "your trigger phrase"
  - "another phrase"
  - "中文触发词"
od:
  mode: prototype           # prototype | deck | template | design-system
  platform: desktop         # desktop | mobile
  scenario: marketing       # free-form tag for grouping
  featured: 1               # any positive integer surfaces it under "Showcase examples"
  preview:
    type: html              # html | jsx | pptx | markdown
  design_system:
    requires: true
  craft:
    requires: [typography, color, anti-ai-slop]
  example_prompt: "A copy-pastable prompt that nicely shows what this template does."
---

# Your Template

Body is free-form Markdown describing the workflow the agent should follow…
```

Die vollständige aktive Grammatik (`od.mode`, `od.surface`, `od.craft.requires`, `od.critique.policy`, Gallery-Hinweise und mehr) steht in [`docs/skills-protocol.md`](../../docs/skills-protocol.md). Ältere portable Felder wie `od.inputs`, `od.parameters` und `od.capabilities_required` können in externen Bundles noch auftauchen, werden aber vom Skill-/Template-Registry nicht ausgewertet.

### Merge-Messlatte für ein neues Design-Template

1. **Ein echtes `example.html`.** Handgebaut, direkt von Disk öffnend, mit Designer-Qualität. Kein Lorem ipsum, kein `<svg><rect/></svg>` Placeholder-Hero.
2. **Anti-AI-slop Checklist bestehen.** Keine violetten Gradients, keine generischen Emoji-Icons, keine runde Karte mit linkem Border-Akzent, kein Inter als Display-Font, keine erfundenen Zahlen.
3. **Ehrliche Platzhalter.** Wenn der Agent keine echte Zahl hat, schreiben Sie `—` oder einen beschrifteten grauen Block, nicht "10× faster".
4. **`references/checklist.md` mit mindestens P0 Gates.** Format an [`design-templates/guizang-ppt/references/checklist.md`](../../design-templates/guizang-ppt/) oder [`design-templates/dating-web/references/checklist.md`](../../design-templates/dating-web/) anlehnen.
5. **Screenshot unter `docs/screenshots/skills/<skill>.png`**, wenn das Template featured ist. PNG, ca. 1024×640 retina, aus dem echten `example.html`.
6. **Ein einzelner, in sich geschlossener Ordner.** Keine CDN-Imports außer bereits verwendeten, keine unlizenzierte Fonts, keine Bilder über ca. 250 KB.

Wenn Sie ein vorhandenes Design-Template forken, behalten Sie LICENSE und Autorenschaft in `references/` und erwähnen Sie es in der PR-Beschreibung.

### Vorhandene Design-Templates zum Nachahmen

- Visuelle Single-Screen-Prototypen: [`design-templates/dating-web/`](../../design-templates/dating-web/), [`design-templates/digital-eguide/`](../../design-templates/digital-eguide/)
- Multi-Frame Mobile-Flows: [`design-templates/mobile-onboarding/`](../../design-templates/mobile-onboarding/), [`design-templates/gamified-app/`](../../design-templates/gamified-app/)
- Dokument / Template: [`design-templates/pm-spec/`](../../design-templates/pm-spec/), [`design-templates/weekly-update/`](../../design-templates/weekly-update/)
- Deck-Modus: [`design-templates/guizang-ppt/`](../../design-templates/guizang-ppt/) und [`design-templates/simple-deck/`](../../design-templates/simple-deck/)

---

## Einen funktionalen Skill hinzufügen

Ein funktionaler Skill ist eine Fähigkeit, die der Agent während einer Aufgabe auf Benutzereingaben anwendet. Die Abgrenzung steht in [`skills/README.md`](../../skills/README.md), der Ordnervertrag in [`skills/AGENTS.md`](../../skills/AGENTS.md), und die gemeinsame `SKILL.md`-Grammatik in [`docs/skills-protocol.md`](../../docs/skills-protocol.md). Der Lazy Scanner des Daemons durchsucht die Skill-Roots bei der nächsten Anfrage an `/api/skills`; lokal ist weder ein Rebuild noch ein Daemon-Neustart nötig.

---

## Ein neues Design System hinzufügen

Ein neues Designsystem im Repository ist ein Paket unter [`design-systems/<slug>/`](../../design-systems/), keine einzelne Markdown-Datei. Alle 151 gebündelten Systeme verwenden inzwischen den Paketvertrag unten. Der Daemon akzeptiert für ältere oder benutzerinstallierte Inhalte weiterhin `DESIGN.md`-only-Ordner als Kompatibilitätspfad; neue gebündelte Systeme dürfen diese Legacy-Form nicht verwenden. Der Katalog wird bei jeder Anfrage an `/api/design-systems` neu gescannt: Aktualisieren Sie nach einer Änderung die Design-System-Oberfläche, ein Daemon-Neustart ist nicht nötig.

### Minimales Paketlayout

```text
design-systems/your-brand/
├── manifest.json
├── DESIGN.md
└── tokens.css
```

`manifest.json` enthält stabile ID, Anzeigename, Kategorie, Beschreibung, Provenienz und deklarierte Paketpfade. `DESIGN.md` erklärt die Designabsicht für Agents; `tokens.css` ist das kanonische kompilierte Stylesheet für semantische Tokens. Der vollständige Vertrag steht in [`docs/design-systems.md`](../../docs/design-systems.md) und [`design-systems/_schema/AGENTS.md`](../../design-systems/_schema/AGENTS.md).

### `DESIGN.md` Form

```markdown
# YourBrand Design System

## Visual Theme
…

## Color Roles
…

## Typography
…

## Layout and Spacing
## Components and States
## Motion and Interaction
## Accessibility
## Anti-patterns
```

Es gibt kein festes Neun-Abschnitte-Schema. Der Paketqualitäts-Guard verlangt mindestens sieben inhaltlich substantielle H2-Abschnitte, schreibt aber weder Namen noch Reihenfolge oder Nummerierung vor. Verwenden Sie Überschriften, die zum tatsächlichen System passen.

### Merge-Messlatte für ein neues Designsystem

1. **Alle drei Pflichtdateien liefern.** Ordner-Slug und `manifest.id` stimmen überein und verwenden normalisiertes ASCII (`linear.app` → `linear-app`, `x.ai` → `x-ai`).
2. **Mindestens sieben substantielle H2-Abschnitte schreiben.** Keine leeren Überschriften nur für den Zähler.
3. **Prosa und Tokens konsistent halten.** Farben, Typografie, Abstände und Motion in `DESIGN.md` müssen mit `tokens.css` übereinstimmen; die gemeinsamen Token-Guards müssen bestehen.
4. **Echte Evidenz und klare Provenienz verwenden.** Direkt vom Quellprodukt oder der Website sampeln und die Quelle im Manifest beziehungsweise in der Paketevidenz festhalten.
5. **Nützliche Katalogtexte schreiben.** `manifest.name`, `category` und `description` sind die primären Picker-Metadaten; Marketing-Fluff gehört nicht hinein.

Die upstream-abgeleiteten Produktsysteme werden aus [`VoltAgent/awesome-design-md`][acd2] über [`scripts/sync-design-systems.ts`](../../scripts/sync-design-systems.ts) importiert. Wenn Ihre Marke upstream passt, schicken Sie den PR zuerst dorthin; OD übernimmt ihn beim nächsten Sync. `design-systems/` enthält außerdem projekt-eigene Ergänzungen, die nicht upstream passen.

---

## Eine neue coding-agent CLI hinzufügen

Eine neue Agent-CLI erhält eine Definition unter [`apps/daemon/src/runtimes/defs/`](../../apps/daemon/src/runtimes/defs/) plus einen Import und Eintrag in `runtimes/registry.ts`:

```ts
import type { RuntimeAgentDef } from '../types.js';

export const fooAgentDef = {
  id: 'foo',
  name: 'Foo Coder',
  bin: 'foo',
  versionArgs: ['--version'],
  fallbackModels: [{ id: 'default', label: 'Default', default: true }],
  buildArgs: (prompt) => ['exec', '-p', prompt],
  streamFormat: 'plain',           // or 'claude-stream-json' if it speaks that
} satisfies RuntimeAgentDef;
```

Importieren Sie die Definition in [`runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts) und fügen Sie sie zu `BASE_AGENT_DEFS` hinzu. Die gemeinsame Engine erkennt sie dann im `PATH`, zeigt sie im Picker und baut den Aufruf. Verwenden Sie ein bestehendes `streamFormat`, wenn die Wire-Struktur passt. Ein wirklich neues Wire-Format braucht außerdem einen Parser unter [`apps/daemon/src/runtimes/`](../../apps/daemon/src/runtimes/) oder [`apps/daemon/src/agent-protocol/`](../../apps/daemon/src/agent-protocol/), Parser-Tests und einen passenden Dispatch-Zweig in [`server.ts`](../../apps/daemon/src/server.ts).

Merge-Bar:

1. **Eine echte Session läuft end-to-end** mit dem neuen Agent; fügen Sie den daemon log in die PR-Beschreibung ein.
2. **`docs/agent-adapters.md`** dokumentiert die Eigenheiten der CLI.
3. **Die README-Tabelle "Unterstützte Code-Agenten"** erhält eine Zeile.

---

## Wartung von Lokalisierungen

Deutsch verwendet das formelle `Sie`, weil OD eine gemischte Zielgruppe aus Solo-Creators, Agenturen und Engineering-Teams anspricht; solange Projektfeedback keine informelle `du`-Stimme nahelegt, ist formelles Deutsch die am wenigsten überraschende Vorgabe. Locale-PRs sollen UI-Chrome, zentrale Dokumentation und display-only Gallery-Metadaten in `apps/web/src/i18n/content.ts` übersetzen, aber nicht `skills/`, `design-systems/` oder Prompt-Bodies, die Agents ausführen. Diese Quell-Prompts sind Workflow-Eingaben; eine gemeinsame Quellsprache vermeidet multiplizierte Prompt-QA über alle Locales. Wenn ein Skill, Designsystem oder Prompt Template ergänzt oder umbenannt wird, aktualisieren Sie die deutschen Display-Metadaten und führen `pnpm --filter @open-design/web test` aus; `content.test.ts` schlägt fehl, wenn die deutsche Display-Coverage driftet. Daemon-Fehler, Export-Dateinamen und agent-generierte Artifact-Texte sind bekannte Grenzen, sofern ein PR sie nicht ausdrücklich umfasst.

---

## Code Style

Wir sind beim Formatting nicht pedantisch (Prettier on save ist okay), aber zwei Regeln sind nicht verhandelbar:

1. **Single quotes in JS/TS.** Strings sind single-quoted, außer Escaping macht sie hässlich.
2. **Kommentare auf Englisch.** Auch wenn ein PR etwas ins Deutsche oder Chinesische übersetzt, bleiben Code-Kommentare englisch, damit es eine greppable Referenzsprache gibt.

Außerdem:

- **Nicht erzählen.** Kein `// import the module`, kein `// loop through items`.
- **TypeScript** für `apps/web/src/`. Der daemon (`apps/daemon/`) ist plain ESM JavaScript mit JSDoc, wenn Typen wichtig sind.
- **Keine neuen Top-Level Dependencies** ohne Absatz in der PR-Beschreibung, was sie bringen und wie viele Bytes sie kosten.
- **Vor dem Push `pnpm typecheck` ausführen.** CI tut es auch.

---

## Commits & Pull Requests

- **Ein Anliegen pro PR.**
- **Titel ist imperativ + Scope.** `add dating-web skill`, `fix daemon SSE backpressure when CLI hangs`, `docs: clarify storage contract`.
- **Nutzen Sie das PR-Template.** Füllen Sie jeden Abschnitt von [`.github/pull_request_template.md`](../../.github/pull_request_template.md) aus — Why, What users will see, Surface area, Screenshots (bei UI), Bug fix verification (bei Bugfix), Validation. Leere Abschnitte ergeben einen "please fill in"-Kommentar.
- **Body erklärt das Warum.** Der Diff zeigt oft das Was, aber selten den Grund.
- **Issue referenzieren**, falls vorhanden. Bei nicht-trivialen PRs ohne Issue bitte zuerst eines öffnen.
- **Während Review nicht squashen.** Fixups pushen; wir squashen beim Merge.
- **Kein Force-Push auf Shared Branches**, außer Reviewer fragen danach.

Wir erzwingen kein CLA. Apache-2.0 deckt Beiträge ab; Ihr Beitrag ist unter derselben Lizenz.

---

## Bugs melden

Öffnen Sie ein Issue mit:

- Exaktem `pnpm tools-dev ...` Aufruf.
- Ausgewählter Agent-CLI oder BYOK-Pfad.
- Skill + Designsystem, die den Fehler ausgelöst haben.
- Relevanter **daemon stderr tail**.
- Screenshot, wenn es UI betrifft.

Für Prompt-Stack-Bugs fügen Sie die **vollständige Assistant Message** bei, damit klar ist, ob Modell oder Prompt verletzt wurde.

---

## Fragen stellen

- Architekturfrage, Designfrage, "Bug oder Fehlbenutzung?" → [GitHub Discussions](https://github.com/nexu-io/open-design/discussions) (bevorzugt, weil suchbar).
- "Wie schreibe ich einen Skill für X?" → Discussion öffnen. Wir beantworten sie und übernehmen fehlende Muster in [`docs/skills-protocol.md`](../../docs/skills-protocol.md).

---

## Was wir nicht annehmen

Um das Projekt fokussiert zu halten, öffnen Sie bitte keine PRs, die:

- **Eine Model Runtime vendoren.** OD setzt darauf, dass Ihre vorhandene CLI reicht.
- **Das Frontend ohne vorherige Abstimmung aus dem aktuellen Stack reißen.** Next.js 16 App Router + React 18 + TS ist gesetzt.
- **Den daemon durch eine Serverless Function ersetzen.** Der daemon besitzt ein echtes `cwd` und startet echte CLIs.
- **Telemetry oder externe Datenerfassung außerhalb des Datenschutzvertrags hinzufügen.** Produktanalysen und maskierte Session-Replays sind einwilligungspflichtig; bereinigte Sicherheits-/Zuverlässigkeitstelemetrie ist in entsprechend konfigurierten Builds stets aktiv. Neue Events, Felder oder Ziele müssen die in [`PRIVACY.md`](../../PRIVACY.md) dokumentierten Einwilligungs-, Minimierungs- und Bereinigungsgrenzen einhalten.
- **Ein Binary bündeln** ohne Lizenzdatei und Autorenschaft direkt daneben.

Wenn Sie nicht sicher sind, ob eine Idee passt, öffnen Sie vor dem Code eine Discussion.

---

<!-- Machine-translated section; native-speaker review welcome via PR. -->
## Maintainer werden

Wenn Sie kontinuierlich beigetragen haben und wissen möchten, wie der Weg zum Maintainer aussieht, finden Sie die Regeln in **[`MAINTAINERS.md`](../../MAINTAINERS.md)**. Die Kurzfassung:

- Ein Maintainer kann Issues prüfen, freigeben und schließen. Der Merge-Button bleibt beim Core Team — Ihre Freigabe zählt jedoch als die für den Merge erforderliche Freigabe.
- Die Hürde liegt bei **≥ 20 merged PRs** plus einer veröffentlichten Account-Qualitätsprüfung (Anti-Bot, Anti-Sock-Puppet) plus einer Einschätzung des Core Teams zur Qualität der Beiträge. Es gibt kein Bewerbungsformular; das Core Team bringt Kandidatinnen und Kandidaten intern zur Sprache und meldet sich.
- Es gibt **keine Quoten, keine SLAs und keine feste Amtszeit.** Ein Rücktritt ist einfach und reversibel (Emeritus → Rückkehr, sobald sich das Leben wieder beruhigt).
- Alle Schwellenwerte, der Nominierungsablauf, die Regeln zum Rücktritt und die Ausnahmeregelung für die frühe Projektphase stehen in [`MAINTAINERS.md`](../../MAINTAINERS.md). Lesen Sie dieses Dokument, falls Sie etwas davon interessiert.

Das tl;dr: Liefern Sie gute PRs, prüfen Sie sorgfältig, halten Sie sich in [Discussions][discussions] / [Discord][discord] auf — und der Rest ergibt sich von selbst.

[discussions]: https://github.com/nexu-io/open-design/discussions
[discord]: https://discord.gg/mHAjSMV6gz

---

## Lizenz

Mit Ihrem Beitrag erklären Sie sich einverstanden, dass er unter der [Apache-2.0-Lizenz](../../LICENSE) dieses Repositories steht. Ausnahme sind Dateien in [`design-templates/guizang-ppt/`](../../design-templates/guizang-ppt/), die ihre ursprüngliche MIT-Lizenz und Autorenschaft von [op7418](https://github.com/op7418) behalten.

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills
[guizang]: https://github.com/op7418/guizang-ppt-skill
[acd2]: https://github.com/VoltAgent/awesome-design-md
[ocod]: https://github.com/OpenCoworkAI/open-codesign
