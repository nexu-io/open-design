import type { DeepPartial, CommunityCopy } from '../community-i18n';

const de: DeepPartial<CommunityCopy> = {
  hub: {
    title: 'Community — Open Design',
    desc: 'Die Open-Design-Community: Mitwirkende, die öffentlich liefern, Botschafter, die lokale Ateliers ausrichten, und Moderatoren, die den Discord warmhalten.',
    heroTitle: 'Open Design <em>nimmt Gestalt an</em><br/>, wenn du es lieferst.',
    heroLead:
      'Open Design wird von Menschen gebaut, in aller Öffentlichkeit. Skills, DESIGN.md-Systeme, Plugins, Docs: Jeder Commit ist ein Pinselstrich. Wähl unten eine Tür und finde deinen Raum.',
    cardMetaH: 'Automatisch geprägt beim ersten Merge',
    cardMetaS: 'PNG · geteilt auf X',
    cardHeroAlt:
      'Ehrenkarte eines Open-Design-Mitwirkenden — @dev-kp-eloper, Top 99,9 %, Giotto-Stufe',
    cards: [
      {
        ord: 'I',
        title: 'Contributors',
        sub: 'Die Hände, die die Arbeit <em>liefern</em>.',
        body: 'Maintainer, wöchentliche Bestenlisten, die Rangliste aller Zeiten und die offenen Issues, die du dir heute schnappen kannst. Dazu der Zero-Code-Weg für Nicht-Programmierer, ihr erstes Werk in die Registry zu schicken.',
      },
      {
        ord: 'II',
        title: 'Ambassadors',
        sub: 'Open Designs <em>Stimme</em> in deiner Stadt.',
        body: 'Eröffne ein lokales Atelier. Ruf die Meetups, die Demos, die nächtlichen Kritiken zusammen. Gestützt durch Budget, Materialien und einen privaten Kanal zum Kernteam.',
      },
      {
        ord: 'III',
        title: 'Moderators',
        sub: 'Der Raum, in dem die <em>Contributors</em> abhängen.',
        body: 'Die Front der Agent-Design-Ära. Discord ist der Ort, an dem sich die schärfsten AI-nativen Designer der Welt versammeln. Lern die Verwalter kennen, die den Raum warmhalten.',
      },
    ],
  },
  contributors: {
    title: 'Contributors — Open Design',
    desc: 'Mach bei Open Design mit: Maintainer, wöchentliche und Allzeit-Bestenlisten der Mitwirkenden, „good first issue“-Einstiege und ein Zero-Code-Weg, dein erstes Werk zu liefern.',
    heroTitle: 'Die Hände, die die Arbeit <em>liefern</em>.',
    heroLead:
      'Open Design wird von Menschen gebaut, in aller Öffentlichkeit. Skills, DESIGN.md-Systeme, Plugins, Docs: Jeder Commit ist ein Pinselstrich. Wähl ein Issue, schick einen PR und verdien dir eine einmalige Ehrenkarte in dem Moment, in dem du gemergt wirst.',
    showcase: {
      kicker: 'Plugin everything',
      h2: 'Open Design als Bühne. <em>Deine Arbeit</em> als die Show.',
      intro:
        'Das Atelier ist zugleich eine Galerie. Dir beim Schaffen zu helfen ist die halbe Miete; dafür zu sorgen, dass der Raum zum Schauen kommt, ist die andere. Jedes Werk, das du lieferst, landet nicht in einem Tresor, sondern an einer Wand, wo die Welt es finden kann.',
      tenets: [
        {
          h3: 'Alles <em>kann ein Plugin sein</em>.',
          body: 'Was auch immer das Studio hervorbringt (Inhalte, ein fertiges Produkt, ein Template, ein Skill, ein Workflow), lässt sich wieder in ein Plugin einfalten. Die Registry nimmt jede Form an; die Tür hat keinen Türsteher.',
        },
        {
          h3: 'Dein Debüt-Werk, deine <em>Aufnahme</em>.',
          body: 'An dem Tag, an dem dein erstes Werk in der Registry landet, tritt dein Name an die Wand. Kein Besucherausweis. Eine dauerhafte Zeile auf der Contributor-Liste, neben allen, die vor dir kamen.',
        },
        {
          h3: 'Ist es einmal drin, <em>reist es</em>.',
          body: 'Die Registry auf <a href="https://open-design.ai/plugins/" target="_blank" rel="noopener">open-design.ai/plugins</a> ist nur die Schwelle. Von dort werden die stärksten Werke nach außen getragen: zu X, zu Discords <span class="num">#showcase</span>, zum Newsletter, zu den Video-Reels. Jede Übergabe weitet den Raum; die Welt begegnet deiner Hand.',
        },
        {
          h3: 'Brauchst du einen <em>ersten Strich</em>?',
          body: 'Geh durch die <a href="https://open-design.ai/plugins/" target="_blank" rel="noopener">Plugin-Registry</a>. Die dort hängenden Werke sind der Zunder für dein eigenes. Borg dir den Funken und schaff dann das Werk, das nur deine Hand schaffen konnte.',
        },
      ],
      pane: {
        kicker: 'The skill',
        h3: 'Lass den <em>Agenten</em> für dich liefern.',
        lede: 'Für Macher, die den Code lieber nicht anfassen. Der ganze Beitrag steckt in einem einzigen Skill, in Alltagssprache gesprochen. Die Pinselarbeit fällt dem Agenten zu.',
        copy: 'Kopieren',
        copied: 'Kopiert',
        steps: [
          {
            h4: 'Gib dem Agenten die Zeile',
            body: 'Füge den Befehl oben in den Agenten innerhalb von Open Design ein oder in den, den du ohnehin zur Hand hast: Claude Code, Codex, Cursor. Er installiert sich selbst.',
          },
          {
            h4: 'Weck den Skill',
            body: 'Tippe <code>/od-contribute</code> oder sag dem Agenten einfach, er soll ausführen, was du gerade installiert hast. Beide Formulierungen öffnen die Tür.',
          },
          {
            h4: 'Eine halbe Minute bis zur Galerie',
            body: 'Den Rest geht der Agent. Dein Werk ist in etwa dreißig Sekunden auf dem Weg ins Open-Source-Repository; wir prüfen bei nächster Gelegenheit, und im Moment, in dem es landet, begegnet der Raum deiner Hand.',
          },
        ],
      },
    },
    maintainers: {
      kicker: 'Steering the ship',
      h2: 'Die <em>Maintainer</em>.',
      intro:
        'Maintainer schützen Richtung und Qualität von Open Design: Sie prüfen Beiträge, halten den Standard kohärent und schaffen Raum, damit sich mehr Mitwirkende ihren Platz im Projekt verdienen.',
      role: 'Maintainer',
      bios: {
        'Nagendhra-web':
          'Nagendhra bringt den Instinkt eines Data Engineers für die Wahrheit in Produktion mit: den Fehler finden, den Grenzfall messen und ihn ordentlich beheben. In Open Design zeigt sich das in Deploy-Preflight-Arbeit, gehärtetem Asset-Bundling und Windows-Fixes, die das Projekt vertrauenswürdig wirken lassen, wenn Mitwirkende liefern.',
        'Sid-Qin':
          'Sid ist der Generalist-Engineer mit dem Blick eines Designers fürs Detail: die Art von Maintainer, der sowohl den kaputten CLI-Pfad als auch die schiefe Interaktions-Affordanz bemerkt. In Open Design hält Sid Export-Flows, Plugin-Aktionen, Windows-Shims, MIME-Handling und Agent-Plumbing scharf genug, dass eine Community darauf aufbauen kann.',
      },
    },
    allTime: {
      kicker: 'All-time signal',
      h2: 'Die Mitwirkenden mit <em>tiefen Wurzeln</em>.',
      intro:
        'Ein langlaufendes Verzeichnis talentierter Mitwirkender, die Ideen, Fixes und Handwerk immer wieder in den gemeinsamen Open-Design-Standard verwandeln.',
      rankLabel: 'Mitwirkende aller Zeiten',
      week: 'Repository-Historie',
      quote:
        'Der lange Schwanz zählt: Designsysteme, Doku-Fixes, Beispiele und kleine Reparaturen sind der Weg, wie eine offene Designsprache verlässlich wird.',
      handleSuffix: '· tiefes Contributor-Signal',
      statCommits: 'Commits',
      statExternalRank: 'Externer Rang',
      headContributor: 'Mitwirkende:r',
      headCommits: 'Commits',
      headRank: 'Rang',
    },
    weekly: {
      kicker: 'Das Signal dieser Woche',
      h2: 'Zehn Mitwirkende, die <em>diese Woche</em> vorangehen.',
      intro:
        'Eine Momentaufnahme scharfer Mitwirkender, die PRs landen, das Produkt verbessern und Open Design lebendig wirken lassen.',
      rankLabel: 'Vorreiter dieser Woche',
      week: 'Letzte 7 Tage',
      handleSuffix: '· führend diese Woche',
      blurbTemplate:
        '{name} gibt diese Woche das Tempo vor mit {prs} gemergten PRs und der Art stetigem Handwerk, das Open Design in Bewegung hält.',
      statRank: 'Rang',
      statPrs: 'PRs · 7 T',
      headContributor: 'Mitwirkende:r',
      headPrs: 'PRs',
      headRank: 'Rang',
    },
    issues: {
      kicker: 'Wähl deinen ersten Beitrag',
      h2: 'Offene Issues, <em>für dich getaggt</em>.',
      intro:
        'Live aus <span class="num">label:&ldquo;good first issue&rdquo;</span> im Open-Design-Repo. Kommentiere ein Issue, um es dir zu sichern, und ein Maintainer weist es dir innerhalb eines Tages zu.',
      loading: 'good first issue',
      foot: 'Es werden die ersten <span class="num" id="issue-count">—</span> offenen good-first-issues gezeigt',
      seeAll: 'Alle auf GitHub ansehen',
      empty: 'Gerade keine offenen good-first-issues. Schau morgen wieder vorbei oder eröffne selbst eins',
      rateLimited:
        'GitHub-Rate-Limit in der Vorschau erreicht. Öffne die Live-Suche nach good-first-issues auf GitHub.',
    },
    onboard: {
      kicker: 'Vier Schritte · jedes Level',
      h2: 'Von null bis <em>gemergt</em>, an einem Nachmittag.',
      intro:
        'Ob du Designer:in, Autor:in, Ingenieur:in oder jemand bist, der gerade einen Tippfehler entdeckt hat: Es gibt eine Beitragsform für dich. Hier ist der Weg.',
      steps: [
        {
          n: 'Schritt 01',
          h3: 'Find einen <em>Funken</em>.',
          body: 'Durchstöbere die good-first-issues-Liste oben oder eröffne ein neues Issue, das etwas beschreibt, das du verbessern würdest. Für Designer: DESIGN.md-Systeme sind der leichteste Einstieg.',
        },
        {
          n: 'Schritt 02',
          h3: 'Öffne einen <em>Entwurf</em>-PR.',
          body: 'Forken, branchen, pushen. Markier ihn als Entwurf. Das signalisiert, dass du früh Feedback willst. Nenn, welches Issue er schließt. Die CI ist schnell; bot-cards bleibt auf ihrem eigenen Branch.',
        },
        {
          n: 'Schritt 03',
          h3: 'Review mit <em>einem Menschen</em>.',
          body: 'Ein Maintainer prüft innerhalb von 24 Std. Wir sind freundlich, konkret und spielen nie Türsteher. Wenn du feststeckst, wirf den PR-Link in Discord #help.',
        },
        {
          n: 'Schritt 04',
          h3: 'Merge → <em>Karte</em>.',
          body: 'Der Bot prägt deine Ehrenkarte in dem Moment, in dem du gemergt wirst, und pusht sie in den bot-cards-Branch. Teil sie auf X mit #OpenDesign, und wir reposten die besten.',
        },
      ],
      cta: 'Lies den Contributing-Guide',
    },
  },
  ambassadors: {
    title: 'Ambassadors — Open Design',
    desc: 'Werde Open-Design-Botschafter: Eröffne ein lokales Atelier, richte Meetups und Kritiken aus und erhalte Budget, Materialien und einen privaten Kanal zum Kernteam.',
    heroTitle: 'Sei Open Designs <em>Stimme</em> in deiner Stadt.',
    heroLead:
      'Eröffne ein lokales Atelier. Ruf die Meetups, die Demos, die nächtlichen Kritiken zusammen. Wir stützen dich mit Budget, Materialien und einem privaten Kanal zum Kernteam.',
    program: {
      kicker: 'Das Programm',
      h2: 'Berufung, <em>Förderung</em>, Bund.',
      applyCta: 'Über Google-Formular bewerben',
      applyNote:
        'Botschafter machen Open Design aus einem Repository zu etwas, dem Mitwirkende in einem Raum begegnen können, mit Tinte auf dem Tisch und kalt gewordenem Kaffee.',
      cols: [
        {
          n: 'I · Berufung',
          h3: 'Maler der <em>lokalen Szene</em>.',
          lede: 'Designer, Entwickler, Organisatoren: die Art, die schon andere versammelt. Wir geben der Versammlung eine Flagge.',
          items: [
            '<b>Gastgeber des lokalen Ateliers:</b> Du hältst ein wiederkehrendes Meetup, eine Studiengruppe oder einen nächtlichen Hack am Leben.',
            '<b>Leitung einer Online-Community:</b> Discord, WeChat, Telegram, X-Spaces.',
            '<b>Praktizierende:r Mitwirkende:r oder Evangelist:in:</b> lieferst bereits Arbeit, postest Handwerk, führst Neulinge heran.',
            '<b>Trägst den Namen mit Selbstverständlichkeit:</b> an den Code of Conduct gebunden, achtsam gegenüber der Marke.',
          ],
        },
        {
          n: 'II · Förderung',
          h3: 'Was das <em>Atelier</em> gewährt.',
          lede: 'Kein Freiwilligen-Abzeichen. Ein Arbeitsbund, mit Budget, Ansehen und Zugang.',
          items: [
            '<b>Eine Seite auf der Website:</b> Porträt, Stadt, Biografie, Socials, die Chronik deiner Events.',
            '<b>Erster Blick:</b> Beta-Features, interne Roadmap-Vorschauen, Releases vor der Warteschlange.',
            '<b>Das Atelier-Kit:</b> Poster, Foliensätze, Demo-Stücke, Swag; ein Beutel für Location, Getränke und Fotografie.',
            '<b>Eine Leitung ins Studio:</b> privater Kanal, monatlicher Sync, ein eigener Weg für dein Feedback.',
            '<b>Ein Weg nach vorn:</b> Ehrenkarten und Stufen, mit einem Pfad zu regionaler Leitung, Speaker- oder bezahlten Community-Rollen.',
          ],
        },
        {
          n: 'III · Bund',
          h3: 'Die <em>Disziplin</em> des Studios.',
          lede: 'Eine bescheidene Verpflichtung, aber bindend. Längere Abwesenheit geht in den Alumni-Status über; der Kreis bleibt klein und ernsthaft.',
          items: [
            '<b>Ruf zusammen</b> mindestens ein Event pro Monat oder Quartal, lokal oder online.',
            '<b>Heiß die neue Hand willkommen.</b> Führ Neulinge durch ihren ersten Beitrag.',
            '<b>Hör genau hin.</b> Sammle ehrliches Feedback von Nutzern, Designern, Entwicklern, Teams.',
            '<b>Hinterlass eine Aufzeichnung.</b> Veröffentlich nach jeder Zusammenkunft eine Nachlese: Teilnahme, Fotos, Links, Leads.',
            '<b>Trag den Namen gut.</b> Halt dich an den Code of Conduct; kein Missbrauch des Zeichens, keine im Namen des Studios unterzeichneten Deals.',
          ],
        },
      ],
    },
    roster: {
      kicker: 'Im Feld',
      h2: 'Lern die <em>Botschafter</em> kennen.',
      intro:
        'Lokale Organisatoren, Kreative und Community-Builder, die Open Design helfen, mehr Designer und Teams zu erreichen.',
      places: [
        'Sunshine Coast, Australien',
        'Kuala Lumpur, Malaysia',
        'Japan',
        'China',
      ],
    },
  },
  moderators: {
    title: 'Moderators — Open Design',
    desc: 'Lern die Open-Design-Discord-Moderatoren kennen und tritt dem Raum bei, in dem AI-native Designer Arbeit liefern, Plugins öffnen, Betas knacken und einander aus der Klemme helfen.',
    heroTitle: 'Der Raum, in dem die <em>Contributors</em> abhängen.',
    heroLead:
      'Die Front der Agent-Design-Ära öffnet sich hier. Discord ist der Ort, an dem sich die schärfsten AI-nativen Designer der Welt versammeln. Lern die Verwalter kennen, die den Raum warmhalten.',
    discord: {
      kicker: 'Wo die Contributors abhängen',
      h2: 'Sprich mit den Leuten, die <em>deinen PR prüfen</em>.',
      body: 'Die Front der Agent-Design-Ära öffnet sich hier. Unser Discord ist der Ort, an dem sich die schärfsten AI-nativen Designer der Welt versammeln: Arbeit liefern, Plugins öffnen, Betas knacken, einander aus der Klemme helfen. Tritt ein. Bring mit, woran du gerade arbeitest.',
      joinCta: 'Dem Discord beitreten',
      discussionsCta: 'GitHub Discussions',
      cards: [
        {
          role: 'Aus dem Studio',
          bio: 'Aus dem Gründungsteam von Open Design. Hofft, dass der Discord ein guter Ort zum Sein bleibt. Wink jederzeit, bei jeder Frage.',
        },
        {
          role: 'Verwalter des Raums',
          bio: 'Eine geübte Hand bei Discord und Community-Pflege. Hält den Raum warm, die Türen offen, das Gespräch im Fluss. Begeistert von Open Design.',
        },
      ],
      channelNotes: ['gelieferte Arbeit', 'Builder', 'frühes Feedback', 'aus der Klemme'],
    },
  },
};

export default de;
