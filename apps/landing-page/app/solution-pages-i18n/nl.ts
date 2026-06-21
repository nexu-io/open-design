import type { SolutionLocaleCopy } from './types';

export const NL: SolutionLocaleCopy = {
  prototype: {
    title: 'Bouw interactieve prototypes met Open Design + Claude Code',
    description:
      'Verander een prompt in een aanklikbaar prototype met meerdere schermen zonder je terminal te verlaten. Open Design geeft je coding agent de ontwerpvaardigheden, sjablonen en het designsysteem om echte prototypes te maken die je in een browser kunt openen.',
    breadcrumb: 'Prototype',
    label: 'Toepassing · Prototype',
    heading: 'Prototype zo snel als een prompt',
    lead: 'Beschrijf de flow die je voor ogen hebt en laat je agent een echt, aanklikbaar prototype samenstellen — meerdere schermen, gedeelde stijlen en live interacties — rechtstreeks gerenderd naar HTML die je kunt openen, delen en aan engineering kunt overdragen.',
    heroImageAlt:
      'Redactionele illustratie van een hand die een wireframe schetst die verandert in een aanklikbaar app-prototype met meerdere schermen',
    tldrTitle: 'In één zin',
    tldrBody:
      'Open Design is de ontwerplaag voor de coding agent die je al gebruikt. Voor prototyping betekent dat: van een idee van één alinea naar een navigeerbaar, gestileerd prototype in één sessie — geen ontwerptool, geen exportstap, geen overdrachtskloof.',
    stepsTitle: 'Hoe prototyping werkt met Open Design',
    steps: [
      {
        title: 'Beschrijf de flow',
        body: 'Vertel je agent in gewone taal wat je bouwt — “een onboardingflow met een welkomstscherm, een abonnementskiezer en een bevestiging.” Open Design laadt de prototypevaardigheid, zodat de agent weet dat hij schermen moet maken, niet één pagina.',
        imageAlt:
          'Illustratie van een persoon die een beschrijving van een app-flow in gewone taal in een terminal typt',
      },
      {
        title: 'Genereer gestileerde schermen',
        body: 'De agent past een designsysteem en prototypesjablonen uit Open Design toe, zodat elk scherm typografie, witruimte en componenten deelt in plaats van op een ruwe schets te lijken. Je krijgt een samenhangende set schermen, geen losse mockups.',
        imageAlt:
          'Illustratie van meerdere app-schermen die na elkaar verschijnen, allemaal met één consistente visuele stijl',
      },
      {
        title: 'Koppel de interacties',
        body: 'Knoppen navigeren, tabs wisselen, modals openen. Het prototype rendert naar zelfstandige HTML, dus het gedraagt zich als het echte ding in elke browser — er is geen account voor een prototypingtool nodig om het te bekijken.',
        imageAlt:
          'Illustratie van een cursor die door gekoppelde schermen klikt, met pijlen die de navigatie ertussen tonen',
      },
      {
        title: 'Itereer en draag over',
        body: 'Verfijn door met de agent te praten — “maak van de abonnementskiezer een indeling met drie kolommen.” Omdat het artefact in je project leeft, delen het ontwerp en de uiteindelijke code één bron van waarheid, waarmee de gebruikelijke overdrachtskloof tussen ontwerper en engineer wordt gedicht.',
        imageAlt:
          'Illustratie van een prototype dat wordt herzien en daarna aan een engineer wordt overgedragen, waarbij ontwerp en code samensmelten tot één bestand',
      },
    ],
    tableTitle: 'Prototyping met Open Design versus de oude manier',
    tableColCapability: 'Wat je nodig hebt',
    tableColWithOd: 'Met Open Design',
    tableColWithout: 'Traditionele prototypingtools',
    tableRows: [
      {
        capability: 'Van idee naar eerste scherm',
        withOd: 'Eén prompt in de agent die je al open hebt',
        without: 'Open een aparte tool, begin een bestand, sleep vakken met de hand',
      },
      {
        capability: 'Meerdere gekoppelde schermen',
        withOd: 'Gegenereerd als set met gedeelde stijlen en werkende navigatie',
        without: 'Elk frame handmatig getekend en gekoppeld',
      },
      {
        capability: 'Consistent visueel systeem',
        withOd: 'Geput uit een herbruikbaar designsysteem dat de agent toepast',
        without: 'Per bestand opnieuw gemaakt of met de hand onderhouden',
      },
      {
        capability: 'Deelbaar resultaat',
        withOd: 'Zelfstandige HTML — opent in elke browser, geen account',
        without: 'De kijker heeft een seat of een deellink in de tool van de leverancier nodig',
      },
      {
        capability: 'Pad naar echte code',
        withOd: 'Artefact leeft in je repo; ontwerp en code delen één bron',
        without: 'Vanaf nul opnieuw gebouwd na een aparte overdracht',
      },
      {
        capability: 'Kosten en lock-in',
        withOd: 'Open source, gebruik je eigen sleutels, draait lokaal',
        without: 'Abonnement per seat, gehost door leverancier, beperkte export',
      },
    ],
    featuresTitle: 'Wat je kunt prototypen',
    features: [
      {
        title: 'Web-apps met meerdere schermen',
        body: 'Volledige flows met gedeelde navigatie — onboarding, dashboards, instellingen — geen losse pagina’s.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Mobiele app-flows',
        body: 'Mobiele trajecten scherm voor scherm met overgangen en toestanden die native aanvoelen.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Landingspagina’s',
        body: 'Marketingpagina’s en SaaS-landingspagina’s die je kunt doorklikken en uitbrengen.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Elke visuele smaak',
        body: 'Redactioneel, zacht of brutalistisch — het prototype draagt een samenhangende stijl van begin tot eind.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Wachtlijst en prijzen',
        body: 'Conversievlakken — wachtlijsten, prijstabellen — gekoppeld en in lijn met het merk.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Gamified en speels',
        body: 'Interactierijke concepten waarbij beweging en toestand deel uitmaken van de pitch.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Prototypes die mensen bouwden met Open Design',
    galleryLead:
      'Elk van deze begon als een prompt en renderde naar een aanklikbaar artefact. Kies een sjabloon dicht bij je idee, beschrijf je variant, en de agent past het aan.',
    gallery: [
      { thumb: "example-dating-web", caption: "Dating-web-app — flow met meerdere schermen" },
      { thumb: "example-hr-onboarding", caption: "HR-onboardingflow" },
      { thumb: "example-kami-landing", caption: "Productlandingspagina" },
      { thumb: "example-web-prototype-taste-soft", caption: "Web-prototype in zachte stijl" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Blader door prototypesjablonen',
    faqTitle: 'Veelgestelde vragen over prototyping',
    faq: [
      {
        q: 'Heb ik een ontwerptool als Figma nodig om te prototypen met Open Design?',
        a: 'Nee. Open Design draait binnen je coding agent en rendert prototypes naar HTML. Je beschrijft de flow in taal; de agent maakt de schermen. Er is geen aparte canvastool om te leren of voor te betalen.',
      },
      {
        q: 'Zijn de prototypes interactief of zijn het slechts statische mockups?',
        a: 'Interactief. Navigatie, tabs en modals werken omdat de uitvoer echte HTML en CSS is. Je kunt er in elke browser doorheen klikken, precies zoals een gebruiker zou doen.',
      },
      {
        q: 'Welke agents kan ik gebruiken?',
        a: 'Open Design werkt met Claude Code, Codex, Cursor Agent, Gemini CLI en een tiental andere eigen adapters. Je gebruikt je eigen providersleutels; er wordt niets voor je gehost.',
      },
      {
        q: 'Kan een prototype het echte product worden?',
        a: 'Dat is juist de bedoeling. Het artefact leeft in je project, dus hetzelfde designsysteem en dezelfde componenten gaan mee de productiecode in in plaats van na een overdracht weggegooid te worden.',
      },
    ],
    ctaTitle: 'Prototype je volgende idee vanavond nog',
    ctaBody:
      'Geef de repo een ster, installeer Open Design en verander je volgende “wat als” in iets dat je kunt aanklikken — in de agent die je al gebruikt.',
  },
  dashboard: {
    title: 'Genereer datadashboards met Open Design + Claude Code',
    description:
      'Beschrijf de metrics die je bijhoudt en laat je coding agent een gestileerd, responsief dashboard bouwen — grafieken, KPI-kaarten en tabellen gerenderd naar HTML die je overal kunt hosten. Geen seat in een BI-tool, geen sleep-en-neerzetbouwer.',
    breadcrumb: 'Dashboard',
    label: 'Toepassing · Dashboard',
    heading: 'Dashboards uit een beschrijving, niet uit een sleep-en-neerzetbouwer',
    lead: 'Vertel je agent wat hij moet tonen en hoe het moet aanvoelen. Open Design levert de grafiekpatronen, het indelingssysteem en de visuele taal, zodat je een samenhangend, presentabel dashboard krijgt — geen muur van standaard gestileerde widgets.',
    heroImageAlt:
      'Redactionele illustratie van ruwe cijfers links die overvloeien in een strak dashboard met grafieken en KPI-kaarten rechts',
    tldrTitle: 'In één zin',
    tldrBody:
      'Open Design verandert een specificatie van je metrics in gewone taal in een gestileerd dashboard dat je agent naar HTML rendert — geversioneerd in je repo, overal te hosten, zonder BI-abonnement per seat.',
    stepsTitle: 'Hoe dashboards werken met Open Design',
    steps: [
      {
        title: 'Beschrijf de metrics',
        body: 'Som op wat ertoe doet — “wekelijks actieve gebruikers, omzet per abonnement, churn en een trend over 30 dagen.” De agent laadt de dashboardvaardigheid, zodat hij KPI-kaarten, grafieken en een tabel indeelt in plaats van één tekstblok.',
        imageAlt: 'Illustratie van een persoon die de metrics opsomt waar hij om geeft',
      },
      {
        title: 'Kies de grafiekpatronen',
        body: 'Open Design levert grafiek- en indelingssjablonen, zodat trends lijngrafieken worden, uitsplitsingen staven en verhoudingen het juiste beeld — consistente typografie en witruimte overal in plaats van niet-passende standaarden.',
        imageAlt: 'Illustratie van meerdere grafiektypes geordend in een samenhangend raster',
      },
      {
        title: 'Koppel je data',
        body: 'Wijs het dashboard naar een CSV, een JSON-endpoint, of plak voorbeeldrijen. Het rendert naar zelfstandige HTML die bijwerkt wanneer de data verandert — open het in elke browser, zet het op elke statische host.',
        imageAlt: 'Illustratie van een databestand dat verbinding maakt met een live bijwerkend dashboard',
      },
      {
        title: 'Verfijn en lever op',
        body: 'Pas aan door met de agent te praten — “groepeer de omzet per regio, zet de KPI-rij bovenaan.” Het artefact leeft in je project, dus het dashboard is te beoordelen en te versioneren als elke andere code.',
        imageAlt: 'Illustratie van een dashboard dat wordt verfijnd en daarna uitgerold',
      },
    ],
    tableTitle: 'Dashboards met Open Design versus de oude manier',
    tableColCapability: 'Wat je nodig hebt',
    tableColWithOd: 'Met Open Design',
    tableColWithout: 'BI-tools / met de hand gecodeerd',
    tableRows: [
      {
        capability: 'Van metriclijst naar indeling',
        withOd: 'Eén prompt; de agent deelt kaarten, grafieken en tabellen in',
        without: 'Sleep widgets stuk voor stuk, of schrijf grafiekcode vanaf nul',
      },
      {
        capability: 'Consistent visueel systeem',
        withOd: 'Grafiekpatronen en witruimte uit een herbruikbaar designsysteem',
        without: 'Standaard widgetstijlen, of per grafiek met de hand gestileerd',
      },
      {
        capability: 'Data koppelen',
        withOd: 'CSV / JSON / geplakte rijen, gerenderd naar live HTML',
        without: 'Leverancierconnectors of maatwerk dataleidingen',
      },
      {
        capability: 'Hosten en delen',
        withOd: 'Zelfstandige HTML op elke statische host, geen account',
        without: 'De kijker heeft een seat bij de BI-leverancier nodig',
      },
      {
        capability: 'Beoordeling en versiebeheer',
        withOd: 'Leeft in je repo; te diffen als code',
        without: 'Opgesloten bij de leverancier, geen echte diff',
      },
      {
        capability: 'Kosten en lock-in',
        withOd: 'Open source, gebruik je eigen sleutels, draait lokaal',
        without: 'Abonnement per seat, gehost door leverancier',
      },
    ],
    featuresTitle: 'Wat je kunt bouwen',
    features: [
      { title: "Productanalyse", body: "Actieve gebruikers, funnels, retentie — de metrics waar een productteam in leeft.", thumb: "example-dashboard" },
      { title: "Repo- en dev-metrics", body: "Sterren, PR’s, CI-gezondheid — engineeringdashboards uit je eigen data.", thumb: "example-github-dashboard" },
      { title: "Financiële rapporten", body: "Omzet, burn, runway uitgewerkt als een deelbaar rapport.", thumb: "example-finance-report" },
      { title: "Live operations", body: "Realtime metrics die verversen wanneer de onderliggende data beweegt.", thumb: "example-live-dashboard" },
      { title: "Social en marketing", body: "Kanaalprestaties en campagnetracking in één overzicht.", thumb: "example-social-media-dashboard" },
      { title: "Domeinrapporten", body: "Gestructureerde rapporten voor elk vakgebied — van klinisch tot trading.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Dashboards die mensen bouwden met Open Design',
    galleryLead:
      'Echte dashboards gerenderd uit een prompt en een databron. Begin met een die dicht bij die van jou ligt en beschrijf de metrics die je bijhoudt.',
    gallery: [
      { thumb: "example-data-report", caption: "Datarapport" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Live ops-dashboard" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Trading-analysedashboard" },
      { thumb: "example-frame-data-chart-nyt", caption: "Redactionele datagrafiek" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Blader door dashboardsjablonen',
    faqTitle: 'Veelgestelde vragen over dashboards',
    faq: [
      {
        q: 'Heb ik een BI-tool als Tableau of Looker nodig?',
        a: 'Nee. Open Design rendert dashboards naar HTML binnen je coding agent. Je beschrijft de metrics en wijst hem naar je data; er is geen apart BI-platform om te licentiëren of te leren.',
      },
      {
        q: 'Waar komt de data vandaan?',
        a: 'Een CSV, een JSON-endpoint, of rijen die je inplakt. Het dashboard is pure HTML en JavaScript, dus jij bepaalt precies waar het uit leest — niets wordt via een gehoste dienst doorgesluisd.',
      },
      {
        q: 'Kunnen niet-technische teamgenoten het bekijken?',
        a: 'Ja. De uitvoer is een zelfstandige webpagina. Iedereen met de link of het bestand kan het in een browser openen — geen account, geen seat.',
      },
      {
        q: 'Welke agents kan ik gebruiken?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI en een tiental andere eigen adapters. Je gebruikt je eigen providersleutels.',
      },
    ],
    ctaTitle: 'Bouw je dashboard vanavond nog',
    ctaBody:
      'Geef de repo een ster, installeer Open Design en verander je metrics in een dashboard dat je overal kunt hosten — in de agent die je al gebruikt.',
  },
  slides: {
    title: 'Genereer presentatiedecks met Open Design + Claude Code',
    description:
      'Verander een outline in een ontworpen, on-brand slidedeck zonder een presentatie-app te openen. Open Design geeft je coding agent decksjablonen en een visueel systeem, en rendert slides naar HTML die je kunt presenteren, exporteren of delen.',
    breadcrumb: 'Slides',
    label: 'Toepassing · Slides',
    heading: 'Decks die ontworpen ogen, geschreven door een prompt',
    lead: 'Geef je agent een outline en een toon. Open Design past een decksjabloon en visueel systeem toe, zodat elke slide opgemaakt, gezet en on-brand is — geen opsomming op een lege achtergrond.',
    heroImageAlt:
      'Redactionele illustratie van een outline links die verandert in een reeks ontworpen presentatieslides rechts',
    tldrTitle: 'In één zin',
    tldrBody:
      'Open Design verandert een outline in een ontworpen HTML-deck dat je agent in één sessie rendert — presenteer het in de browser, exporteer naar PDF of PPTX, en houd de bron in je repo.',
    stepsTitle: 'Hoe decks werken met Open Design',
    steps: [
      {
        title: 'Geef de outline',
        body: 'Plak je gesprekspunten of een ruwe structuur. De agent laadt de deckvaardigheid, zodat hij een reeks opgemaakte slides maakt, niet één lang document.',
        imageAlt: 'Illustratie van een tekstoutline die aan een agent wordt overhandigd',
      },
      {
        title: 'Kies een deckstijl',
        body: 'Open Design levert decksjablonen — redactioneel, Zwitsers-internationaal, donker technisch en meer. De agent past er één toe, zodat typografie, raster en accenten over elke slide consistent blijven.',
        imageAlt: 'Illustratie van meerdere deckstijlopties naast elkaar gelegd',
      },
      {
        title: 'Genereer de slides',
        body: 'Elk punt wordt een ontworpen slide met de juiste hiërarchie — titels, ondersteunende beelden, datahighlights. Het rendert naar HTML, dus het presenteert schermvullend in elke browser.',
        imageAlt: 'Illustratie van een reeks afgeronde slides met consistente styling',
      },
      {
        title: 'Presenteer, exporteer, itereer',
        body: 'Presenteer vanuit de browser, of exporteer naar PDF / PPTX om te delen. Verfijn door met de agent te praten — “strakker de dataslide, voeg een afsluitende call to action toe.” De deckbron blijft in je project.',
        imageAlt: 'Illustratie van een deck dat wordt gepresenteerd en geëxporteerd naar meerdere formaten',
      },
    ],
    tableTitle: 'Decks met Open Design versus de oude manier',
    tableColCapability: 'Wat je nodig hebt',
    tableColWithOd: 'Met Open Design',
    tableColWithout: 'PowerPoint / Keynote / AI-slidetools',
    tableRows: [
      {
        capability: 'Van outline naar slides',
        withOd: 'Eén prompt; de agent deelt elke slide in',
        without: 'Bouw elke slide met de hand, of worstel met een sjabloon',
      },
      {
        capability: 'Consistent ontwerp',
        withOd: 'Decksjablonen met een echt raster en typesysteem',
        without: 'Thema-afwijking, handmatige uitlijning, off-brand standaarden',
      },
      {
        capability: 'Data en diagrammen',
        withOd: 'Grafieken en highlights gerenderd als onderdeel van de slide',
        without: 'Plak statische afbeeldingen of bouw grafieken telkens opnieuw',
      },
      {
        capability: 'Exportformaten',
        withOd: 'HTML om te presenteren, plus export naar PDF / PPTX',
        without: 'Vastgezet op het formaat van één app',
      },
      {
        capability: 'Beoordeling en versiebeheer',
        withOd: 'Bron leeft in je repo, te diffen',
        without: 'Binair bestand, geen betekenisvolle diff',
      },
      {
        capability: 'Kosten en lock-in',
        withOd: 'Open source, gebruik je eigen sleutels, draait lokaal',
        without: 'App-licentie of AI-add-on per seat',
      },
    ],
    featuresTitle: 'Wat je kunt presenteren',
    features: [
      { title: "Pitchdecks", body: "Investeerders- en salesdecks met een sterk verhaal en strakke dataslides.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Zwitsers / redactioneel", body: "Rastergedreven, typografische decks die art-directed ogen.", thumb: "example-deck-swiss-international" },
      { title: "Cursusmodules", body: "Lesdecks met heldere stappen, highlights en tempo.", thumb: "example-html-ppt-course-module" },
      { title: "Datagrafiekdecks", body: "Donkere, grafiekgerichte decks voor analyse en reviews.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Presentatormodus", body: "Decks in reveal-stijl gebouwd om live in de browser te presenteren.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Technische blauwdrukken", body: "Architectuur- en kennisdecks die complexe systemen in kaart brengen.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Decks die mensen bouwden met Open Design',
    galleryLead:
      'Echte decks gerenderd uit een outline. Kies een stijl dicht bij je presentatie en beschrijf de inhoud.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Redactioneel magazinedeck" },
      { thumb: "example-guizang-ppt", caption: "Geïllustreerde keynote" },
      { thumb: "example-deck-open-slide-canvas", caption: "Open slide canvas-deck" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Deck met gradiëntthema" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Blader door decksjablonen',
    faqTitle: 'Veelgestelde vragen over slides',
    faq: [
      {
        q: 'Heb ik PowerPoint of Keynote nodig?',
        a: 'Nee. Open Design rendert decks naar HTML binnen je coding agent en kan exporteren naar PDF of PPTX. Je presenteert vanuit de browser of draagt een bestand over — er is geen presentatie-app nodig om het te bouwen.',
      },
      {
        q: 'Zijn dit gewoon door AI gegenereerde opsommingen?',
        a: 'Nee. De agent past een echt decksjabloon toe met een raster, typeschaal en visuele hiërarchie, zodat slides ontworpen ogen in plaats van automatisch ingevuld.',
      },
      {
        q: 'Kan ik naar PowerPoint exporteren voor een klant?',
        a: 'Ja. Decks exporteren naar PPTX en PDF naast de HTML waarvanuit je presenteert, zodat ze passen bij wat het publiek verwacht.',
      },
      {
        q: 'Welke agents kan ik gebruiken?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI en meer eigen adapters, met je eigen providersleutels.',
      },
    ],
    ctaTitle: 'Bouw je volgende deck vanavond nog',
    ctaBody:
      'Geef de repo een ster, installeer Open Design en verander je outline in een ontworpen deck — in de agent die je al gebruikt.',
  },
  image: {
    title: 'Genereer on-brand graphics met Open Design + Claude Code',
    description:
      'Maak socialkaarten, artikelomslagen en marketinggraphics uit een prompt — opgemaakt met echte typografie en jouw merksysteem, gerenderd naar scherpe HTML die je naar PNG kunt exporteren. Geen ontwerp-app, geen sjabloonabonnement.',
    breadcrumb: 'Afbeelding',
    label: 'Toepassing · Afbeelding',
    heading: 'On-brand graphics, voor je gegenereerd en opgemaakt',
    lead: 'Beschrijf de kaart of omslag die je nodig hebt. Open Design stelt hem samen met echte typografie, raster en jouw merkkleuren — en rendert vervolgens naar HTML die je als afbeelding kunt exporteren, in plaats van te worstelen met een ontwerp-app of een generiek sjabloon.',
    heroImageAlt:
      'Redactionele illustratie van een prompt die verandert in een set opgemaakte socialkaarten en artikelomslagen',
    tldrTitle: 'In één zin',
    tldrBody:
      'Open Design verandert een prompt in een gezette, on-brand graphic die je agent naar HTML rendert en naar PNG exporteert — herhaalbaar, geversioneerd en vrij van ontwerptools per seat.',
    stepsTitle: 'Hoe graphics werken met Open Design',
    steps: [
      {
        title: 'Beschrijf de graphic',
        body: 'Zeg wat het is — “een Twitter-kaart voor onze launch met de kop en een quote.” De agent laadt de juiste vaardigheid, zodat hij een opgemaakte graphic samenstelt, geen kale tekstblok.',
        imageAlt: 'Illustratie van een persoon die een socialkaart beschrijft die hij nodig heeft',
      },
      {
        title: 'Pas het merksysteem toe',
        body: 'Open Design haalt je kleuren, typografie en witruimte uit een herbruikbaar designsysteem, zodat elke kaart bij de rest van je merk past in plaats van eenmalig te ogen.',
        imageAlt: 'Illustratie van merkkleuren en typografie die op een kaartindeling worden toegepast',
      },
      {
        title: 'Render en exporteer',
        body: 'De graphic rendert naar HTML in precies de afmetingen die je nodig hebt — socialkaart, omslag, banner — en exporteert vervolgens naar PNG. Scherpe tekst, echte opmaak, geen handmatig schuiven.',
        imageAlt: 'Illustratie van een graphic die rendert en exporteert naar een afbeeldingsbestand',
      },
      {
        title: 'Hergebruik het recept',
        body: 'Omdat het een sjabloon is, is de volgende graphic één prompt verderop — verander de kop, behoud de opmaak. Reeksen kaarten blijven perfect consistent.',
        imageAlt: 'Illustratie van één kaartsjabloon dat een consistente reeks graphics produceert',
      },
    ],
    tableTitle: 'Graphics met Open Design versus de oude manier',
    tableColCapability: 'Wat je nodig hebt',
    tableColWithOd: 'Met Open Design',
    tableColWithout: 'Ontwerp-apps / generieke sjablonen',
    tableRows: [
      {
        capability: 'Van idee naar opgemaakte graphic',
        withOd: 'Eén prompt; de agent stelt typografie en opmaak samen',
        without: 'Open een app, plaats elk element met de hand',
      },
      {
        capability: 'On-brand blijven',
        withOd: 'Kleuren en typografie uit een herbruikbaar designsysteem',
        without: 'Per bestand merkstijlen opnieuw kiezen, of off-brand afdwalen',
      },
      {
        capability: 'Consistente reeks',
        withOd: 'Zelfde sjabloon, nieuwe tekst — perfect uitgelijnde set',
        without: 'Elke variant met de hand uitlijnen',
      },
      {
        capability: 'Export',
        withOd: 'HTML in exacte afmetingen, geëxporteerd naar PNG',
        without: 'Handmatige canvasgrootte en exportinstellingen',
      },
      {
        capability: 'Herhaalbaar',
        withOd: 'Een door prompts gestuurd recept in je repo',
        without: 'Een eenmalig bestand dat je telkens opnieuw maakt',
      },
      {
        capability: 'Kosten en lock-in',
        withOd: 'Open source, gebruik je eigen sleutels, draait lokaal',
        without: 'Ontwerptool per seat of sjabloonmarktplaats',
      },
    ],
    featuresTitle: 'Wat je kunt maken',
    features: [
      { title: "Socialkaarten", body: "X / Twitter-kaarten samengesteld met jouw kop en merk.", thumb: "example-card-twitter" },
      { title: "Artikelomslagen", body: "Redactionele, magazineachtige omslagen voor posts en nieuwsbrieven.", thumb: "example-article-magazine" },
      { title: "Xiaohongshu-kaarten", body: "Kaarten in RedNote-stijl afgestemd op die feed.", thumb: "example-card-xiaohongshu" },
      { title: "Hero-graphics", body: "Vloeiende, gradiënt hero-beelden voor sites en launches.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Carrousels", body: "Socialcarrousels met meerdere slides die consistent blijven over frames.", thumb: "example-social-carousel" },
      { title: "UI-mockupframes", body: "Notificatie- en apparaatframes om productverhalen te vertellen.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Graphics die mensen bouwden met Open Design',
    galleryLead:
      'Echte kaarten en omslagen gerenderd uit een prompt. Kies er een dicht bij wat je nodig hebt en wissel je tekst erin.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Pastel socialkaart" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Redactionele driekleurenposter" },
      { thumb: "example-magazine-poster", caption: "Poster in magazinestijl" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Gedurfde redactionele omslag" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Blader door graphicsjablonen',
    faqTitle: 'Veelgestelde vragen over afbeeldingen',
    faq: [
      {
        q: 'Is dit een AI-beeldgenerator zoals Midjourney?',
        a: 'Nee. Open Design stelt graphics samen met echte opmaak en typografie — jouw kop, jouw merk, exacte afmetingen — en rendert naar HTML die je als PNG exporteert. Het is ontwerpcompositie, geen pixelgeneratie.',
      },
      {
        q: 'Kan ik een consistente reeks kaarten maken?',
        a: 'Ja. Omdat elke graphic een sjabloon is, behoud je de opmaak en verander je de tekst, zodat een hele reeks perfect uitgelijnd en on-brand blijft.',
      },
      {
        q: 'Welke formaten kan het maken?',
        a: 'Elk formaat — de graphic rendert in precies de afmetingen die je opgeeft, van een vierkante socialkaart tot een brede banner, en exporteert vervolgens naar PNG.',
      },
      {
        q: 'Welke agents kan ik gebruiken?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI en meer eigen adapters, met je eigen providersleutels.',
      },
    ],
    ctaTitle: 'Maak je volgende graphic vanavond nog',
    ctaBody:
      'Geef de repo een ster, installeer Open Design en verander een prompt in een on-brand graphic — in de agent die je al gebruikt.',
  },
  video: {
    title: 'Genereer motion graphics en korte video met Open Design + Claude Code',
    description:
      'Verander een script in geanimeerde frames en korte video — titelkaarten, bewegende achtergronden en outro’s samengesteld met jouw merksysteem en gerenderd vanuit HTML. Geen motion-graphics-suite, geen tijdlijn-geschuif.',
    breadcrumb: 'Video',
    label: 'Toepassing · Video',
    heading: 'Motion graphics uit een script, niet uit een tijdlijn',
    lead: 'Beschrijf het moment dat je wilt — een titelonthulling, een data-animatie, een logo-outro. Open Design stelt geanimeerde frames samen met jouw merksysteem en rendert ze naar video, zonder dat er een motion-graphics-suite nodig is.',
    heroImageAlt:
      'Redactionele illustratie van een script dat verandert in een reeks geanimeerde videoframes',
    tldrTitle: 'In één zin',
    tldrBody:
      'Open Design verandert een script in geanimeerde, on-brand frames die je agent naar korte video rendert — samengesteld uit HTML, geversioneerd in je repo, zonder tijdlijneditor om te leren.',
    stepsTitle: 'Hoe motion werkt met Open Design',
    steps: [
      {
        title: 'Beschrijf het moment',
        body: 'Zeg wat er moet gebeuren — “een glitch-titel die oplost in ons logo, daarna een afsluitende kaart.” De agent laadt de motionvaardigheid, zodat hij geanimeerde frames maakt, geen statisch beeld.',
        imageAlt: 'Illustratie van een persoon die een motionreeks beschrijft',
      },
      {
        title: 'Pas de merk- en motionstijl toe',
        body: 'Open Design levert framesjablonen — cinematische light leaks, glitch-titels, logo-outro’s — en past jouw kleuren en typografie toe, zodat de beweging doelbewust en on-brand oogt.',
        imageAlt: 'Illustratie van merkstyling toegepast op geanimeerde frames',
      },
      {
        title: 'Render de frames naar video',
        body: 'Frames worden samengesteld in HTML en gerenderd naar video, zodat timing en opmaak precies en herhaalbaar zijn — geen handmatig keyframen op een tijdlijn.',
        imageAlt: 'Illustratie van HTML-frames die renderen tot een videoclip',
      },
      {
        title: 'Itereer en exporteer',
        body: 'Verfijn door met de agent te praten — “vertraag de titelonthulling, voeg een onderschrift toe.” Exporteer korte clips voor social of product. De bron blijft in je project.',
        imageAlt: 'Illustratie van een videoclip die wordt verfijnd en geëxporteerd voor social',
      },
    ],
    tableTitle: 'Motion met Open Design versus de oude manier',
    tableColCapability: 'Wat je nodig hebt',
    tableColWithOd: 'Met Open Design',
    tableColWithout: 'After Effects / motion-suites',
    tableRows: [
      {
        capability: 'Van script naar geanimeerde frames',
        withOd: 'Eén prompt; de agent stelt de reeks samen',
        without: 'Keyframe elk element met de hand op een tijdlijn',
      },
      {
        capability: 'On-brand blijven',
        withOd: 'Framesjablonen + jouw kleuren en typografie',
        without: 'Bouw merkstyling per project opnieuw',
      },
      {
        capability: 'Precieze, herhaalbare timing',
        withOd: 'Samengesteld in HTML, deterministisch gerenderd',
        without: 'Handmatig schuiven, lastig te reproduceren',
      },
      {
        capability: 'Export voor social',
        withOd: 'Korte clips gerenderd naar video',
        without: 'Exportpresets en codec-gedoe',
      },
      {
        capability: 'Beoordeling en versiebeheer',
        withOd: 'Framebron leeft in je repo, te diffen',
        without: 'Binair projectbestand, geen echte diff',
      },
      {
        capability: 'Kosten en lock-in',
        withOd: 'Open source, gebruik je eigen sleutels, draait lokaal',
        without: 'Dure suite, steile leercurve',
      },
    ],
    featuresTitle: 'Wat je kunt animeren',
    features: [
      { title: "Hyperframes", body: "Frame-voor-frame motionreeksen samengesteld uit HTML.", thumb: "example-video-hyperframes" },
      { title: "Korte social-vorm", body: "Verticale clips gebouwd voor socialfeeds.", thumb: "example-video-shortform" },
      { title: "Motion-framesets", body: "Herbruikbare geanimeerde frames die je samenstelt tot een clip.", thumb: "example-motion-frames" },
      { title: "Cinematische light leaks", body: "Filmische overgangen en sfeervolle achtergronden.", thumb: "example-frame-light-leak-cinema" },
      { title: "Glitch-titels", body: "Titelonthullingen met beweging en textuur.", thumb: "example-frame-glitch-title" },
      { title: "Logo-outro’s", body: "Merkgebonden afsluitende animaties voor elke clip.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Motion die mensen bouwden met Open Design',
    galleryLead:
      'Echte geanimeerde frames en clips gerenderd uit een prompt. Kies er een dicht bij je idee en beschrijf de beweging.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Hyperframes-reeks" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Vloeiende motionachtergrond" },
      { thumb: "example-frame-macos-notification", caption: "Geanimeerd UI-frame" },
      { thumb: "example-frame-data-chart-nyt", caption: "Geanimeerde datagrafiek" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Blader door motionsjablonen',
    faqTitle: 'Veelgestelde vragen over video',
    faq: [
      {
        q: 'Heb ik After Effects of een motion-graphics-suite nodig?',
        a: 'Nee. Open Design stelt geanimeerde frames samen in HTML en rendert ze naar video binnen je coding agent. Er is geen tijdlijneditor om te leren of te licentiëren.',
      },
      {
        q: 'Voor wat voor video is dit geschikt?',
        a: 'Korte motion — titelkaarten, data-animaties, logo-outro’s, socialclips. Het is gebouwd voor merk- en productmotion, niet voor montage van speelfilmlengte.',
      },
      {
        q: 'Is de timing reproduceerbaar?',
        a: 'Ja. Omdat frames in code worden samengesteld en deterministisch gerenderd, krijg je elke keer hetzelfde resultaat en kun je het nauwkeurig bijstellen met een prompt.',
      },
      {
        q: 'Welke agents kan ik gebruiken?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI en meer eigen adapters, met je eigen providersleutels.',
      },
    ],
    ctaTitle: 'Animeer je volgende idee vanavond nog',
    ctaBody:
      'Geef de repo een ster, installeer Open Design en verander een script in motion — in de agent die je al gebruikt.',
  },
  designSystem: {
    title: 'Bouw en pas een designsysteem toe met Open Design + Claude Code',
    description:
      'Vang je merk als een herbruikbaar designsysteem dat je coding agent toepast op elk artefact — kleuren, typografie, componenten en toon in één DESIGN.md. Definieer het één keer; elk prototype, deck en dashboard blijft on-brand.',
    breadcrumb: 'Designsysteem',
    label: 'Toepassing · Designsysteem',
    heading: 'Eén designsysteem, toegepast op alles wat je agent maakt',
    lead: 'Definieer je merk één keer en Open Design draagt het mee naar elke uitvoer — prototypes, decks, dashboards, graphics. Het systeem leeft in je repo als een DESIGN.md die de agent leest, zodat consistentie automatisch is, niet handmatig.',
    heroImageAlt:
      'Redactionele illustratie van één designsysteem dat uitstraalt naar vele on-brand artefacten',
    tldrTitle: 'In één zin',
    tldrBody:
      'Open Design vangt je merk als een draagbaar designsysteem dat je agent toepast op elk artefact — één keer gedefinieerd in je repo, overal afgedwongen, zonder een centrale ontwerptool die de poort bewaakt.',
    stepsTitle: 'Hoe designsystemen werken met Open Design',
    steps: [
      {
        title: 'Vang het systeem',
        body: 'Beschrijf je merk — kleuren, typografie, witruimte, stem — of wijs de agent naar een bestaande site om het te extraheren. Open Design schrijft het in een DESIGN.md die in je project leeft.',
        imageAlt: 'Illustratie van een merk dat wordt gevangen in één designsysteembestand',
      },
      {
        title: 'Begin vanuit een bewezen basis',
        body: 'Open Design levert 140+ referentiedesignsystemen — van Apple en Linear tot redactioneel en brutalistisch. Fork er een dicht bij je merk in plaats van te beginnen met een lege pagina.',
        imageAlt: 'Illustratie van een galerij referentiedesignsystemen die wordt doorgebladerd',
      },
      {
        title: 'Pas het overal toe',
        body: 'Elke andere vaardigheid leest hetzelfde systeem, zodat een prototype, een deck en een dashboard allemaal één visuele taal delen — zonder dat je het telkens opnieuw hoeft op te geven.',
        imageAlt: 'Illustratie van één systeem dat consistent wordt toegepast over vele artefacttypes',
      },
      {
        title: 'Evolueer het op één plek',
        body: 'Verander het systeem en de volgende render weerspiegelt het overal. Omdat het een bestand in je repo is, worden ontwerpbeslissingen beoordeeld en geversioneerd als code.',
        imageAlt: 'Illustratie van een designsysteem dat wordt bijgewerkt en zich verspreidt naar alle uitvoer',
      },
    ],
    tableTitle: 'Designsystemen met Open Design versus de oude manier',
    tableColCapability: 'Wat je nodig hebt',
    tableColWithOd: 'Met Open Design',
    tableColWithout: 'Bibliotheken van ontwerptools / stijlgidsen',
    tableRows: [
      {
        capability: 'Het systeem definiëren',
        withOd: 'Een DESIGN.md die de agent leest, geforkt uit 140+ referenties',
        without: 'Een statische stijlgids of een toolgebonden bibliotheek',
      },
      {
        capability: 'Toepassen over artefacttypes heen',
        withOd: 'Hetzelfde systeem voedt prototypes, decks, dashboards, graphics',
        without: 'Per tool en per bestand opnieuw geïmplementeerd',
      },
      {
        capability: 'Alles consistent houden',
        withOd: 'Automatisch — elke vaardigheid leest één bron',
        without: 'Handmatige discipline; wijkt af na verloop van tijd',
      },
      {
        capability: 'Het merk laten evolueren',
        withOd: 'Bewerk één keer; volgende render werkt overal bij',
        without: 'Zoeken en vervangen over bestanden en tools heen',
      },
      {
        capability: 'Beoordeling en versiebeheer',
        withOd: 'Leeft in je repo, te diffen als code',
        without: 'Verstopt in een ontwerptool, lastig te auditen',
      },
      {
        capability: 'Kosten en lock-in',
        withOd: 'Open source, draagbaar, draait lokaal',
        without: 'Vastgezet op een abonnement van een ontwerptool',
      },
    ],
    featuresTitle: 'Systemen waarmee je kunt beginnen',
    features: [
      { title: "Apple", body: "Strakke, ingetogen esthetiek met systeemlettertype.", thumb: "design-system-apple" },
      { title: "Linear", body: "Heldere producttool-look met krappe witruimte.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Zacht, documentgericht, toegankelijk.", thumb: "design-system-notion" },
      { title: "Figma", body: "Speels, kleurrijk, energie van een creatieve tool.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimaal, neutraal, op onderzoeksniveau.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Dicht, technisch, native voor ontwikkelaars.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Designsystemen in Open Design',
    galleryLead:
      'Een paar van de 140+ referentiesystemen die je als startpunt kunt forken. Kies er een dicht bij je merk en pas het aan.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Systeem in Airbnb-stijl" },
      { thumb: "design-system-vercel", caption: "Systeem in Vercel-stijl" },
      { thumb: "design-system-stripe", caption: "Systeem in Stripe-stijl" },
      { thumb: "design-system-spotify", caption: "Systeem in Spotify-stijl" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Blader door designsystemen',
    faqTitle: 'Veelgestelde vragen over designsystemen',
    faq: [
      {
        q: 'Wat is het designsysteem hier precies?',
        a: 'Een DESIGN.md-bestand in je repo dat kleuren, typografie, witruimte, componenten en stem vangt. Elke Open Design-vaardigheid leest het, zodat je merk automatisch wordt toegepast op alles wat de agent produceert.',
      },
      {
        q: 'Moet ik vanaf nul beginnen?',
        a: 'Nee. Open Design levert 140+ referentiedesignsystemen die je kunt forken — van Apple en Linear tot redactioneel en brutalistisch — en daarna aan je merk aanpassen.',
      },
      {
        q: 'Hoe blijft het consistent over decks, dashboards en prototypes?',
        a: 'Omdat al die vaardigheden dezelfde DESIGN.md lezen. Definieer het systeem één keer en consistentie is automatisch in plaats van iets wat je met de hand bewaakt.',
      },
      {
        q: 'Welke agents kan ik gebruiken?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI en meer eigen adapters, met je eigen providersleutels.',
      },
    ],
    ctaTitle: 'Definieer je designsysteem vanavond nog',
    ctaBody:
      'Geef de repo een ster, installeer Open Design en geef je agent één merk om overal toe te passen — in de agent die je al gebruikt.',
  },
  roleSoloBuilder: {
    title: 'Open Design voor solobouwers & indie hackers',
    description:
      'Lever als een team van één. Open Design verandert je coding agent in de ontwerphelft van je startup — prototypes, landingspaginas, dashboards en merkvisuals, allemaal vanuit een prompt, allemaal op merk, allemaal in je repo.',
    breadcrumb: 'Solobouwer',
    label: 'Voor · Solobouwers',
    heading: 'Jouw ontwerpteam is de agent die je al draait',
    lead: 'Geen ontwerper, geen budget, geen overdracht. Beschrijf wat je nodig hebt en je agent rendert het — een landingspagina vanochtend, een dashboard vanmiddag, socialkaarten voordat je lanceert — allemaal met één ontwerpsysteem dat je eenmaal hebt gedefinieerd.',
    heroImageAlt:
      'Redactionele illustratie van één persoon aan een bureau, omringd door een landingspagina, een app, een dashboard en socialkaarten, allemaal in één consistente stijl',
    tldrTitle: 'In één zin',
    tldrBody:
      'Open Design is de ontwerpafdeling die een solo-oprichter nooit had: van prompt naar artefact op elk oppervlak dat je product nodig heeft, op één merk, zonder overdracht en zonder extra tools.',
    stepsTitle: 'Hoe een solobouwer Open Design gebruikt',
    steps: [
      {
        title: 'Definieer je merk eenmaal',
        body: 'Leg kleuren, typografie en toon vast in een DESIGN.md (of fork een van de 140+ referentiesystemen). Elk artefact dat je daarna genereert, is automatisch op merk.',
        imageAlt: 'Illustratie van één merkdefinitiebestand',
      },
      {
        title: 'Genereer wat je hierna ook nodig hebt',
        body: 'Prototype, landingspagina, dashboard, pitchdeck, socialkaart — dezelfde agent, hetzelfde merk, elk met één prompt. Geen tools wisselen of extra licenties kopen.',
        imageAlt: 'Illustratie van vele soorten artefacten die uit één prompt voortkomen',
      },
      {
        title: 'Lever het — het is al echt',
        body: 'Alles rendert naar HTML / code in je repo, dus het prototype wordt het product en de landingspagina gaat live. Geen wegwerpmockups.',
        imageAlt: 'Illustratie van een artefact dat rechtstreeks van prompt naar live gaat',
      },
    ],
    tableTitle: 'Solo bouwen met Open Design vs het op de moeilijke manier doen',
    tableColCapability: 'Wat je nodig hebt',
    tableColWithOd: 'Met Open Design',
    tableColWithout: 'Het er nu alleen voor staan',
    tableRows: [
      { capability: 'Dek elk ontwerpoppervlak', withOd: 'Eén agent doet prototype, landing, dashboard, merk', without: 'Vijf SaaS-tools en tutorials aan elkaar knopen' },
      { capability: 'Blijf op merk', withOd: 'Eén DESIGN.md die overal automatisch wordt toegepast', without: 'De look per tool opnieuw maken, drift na verloop van tijd' },
      { capability: 'Beweeg op solosnelheid', withOd: 'Van idee naar artefact in één prompt', without: 'Een ontwerptool leren waar je geen tijd voor hebt' },
      { capability: 'Leveren, niet mocken', withOd: 'HTML / code in je repo, klaar om te deployen', without: 'Een mockup die iemand alsnog moet bouwen' },
      { capability: 'Kosten', withOd: 'Open source, eigen sleutels, draait lokaal', without: 'Een stapel abonnementen per stoel' },
    ],
    featuresTitle: 'Wat een solobouwer kan leveren',
    features: [
      { title: 'Landingspaginas', body: 'Marketing- en SaaS-landings, klikbaar en live.', thumb: 'example-saas-landing' },
      { title: 'Productprototypes', body: 'Webapps met meerdere schermen om het idee te valideren.', thumb: 'example-web-prototype' },
      { title: 'Dashboards', body: 'Statistiek- en adminweergaven voor je product.', thumb: 'example-dashboard' },
      { title: 'Merkgraphics', body: 'Covers en posters die bij je merk passen.', thumb: 'example-magazine-poster' },
      { title: 'Mobiele flows', body: 'Appschermen wanneer je verder gaat dan het web.', thumb: 'example-mobile-app' },
      { title: 'Socialkaarten', body: 'Lancerings- en updatekaarten voor elk kanaal.', thumb: 'example-card-twitter' },
    ],
    galleryTitle: 'Solo gebouwd met Open Design',
    galleryLead:
      'Elk oppervlak dat een eenpersoonsstartup nodig heeft, vanuit een prompt. Kies er een die dicht bij je volgende stap ligt en beschrijf het.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'SaaS-landingspagina' },
      { thumb: 'example-web-prototype', caption: 'Productprototype' },
      { thumb: 'example-dashboard', caption: 'Productdashboard' },
      { thumb: 'example-card-twitter', caption: 'Socialkaart voor lancering' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Bekijk templates',
    faqTitle: 'Veelgestelde vragen voor solobouwers',
    faq: [
      { q: 'Ik ben geen ontwerper — kan ik dit echt gebruiken?', a: 'Ja. Je beschrijft in gewone taal wat je wilt; de agent past een ontwerpsysteem toe en rendert het. De vaardigheid zit in het schrijven van de prompt, niet in het pixels duwen.' },
      { q: 'Dekt het alles, of maar één ding?', a: 'Alles wat een klein product nodig heeft — prototypes, landingspaginas, dashboards, decks, graphics — vanuit dezelfde agent en hetzelfde merk.' },
      { q: 'Wat worden de resultaten?', a: 'Echte HTML / code in je repo, zodat een prototype het product kan worden en een landingspagina live kan gaan, in plaats van een mockup die je weggooit.' },
      { q: 'Welke agents kan ik gebruiken?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI en meer eigen adapters, met je eigen providersleutels.' },
    ],
    ctaTitle: 'Bouw je hele ding vanavond',
    ctaBody:
      'Geef de repo een ster, installeer Open Design en laat één agent je ontwerpteam zijn — in de agent die je al gebruikt.',
  },
  roleDesigner: {
    title: 'Open Design voor ontwerpers',
    description:
      'Besteed je tijd aan smaak, niet aan sleurwerk. Open Design laat je agent het repetitieve productiewerk afhandelen — varianten, statussen, complete ontwerpsystemen — terwijl jij de look stuurt en het laatste woord houdt.',
    breadcrumb: 'Ontwerper',
    label: 'Voor · Ontwerpers',
    heading: 'Stuur het ontwerp — laat de agent de productie doen',
    lead: 'Jij bepaalt het systeem en de standaard; de agent rendert de schermen, de statussen, de varianten, de hifi-comps. Minder rechthoeken duwen, meer beslissen hoe goed eruitziet.',
    heroImageAlt:
      'Redactionele illustratie van een ontwerper die stuurt terwijl een agent schermen, varianten en een ontwerpsysteem invult',
    tldrTitle: 'In één zin',
    tldrBody:
      'Open Design is de productieassistent die nooit moe wordt: jij definieert het ontwerpsysteem en bepaalt de smaak; de agent genereert de rest, op systeem, in je repo.',
    stepsTitle: 'Hoe een ontwerper Open Design gebruikt',
    steps: [
      {
        title: 'Codeer je systeem',
        body: 'Zet je merk om in een DESIGN.md — typeschaal, kleur, witruimte, componenten, toon. Dit is de bron van waarheid die de agent volgt.',
        imageAlt: 'Illustratie van een ontwerpsysteem vastgelegd als bestand',
      },
      {
        title: 'Genereer de lange staart',
        body: 'Elk scherm, elke status en elke variant die je anders met de hand zou bouwen — de agent rendert ze op systeem, dus de saaie 80% is in minuten klaar.',
        imageAlt: 'Illustratie van vele op-systeem schermen die in één keer worden gegenereerd',
      },
      {
        title: 'Stuur en verfijn',
        body: 'Bekritiseer in taal — “verstrak de witruimte, maak de lege status warmer.” Jij houdt het laatste woord; de agent doet de iteraties.',
        imageAlt: 'Illustratie van een ontwerper die richting geeft en het ontwerp dat meebeweegt',
      },
    ],
    tableTitle: 'Ontwerpen met Open Design vs de handmatige manier',
    tableColCapability: 'Wat je nodig hebt',
    tableColWithOd: 'Met Open Design',
    tableColWithout: 'Handmatige ontwerptools',
    tableRows: [
      { capability: 'Een ontwerpsysteem bouwen', withOd: 'Een DESIGN.md die de agent overal toepast', without: 'Een bibliotheek die je per tool met de hand onderhoudt' },
      { capability: 'Varianten & statussen maken', withOd: 'Op systeem gegenereerd vanuit een prompt', without: 'Frames dupliceren en elk apart aanpassen' },
      { capability: 'Hifi-comps', withOd: 'Gerenderd naar echte HTML, geen platte mockup', without: 'Pixelwerk dat engineering toch herbouwt' },
      { capability: 'Consistent blijven', withOd: 'Eén systeem, automatisch afgedwongen', without: 'Handmatige discipline; drift na verloop van tijd' },
      { capability: 'Overdracht', withOd: 'Het artefact is code — geen vertaalkloof', without: 'Specdocumenten en redlines' },
    ],
    featuresTitle: 'Wat een ontwerper kan sturen',
    features: [
      { title: 'Redactionele layouts', body: 'Art-directed, gridgedreven composities.', thumb: 'example-web-prototype-taste-editorial' },
      { title: 'Artikelcovers', body: 'Covers en features in magazinestijl.', thumb: 'example-article-magazine' },
      { title: 'Posters', body: 'Gedurfde typografische posters op merk.', thumb: 'example-magazine-poster' },
      { title: 'Socialsets', body: 'Consistente carrousels met meerdere frames.', thumb: 'example-social-carousel' },
      { title: 'Appschermen', body: 'Hifi mobiele en webschermen.', thumb: 'example-mobile-app' },
      { title: 'Dashboards', body: 'Data-UI die jouw systeem respecteert.', thumb: 'example-dashboard' },
    ],
    galleryTitle: 'Gestuurd met Open Design',
    galleryLead:
      'Hifi, op-systeem werk dat de agent vanuit richting produceerde. Kies er een die dicht bij je stijl ligt en verfijn het.',
    gallery: [
      { thumb: 'example-web-prototype-taste-editorial', caption: 'Redactionele layout' },
      { thumb: 'example-article-magazine', caption: 'Magazinecover' },
      { thumb: 'example-social-carousel', caption: 'Socialcarrousel' },
      { thumb: 'example-magazine-poster', caption: 'Typografische poster' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Bekijk templates',
    faqTitle: 'Veelgestelde vragen voor ontwerpers',
    faq: [
      { q: 'Vervangt dit mij?', a: 'Nee — het vervangt het sleurwerk. Jij bepaalt het systeem en de smaak; de agent doet de repetitieve productie zodat jij tijd besteedt aan de beslissingen die alleen jij kunt nemen.' },
      { q: 'Hoe houd ik controle over de look?', a: 'Jouw DESIGN.md is het contract. De agent rendert daarbinnen, en jij bekritiseert in taal tot het klopt.' },
      { q: 'Is de output bewerkbaar / echt?', a: 'Het is echte HTML/CSS, geen platte export — dus het gaat rechtstreeks de productie in in plaats van herbouwd te worden.' },
      { q: 'Welke agents kan ik gebruiken?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI en meer eigen adapters, met je eigen providersleutels.' },
    ],
    ctaTitle: 'Stuur je volgende ontwerp vanavond',
    ctaBody:
      'Geef de repo een ster, installeer Open Design en laat de agent de productie afhandelen terwijl jij de smaak bepaalt — in de agent die je al gebruikt.',
  },
  roleEngineering: {
    title: 'Open Design voor engineers',
    description:
      'Sla de ontwerpoverdracht over. Open Design verandert een DESIGN.md in echte front-end die je coding agent rechtstreeks schrijft — op-systeem UI, prototypes en dashboards, in de repo, zonder Figma-heen-en-weer.',
    breadcrumb: 'Engineering',
    label: 'Voor · Engineering',
    heading: 'Van spec naar front-end, geen overdracht ertussen',
    lead: 'Wijs je agent naar een DESIGN.md en een beschrijving; hij schrijft op-systeem, echte front-endcode — componenten, schermen, dashboards — rechtstreeks in je project. Geen redlines, geen “wachten op ontwerp.”',
    heroImageAlt:
      'Redactionele illustratie van een DESIGN.md die rechtstreeks doorstroomt naar front-endcode en gerenderde UI, met overslaan van een overdrachtsstap',
    tldrTitle: 'In één zin',
    tldrBody:
      'Open Design dicht de kloof tussen ontwerper en engineer door het ontwerpsysteem machineleesbaar te maken: dezelfde agent die je code schrijft, past het systeem toe en rendert echte UI.',
    stepsTitle: 'Hoe een engineer Open Design gebruikt',
    steps: [
      {
        title: 'Lees het systeem, niet een redline',
        body: 'De DESIGN.md leeft in de repo. Je agent leest het zoals hij de rest van de codebase leest — geen geëxporteerde specs om te interpreteren.',
        imageAlt: 'Illustratie van een agent die een DESIGN.md naast code leest',
      },
      {
        title: 'Genereer op-systeem UI',
        body: 'Beschrijf het scherm of component; de agent schrijft front-end die al bij het systeem past. Prototypes, admin-dashboards, interne tools — in minuten.',
        imageAlt: 'Illustratie van UI-code die wordt gegenereerd om bij een ontwerpsysteem te passen',
      },
      {
        title: 'Het is al jouw code',
        body: 'De output is HTML / frameworkcode in je repo, te beoordelen in een PR. Geen vertaalstap tussen “het ontwerp” en “de build.”',
        imageAlt: 'Illustratie van gegenereerde UI die landt als een te beoordelen PR',
      },
    ],
    tableTitle: 'Front-end met Open Design vs de overdrachtsmanier',
    tableColCapability: 'Wat je nodig hebt',
    tableColWithOd: 'Met Open Design',
    tableColWithout: 'Overdracht van ontwerp naar dev',
    tableRows: [
      { capability: 'Een ontwerp om vanuit te bouwen', withOd: 'Een DESIGN.md die je agent rechtstreeks leest', without: 'Een Figma-bestand dat je met de hand herinterpreteert' },
      { capability: 'Match het systeem', withOd: 'Automatisch afgedwongen op het moment van genereren', without: 'Met het oog tegen een spec inschatten, drift sluipt erin' },
      { capability: 'Interne tools / dashboards bouwen', withOd: 'Prompt → op-systeem front-end in de repo', without: 'Wachten op een ontwerper, dan twee keer bouwen' },
      { capability: 'Beoordelen', withOd: 'Het is code — diff het in een PR', without: 'Pixels vergelijken met een mockup' },
      { capability: 'Kosten & lock-in', withOd: 'Open source, in je repo, draait lokaal', without: 'Een ontwerptool die het hele team moet licentiëren' },
    ],
    featuresTitle: 'Wat een engineer kan genereren',
    features: [
      { title: 'Webapp-UI', body: 'Front-ends met meerdere schermen vanuit een beschrijving.', thumb: 'example-web-prototype' },
      { title: 'Dev-dashboards', body: 'Repo-, CI- en statistiekdashboards.', thumb: 'example-github-dashboard' },
      { title: 'Datarapporten', body: 'Gestructureerde rapporten vanuit je data.', thumb: 'example-data-report' },
      { title: 'Admin-dashboards', body: 'Interne tools en adminweergaven.', thumb: 'example-dashboard' },
      { title: 'Landingspaginas', body: 'Marketingpaginas zonder op ontwerp te wachten.', thumb: 'example-saas-landing' },
      { title: 'Kanban / borden', body: 'Interne workflow-UIs.', thumb: 'example-kanban-board' },
    ],
    galleryTitle: 'Gebouwd door engineers met Open Design',
    galleryLead:
      'Echte, op-systeem front-end die rechtstreeks in de repo is gegenereerd. Kies er een die dicht bij wat je bouwt ligt en beschrijf het.',
    gallery: [
      { thumb: 'example-web-prototype', caption: 'Webapp-UI' },
      { thumb: 'example-github-dashboard', caption: 'Dev-dashboard' },
      { thumb: 'example-data-report', caption: 'Datarapport' },
      { thumb: 'example-kanban-board', caption: 'Intern bord-UI' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Bekijk templates',
    faqTitle: 'Veelgestelde vragen over engineering',
    faq: [
      { q: 'Heb ik nog een ontwerper nodig?', a: 'Voor merk en richting wel. Maar voor het bouwen van op-systeem UI en interne tools leest de agent de DESIGN.md en schrijft de front-end — zonder overdracht-heen-en-weer.' },
      { q: 'Wat levert het op?', a: 'Echte HTML / frameworkcode in je repo, te beoordelen in een PR — geen mockup die je opnieuw implementeert.' },
      { q: 'Hoe blijft het op systeem?', a: 'De DESIGN.md is de bron van waarheid; de agent past hem toe op het moment van genereren, dus de output matcht zonder handmatige pixelcontrole.' },
      { q: 'Welke agents kan ik gebruiken?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI en meer eigen adapters, met je eigen providersleutels.' },
    ],
    ctaTitle: 'Genereer je volgende UI vanavond',
    ctaBody:
      'Geef de repo een ster, installeer Open Design en verander een DESIGN.md in front-end — in de agent die je al gebruikt.',
  },
  roleProductManagers: {
    title: 'Open Design voor productmanagers',
    description:
      'Wacht niet meer op ontwerpcapaciteit om een idee over te brengen. Open Design laat een PM een prompt veranderen in een klikbaar prototype of wireframe — om stakeholders op één lijn te brengen en het team te briefen, zonder ontwerpticket.',
    breadcrumb: 'Productmanagers',
    label: 'Voor · Productmanagers',
    heading: 'Maak het idee klikbaar nog voor de kickoff',
    lead: 'Beschrijf de flow en je agent rendert een echt, klikbaar prototype dat je vandaag al aan stakeholders kunt voorleggen — zodat reviews het echte ding bespreken, niet een alinea in een document.',
    heroImageAlt:
      'Redactionele illustratie van een PM die een geschreven idee verandert in een klikbaar prototype dat aan stakeholders wordt getoond',
    tldrTitle: 'In één zin',
    tldrBody:
      'Open Design geeft een PM een ontwerpvrije manier om ideeën tastbaar te maken: van prompt naar prototype voor afstemming en briefings, zonder het ontwerpbudget van het team uit te geven.',
    stepsTitle: 'Hoe een PM Open Design gebruikt',
    steps: [
      {
        title: 'Beschrijf de flow',
        body: 'Schrijf de gebruikersreis in gewone taal — de schermen, de statussen, het ideale pad. Geen wireframetool nodig.',
        imageAlt: 'Illustratie van een PM die een gebruikersflow beschrijft',
      },
      {
        title: 'Krijg een klikbaar prototype',
        body: 'De agent rendert navigeerbare schermen waar je echt doorheen kunt klikken — veel duidelijker dan een slide of document voor een stakeholderreview.',
        imageAlt: 'Illustratie van een klikbaar prototype geproduceerd vanuit een beschrijving',
      },
      {
        title: 'Stem af en draag over',
        body: 'Deel de link, verzamel feedback op het echte ding, en geef het prototype daarna aan ontwerp/engineering als een precies, gedeeld startpunt.',
        imageAlt: 'Illustratie van een prototype gedeeld voor afstemming en daarna overgedragen aan het team',
      },
    ],
    tableTitle: 'PM-werk met Open Design vs wachten op ontwerp',
    tableColCapability: 'Wat je nodig hebt',
    tableColWithOd: 'Met Open Design',
    tableColWithout: 'Zonder het vandaag',
    tableRows: [
      { capability: 'Een idee tastbaar maken', withOd: 'Prompt → klikbaar prototype dat je zelf maakt', without: 'Een ontwerpticket indienen en op capaciteit wachten' },
      { capability: 'Stakeholders op één lijn brengen', withOd: 'Ze klikken door de echte flow', without: 'Ze lezen een document en stellen het zich anders voor' },
      { capability: 'Het team briefen', withOd: 'Een concreet prototype als de spec', without: 'Een muur van tekst en heen-en-weer' },
      { capability: 'Itereren voor de build', withOd: 'Wijzig het in een prompt, deel opnieuw', without: 'Nog een ronde in de ontwerpwachtrij' },
      { capability: 'Kosten', withOd: 'Open source, in de agent die je al gebruikt', without: 'Ontwerpuren besteed aan wegwerpconcepten' },
    ],
    featuresTitle: 'Wat een PM aan mensen kan voorleggen',
    features: [
      { title: 'Mobiele flows', body: 'End-to-end appreizen, klikbaar.', thumb: 'example-mobile-app' },
      { title: 'Onboardingflows', body: 'Welkom → setup → eerste keer.', thumb: 'example-mobile-onboarding' },
      { title: 'Borden & workflows', body: 'Kanban- en proces-UIs voor specs.', thumb: 'example-kanban-board' },
      { title: 'Dashboards', body: 'Statistiekweergaven om het probleem te kaderen.', thumb: 'example-dashboard' },
      { title: 'Webprototypes', body: 'Webflows met meerdere schermen om te reviewen.', thumb: 'example-web-prototype' },
      { title: 'Trendweergaven', body: 'Snapshots van 30 dagen en trends voor context.', thumb: 'example-last30days' },
    ],
    galleryTitle: 'Geprototypeerd door PMs met Open Design',
    galleryLead:
      'Klikbare flows gerenderd vanuit een beschrijving, klaar voor een stakeholderreview. Kies er een die dicht bij je idee ligt en beschrijf het.',
    gallery: [
      { thumb: 'example-mobile-app', caption: 'Mobiele flow' },
      { thumb: 'example-mobile-onboarding', caption: 'Onboardingflow' },
      { thumb: 'example-kanban-board', caption: 'Workflowbord' },
      { thumb: 'example-web-prototype', caption: 'Webprototype' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Bekijk templates',
    faqTitle: 'Veelgestelde vragen voor productmanagers',
    faq: [
      { q: 'Ik kan niet ontwerpen — is dit iets voor mij?', a: 'Ja. Je beschrijft de flow in woorden; de agent maakt het klikbaar. Het is bedoeld om te communiceren en af te stemmen, zonder ontwerptool.' },
      { q: 'Is het een echt prototype of een mockup?', a: 'Echt en klikbaar — navigatie en statussen werken, dus stakeholders reageren op de daadwerkelijke ervaring.' },
      { q: 'Vervangt het ontwerp?', a: 'Nee — het geeft ontwerp en engineering een precies, gedeeld startpunt in plaats van een tekstspec, en bespaart ontwerpcapaciteit voor het werk dat het echt nodig heeft.' },
      { q: 'Welke agents kan ik gebruiken?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI en meer eigen adapters, met je eigen providersleutels.' },
    ],
    ctaTitle: 'Maak je idee vanavond klikbaar',
    ctaBody:
      'Geef de repo een ster, installeer Open Design en verander je volgende spec in iets waar mensen op kunnen klikken — in de agent die je al gebruikt.',
  },
  roleMarketing: {
    title: 'Open Design voor marketingteams',
    description:
      'Lever campagnes op contentsnelheid. Open Design laat je agent landingspaginas, socialkaarten en campagnevisuals produceren vanuit een prompt — op merk, op aanvraag, zonder ontwerp in de wachtrij te zetten.',
    breadcrumb: 'Marketing',
    label: 'Voor · Marketing',
    heading: 'Campagnevisuals op de snelheid van een prompt',
    lead: 'Landingspaginas, socialkaarten, covers, aankondigingsgraphics — beschreven in taal, gerenderd op merk, dezelfde dag geleverd. Geen ontwerpticket, geen geworstel met templates.',
    heroImageAlt:
      'Redactionele illustratie van een marketeer die een brief verandert in een landingspagina en een set socialkaarten op merk',
    tldrTitle: 'In één zin',
    tldrBody:
      'Open Design is de altijd-beschikbare ontwerpresource voor marketing: van prompt naar asset voor landingspaginas en social, op merk, zodat campagnes worden geleverd op de snelheid waarmee je tekst schrijft.',
    stepsTitle: 'Hoe een marketingteam Open Design gebruikt',
    steps: [
      {
        title: 'Zet het merk vast',
        body: 'Je DESIGN.md bevat de kleuren, typografie en toon. Elke asset die de agent maakt, is automatisch op merk — geen herstyling per asset.',
        imageAlt: 'Illustratie van een merksysteem toegepast op marketingassets',
      },
      {
        title: 'Genereer de campagne',
        body: 'Landingspagina, socialkaarten, covers, aankondigingsgraphics — elk met één prompt, een consistente set over elk kanaal.',
        imageAlt: 'Illustratie van een volledige campagneset gegenereerd vanuit prompts',
      },
      {
        title: 'Lever en itereer',
        body: 'Landingspaginas renderen naar HTML die je kunt deployen; graphics exporteren naar PNG. Wijzig de kop, render de set opnieuw — geen wachten in de wachtrij.',
        imageAlt: 'Illustratie van campagne-assets die worden geleverd en snel worden geïtereerd',
      },
    ],
    tableTitle: 'Marketing met Open Design vs de gebruikelijke ren',
    tableColCapability: 'Wat je nodig hebt',
    tableColWithOd: 'Met Open Design',
    tableColWithout: 'Zonder het vandaag',
    tableRows: [
      { capability: 'Een landingspagina lanceren', withOd: 'Prompt → pagina op merk, deploybaar', without: 'Ontwerp briefen of vechten met een websitebouwer' },
      { capability: 'Een consistente socialset', withOd: 'Zelfde template, nieuwe tekst, perfect uitgelijnd', without: 'Elke kaart met de hand uitlijnen' },
      { capability: 'Op merk blijven', withOd: 'Eén DESIGN.md toegepast op elke asset', without: 'Hopen dat elke asset bij de richtlijnen past' },
      { capability: 'Op campagnesnelheid bewegen', withOd: 'Asset in een prompt, dezelfde dag', without: 'In de rij achter de ontwerpachterstand' },
      { capability: 'Kosten', withOd: 'Open source, geen ontwerptool per stoel', without: 'Abonnementen plus ontwerpuren' },
    ],
    featuresTitle: 'Wat een marketingteam kan leveren',
    features: [
      { title: 'Landingspaginas', body: 'Campagne- en productlandings, deploybaar.', thumb: 'example-saas-landing' },
      { title: 'Socialkaarten', body: 'X / Twitter-kaarten op merk.', thumb: 'example-card-twitter' },
      { title: 'Carrousels', body: 'Socialsets met meerdere slides, consistent.', thumb: 'example-social-carousel' },
      { title: 'Posters', body: 'Aankondigings- en evenementenposters.', thumb: 'example-magazine-poster' },
      { title: 'Artikelcovers', body: 'Blog- en nieuwsbriefcovers.', thumb: 'example-article-magazine' },
      { title: 'Webpaginas', body: 'Microsites en campagnepaginas.', thumb: 'example-web-prototype' },
    ],
    galleryTitle: 'Geleverd door marketing met Open Design',
    galleryLead:
      'Campagne-assets op merk gerenderd vanuit een prompt. Kies er een die dicht bij je campagne ligt en wissel je eigen tekst erin.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'Campagnelandingspagina' },
      { thumb: 'example-card-twitter', caption: 'Socialkaart' },
      { thumb: 'example-social-carousel', caption: 'Socialcarrousel' },
      { thumb: 'example-magazine-poster', caption: 'Aankondigingsposter' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Bekijk templates',
    faqTitle: 'Veelgestelde vragen over marketing',
    faq: [
      { q: 'Hebben we voor elke asset een ontwerper nodig?', a: 'Nee. De agent rendert landingspaginas en socialassets op merk vanuit een prompt, zodat het team routinematig campagnewerk levert zonder ontwerp in de wachtrij te zetten.' },
      { q: 'Hoe blijven assets op merk?', a: 'Je DESIGN.md wordt automatisch op alles toegepast — kleuren, typografie en toon dragen door naar elke asset.' },
      { q: 'Kunnen de landingspaginas echt live gaan?', a: 'Ja — ze renderen naar HTML die je kunt deployen, en graphics exporteren naar PNG. Dit zijn leverbare assets, geen mockups.' },
      { q: 'Welke agents kan ik gebruiken?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI en meer eigen adapters, met je eigen providersleutels.' },
    ],
    ctaTitle: 'Lever je volgende campagne vanavond',
    ctaBody:
      'Geef de repo een ster, installeer Open Design en verander briefs in assets op merk — in de agent die je al gebruikt.',
  },
};
