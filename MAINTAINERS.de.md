<!-- Machine-translated draft. Native-speaker review and corrections welcome via PR. -->
# Maintainer

<p align="center"><a href="MAINTAINERS.md">English</a> · <a href="MAINTAINERS.pt-BR.md">Português (Brasil)</a> · <b>Deutsch</b> · <a href="MAINTAINERS.fr.md">Français</a> · <a href="MAINTAINERS.zh-CN.md">简体中文</a> · <a href="MAINTAINERS.ja-JP.md">日本語</a></p>

Dieses Dokument legt die Regeln dafür fest, wie man Maintainer von `nexu-io/open-design` wird, diese Rolle ausübt und sich aus ihr zurückzieht. Die individuelle Zusammensetzung des Core Teams wird intern verwaltet und ist hier nicht aufgeführt — was öffentlich zählt, sind die Regeln, an die sich alle halten.

> **Status**: v1, entworfen am 2026-05-11. Begleitdokument zu [`CONTRIBUTING.md`](CONTRIBUTING.md#becoming-a-maintainer) — diese Datei verweist Beitragende für die vollständigen Regeln hierher.

---

## Rollen

| Rolle | Berechtigungen |
|---|---|
| **Contributor** | Jede Person mit mindestens 1 merged PR. Keine besonderen Berechtigungen. |
| **External Maintainer** | Ein Community-Beitragender, der nach den unten aufgeführten Regeln befördert wurde. Kann Reviews durchführen, approven, issues schließen/wiedereröffnen und sich issues selbst zuweisen. **Kann den merge button nicht klicken** — dies bleibt dem Core Team vorbehalten. |
| **Core Team** | Das interne Team von Open Design. Verfügt über vollen Schreibzugriff auf das Repository und ist die letzte Instanz bei Governance-Entscheidungen. Die Zusammensetzung wird intern verwaltet. |

Der Rest dieses Dokuments bezieht sich auf **External Maintainers**, sofern nicht anders angegeben.

---

## Was ein Maintainer tun kann, was ein Contributor nicht kann

| Aktion | Contributor | Maintainer |
|---|:---:|:---:|
| Einen PR approven | ⚠️ zählt als Kommentar, **nicht** als die erforderliche Approval | ✓ zählt als die erforderliche Approval für den Merge |
| Issues schließen / wiedereröffnen | Nur issues, die sie selbst geöffnet haben | ✓ jedes issue |
| Sich offene, nicht zugewiesene issues selbst zuweisen (P0 zuerst) | ✗ | ✓ |

### Merge-Anforderungen

Jeder PR — unabhängig davon, wer ihn verfasst hat — benötigt **alle drei** der folgenden Punkte:

1. Keine Code-Konflikte.
2. CI vollständig grün.
3. Mindestens eine Approval von einem Maintainer oder einem Core-Team-Mitglied.

Die Approval eines Maintainers ist der Weg, den die meisten PRs zum Merge nehmen — sie ist die direkteste Art, wie sich das Vertrauen eines Maintainers im täglichen Projektgeschehen zeigt.

---

## Wie man Maintainer wird

Es gibt **drei** Aufnahmekriterien. Alle drei müssen erfüllt sein.

### 1. Beitragsumfang

- **≥ 20 merged PRs** zu `nexu-io/open-design`.

Dies ist eine weiche Untergrenze, kein automatisches Ticket. Das Erreichen von 20 PRs bringt Sie in die Betrachtung; es garantiert die Rolle nicht.

### 2. Account-Qualität (Anti-Sock-Puppet, Anti-Bot)

Wir prüfen das GitHub-Profil des Kandidaten anhand von sieben Dimensionen. **Mindestens 5 von 7 Aufnahmelinien müssen erfüllt sein, und null Veto-Linien dürfen ausgelöst werden.**

| # | Dimension | Aufnahmelinie | Veto-Linie |
|---|---|---|---|
| 1 | Alter des GitHub-Accounts | ≥ 1 Jahr | < 90 Tage |
| 2 | Öffentliche Repos | ≥ 3 | 0 |
| 3 | Follower | ≥ 10 | < 3 |
| 4 | Verhältnis Follower / Following | > 0,30 | < 0,05 (typisches Follow-Farm-Muster) |
| 5 | Profilvollständigkeit | Eigener Avatar **und** mindestens eines von bio / company / blog / twitter | Standard-Avatar **und** alle von bio/company/blog leer |
| 6 | Projektübergreifende Aktivität | Mindestens ein merged PR oder anhaltende issue-/Star-Aktivität in **einem anderen** öffentlichen Repo | Merged PRs nur in diesem Repo |
| 7 | Account-Status | Keine Plattform-Beschränkungen auf GitHub (spam/banned/restored) | Eines der oben genannten |

#### Frühphasen-Ausnahme (läuft automatisch ab, wenn das Repo 6 Monate alt wird)

Solange `nexu-io/open-design` jünger als sechs Monate seit dem initialen Commit ist, kann das Veto zur **projektübergreifenden Aktivität** (#6) durch Konsens des Core Teams ausgesetzt werden, wenn:

- Die Dimensionen 1, 2, 3 und 5 deutlich über der Aufnahmelinie liegen; **und**
- Die PR-Qualität des Kandidaten in diesem Repo vom Core Team nach praxisnaher Prüfung als hoch beurteilt wird.

Eine solche Ausnahme muss in der internen Aufzeichnung des Core Teams zusammen mit dem Namen des Kandidaten und dem Datum vermerkt werden. Sobald das Repo sechs Monate alt ist, steht diese Ausnahmeklausel nicht mehr zur Verfügung.

### 3. Beitragsqualität (Beurteilung durch das Core Team)

Dies ist qualitativ und nicht formelbasiert. Das Core Team betrachtet:

- **Code-Qualität** der merged PRs (Korrektheit, Disziplin im Umfang, Respekt vor Repo-Grenzen).
- **Review-Qualität** etwaiger Review-Kommentare zu PRs anderer.
- **Community-Beteiligung** — Discussions, issue-Triage, Engagement auf Discord.
- **Kollaborations-Signale** — Reaktionsbereitschaft auf Feedback, Bereitschaft zur Überarbeitung.

Das Bestehen der ersten beiden Kriterien bringt Sie in den Kandidatenpool. Das Überschreiten dieser dritten Schwelle führt zur Nominierung.

### Auswahlprozess

1. Ein Core-Team-Mitglied bringt den Kandidaten intern zur Sprache.
2. Das Core Team erzielt einen Konsens.
3. Ein Core-Team-Mitglied nimmt privat Kontakt auf, um die Bereitschaft des Kandidaten zu bestätigen.
4. Onboarding.
5. Öffentliche Bekanntmachung.

Es gibt keinen Nominierungs-PR, keine öffentliche Abstimmung, keine feste Amtszeit. Die Absicht ist das **Gegenteil des K8s-/Apache-Approver-Vote-Modells** — in der frühen Lebensphase des Projekts ist ein leichtgewichtiger Konsens des Core Teams schneller und führt zu einem Ergebnis gleicher Qualität. Sobald die Maintainer-Gruppe über fünf External Maintainers hinauswächst, wird dieser Abschnitt überarbeitet.

---

## Verantwortlichkeiten und Erwartungen

**Es gibt keine festen Quoten.** Keine wöchentliche PR-Review-Zahl, keine Mindestrate für issue-Triage, kein SLA für Antwortzeiten. Die Maintainer-Rolle ist eine Anerkennung von Vertrauen, kein unbezahlter Job.

Was wir im Geiste erwarten:

- Approven Sie PRs, für die Sie den Kontext haben; enthalten Sie sich, wenn nicht.
- Halten Sie sich an die Merge-Anforderungen (§ „Merge-Anforderungen") — Ihre Approval ist ein echtes Signal, kein Stempel.
- Halten Sie `#maintainers` informiert, wenn Sie über einen längeren Zeitraum nicht erreichbar sein werden.
- Behandeln Sie die noch nicht öffentliche Roadmap, die in `#maintainers` geteilt wird, als vertraulich.

Wenn das Core Team ein Muster von Fehlverhalten beobachtet (Rubber-Stamp-Approvals, böswilliges Schließen von issues, Weitergabe nicht angekündigter Roadmap-Inhalte usw.), werden die Berechtigungen gemäß § „Rücktritt — aus wichtigem Grund" entzogen.

---

## Maintainer-exklusiver Zugang

Über die oben aufgeführten Repository-Berechtigungen hinaus erhalten Maintainer einige Dinge, die der breiteren Community nicht zur Verfügung stehen:

- **Discord-Channel `#maintainers`** — ein privater Arbeitsbereich, der gemeinsam mit dem Core Team genutzt wird. Verwendet für Design-Vorschauen, RFC-Entwürfe und interne Koordination zum noch nicht öffentlichen Teil der Roadmap.
- **Vertrauliche Roadmap** — frühe Einsicht in Arbeiten, die noch nicht angekündigt wurden. Maintainer verpflichten sich, deren Inhalte vertraulich zu behandeln, bis ein Core-Team-Mitglied sie öffentlich ankündigt.
- **Direkter Draht zum Core Team** — Ihre Nachrichten in `#maintainers` erhalten eine schnellere und substantiellere Antwort als öffentliche Discussions, und das Core Team holt aktiv Maintainer-Input zu Architektur- und Roadmap-Entscheidungen ein.
- **Maintainer-Badge** — eine öffentliche Vertrauensauszeichnung auf Ihrem GitHub-Profil und in MAINTAINERS-bezogenen Repo-Bereichen (wird ausgerollt, sobald die GitHub-Badge-Funktionalität verfügbar ist).
- **Öffentliche Anerkennung bei der Beförderung** — Ankündigung auf Twitter, GitHub Discussions und Discord, wenn Sie beitreten.

---

## Rücktritt

Die Maintainer-Rolle ist keine lebenslange Ernennung. Es gibt drei Wege des Ausscheidens.

### Geordneter Rücktritt (freiwillig)

- Der Maintainer schreibt das Core Team an oder postet in `#maintainers`.
- Die Berechtigungen werden innerhalb von 24 Stunden entzogen.
- Der Maintainer wechselt in den **Emeritus**-Status.
- Eine öffentliche Begründung ist nicht erforderlich.

### Inaktivitäts-Übergang

Ein Maintainer wird für den Inaktivitäts-Übergang in Betracht gezogen, wenn **eines** der folgenden Kriterien zutrifft:

- 90 aufeinanderfolgende Tage ohne Aktivitätssignal (merged PR, Review-Kommentar, issue-Triage, substantielle Beteiligung in Discussions oder Discord), **oder**
- 60 aufeinanderfolgende Tage ohne Reaktion auf eine @-Erwähnung (PR-Review-Anfrage, issue-Zuweisung).

Ablauf:

1. Das Core Team @-erwähnt den Maintainer privat in `#maintainers` und gewährt ein **14-tägiges Antwortfenster**.
2. Erfolgt innerhalb von 14 Tagen keine substantielle Antwort, wechselt der Maintainer in den Emeritus-Status, und die Berechtigungen werden entzogen.
3. Eine kurze, freundliche öffentliche Notiz wird in GitHub Discussions gepostet: „Vielen Dank für Ihre Beiträge — Sie wurden in den Emeritus-Status überführt, Sie sind jederzeit wieder willkommen."
4. Die Rückkehr ist einfach — siehe „Emeritus" weiter unten.

### Rücktritt aus wichtigem Grund

Ausgelöst durch:

- Wiederholtes Fehlverhalten (z. B. Rubber-Stamp-Approvals bei minderwertigen PRs, böswilliges Schließen von issues, Missbrauch von Berechtigungen).
- Verstoß gegen den [Verhaltenskodex][coc] des Projekts.
- Sicherheitsrelevante Vorfälle (kompromittierter Account, der nicht umgehend gemeldet wurde, vorsätzliches Leaken nicht angekündigter Roadmap-Inhalte usw.).

Ablauf:

1. Jedes Core-Team-Mitglied kann die Diskussion eröffnen.
2. **Mindestens 3 Core-Team-Mitglieder** müssen zustimmen, bevor Maßnahmen ergriffen werden (ein vollständiger Core-Team-Konsens ist nicht erforderlich).
3. Innerhalb von 24 Stunden nach der Entscheidung: Berechtigungen entzogen, Entfernung aus `#maintainers`, Entfernung von allen Maintainer-Listen (es erfolgt **kein** Übergang in den Emeritus-Status).
4. Die betroffene Person wird über die Entscheidung und die Gründe informiert und kann einmal Einspruch einlegen.

Das Prinzip lautet **im Zweifel für den Verbleib des Maintainers**. Ein einzelner kleiner Ausrutscher ist kein Grund für einen erzwungenen Rücktritt; der Weg „aus wichtigem Grund" ist ausschließlich für wiederholte Muster oder schwere Einzelvorfälle vorgesehen.

[coc]: https://www.contributor-covenant.org/

---

## Emeritus

Maintainer, die geordnet zurücktreten oder durch Inaktivität übergehen, werden zu **Emeritus**. Der Emeritus-Status:

- Entzieht Schreib-/Approve-/Close-Berechtigungen.
- Behält die namentliche Anerkennung der Person im Emeritus-Bereich der (internen) Liste bei.
- Behält den Zugang zum Discord-Channel `#maintainers` (lesend oder schreibend — nach Wahl des Maintainers).
- Bringt keine fortlaufende Verantwortung mit sich.

### Rückkehr aus dem Emeritus-Status

Der einfachste Rückkehrweg: 3 merged PRs in den letzten 30 Tagen, dann stellt das Core Team die Berechtigungen wieder her. Eine erneute Nominierung ist nicht erforderlich.

Der Sinn des Emeritus-Status besteht darin, anzuerkennen, dass das Leben passiert — ein Sabbatical, ein Jobwechsel, ein Kind — ohne Drama und ohne sozialen Preis auf beiden Seiten.

---

## Änderungen an diesem Dokument

Die Regeln in diesem Dokument können durch Konsens des Core Teams geändert werden. Wesentliche Änderungen (Aufnahmekriterien, Rücktritts-Schwellenwerte) werden in GitHub Discussions angekündigt, bevor sie für aktive Kandidaten in Kraft treten. Redaktionelle Klarstellungen können direkt übernommen werden.
