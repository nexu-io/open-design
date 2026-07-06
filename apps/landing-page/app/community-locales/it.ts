import type { DeepPartial, CommunityCopy } from '../community-i18n';

const it: DeepPartial<CommunityCopy> = {
  hub: {
    title: "Community — Open Design",
    desc: "La community di Open Design: contributor che pubblicano in pubblico, ambassador che ospitano atelier locali e moderator che tengono viva la Discord.",
    heroTitle: "Open design <em>prende forma</em><br/>quando lo pubblichi.",
    heroLead:
      "Open Design è costruito dalle persone, in pubblico. Skill, sistemi DESIGN.md, plugin, documentazione: ogni commit è una pennellata. Scegli una porta qui sotto, trova la tua stanza.",
    cardMetaH: "Coniata automaticamente al primo merge",
    cardMetaS: "PNG · condivisa su X",
    cardHeroAlt:
      "Carta d'onore del contributor di Open Design — @dev-kp-eloper, top 99.9%, livello Giotto",
    cards: [
      {
        ord: "I",
        title: "Contributors",
        sub: "Le mani che <em>pubblicano</em> il lavoro.",
        body: "Maintainer, classifiche settimanali, l'albo di sempre e le issue aperte che puoi reclamare oggi. In più, il percorso senza codice per chi non programma per inviare il proprio primo pezzo nel registry.",
      },
      {
        ord: "II",
        title: "Ambassadors",
        sub: "La <em>voce</em> di Open Design nella tua città.",
        body: "Apri un atelier locale. Convoca i meetup, le demo, le critiche notturne. Con il supporto di budget, materiali e un canale privato con il core team.",
      },
      {
        ord: "III",
        title: "Moderators",
        sub: "La stanza dove i <em>contributor</em> si ritrovano.",
        body: "La prima linea dell'era dell'agent design. Discord è dove si riuniscono i designer AI-native più brillanti del mondo. Conosci i custodi che tengono viva la stanza.",
      },
    ],
  },
  contributors: {
    title: "Contributors — Open Design",
    desc: "Contribuisci a Open Design: maintainer, classifiche settimanali e di sempre dei contributor, good first issue e un percorso senza codice per pubblicare il tuo primo pezzo.",
    heroTitle: "Le mani che <em>pubblicano</em> il lavoro.",
    heroLead:
      "Open Design è costruito dalle persone, in pubblico. Skill, sistemi DESIGN.md, plugin, documentazione: ogni commit è una pennellata. Scegli una issue, invia una PR e guadagna una carta d'onore unica nel momento in cui viene fatto il merge.",
    showcase: {
      kicker: "Plugin everything",
      h2: "Open Design come palco. <em>Il tuo lavoro</em> come spettacolo.",
      intro:
        "L'atelier è anche una galleria. Aiutarti a realizzare il lavoro è metà dell'indirizzo; fare in modo che la stanza venga a guardarlo è l'altra. Ogni pezzo che pubblichi finisce non in un caveau ma su una parete, dove il mondo può trovarlo.",
      tenets: [
        {
          h3: "Qualsiasi cosa <em>può essere un plugin</em>.",
          body: "Qualunque cosa produca lo studio (un contenuto, un prodotto finito, un template, una Skill, un workflow) può essere ripiegata in un plugin. Il registry accetta ogni forma; la porta non tiene alcun guardiano.",
        },
        {
          h3: "Il tuo pezzo d'esordio, la tua <em>iniziazione</em>.",
          body: "Il giorno in cui il tuo primo pezzo arriva nel registry, il tuo nome si unisce alla parete. Non un pass da visitatore. Una riga permanente sulla lista dei contributor, accanto a tutti coloro che sono arrivati prima.",
        },
        {
          h3: "Una volta dentro, <em>viaggia</em>.",
          body: "Il registry su <a href=\"https://open-design.ai/plugins/\" target=\"_blank\" rel=\"noopener\">open-design.ai/plugins</a> è solo la soglia. Da lì i pezzi più forti vengono portati all'esterno: su X, sulla <span class=\"num\">#showcase</span> di Discord, nella newsletter, nei video reel. Ogni passaggio allarga la stanza; il mondo incontra la tua mano.",
        },
        {
          h3: "Ti serve una <em>prima pennellata</em>?",
          body: "Percorri il <a href=\"https://open-design.ai/plugins/\" target=\"_blank\" rel=\"noopener\">registry dei plugin</a>. Le opere appese lì sono esca per la tua. Prendi in prestito la scintilla, poi crea il pezzo che solo la tua mano potrebbe.",
        },
      ],
      pane: {
        kicker: "The skill",
        h3: "Lascia che sia l'<em>agent</em> a pubblicare per te.",
        lede: "Per i creativi che preferiscono non toccare il codice. L'intero contributo vive in un'unica skill, espressa in linguaggio semplice. La pennellata spetta all'agent.",
        copy: "Copia",
        copied: "Copiato",
        steps: [
          {
            h4: "Affida la riga all'agent",
            body: "Incolla il comando qui sopra nell'agent dentro Open Design, o in quello che già tieni a portata di mano: Claude Code, Codex, Cursor. Si installa da solo.",
          },
          {
            h4: "Risveglia la skill",
            body: "Digita <code>/od-contribute</code>, o semplicemente di' all'agent di eseguire ciò che hai appena installato. Entrambe le frasi aprono la porta.",
          },
          {
            h4: "Mezzo minuto alla galleria",
            body: "L'agent percorre il resto. Il tuo pezzo è diretto al repository open source in circa trenta secondi; lo revisioniamo alla prima occasione e, nel momento in cui arriva, la stanza incontra la tua mano.",
          },
        ],
      },
    },
    maintainers: {
      kicker: "Al timone",
      h2: "I <em>maintainer</em>.",
      intro:
        "I maintainer proteggono la direzione e la qualità di Open Design: revisionano i contributi, mantengono coerente lo standard e fanno spazio a più contributor perché guadagnino il loro posto nel progetto.",
      role: "Maintainer",
      bios: {
        "Nagendhra-web":
          "Nagendhra porta l'istinto di un data engineer per la verità di produzione: trovare il guasto, misurare il caso limite e risolverlo per bene. In Open Design questo si vede nel lavoro di preflight dei deploy, nel rafforzamento dell'asset bundling e nei fix per Windows che rendono il progetto affidabile quando i contributor pubblicano.",
        "Sid-Qin":
          "Sid è l'ingegnere generalista con l'occhio di un designer per il dettaglio: il tipo di maintainer che nota sia il percorso CLI rotto sia l'affordance di interazione storta. In Open Design, Sid mantiene i flussi di export, le azioni dei plugin, gli shim per Windows, la gestione MIME e l'impianto dell'agent abbastanza affilati da farci costruire sopra una community.",
      },
    },
    allTime: {
      kicker: "Segnale di sempre",
      h2: "I contributor con <em>radici profonde</em>.",
      intro:
        "Un registro di lungo corso di contributor di talento che continuano a trasformare idee, fix e mestiere nello standard condiviso di Open Design.",
      rankLabel: "Contributor di sempre",
      week: "Storia del repository",
      quote:
        "La coda lunga conta: sistemi di design, correzioni alla documentazione, esempi e piccole riparazioni sono il modo in cui un linguaggio di design aperto diventa affidabile.",
      handleSuffix: "· segnale di contributor profondo",
      statCommits: "Commit",
      statExternalRank: "Posizione esterna",
      headContributor: "Contributor",
      headCommits: "Commit",
      headRank: "Posizione",
    },
    weekly: {
      kicker: "Il segnale di questa settimana",
      h2: "Dieci contributor in testa <em>questa settimana</em>.",
      intro:
        "Un'istantanea di contributor brillanti che fanno atterrare PR, migliorano il prodotto e fanno sentire vivo Open Design.",
      rankLabel: "Leader di questa settimana",
      week: "Ultimi 7 giorni",
      handleSuffix: "· in testa questa settimana",
      blurbTemplate:
        "{name} sta dettando il ritmo questa settimana con {prs} PR mergiate e quel tipo di mestiere costante che tiene Open Design in movimento.",
      statRank: "Posizione",
      statPrs: "PR · 7g",
      headContributor: "Contributor",
      headPrs: "PR",
      headRank: "Posizione",
    },
    issues: {
      kicker: "Scegli il tuo primo contributo",
      h2: "Issue aperte, <em>taggate per te</em>.",
      intro:
        "In diretta da <span class=\"num\">label:&ldquo;good first issue&rdquo;</span> sul repo di Open Design. Commenta una issue per reclamarla, e un maintainer te la assegnerà entro un giorno.",
      loading: "good first issue",
      foot: "Mostro le prime <span class=\"num\" id=\"issue-count\">—</span> good-first-issue aperte",
      seeAll: "Vedi tutte su GitHub",
      empty: "Nessuna good-first-issue aperta al momento. Ripassa domani, o aprine una tu stesso",
      rateLimited:
        "Limite di richieste GitHub raggiunto in anteprima. Apri la ricerca live delle good-first-issue su GitHub.",
    },
    onboard: {
      kicker: "Quattro passi · qualsiasi livello",
      h2: "Da zero al <em>merge</em>, in un pomeriggio.",
      intro:
        "Che tu sia un designer, uno scrittore, un ingegnere o qualcuno che ha appena notato un refuso, c'è una forma di contributo per te. Ecco il percorso.",
      steps: [
        {
          n: "Passo 01",
          h3: "Trova una <em>scintilla</em>.",
          body: "Sfoglia la lista delle good-first-issue qui sopra, oppure apri una nuova issue che descrive qualcosa che miglioreresti. Designer: i sistemi DESIGN.md sono l'ingresso più facile.",
        },
        {
          n: "Passo 02",
          h3: "Apri una PR in <em>bozza</em>.",
          body: "Fai il fork, crea il branch, pusha. Segnala come bozza. Indica che vuoi feedback presto. Menziona quale issue chiude. La CI è veloce; le bot-cards restano sul loro branch.",
        },
        {
          n: "Passo 03",
          h3: "Revisiona con <em>una persona</em>.",
          body: "Un maintainer revisiona entro 24h. Siamo gentili, specifici e non facciamo mai i guardiani. Se sei bloccato, lascia il link della PR in Discord #help.",
        },
        {
          n: "Passo 04",
          h3: "Merge → <em>carta</em>.",
          body: "Il bot conia la tua carta d'onore nel momento del merge e la pubblica sul branch bot-cards. Condividila su X con #OpenDesign, e noi ripubblichiamo le migliori.",
        },
      ],
      cta: "Leggi la guida ai contributi",
    },
  },
  ambassadors: {
    title: "Ambassadors — Open Design",
    desc: "Diventa un ambassador di Open Design: apri un atelier locale, ospita meetup e critiche, e ottieni budget, materiali e un canale privato con il core team.",
    heroTitle: "Sii la <em>voce</em> di Open Design nella tua città.",
    heroLead:
      "Apri un atelier locale. Convoca i meetup, le demo, le critiche notturne. Ti sosteniamo con budget, materiali e un canale privato con il core team.",
    program: {
      kicker: "Il programma",
      h2: "Vocazione, <em>mecenatismo</em>, patto.",
      applyCta: "Candidati tramite Google Form",
      applyNote:
        "Gli ambassador trasformano Open Design da repository in qualcosa che i contributor possono incontrare in una stanza, con l'inchiostro sul tavolo e il caffè ormai freddo.",
      cols: [
        {
          n: "I · Vocazione",
          h3: "Pittori della <em>scena locale</em>.",
          lede: "Designer, sviluppatori, organizzatori: quelli che già radunano gli altri. Diamo un vessillo al raduno.",
          items: [
            "<b>Host di atelier locale:</b> tieni vivo un meetup ricorrente, un gruppo di studio o un hack notturno.",
            "<b>Guida di community online:</b> Discord, WeChat, Telegram, X spaces.",
            "<b>Contributor praticante o evangelist:</b> già pubblichi lavoro, condividi il mestiere, accompagni i nuovi arrivati.",
            "<b>A tuo agio nel portare il nome:</b> vincolato al Code of Conduct, attento al brand.",
          ],
        },
        {
          n: "II · Mecenatismo",
          h3: "Ciò che l'<em>atelier</em> offre.",
          lede: "Non un distintivo da volontario. Un legame operativo, con budget, prestigio e accesso.",
          items: [
            "<b>Una pagina sul sito:</b> ritratto, città, biografia, social, la cronaca dei tuoi eventi.",
            "<b>Prima visione:</b> feature beta, anteprime della roadmap interna, release prima della coda.",
            "<b>Il kit dell'atelier:</b> poster, presentazioni, pezzi demo, gadget; una borsa per sede, drink e fotografia.",
            "<b>Una linea con lo studio:</b> canale privato, sync mensile, un percorso dedicato per il tuo feedback.",
            "<b>Una via avanti:</b> carte d'onore e livelli, con un percorso verso lead regionale, speaker o ruoli retribuiti nella community.",
          ],
        },
        {
          n: "III · Patto",
          h3: "La <em>disciplina</em> dello studio.",
          lede: "Un impegno modesto, ma vincolante. Un'assenza prolungata confluisce nello status di alumni; il cerchio resta piccolo e serio.",
          items: [
            "<b>Convoca</b> almeno un evento al mese o al trimestre, locale o online.",
            "<b>Accogli la nuova mano.</b> Accompagna i nuovi arrivati nel loro primo contributo.",
            "<b>Ascolta con attenzione.</b> Raccogli feedback onesti da utenti, designer, sviluppatori, team.",
            "<b>Lascia una traccia.</b> Pubblica un resoconto dopo ogni raduno: presenze, fotografie, link, lead.",
            "<b>Porta bene il nome.</b> Attieniti al Code of Conduct; nessun uso improprio del marchio, nessun accordo firmato per conto dello studio.",
          ],
        },
      ],
    },
    roster: {
      kicker: "Sul campo",
      h2: "Conosci gli <em>ambassador</em>.",
      intro:
        "Organizzatori locali, creator e community builder che aiutano Open Design a raggiungere più designer e team.",
      places: [
        "Sunshine Coast, Australia",
        "Kuala Lumpur, Malaysia",
        "Giappone",
        "Cina",
      ],
    },
  },
  moderators: {
    title: "Moderators — Open Design",
    desc: "Conosci i moderator della Discord di Open Design e unisciti alla stanza dove i designer AI-native pubblicano lavoro, aprono plugin, testano le beta e si aiutano a vicenda a sbloccarsi.",
    heroTitle: "La stanza dove i <em>contributor</em> si ritrovano.",
    heroLead:
      "La prima linea dell'era dell'agent design si apre qui. Discord è dove si riuniscono i designer AI-native più brillanti del mondo. Conosci i custodi che tengono viva la stanza.",
    discord: {
      kicker: "Dove si ritrovano i contributor",
      h2: "Parla con le persone che <em>revisioneranno la tua PR</em>.",
      body: "La prima linea dell'era dell'agent design si apre qui. La nostra Discord è dove si riuniscono i designer AI-native più brillanti del mondo: pubblicano lavoro, aprono plugin, testano le beta, si aiutano a vicenda a sbloccarsi. Entra. Porta ciò che stai creando.",
      joinCta: "Unisciti alla Discord",
      discussionsCta: "GitHub Discussions",
      cards: [
        {
          role: "Dallo studio",
          bio: "Dal team fondatore di Open Design. Spera che la Discord resti un bel posto in cui stare. Saluta in qualsiasi momento, per qualsiasi domanda.",
        },
        {
          role: "Custode della stanza",
          bio: "Mano esperta di Discord e di cura della community. Tiene viva la stanza, le porte aperte, la conversazione che scorre. Appassionato di Open Design.",
        },
      ],
      channelNotes: ["lavoro pubblicato", "builder", "feedback iniziale", "sbloccarsi"],
    },
  },
};

export default it;
