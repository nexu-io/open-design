import type { SolutionLocaleCopy } from './types';

export const FR: SolutionLocaleCopy = {
  prototype: {
    title: 'Créer des prototypes interactifs avec Open Design + Claude Code',
    description:
      'Transformez une invite en un prototype cliquable et multi-écrans sans quitter votre terminal. Open Design donne à votre agent de code les compétences de design, les modèles et le système de design pour livrer de vrais prototypes que vous pouvez ouvrir dans un navigateur.',
    breadcrumb: 'Prototype',
    label: 'Cas d’usage · Prototype',
    heading: 'Prototyper à la vitesse d’une invite',
    lead: 'Décrivez le parcours que vous avez en tête et laissez votre agent assembler un vrai prototype cliquable — plusieurs écrans, styles partagés et interactions vivantes — rendu directement en HTML que vous pouvez ouvrir, partager et confier à l’ingénierie.',
    heroImageAlt:
      'Illustration éditoriale d’une main esquissant un wireframe qui se transforme en prototype d’application cliquable multi-écrans',
    tldrTitle: 'En une ligne',
    tldrBody:
      'Open Design est la couche de design de l’agent de code que vous utilisez déjà. Pour le prototypage, cela signifie passer d’une idée d’un paragraphe à un prototype navigable et stylé en une seule session — sans outil de design, sans étape d’export, sans rupture de transmission.',
    stepsTitle: 'Comment fonctionne le prototypage avec Open Design',
    steps: [
      {
        title: 'Décrivez le parcours',
        body: 'Dites à votre agent ce que vous construisez en langage clair — "un parcours d’onboarding avec un écran de bienvenue, un sélecteur de forfait et une confirmation." Open Design charge la compétence de prototype pour que l’agent sache produire des écrans, pas une seule page.',
        imageAlt:
          'Illustration d’une personne tapant dans un terminal une description en langage clair d’un parcours d’application',
      },
      {
        title: 'Générez des écrans stylés',
        body: 'L’agent applique un système de design et des modèles de prototype d’Open Design, si bien que chaque écran partage typographie, espacements et composants au lieu de ressembler à un brouillon. Vous obtenez un ensemble d’écrans cohérent, pas des maquettes disparates.',
        imageAlt:
          'Illustration de plusieurs écrans d’application apparaissant en séquence, tous partageant un style visuel cohérent',
      },
      {
        title: 'Reliez les interactions',
        body: 'Les boutons naviguent, les onglets changent, les fenêtres modales s’ouvrent. Le prototype est rendu en HTML autonome, donc il se comporte comme le vrai produit dans n’importe quel navigateur — aucun compte d’outil de prototypage requis pour le consulter.',
        imageAlt:
          'Illustration d’un curseur cliquant à travers des écrans reliés, avec des flèches montrant la navigation entre eux',
      },
      {
        title: 'Itérez et transmettez',
        body: 'Affinez en parlant à l’agent — "passe le sélecteur de forfait en disposition trois colonnes." Comme l’artefact vit dans votre projet, le design et le code final partagent une seule source de vérité, comblant la rupture habituelle entre designer et ingénieur.',
        imageAlt:
          'Illustration d’un prototype révisé puis transmis à un ingénieur, design et code fusionnant en un seul fichier',
      },
    ],
    tableTitle: 'Le prototypage avec Open Design vs l’ancienne méthode',
    tableColCapability: 'Ce dont vous avez besoin',
    tableColWithOd: 'Avec Open Design',
    tableColWithout: 'Outils de prototypage classiques',
    tableRows: [
      {
        capability: 'Passer de l’idée au premier écran',
        withOd: 'Une invite dans l’agent que vous avez déjà ouvert',
        without: 'Ouvrir un outil séparé, créer un fichier, glisser des boîtes à la main',
      },
      {
        capability: 'Plusieurs écrans reliés',
        withOd: 'Générés comme un ensemble avec styles partagés et navigation fonctionnelle',
        without: 'Chaque écran dessiné et relié manuellement',
      },
      {
        capability: 'Système visuel cohérent',
        withOd: 'Tiré d’un système de design réutilisable que l’agent applique',
        without: 'Recréé par fichier ou maintenu à la main',
      },
      {
        capability: 'Résultat partageable',
        withOd: 'HTML autonome — s’ouvre dans n’importe quel navigateur, sans compte',
        without: 'Le spectateur a besoin d’un siège ou d’un lien de partage dans l’outil du fournisseur',
      },
      {
        capability: 'Chemin vers le vrai code',
        withOd: 'L’artefact vit dans votre dépôt ; design et code partagent une source',
        without: 'Reconstruit de zéro après une transmission séparée',
      },
      {
        capability: 'Coût et verrouillage',
        withOd: 'Open source, apportez vos propres clés, fonctionne en local',
        without: 'Abonnement par siège, hébergé par le fournisseur, export limité',
      },
    ],
    featuresTitle: 'Ce que vous pouvez prototyper',
    features: [
      {
        title: 'Applications web multi-écrans',
        body: 'Des parcours complets avec navigation partagée — onboarding, tableaux de bord, paramètres — pas des pages isolées.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Parcours d’application mobile',
        body: 'Des parcours mobiles écran par écran avec des transitions et états au rendu natif.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Pages d’atterrissage',
        body: 'Des pages marketing et des landings SaaS que vous pouvez parcourir et livrer.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Tout goût visuel',
        body: 'Éditorial, doux ou brutaliste — le prototype porte un style cohérent de bout en bout.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Liste d’attente et tarifs',
        body: 'Des surfaces de conversion — listes d’attente, grilles tarifaires — câblées et fidèles à la marque.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Ludique et gamifié',
        body: 'Des concepts riches en interactions où le mouvement et l’état font partie du pitch.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Des prototypes créés avec Open Design',
    galleryLead:
      'Chacun a commencé par une invite et a été rendu en artefact cliquable. Choisissez un modèle proche de votre idée, décrivez votre variante, et l’agent l’adapte.',
    gallery: [
      { thumb: "example-dating-web", caption: "Application web de rencontres — parcours multi-écrans" },
      { thumb: "example-hr-onboarding", caption: "Parcours d’onboarding RH" },
      { thumb: "example-kami-landing", caption: "Page d’atterrissage produit" },
      { thumb: "example-web-prototype-taste-soft", caption: "Prototype web au style doux" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Parcourir les modèles de prototype',
    faqTitle: 'FAQ prototypage',
    faq: [
      {
        q: 'Ai-je besoin d’un outil de design comme Figma pour prototyper avec Open Design ?',
        a: 'Non. Open Design fonctionne à l’intérieur de votre agent de code et rend les prototypes en HTML. Vous décrivez le parcours en langage ; l’agent produit les écrans. Il n’y a aucun outil de canevas distinct à apprendre ou à payer.',
      },
      {
        q: 'Les prototypes sont-ils interactifs ou juste des maquettes statiques ?',
        a: 'Interactifs. La navigation, les onglets et les modales fonctionnent parce que la sortie est du vrai HTML et CSS. Vous pouvez le parcourir dans n’importe quel navigateur exactement comme le ferait un utilisateur.',
      },
      {
        q: 'Quels agents puis-je utiliser ?',
        a: 'Open Design fonctionne avec Claude Code, Codex, Cursor Agent, Gemini CLI et une douzaine d’autres adaptateurs maison. Vous apportez vos propres clés de fournisseur ; rien n’est hébergé pour vous.',
      },
      {
        q: 'Un prototype peut-il devenir le vrai produit ?',
        a: 'C’est tout l’intérêt. L’artefact vit dans votre projet, donc le même système de design et les mêmes composants passent dans le code de production au lieu d’être jetés après une transmission.',
      },
    ],
    ctaTitle: 'Prototypez votre prochaine idée ce soir',
    ctaBody:
      'Mettez une étoile au dépôt, installez Open Design et transformez votre prochain "et si" en quelque chose de cliquable — dans l’agent que vous utilisez déjà.',
  },
  dashboard: {
    title: 'Générer des tableaux de bord de données avec Open Design + Claude Code',
    description:
      'Décrivez les indicateurs que vous suivez et laissez votre agent de code construire un tableau de bord stylé et responsive — graphiques, cartes KPI et tableaux rendus en HTML que vous pouvez héberger partout. Pas de siège d’outil BI, pas de constructeur glisser-déposer.',
    breadcrumb: 'Tableau de bord',
    label: 'Cas d’usage · Tableau de bord',
    heading: 'Des tableaux de bord à partir d’une description, pas d’un constructeur glisser-déposer',
    lead: 'Dites à votre agent quoi montrer et quelle impression donner. Open Design fournit les motifs de graphiques, le système de mise en page et le langage visuel pour obtenir un tableau de bord cohérent et présentable — pas un mur de widgets au style par défaut.',
    heroImageAlt:
      'Illustration éditoriale de chiffres bruts à gauche qui se transforment en un tableau de bord épuré de graphiques et de cartes KPI à droite',
    tldrTitle: 'En une ligne',
    tldrBody:
      'Open Design transforme une spécification en langage clair de vos indicateurs en un tableau de bord stylé que votre agent rend en HTML — versionné dans votre dépôt, hébergeable partout, sans abonnement BI par siège.',
    stepsTitle: 'Comment fonctionnent les tableaux de bord avec Open Design',
    steps: [
      {
        title: 'Décrivez les indicateurs',
        body: 'Listez ce qui compte — "utilisateurs actifs hebdomadaires, revenu par forfait, attrition et tendance sur 30 jours." L’agent charge la compétence de tableau de bord pour savoir disposer des cartes KPI, des graphiques et un tableau plutôt qu’un seul bloc de texte.',
        imageAlt: 'Illustration d’une personne listant les indicateurs qui lui importent',
      },
      {
        title: 'Choisissez les motifs de graphiques',
        body: 'Open Design livre des modèles de graphiques et de mise en page, si bien que les tendances deviennent des courbes, les répartitions des barres et les ratios la bonne visualisation — typographie et espacements cohérents partout au lieu de réglages par défaut disparates.',
        imageAlt: 'Illustration de plusieurs types de graphiques disposés dans une grille cohérente',
      },
      {
        title: 'Branchez vos données',
        body: 'Pointez le tableau de bord vers un CSV, un point de terminaison JSON, ou collez des lignes d’exemple. Il est rendu en HTML autonome qui se met à jour quand les données changent — ouvrez-le dans n’importe quel navigateur, déposez-le sur n’importe quel hébergement statique.',
        imageAlt: 'Illustration d’un fichier de données se connectant à un tableau de bord à mise à jour en direct',
      },
      {
        title: 'Affinez et livrez',
        body: 'Ajustez en parlant à l’agent — "regroupe le revenu par région, remonte la ligne KPI en haut." L’artefact vit dans votre projet, donc le tableau de bord est relisible et versionné comme n’importe quel autre code.',
        imageAlt: 'Illustration d’un tableau de bord en cours d’affinage puis déployé',
      },
    ],
    tableTitle: 'Les tableaux de bord avec Open Design vs l’ancienne méthode',
    tableColCapability: 'Ce dont vous avez besoin',
    tableColWithOd: 'Avec Open Design',
    tableColWithout: 'Outils BI / codé à la main',
    tableRows: [
      {
        capability: 'Passer de la liste d’indicateurs à la mise en page',
        withOd: 'Une invite ; l’agent dispose cartes, graphiques et tableaux',
        without: 'Glisser les widgets un à un, ou écrire le code des graphiques de zéro',
      },
      {
        capability: 'Système visuel cohérent',
        withOd: 'Motifs de graphiques et espacements d’un système de design réutilisable',
        without: 'Styles de widgets par défaut, ou stylés à la main par graphique',
      },
      {
        capability: 'Connecter les données',
        withOd: 'CSV / JSON / lignes collées, rendus en HTML vivant',
        without: 'Connecteurs du fournisseur ou plomberie de données sur mesure',
      },
      {
        capability: 'Hébergement et partage',
        withOd: 'HTML autonome sur n’importe quel hébergement statique, sans compte',
        without: 'Le spectateur a besoin d’un siège chez le fournisseur BI',
      },
      {
        capability: 'Relecture et versionnage',
        withOd: 'Vit dans votre dépôt ; comparable comme du code',
        without: 'Enfermé chez le fournisseur, pas de vrai diff',
      },
      {
        capability: 'Coût et verrouillage',
        withOd: 'Open source, apportez vos propres clés, fonctionne en local',
        without: 'Abonnement par siège, hébergé par le fournisseur',
      },
    ],
    featuresTitle: 'Ce que vous pouvez construire',
    features: [
      { title: "Analytique produit", body: "Utilisateurs actifs, entonnoirs, rétention — les indicateurs où vit une équipe produit.", thumb: "example-dashboard" },
      { title: "Indicateurs dépôt et dev", body: "Étoiles, PR, santé du CI — des tableaux de bord d’ingénierie à partir de vos propres données.", thumb: "example-github-dashboard" },
      { title: "Rapports financiers", body: "Revenu, burn, runway disposés en un rapport partageable.", thumb: "example-finance-report" },
      { title: "Opérations en direct", body: "Des indicateurs en temps réel qui se rafraîchissent au gré des données sous-jacentes.", thumb: "example-live-dashboard" },
      { title: "Social et marketing", body: "Performance des canaux et suivi des campagnes en une seule vue.", thumb: "example-social-media-dashboard" },
      { title: "Rapports métier", body: "Des rapports structurés pour tout domaine — du clinique au trading.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Des tableaux de bord créés avec Open Design',
    galleryLead:
      'De vrais tableaux de bord rendus à partir d’une invite et d’une source de données. Partez d’un proche du vôtre et décrivez les indicateurs que vous suivez.',
    gallery: [
      { thumb: "example-data-report", caption: "Rapport de données" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Tableau de bord des opérations en direct" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Tableau de bord d’analyse de trading" },
      { thumb: "example-frame-data-chart-nyt", caption: "Graphique de données éditorial" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Parcourir les modèles de tableau de bord',
    faqTitle: 'FAQ tableau de bord',
    faq: [
      {
        q: 'Ai-je besoin d’un outil BI comme Tableau ou Looker ?',
        a: 'Non. Open Design rend les tableaux de bord en HTML à l’intérieur de votre agent de code. Vous décrivez les indicateurs et le pointez vers vos données ; il n’y a aucune plateforme BI distincte à licencier ou à apprendre.',
      },
      {
        q: 'D’où viennent les données ?',
        a: 'D’un CSV, d’un point de terminaison JSON ou de lignes que vous collez. Le tableau de bord est du HTML et du JavaScript simples, donc vous contrôlez exactement où il lit — rien ne transite par un service hébergé.',
      },
      {
        q: 'Des coéquipiers non techniques peuvent-ils le consulter ?',
        a: 'Oui. La sortie est une page web autonome. Quiconque a le lien ou le fichier peut l’ouvrir dans un navigateur — sans compte, sans siège.',
      },
      {
        q: 'Quels agents puis-je utiliser ?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI et une douzaine d’autres adaptateurs maison. Vous apportez vos propres clés de fournisseur.',
      },
    ],
    ctaTitle: 'Construisez votre tableau de bord ce soir',
    ctaBody:
      'Mettez une étoile au dépôt, installez Open Design et transformez vos indicateurs en un tableau de bord que vous pouvez héberger partout — dans l’agent que vous utilisez déjà.',
  },
  slides: {
    title: 'Générer des présentations avec Open Design + Claude Code',
    description:
      'Transformez un plan en une présentation conçue et fidèle à la marque sans ouvrir d’application de présentation. Open Design donne à votre agent de code des modèles de présentation et un système visuel, rendant les diapositives en HTML que vous pouvez présenter, exporter ou partager.',
    breadcrumb: 'Diapositives',
    label: 'Cas d’usage · Diapositives',
    heading: 'Des présentations qui semblent conçues, écrites par une invite',
    lead: 'Confiez à votre agent un plan et un ton. Open Design applique un modèle de présentation et un système visuel pour que chaque diapositive soit disposée, composée et fidèle à la marque — pas une liste à puces sur un fond vide.',
    heroImageAlt:
      'Illustration éditoriale d’un plan à gauche se transformant en une séquence de diapositives de présentation conçues à droite',
    tldrTitle: 'En une ligne',
    tldrBody:
      'Open Design transforme un plan en une présentation HTML conçue que votre agent rend en une session — présentez-la dans le navigateur, exportez en PDF ou PPTX et gardez la source dans votre dépôt.',
    stepsTitle: 'Comment fonctionnent les présentations avec Open Design',
    steps: [
      {
        title: 'Donnez-lui le plan',
        body: 'Collez vos points clés ou une structure approximative. L’agent charge la compétence de présentation pour produire une séquence de diapositives disposées, pas un long document.',
        imageAlt: 'Illustration d’un plan textuel remis à un agent',
      },
      {
        title: 'Choisissez un style de présentation',
        body: 'Open Design livre des modèles de présentation — éditorial, suisse-international, technique sombre, et plus. L’agent en applique un pour que typographie, grille et accents restent cohérents sur chaque diapositive.',
        imageAlt: 'Illustration de plusieurs options de style de présentation posées côte à côte',
      },
      {
        title: 'Générez les diapositives',
        body: 'Chaque point devient une diapositive conçue avec la bonne hiérarchie — titres, visuels d’appui, mises en avant de données. C’est rendu en HTML, donc cela se présente en plein écran dans n’importe quel navigateur.',
        imageAlt: 'Illustration d’une séquence de diapositives finies avec un style cohérent',
      },
      {
        title: 'Présentez, exportez, itérez',
        body: 'Présentez depuis le navigateur, ou exportez en PDF / PPTX pour partager. Affinez en parlant à l’agent — "resserre la diapositive de données, ajoute un appel à l’action de clôture." La source de la présentation reste dans votre projet.',
        imageAlt: 'Illustration d’une présentation présentée et exportée vers plusieurs formats',
      },
    ],
    tableTitle: 'Les présentations avec Open Design vs l’ancienne méthode',
    tableColCapability: 'Ce dont vous avez besoin',
    tableColWithOd: 'Avec Open Design',
    tableColWithout: 'PowerPoint / Keynote / outils de diapositives IA',
    tableRows: [
      {
        capability: 'Passer du plan aux diapositives',
        withOd: 'Une invite ; l’agent dispose chaque diapositive',
        without: 'Construire chaque diapositive à la main, ou se battre avec un modèle',
      },
      {
        capability: 'Design cohérent',
        withOd: 'Des modèles de présentation avec une vraie grille et un système typographique',
        without: 'Dérive de thème, alignement manuel, réglages par défaut hors marque',
      },
      {
        capability: 'Données et diagrammes',
        withOd: 'Graphiques et mises en avant rendus comme partie de la diapositive',
        without: 'Coller des images statiques ou reconstruire les graphiques à chaque fois',
      },
      {
        capability: 'Formats d’export',
        withOd: 'HTML pour présenter, plus export PDF / PPTX',
        without: 'Verrouillé au format d’une seule application',
      },
      {
        capability: 'Relecture et versionnage',
        withOd: 'La source vit dans votre dépôt, comparable',
        without: 'Fichier binaire, pas de diff significatif',
      },
      {
        capability: 'Coût et verrouillage',
        withOd: 'Open source, apportez vos propres clés, fonctionne en local',
        without: 'Licence d’application ou module IA par siège',
      },
    ],
    featuresTitle: 'Ce que vous pouvez présenter',
    features: [
      { title: "Présentations de pitch", body: "Des présentations investisseurs et ventes avec un récit fort et des diapositives de données nettes.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Suisse / éditorial", body: "Des présentations typographiques, guidées par la grille, à l’allure dirigée artistiquement.", thumb: "example-deck-swiss-international" },
      { title: "Modules de cours", body: "Des présentations pédagogiques avec des étapes claires, des mises en avant et un rythme.", thumb: "example-html-ppt-course-module" },
      { title: "Présentations à graphiques", body: "Des présentations sombres, axées sur les graphiques, pour analyses et revues.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Mode présentateur", body: "Des présentations de style Reveal conçues pour présenter en direct dans le navigateur.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Schémas techniques", body: "Des présentations d’architecture et de connaissances qui cartographient des systèmes complexes.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Des présentations créées avec Open Design',
    galleryLead:
      'De vraies présentations rendues à partir d’un plan. Choisissez un style proche de votre exposé et décrivez le contenu.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Présentation magazine éditoriale" },
      { thumb: "example-guizang-ppt", caption: "Keynote illustrée" },
      { thumb: "example-deck-open-slide-canvas", caption: "Présentation open slide canvas" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Présentation au thème dégradé" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Parcourir les modèles de présentation',
    faqTitle: 'FAQ diapositives',
    faq: [
      {
        q: 'Ai-je besoin de PowerPoint ou Keynote ?',
        a: 'Non. Open Design rend les présentations en HTML à l’intérieur de votre agent de code et peut exporter en PDF ou PPTX. Vous présentez depuis le navigateur ou transmettez un fichier — aucune application de présentation requise pour la construire.',
      },
      {
        q: 'Ne sont-ce que des puces générées par IA ?',
        a: 'Non. L’agent applique un vrai modèle de présentation avec une grille, une échelle typographique et une hiérarchie visuelle, si bien que les diapositives semblent conçues plutôt que remplies automatiquement.',
      },
      {
        q: 'Puis-je exporter vers PowerPoint pour un client ?',
        a: 'Oui. Les présentations s’exportent en PPTX et PDF en plus du HTML depuis lequel vous présentez, pour s’adapter à ce que le public attend.',
      },
      {
        q: 'Quels agents puis-je utiliser ?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI et d’autres adaptateurs maison, avec vos propres clés de fournisseur.',
      },
    ],
    ctaTitle: 'Construisez votre prochaine présentation ce soir',
    ctaBody:
      'Mettez une étoile au dépôt, installez Open Design et transformez votre plan en une présentation conçue — dans l’agent que vous utilisez déjà.',
  },
  image: {
    title: 'Générer des visuels fidèles à la marque avec Open Design + Claude Code',
    description:
      'Produisez des cartes sociales, des couvertures d’articles et des visuels marketing à partir d’une invite — disposés avec une vraie typographie et votre système de marque, rendus en HTML net que vous pouvez exporter en PNG. Pas d’application de design, pas d’abonnement à des modèles.',
    breadcrumb: 'Image',
    label: 'Cas d’usage · Image',
    heading: 'Des visuels fidèles à la marque, générés et mis en page pour vous',
    lead: 'Décrivez la carte ou la couverture dont vous avez besoin. Open Design la compose avec une vraie typographie, une grille et vos couleurs de marque — puis la rend en HTML que vous exportez en image, au lieu de batailler avec une application de design ou un modèle générique.',
    heroImageAlt:
      'Illustration éditoriale d’une invite se transformant en un ensemble de cartes sociales et de couvertures d’articles mises en page',
    tldrTitle: 'En une ligne',
    tldrBody:
      'Open Design transforme une invite en un visuel composé et fidèle à la marque que votre agent rend en HTML et exporte en PNG — reproductible, versionné et libéré des outils de design par siège.',
    stepsTitle: 'Comment fonctionnent les visuels avec Open Design',
    steps: [
      {
        title: 'Décrivez le visuel',
        body: 'Dites ce que c’est — "une carte Twitter pour notre lancement avec le titre et une citation." L’agent charge la bonne compétence pour composer un visuel mis en page, pas un simple bloc de texte.',
        imageAlt: 'Illustration d’une personne décrivant une carte sociale dont elle a besoin',
      },
      {
        title: 'Appliquez le système de marque',
        body: 'Open Design tire vos couleurs, votre typographie et vos espacements d’un système de design réutilisable, si bien que chaque carte s’accorde au reste de votre marque au lieu d’avoir l’air d’un coup unique.',
        imageAlt: 'Illustration de couleurs et de typographie de marque appliquées à une mise en page de carte',
      },
      {
        title: 'Rendez et exportez',
        body: 'Le visuel est rendu en HTML aux dimensions exactes dont vous avez besoin — carte sociale, couverture, bannière — puis exporté en PNG. Texte net, vraie mise en page, aucun ajustement manuel.',
        imageAlt: 'Illustration d’un visuel rendu et exporté vers un fichier image',
      },
      {
        title: 'Réutilisez la recette',
        body: 'Comme c’est un modèle, le visuel suivant n’est qu’à une invite — changez le titre, gardez la mise en page. Les séries de cartes restent parfaitement cohérentes.',
        imageAlt: 'Illustration d’un modèle de carte produisant une série de visuels cohérente',
      },
    ],
    tableTitle: 'Les visuels avec Open Design vs l’ancienne méthode',
    tableColCapability: 'Ce dont vous avez besoin',
    tableColWithOd: 'Avec Open Design',
    tableColWithout: 'Applications de design / modèles génériques',
    tableRows: [
      {
        capability: 'Passer de l’idée au visuel mis en page',
        withOd: 'Une invite ; l’agent compose typographie et mise en page',
        without: 'Ouvrir une application, placer chaque élément à la main',
      },
      {
        capability: 'Rester fidèle à la marque',
        withOd: 'Couleurs et typographie d’un système de design réutilisable',
        without: 'Re-choisir les styles de marque par fichier, ou dériver hors marque',
      },
      {
        capability: 'Série cohérente',
        withOd: 'Même modèle, nouveau texte — un ensemble parfaitement aligné',
        without: 'Réaligner chaque variante manuellement',
      },
      {
        capability: 'Export',
        withOd: 'HTML aux dimensions exactes, exporté en PNG',
        without: 'Dimensionnement de canevas et réglages d’export manuels',
      },
      {
        capability: 'Reproductible',
        withOd: 'Une recette guidée par invite dans votre dépôt',
        without: 'Un fichier unique que vous recréez à chaque fois',
      },
      {
        capability: 'Coût et verrouillage',
        withOd: 'Open source, apportez vos propres clés, fonctionne en local',
        without: 'Outil de design par siège ou place de marché de modèles',
      },
    ],
    featuresTitle: 'Ce que vous pouvez créer',
    features: [
      { title: "Cartes sociales", body: "Des cartes X / Twitter composées avec votre titre et votre marque.", thumb: "example-card-twitter" },
      { title: "Couvertures d’articles", body: "Des couvertures éditoriales, style magazine, pour billets et newsletters.", thumb: "example-article-magazine" },
      { title: "Cartes Xiaohongshu", body: "Des cartes style RedNote calibrées pour ce fil.", thumb: "example-card-xiaohongshu" },
      { title: "Visuels hero", body: "Des visuels hero liquides et dégradés pour sites et lancements.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Carrousels", body: "Des carrousels sociaux multi-diapositives qui restent cohérents d’un cadre à l’autre.", thumb: "example-social-carousel" },
      { title: "Cadres de maquette UI", body: "Des cadres de notification et d’appareil pour le storytelling produit.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Des visuels créés avec Open Design',
    galleryLead:
      'De vraies cartes et couvertures rendues à partir d’une invite. Choisissez-en une proche de votre besoin et remplacez par votre texte.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Carte sociale pastel" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Affiche éditoriale tricolore" },
      { thumb: "example-magazine-poster", caption: "Affiche style magazine" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Couverture éditoriale audacieuse" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Parcourir les modèles de visuel',
    faqTitle: 'FAQ image',
    faq: [
      {
        q: 'Est-ce un générateur d’images IA comme Midjourney ?',
        a: 'Non. Open Design compose des visuels avec une vraie mise en page et une vraie typographie — votre titre, votre marque, des dimensions exactes — et les rend en HTML que vous exportez en PNG. C’est de la composition de design, pas de la génération de pixels.',
      },
      {
        q: 'Puis-je créer une série de cartes cohérente ?',
        a: 'Oui. Comme chaque visuel est un modèle, vous gardez la mise en page et changez le texte, si bien qu’une série entière reste parfaitement alignée et fidèle à la marque.',
      },
      {
        q: 'Quelles tailles peut-il produire ?',
        a: 'N’importe laquelle — le visuel est rendu aux dimensions exactes que vous précisez, d’une carte sociale carrée à une large bannière, puis exporté en PNG.',
      },
      {
        q: 'Quels agents puis-je utiliser ?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI et d’autres adaptateurs maison, avec vos propres clés de fournisseur.',
      },
    ],
    ctaTitle: 'Créez votre prochain visuel ce soir',
    ctaBody:
      'Mettez une étoile au dépôt, installez Open Design et transformez une invite en un visuel fidèle à la marque — dans l’agent que vous utilisez déjà.',
  },
  video: {
    title: 'Générer des motion graphics et des vidéos courtes avec Open Design + Claude Code',
    description:
      'Transformez un script en cadres animés et vidéos courtes — cartons-titres, fonds animés et outros composés avec votre système de marque et rendus à partir de HTML. Pas de suite de motion graphics, pas de défilement sur une timeline.',
    breadcrumb: 'Vidéo',
    label: 'Cas d’usage · Vidéo',
    heading: 'Des motion graphics à partir d’un script, pas d’une timeline',
    lead: 'Décrivez le moment que vous voulez — une apparition de titre, une animation de données, un outro de logo. Open Design compose des cadres animés avec votre système de marque et les rend en vidéo, sans suite de motion graphics requise.',
    heroImageAlt:
      'Illustration éditoriale d’un script se transformant en une séquence de cadres vidéo animés',
    tldrTitle: 'En une ligne',
    tldrBody:
      'Open Design transforme un script en cadres animés et fidèles à la marque que votre agent rend en vidéo courte — composés à partir de HTML, versionnés dans votre dépôt, sans éditeur de timeline à apprendre.',
    stepsTitle: 'Comment fonctionne le motion avec Open Design',
    steps: [
      {
        title: 'Décrivez le moment',
        body: 'Dites ce qui doit se passer — "un titre glitch qui se résout en notre logo, puis un carton de clôture." L’agent charge la compétence de motion pour produire des cadres animés, pas une image statique.',
        imageAlt: 'Illustration d’une personne décrivant une séquence animée',
      },
      {
        title: 'Appliquez le style de marque et de motion',
        body: 'Open Design fournit des modèles de cadres — fuites de lumière cinématiques, titres glitch, outros de logo — et applique vos couleurs et votre typographie, pour que le mouvement semble intentionnel et fidèle à la marque.',
        imageAlt: 'Illustration d’un style de marque appliqué à des cadres animés',
      },
      {
        title: 'Rendez les cadres en vidéo',
        body: 'Les cadres sont composés en HTML et rendus en vidéo, donc le timing et la mise en page sont précis et reproductibles — pas de keyframing manuel sur une timeline.',
        imageAlt: 'Illustration de cadres HTML rendus en un clip vidéo',
      },
      {
        title: 'Itérez et exportez',
        body: 'Affinez en parlant à l’agent — "ralentis l’apparition du titre, ajoute une légende." Exportez des clips courts pour le social ou le produit. La source reste dans votre projet.',
        imageAlt: 'Illustration d’un clip vidéo affiné et exporté pour le social',
      },
    ],
    tableTitle: 'Le motion avec Open Design vs l’ancienne méthode',
    tableColCapability: 'Ce dont vous avez besoin',
    tableColWithOd: 'Avec Open Design',
    tableColWithout: 'After Effects / suites de motion',
    tableRows: [
      {
        capability: 'Passer du script aux cadres animés',
        withOd: 'Une invite ; l’agent compose la séquence',
        without: 'Keyframer chaque élément sur une timeline à la main',
      },
      {
        capability: 'Rester fidèle à la marque',
        withOd: 'Modèles de cadres + vos couleurs et votre typographie',
        without: 'Reconstruire le style de marque par projet',
      },
      {
        capability: 'Timing précis et reproductible',
        withOd: 'Composé en HTML, rendu de façon déterministe',
        without: 'Défilement manuel, difficile à reproduire',
      },
      {
        capability: 'Export pour le social',
        withOd: 'Clips courts rendus en vidéo',
        without: 'Préréglages d’export et bataille avec les codecs',
      },
      {
        capability: 'Relecture et versionnage',
        withOd: 'La source des cadres vit dans votre dépôt, comparable',
        without: 'Fichier de projet binaire, pas de vrai diff',
      },
      {
        capability: 'Coût et verrouillage',
        withOd: 'Open source, apportez vos propres clés, fonctionne en local',
        without: 'Suite coûteuse, courbe d’apprentissage raide',
      },
    ],
    featuresTitle: 'Ce que vous pouvez animer',
    features: [
      { title: "Hyperframes", body: "Des séquences animées image par image composées à partir de HTML.", thumb: "example-video-hyperframes" },
      { title: "Social court", body: "Des clips verticaux conçus pour les fils sociaux.", thumb: "example-video-shortform" },
      { title: "Sets de cadres animés", body: "Des cadres animés réutilisables que vous assemblez en un clip.", thumb: "example-motion-frames" },
      { title: "Fuites de lumière cinématiques", body: "Des transitions cinématographiques et des fonds atmosphériques.", thumb: "example-frame-light-leak-cinema" },
      { title: "Titres glitch", body: "Des apparitions de titre avec mouvement et texture.", thumb: "example-frame-glitch-title" },
      { title: "Outros de logo", body: "Des animations de clôture aux couleurs de la marque pour tout clip.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Du motion créé avec Open Design',
    galleryLead:
      'De vrais cadres animés et clips rendus à partir d’une invite. Choisissez-en un proche de votre idée et décrivez le mouvement.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Séquence Hyperframes" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Fond animé liquide" },
      { thumb: "example-frame-macos-notification", caption: "Cadre UI animé" },
      { thumb: "example-frame-data-chart-nyt", caption: "Graphique de données animé" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Parcourir les modèles de motion',
    faqTitle: 'FAQ vidéo',
    faq: [
      {
        q: 'Ai-je besoin d’After Effects ou d’une suite de motion graphics ?',
        a: 'Non. Open Design compose des cadres animés en HTML et les rend en vidéo à l’intérieur de votre agent de code. Il n’y a aucun éditeur de timeline à apprendre ou à licencier.',
      },
      {
        q: 'Pour quel type de vidéo est-ce adapté ?',
        a: 'Le motion court — cartons-titres, animations de données, outros de logo, clips sociaux. C’est conçu pour le motion de marque et produit, pas pour le montage long format.',
      },
      {
        q: 'Le timing est-il reproductible ?',
        a: 'Oui. Comme les cadres sont composés en code et rendus de façon déterministe, vous obtenez le même résultat à chaque fois et pouvez l’ajuster précisément par une invite.',
      },
      {
        q: 'Quels agents puis-je utiliser ?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI et d’autres adaptateurs maison, avec vos propres clés de fournisseur.',
      },
    ],
    ctaTitle: 'Animez votre prochaine idée ce soir',
    ctaBody:
      'Mettez une étoile au dépôt, installez Open Design et transformez un script en motion — dans l’agent que vous utilisez déjà.',
  },
  designSystem: {
    title: 'Construire et appliquer un système de design avec Open Design + Claude Code',
    description:
      'Capturez votre marque comme un système de design réutilisable que votre agent de code applique à chaque artefact — couleurs, typographie, composants et ton dans un seul DESIGN.md. Définissez-le une fois ; chaque prototype, présentation et tableau de bord reste fidèle à la marque.',
    breadcrumb: 'Système de design',
    label: 'Cas d’usage · Système de design',
    heading: 'Un système de design, appliqué à tout ce que crée votre agent',
    lead: 'Définissez votre marque une fois et Open Design la porte dans chaque sortie — prototypes, présentations, tableaux de bord, visuels. Le système vit dans votre dépôt sous forme de DESIGN.md que l’agent lit, donc la cohérence est automatique, pas manuelle.',
    heroImageAlt:
      'Illustration éditoriale d’un seul système de design rayonnant vers de nombreux artefacts fidèles à la marque',
    tldrTitle: 'En une ligne',
    tldrBody:
      'Open Design capture votre marque comme un système de design portable que votre agent applique à chaque artefact — défini une fois dans votre dépôt, imposé partout, sans outil de design central qui en garde l’accès.',
    stepsTitle: 'Comment fonctionnent les systèmes de design avec Open Design',
    steps: [
      {
        title: 'Capturez le système',
        body: 'Décrivez votre marque — couleurs, typographie, espacements, voix — ou pointez l’agent vers un site existant pour l’extraire. Open Design l’écrit dans un DESIGN.md qui vit dans votre projet.',
        imageAlt: 'Illustration d’une marque capturée dans un seul fichier de système de design',
      },
      {
        title: 'Partez d’une base éprouvée',
        body: 'Open Design livre plus de 140 systèmes de design de référence — d’Apple et Linear à l’éditorial et au brutaliste. Forkez-en un proche de votre marque au lieu de partir d’une page blanche.',
        imageAlt: 'Illustration d’une galerie de systèmes de design de référence que l’on parcourt',
      },
      {
        title: 'Appliquez-le partout',
        body: 'Toutes les autres compétences lisent le même système, donc un prototype, une présentation et un tableau de bord partagent tous un langage visuel — sans que vous ayez à le re-spécifier à chaque fois.',
        imageAlt: 'Illustration d’un système appliqué de façon cohérente à de nombreux types d’artefacts',
      },
      {
        title: 'Faites-le évoluer en un seul endroit',
        body: 'Changez le système et le prochain rendu le reflète partout. Comme c’est un fichier dans votre dépôt, les décisions de design sont relues et versionnées comme du code.',
        imageAlt: 'Illustration d’un système de design mis à jour et se propageant à toutes les sorties',
      },
    ],
    tableTitle: 'Les systèmes de design avec Open Design vs l’ancienne méthode',
    tableColCapability: 'Ce dont vous avez besoin',
    tableColWithOd: 'Avec Open Design',
    tableColWithout: 'Bibliothèques d’outils de design / chartes graphiques',
    tableRows: [
      {
        capability: 'Définir le système',
        withOd: 'Un DESIGN.md que l’agent lit, forké depuis plus de 140 références',
        without: 'Une charte graphique statique ou une bibliothèque liée à un outil',
      },
      {
        capability: 'Appliquer à travers les types d’artefacts',
        withOd: 'Le même système alimente prototypes, présentations, tableaux de bord, visuels',
        without: 'Réimplémenté par outil et par fichier',
      },
      {
        capability: 'Tout garder cohérent',
        withOd: 'Automatique — chaque compétence lit une seule source',
        without: 'Discipline manuelle ; dérive avec le temps',
      },
      {
        capability: 'Faire évoluer la marque',
        withOd: 'Modifiez une fois ; le prochain rendu se met à jour partout',
        without: 'Chercher-remplacer à travers fichiers et outils',
      },
      {
        capability: 'Relecture et versionnage',
        withOd: 'Vit dans votre dépôt, comparable comme du code',
        without: 'Enfoui dans un outil de design, difficile à auditer',
      },
      {
        capability: 'Coût et verrouillage',
        withOd: 'Open source, portable, fonctionne en local',
        without: 'Verrouillé à un abonnement d’outil de design',
      },
    ],
    featuresTitle: 'Des systèmes d’où partir',
    features: [
      { title: "Apple", body: "Esthétique épurée, sobre, à police système.", thumb: "design-system-apple" },
      { title: "Linear", body: "Allure d’outil produit nette avec des espacements serrés.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Doux, centré sur le document, accessible.", thumb: "design-system-notion" },
      { title: "Figma", body: "Ludique, coloré, avec l’énergie d’un outil créatif.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimal, neutre, de qualité recherche.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Dense, technique, natif pour les développeurs.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Les systèmes de design dans Open Design',
    galleryLead:
      'Quelques-uns des plus de 140 systèmes de référence que vous pouvez forker comme point de départ. Choisissez-en un proche de votre marque et adaptez-le.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Système style Airbnb" },
      { thumb: "design-system-vercel", caption: "Système style Vercel" },
      { thumb: "design-system-stripe", caption: "Système style Stripe" },
      { thumb: "design-system-spotify", caption: "Système style Spotify" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Parcourir les systèmes de design',
    faqTitle: 'FAQ système de design',
    faq: [
      {
        q: 'Qu’est-ce exactement que le système de design ici ?',
        a: 'Un fichier DESIGN.md dans votre dépôt qui capture couleurs, typographie, espacements, composants et voix. Chaque compétence Open Design le lit, donc votre marque est appliquée automatiquement à tout ce que l’agent produit.',
      },
      {
        q: 'Dois-je partir de zéro ?',
        a: 'Non. Open Design livre plus de 140 systèmes de design de référence que vous pouvez forker — d’Apple et Linear à l’éditorial et au brutaliste — puis adapter à votre marque.',
      },
      {
        q: 'Comment reste-t-il cohérent entre présentations, tableaux de bord et prototypes ?',
        a: 'Parce que toutes ces compétences lisent le même DESIGN.md. Définissez le système une fois et la cohérence devient automatique au lieu d’être quelque chose que vous surveillez à la main.',
      },
      {
        q: 'Quels agents puis-je utiliser ?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI et d’autres adaptateurs maison, avec vos propres clés de fournisseur.',
      },
    ],
    ctaTitle: 'Définissez votre système de design ce soir',
    ctaBody:
      'Mettez une étoile au dépôt, installez Open Design et donnez à votre agent une marque à appliquer partout — dans l’agent que vous utilisez déjà.',
  },
  roleSoloBuilder: {
    title: 'Open Design pour les créateurs solo et indie hackers',
    description:
      'Livrez comme une équipe à vous tout seul. Open Design transforme votre agent de code en la moitié design de votre startup — prototypes, landing pages, tableaux de bord et visuels de marque, le tout à partir d’un prompt, le tout dans votre charte, le tout dans votre dépôt.',
    breadcrumb: 'Créateur solo',
    label: 'Pour · Créateurs solo',
    heading: 'Votre équipe design, c’est l’agent que vous utilisez déjà',
    lead: 'Pas de designer, pas de budget, pas de transmission. Décrivez ce dont vous avez besoin et votre agent le rend — une landing page ce matin, un tableau de bord cet après-midi, des cartes sociales avant de livrer — le tout partageant un seul système de design défini une fois pour toutes.',
    heroImageAlt:
      'Illustration éditoriale d’une personne à un bureau entourée d’une landing page, d’une application, d’un tableau de bord et de cartes sociales, le tout dans un style cohérent',
    tldrTitle: 'En une phrase',
    tldrBody:
      'Open Design est le département design qu’un fondateur solo n’a jamais eu : du prompt à l’artefact sur chaque surface dont votre produit a besoin, dans une seule marque, sans transmission ni outil supplémentaire.',
    stepsTitle: 'Comment un créateur solo utilise Open Design',
    steps: [
      {
        title: 'Définissez votre marque une fois',
        body: 'Consignez couleurs, typographie et ton dans un DESIGN.md (ou forkez l’un des plus de 140 systèmes de référence). Chaque artefact que vous générez ensuite est automatiquement dans votre charte.',
        imageAlt: 'Illustration d’un unique fichier de définition de marque',
      },
      {
        title: 'Générez ce dont vous avez besoin ensuite',
        body: 'Prototype, landing page, tableau de bord, pitch deck, carte sociale — même agent, même marque, un prompt chacun. Pas de changement d’outil, pas de licences à racheter.',
        imageAlt: 'Illustration de nombreux types d’artefacts issus d’un seul prompt',
      },
      {
        title: 'Livrez-le — c’est déjà réel',
        body: 'Tout est rendu en HTML / code dans votre dépôt, donc le prototype devient le produit et la landing page passe en ligne. Pas de maquettes jetables.',
        imageAlt: 'Illustration d’un artefact passant directement du prompt à la mise en ligne',
      },
    ],
    tableTitle: 'Construire en solo avec Open Design vs. le faire à la dure',
    tableColCapability: 'Ce dont vous avez besoin',
    tableColWithOd: 'Avec Open Design',
    tableColWithout: 'Y aller seul aujourd’hui',
    tableRows: [
      { capability: 'Couvrir chaque surface de design', withOd: 'Un agent fait prototype, landing, tableau de bord, marque', without: 'Assembler cinq outils SaaS et des tutoriels' },
      { capability: 'Rester dans la charte', withOd: 'Un DESIGN.md appliqué partout automatiquement', without: 'Recréer le look par outil, dérive avec le temps' },
      { capability: 'Avancer à la vitesse du solo', withOd: 'De l’idée à l’artefact en un prompt', without: 'Apprendre un outil de design dont vous n’avez pas le temps' },
      { capability: 'Livrer, pas maquetter', withOd: 'HTML / code dans votre dépôt, prêt à déployer', without: 'Une maquette que quelqu’un doit encore construire' },
      { capability: 'Coût', withOd: 'Open source, vos propres clés, tourne en local', without: 'Une pile d’abonnements facturés par siège' },
    ],
    featuresTitle: 'Ce qu’un créateur solo peut livrer',
    features: [
      { title: 'Landing pages', body: 'Landings marketing et SaaS, cliquables et en ligne.', thumb: 'example-saas-landing' },
      { title: 'Prototypes produit', body: 'Applications web multi-écrans pour valider l’idée.', thumb: 'example-web-prototype' },
      { title: 'Tableaux de bord', body: 'Vues de métriques et d’admin pour votre produit.', thumb: 'example-dashboard' },
      { title: 'Graphismes de marque', body: 'Couvertures et affiches assorties à votre marque.', thumb: 'example-magazine-poster' },
      { title: 'Parcours mobiles', body: 'Écrans d’app quand vous allez au-delà du web.', thumb: 'example-mobile-app' },
      { title: 'Cartes sociales', body: 'Cartes de lancement et de mise à jour pour chaque canal.', thumb: 'example-card-twitter' },
    ],
    galleryTitle: 'Construit en solo avec Open Design',
    galleryLead:
      'Chaque surface dont une startup d’une personne a besoin, à partir d’un prompt. Choisissez-en une proche de votre prochain coup et décrivez-la.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'Landing page SaaS' },
      { thumb: 'example-web-prototype', caption: 'Prototype produit' },
      { thumb: 'example-dashboard', caption: 'Tableau de bord produit' },
      { thumb: 'example-card-twitter', caption: 'Carte sociale de lancement' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Parcourir les modèles',
    faqTitle: 'FAQ créateur solo',
    faq: [
      { q: 'Je ne suis pas designer — puis-je vraiment l’utiliser ?', a: 'Oui. Vous décrivez ce que vous voulez en langage clair ; l’agent applique un système de design et le rend. Le savoir-faire, c’est d’écrire le prompt, pas de pousser des pixels.' },
      { q: 'Couvre-t-il tout, ou juste une chose ?', a: 'Tout ce dont un petit produit a besoin — prototypes, landing pages, tableaux de bord, decks, graphismes — depuis le même agent et la même marque.' },
      { q: 'Que deviennent les résultats ?', a: 'Du vrai HTML / code dans votre dépôt, donc un prototype peut devenir le produit et une landing page peut passer en ligne, au lieu d’une maquette que vous jetez.' },
      { q: 'Quels agents puis-je utiliser ?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI et d’autres adaptateurs natifs, avec vos propres clés de fournisseur.' },
    ],
    ctaTitle: 'Construisez votre projet entier ce soir',
    ctaBody:
      'Mettez une étoile au dépôt, installez Open Design et laissez un seul agent être votre équipe design — dans l’agent que vous utilisez déjà.',
  },
  roleDesigner: {
    title: 'Open Design pour les designers',
    description:
      'Passez votre temps sur le goût, pas sur la corvée. Open Design laisse votre agent gérer le travail de production répétitif — variantes, états, systèmes de design complets — pendant que vous dirigez le look et gardez le dernier mot.',
    breadcrumb: 'Designer',
    label: 'Pour · Designers',
    heading: 'Dirigez le design — laissez l’agent faire la production',
    lead: 'Vous fixez le système et le standard ; l’agent rend les écrans, les états, les variantes, les comps haute fidélité. Moins de rectangles à pousser, plus de décisions sur ce qu’est le beau.',
    heroImageAlt:
      'Illustration éditoriale d’un designer qui dirige pendant qu’un agent remplit écrans, variantes et système de design',
    tldrTitle: 'En une phrase',
    tldrBody:
      'Open Design est l’assistant de production qui ne se fatigue jamais : vous définissez le système de design et tranchez sur le goût ; l’agent génère le reste, dans le système, dans votre dépôt.',
    stepsTitle: 'Comment un designer utilise Open Design',
    steps: [
      {
        title: 'Encodez votre système',
        body: 'Transformez votre marque en un DESIGN.md — échelle typographique, couleur, espacement, composants, ton. C’est la source de vérité à laquelle l’agent obéit.',
        imageAlt: 'Illustration d’un système de design consigné dans un fichier',
      },
      {
        title: 'Générez la longue traîne',
        body: 'Chaque écran, état et variante que vous monteriez sinon à la main — l’agent les rend dans le système, donc les 80 % ennuyeux sont faits en quelques minutes.',
        imageAlt: 'Illustration de nombreux écrans conformes au système générés d’un coup',
      },
      {
        title: 'Dirigez et affinez',
        body: 'Critiquez en langage — « resserrez l’espacement, rendez l’état vide plus chaleureux ». Vous gardez le dernier mot ; l’agent fait les itérations.',
        imageAlt: 'Illustration d’un designer donnant une direction et du design qui se met à jour',
      },
    ],
    tableTitle: 'Concevoir avec Open Design vs. la méthode manuelle',
    tableColCapability: 'Ce dont vous avez besoin',
    tableColWithOd: 'Avec Open Design',
    tableColWithout: 'Outillage de design manuel',
    tableRows: [
      { capability: 'Construire un système de design', withOd: 'Un DESIGN.md que l’agent applique partout', without: 'Une bibliothèque maintenue à la main par outil' },
      { capability: 'Produire variantes & états', withOd: 'Générés dans le système à partir d’un prompt', without: 'Dupliquer des cadres et ajuster chacun' },
      { capability: 'Comps haute fidélité', withOd: 'Rendus en vrai HTML, pas une maquette plate', without: 'Du travail au pixel que l’ingénierie refait de toute façon' },
      { capability: 'Rester cohérent', withOd: 'Un système, appliqué automatiquement', without: 'Discipline manuelle ; dérive avec le temps' },
      { capability: 'Transmission', withOd: 'L’artefact est du code — pas d’écart de traduction', without: 'Documents de spec et redlines' },
    ],
    featuresTitle: 'Ce qu’un designer peut diriger',
    features: [
      { title: 'Mises en page éditoriales', body: 'Compositions dirigées artistiquement, pilotées par la grille.', thumb: 'example-web-prototype-taste-editorial' },
      { title: 'Couvertures d’articles', body: 'Couvertures et reportages façon magazine.', thumb: 'example-article-magazine' },
      { title: 'Affiches', body: 'Affiches typographiques fortes, dans la charte.', thumb: 'example-magazine-poster' },
      { title: 'Sets sociaux', body: 'Carrousels multi-cadres cohérents.', thumb: 'example-social-carousel' },
      { title: 'Écrans d’app', body: 'Écrans mobiles et web haute fidélité.', thumb: 'example-mobile-app' },
      { title: 'Tableaux de bord', body: 'UI de données qui respecte votre système.', thumb: 'example-dashboard' },
    ],
    galleryTitle: 'Dirigé avec Open Design',
    galleryLead:
      'Du travail haute fidélité, conforme au système, produit par l’agent à partir d’une direction. Choisissez-en un proche de votre style et affinez-le.',
    gallery: [
      { thumb: 'example-web-prototype-taste-editorial', caption: 'Mise en page éditoriale' },
      { thumb: 'example-article-magazine', caption: 'Couverture de magazine' },
      { thumb: 'example-social-carousel', caption: 'Carrousel social' },
      { thumb: 'example-magazine-poster', caption: 'Affiche typographique' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Parcourir les modèles',
    faqTitle: 'FAQ designer',
    faq: [
      { q: 'Est-ce que ça me remplace ?', a: 'Non — ça remplace la corvée. Vous fixez le système et le goût ; l’agent fait la production répétitive pour que vous passiez votre temps sur les décisions que vous seul pouvez prendre.' },
      { q: 'Comment garder le contrôle du look ?', a: 'Votre DESIGN.md est le contrat. L’agent rend dans son cadre, et vous critiquez en langage jusqu’à ce que ce soit juste.' },
      { q: 'Le résultat est-il éditable / réel ?', a: 'C’est du vrai HTML/CSS, pas un export plat — il passe directement en production au lieu d’être reconstruit.' },
      { q: 'Quels agents puis-je utiliser ?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI et d’autres adaptateurs natifs, avec vos propres clés de fournisseur.' },
    ],
    ctaTitle: 'Dirigez votre prochain design ce soir',
    ctaBody:
      'Mettez une étoile au dépôt, installez Open Design et laissez l’agent gérer la production pendant que vous tranchez sur le goût — dans l’agent que vous utilisez déjà.',
  },
  roleEngineering: {
    title: 'Open Design pour les ingénieurs',
    description:
      'Sautez la transmission du design. Open Design transforme un DESIGN.md en vrai front-end que votre agent de code écrit directement — UI conforme au système, prototypes et tableaux de bord, dans le dépôt, sans aller-retour Figma.',
    breadcrumb: 'Ingénierie',
    label: 'Pour · Ingénierie',
    heading: 'De la spec au front-end, aucune transmission entre les deux',
    lead: 'Pointez votre agent vers un DESIGN.md et une description ; il écrit du code front-end réel et conforme au système — composants, écrans, tableaux de bord — directement dans votre projet. Pas de redlines, pas d’« attente du design ».',
    heroImageAlt:
      'Illustration éditoriale d’un DESIGN.md s’écoulant directement dans du code front-end et une UI rendue, en sautant une étape de transmission',
    tldrTitle: 'En une phrase',
    tldrBody:
      'Open Design comble l’écart designer-ingénieur en rendant le système de design lisible par la machine : le même agent qui écrit votre code applique le système et rend une vraie UI.',
    stepsTitle: 'Comment un ingénieur utilise Open Design',
    steps: [
      {
        title: 'Lisez le système, pas une redline',
        body: 'Le DESIGN.md vit dans le dépôt. Votre agent le lit comme il lit le reste de la base de code — pas de specs exportées à interpréter.',
        imageAlt: 'Illustration d’un agent lisant un DESIGN.md aux côtés du code',
      },
      {
        title: 'Générez une UI conforme au système',
        body: 'Décrivez l’écran ou le composant ; l’agent écrit du front-end qui correspond déjà au système. Prototypes, tableaux de bord d’admin, outils internes — en quelques minutes.',
        imageAlt: 'Illustration de code d’UI généré pour correspondre à un système de design',
      },
      {
        title: 'C’est déjà votre code',
        body: 'La sortie est du HTML / code de framework dans votre dépôt, relisible dans une PR. Pas d’étape de traduction entre « le design » et « le build ».',
        imageAlt: 'Illustration d’une UI générée arrivant comme une PR relisible',
      },
    ],
    tableTitle: 'Front-end avec Open Design vs. la méthode de transmission',
    tableColCapability: 'Ce dont vous avez besoin',
    tableColWithOd: 'Avec Open Design',
    tableColWithout: 'Transmission design-vers-dev',
    tableRows: [
      { capability: 'Obtenir un design à construire', withOd: 'Un DESIGN.md que votre agent lit directement', without: 'Un fichier Figma que vous réinterprétez à la main' },
      { capability: 'Correspondre au système', withOd: 'Appliqué automatiquement à la génération', without: 'Comparer à l’œil avec une spec, la dérive s’installe' },
      { capability: 'Construire outils internes / tableaux de bord', withOd: 'Prompt → front-end conforme au système dans le dépôt', without: 'Attendre un designer, puis le construire deux fois' },
      { capability: 'Revue', withOd: 'C’est du code — faites le diff dans une PR', without: 'Comparaison au pixel avec une maquette' },
      { capability: 'Coût & verrouillage', withOd: 'Open source, dans votre dépôt, tourne en local', without: 'Un outil de design que toute l’équipe doit licencier' },
    ],
    featuresTitle: 'Ce qu’un ingénieur peut générer',
    features: [
      { title: 'UI d’app web', body: 'Front-ends multi-écrans à partir d’une description.', thumb: 'example-web-prototype' },
      { title: 'Tableaux de bord dev', body: 'Tableaux de bord de dépôt, CI et métriques.', thumb: 'example-github-dashboard' },
      { title: 'Rapports de données', body: 'Rapports structurés à partir de vos données.', thumb: 'example-data-report' },
      { title: 'Tableaux de bord admin', body: 'Outils internes et vues d’admin.', thumb: 'example-dashboard' },
      { title: 'Landing pages', body: 'Pages marketing sans attendre le design.', thumb: 'example-saas-landing' },
      { title: 'Kanban / tableaux', body: 'UI de workflow internes.', thumb: 'example-kanban-board' },
    ],
    galleryTitle: 'Construit par des ingénieurs avec Open Design',
    galleryLead:
      'Du vrai front-end conforme au système, généré directement dans le dépôt. Choisissez-en un proche de ce que vous construisez et décrivez-le.',
    gallery: [
      { thumb: 'example-web-prototype', caption: 'UI d’app web' },
      { thumb: 'example-github-dashboard', caption: 'Tableau de bord dev' },
      { thumb: 'example-data-report', caption: 'Rapport de données' },
      { thumb: 'example-kanban-board', caption: 'UI de tableau interne' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Parcourir les modèles',
    faqTitle: 'FAQ ingénierie',
    faq: [
      { q: 'Ai-je encore besoin d’un designer ?', a: 'Pour la marque et la direction, oui. Mais pour construire une UI conforme au système et des outils internes, l’agent lit le DESIGN.md et écrit le front-end — sans aller-retour de transmission.' },
      { q: 'Que produit-il ?', a: 'Du vrai HTML / code de framework dans votre dépôt, relisible dans une PR — pas une maquette que vous réimplémentez.' },
      { q: 'Comment reste-t-il conforme au système ?', a: 'Le DESIGN.md est la source de vérité ; l’agent l’applique à la génération, donc la sortie correspond sans vérification manuelle au pixel.' },
      { q: 'Quels agents puis-je utiliser ?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI et d’autres adaptateurs natifs, avec vos propres clés de fournisseur.' },
    ],
    ctaTitle: 'Générez votre prochaine UI ce soir',
    ctaBody:
      'Mettez une étoile au dépôt, installez Open Design et transformez un DESIGN.md en front-end — dans l’agent que vous utilisez déjà.',
  },
  roleProductManagers: {
    title: 'Open Design pour les product managers',
    description:
      'Cessez d’attendre la disponibilité du design pour communiquer une idée. Open Design laisse un PM transformer un prompt en prototype cliquable ou wireframe — pour aligner les parties prenantes et briefer l’équipe, sans ticket de design.',
    breadcrumb: 'Product managers',
    label: 'Pour · Product managers',
    heading: 'Rendez l’idée cliquable avant le lancement',
    lead: 'Décrivez le parcours et votre agent rend un vrai prototype cliquable que vous pouvez mettre devant les parties prenantes aujourd’hui — pour que les revues discutent de la chose réelle, pas d’un paragraphe dans un document.',
    heroImageAlt:
      'Illustration éditoriale d’un PM transformant une idée écrite en un prototype cliquable montré aux parties prenantes',
    tldrTitle: 'En une phrase',
    tldrBody:
      'Open Design donne au PM un moyen sans design de rendre les idées tangibles : du prompt au prototype pour l’alignement et les briefs, sans dépenser le budget design de l’équipe.',
    stepsTitle: 'Comment un PM utilise Open Design',
    steps: [
      {
        title: 'Décrivez le parcours',
        body: 'Écrivez le parcours utilisateur en langage clair — les écrans, les états, le chemin nominal. Aucun outil de wireframe requis.',
        imageAlt: 'Illustration d’un PM décrivant un parcours utilisateur',
      },
      {
        title: 'Obtenez un prototype cliquable',
        body: 'L’agent rend des écrans navigables que vous pouvez réellement parcourir au clic — bien plus clair qu’une diapo ou un document pour une revue de parties prenantes.',
        imageAlt: 'Illustration d’un prototype cliquable produit à partir d’une description',
      },
      {
        title: 'Alignez et transmettez',
        body: 'Partagez le lien, recueillez le retour sur la chose réelle, puis passez le prototype au design/eng comme point de départ précis et partagé.',
        imageAlt: 'Illustration d’un prototype partagé pour l’alignement puis transmis à l’équipe',
      },
    ],
    tableTitle: 'Le travail de PM avec Open Design vs. attendre le design',
    tableColCapability: 'Ce dont vous avez besoin',
    tableColWithOd: 'Avec Open Design',
    tableColWithout: 'Sans, aujourd’hui',
    tableRows: [
      { capability: 'Rendre une idée tangible', withOd: 'Prompt → prototype cliquable, par vous-même', without: 'Déposer un ticket de design et attendre la dispo' },
      { capability: 'Aligner les parties prenantes', withOd: 'Elles cliquent dans le vrai parcours', without: 'Elles lisent un document et l’imaginent différemment' },
      { capability: 'Briefer l’équipe', withOd: 'Un prototype concret comme spec', without: 'Un mur de texte et des allers-retours' },
      { capability: 'Itérer avant le build', withOd: 'Modifier en un prompt, repartager', without: 'Un autre tour dans la file du design' },
      { capability: 'Coût', withOd: 'Open source, dans l’agent que vous utilisez déjà', without: 'Des heures de design sur des concepts jetables' },
    ],
    featuresTitle: 'Ce qu’un PM peut mettre devant les gens',
    features: [
      { title: 'Parcours mobiles', body: 'Parcours d’app de bout en bout, cliquables.', thumb: 'example-mobile-app' },
      { title: 'Parcours d’onboarding', body: 'Bienvenue → configuration → premier lancement.', thumb: 'example-mobile-onboarding' },
      { title: 'Tableaux & workflows', body: 'UI Kanban et de processus pour les specs.', thumb: 'example-kanban-board' },
      { title: 'Tableaux de bord', body: 'Vues de métriques pour cadrer le problème.', thumb: 'example-dashboard' },
      { title: 'Prototypes web', body: 'Parcours web multi-écrans à relire.', thumb: 'example-web-prototype' },
      { title: 'Vues de tendances', body: 'Instantanés sur 30 jours et de tendance pour le contexte.', thumb: 'example-last30days' },
    ],
    galleryTitle: 'Prototypé par des PM avec Open Design',
    galleryLead:
      'Des parcours cliquables rendus à partir d’une description, prêts pour une revue de parties prenantes. Choisissez-en un proche de votre idée et décrivez-le.',
    gallery: [
      { thumb: 'example-mobile-app', caption: 'Parcours mobile' },
      { thumb: 'example-mobile-onboarding', caption: 'Parcours d’onboarding' },
      { thumb: 'example-kanban-board', caption: 'Tableau de workflow' },
      { thumb: 'example-web-prototype', caption: 'Prototype web' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Parcourir les modèles',
    faqTitle: 'FAQ product manager',
    faq: [
      { q: 'Je ne sais pas designer — est-ce pour moi ?', a: 'Oui. Vous décrivez le parcours avec des mots ; l’agent le rend cliquable. C’est pour communiquer et aligner, sans outil de design requis.' },
      { q: 'Est-ce un vrai prototype ou une maquette ?', a: 'Réel et cliquable — la navigation et les états fonctionnent, donc les parties prenantes réagissent à l’expérience réelle.' },
      { q: 'Est-ce que ça remplace le design ?', a: 'Non — ça donne au design et à l’eng un point de départ précis et partagé au lieu d’une spec textuelle, et ça réserve la disponibilité du design pour le travail qui en a besoin.' },
      { q: 'Quels agents puis-je utiliser ?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI et d’autres adaptateurs natifs, avec vos propres clés de fournisseur.' },
    ],
    ctaTitle: 'Rendez votre idée cliquable ce soir',
    ctaBody:
      'Mettez une étoile au dépôt, installez Open Design et transformez votre prochaine spec en quelque chose que les gens peuvent cliquer — dans l’agent que vous utilisez déjà.',
  },
  roleMarketing: {
    title: 'Open Design pour les équipes marketing',
    description:
      'Livrez des campagnes à la vitesse du contenu. Open Design laisse votre agent produire landing pages, cartes sociales et visuels de campagne à partir d’un prompt — dans la charte, à la demande, sans faire la queue au design.',
    breadcrumb: 'Marketing',
    label: 'Pour · Marketing',
    heading: 'Des visuels de campagne à la vitesse d’un prompt',
    lead: 'Landing pages, cartes sociales, couvertures, visuels d’annonce — décrits en langage, rendus dans la charte, livrés le jour même. Pas de ticket de design, pas de bataille avec les gabarits.',
    heroImageAlt:
      'Illustration éditoriale d’une marketeuse transformant un brief en une landing page et un jeu de cartes sociales dans la charte',
    tldrTitle: 'En une phrase',
    tldrBody:
      'Open Design est la ressource design toujours active du marketing : du prompt à l’asset pour landing pages et social, dans la charte, pour que les campagnes soient livrées à la vitesse où vous écrivez le texte.',
    stepsTitle: 'Comment une équipe marketing utilise Open Design',
    steps: [
      {
        title: 'Verrouillez la marque',
        body: 'Votre DESIGN.md contient les couleurs, la typographie et le ton. Chaque asset que l’agent crée est automatiquement dans la charte — pas de restylage par asset.',
        imageAlt: 'Illustration d’un système de marque appliqué aux assets marketing',
      },
      {
        title: 'Générez la campagne',
        body: 'Landing page, cartes sociales, couvertures, visuels d’annonce — un prompt chacun, un jeu cohérent sur chaque canal.',
        imageAlt: 'Illustration d’un jeu complet de campagne généré à partir de prompts',
      },
      {
        title: 'Livrez et itérez',
        body: 'Les landing pages se rendent en HTML déployable ; les graphismes s’exportent en PNG. Changez le titre, refaites le rendu du jeu — sans attendre dans une file.',
        imageAlt: 'Illustration d’assets de campagne livrés et itérés rapidement',
      },
    ],
    tableTitle: 'Le marketing avec Open Design vs. la course habituelle',
    tableColCapability: 'Ce dont vous avez besoin',
    tableColWithOd: 'Avec Open Design',
    tableColWithout: 'Sans, aujourd’hui',
    tableRows: [
      { capability: 'Lancer une landing page', withOd: 'Prompt → page dans la charte, déployable', without: 'Briefer le design ou se battre avec un constructeur de site' },
      { capability: 'Un jeu social cohérent', withOd: 'Même gabarit, nouveau texte, parfaitement aligné', without: 'Réaligner chaque carte à la main' },
      { capability: 'Rester dans la charte', withOd: 'Un DESIGN.md appliqué à chaque asset', without: 'Espérer que chaque asset respecte les règles' },
      { capability: 'Avancer à la vitesse des campagnes', withOd: 'Un asset en un prompt, le jour même', without: 'Faire la queue derrière le backlog du design' },
      { capability: 'Coût', withOd: 'Open source, pas d’outil de design facturé par siège', without: 'Des abonnements plus des heures de design' },
    ],
    featuresTitle: 'Ce qu’une équipe marketing peut livrer',
    features: [
      { title: 'Landing pages', body: 'Landings de campagne et de produit, déployables.', thumb: 'example-saas-landing' },
      { title: 'Cartes sociales', body: 'Cartes X / Twitter dans la charte.', thumb: 'example-card-twitter' },
      { title: 'Carrousels', body: 'Jeux sociaux multi-diapos, cohérents.', thumb: 'example-social-carousel' },
      { title: 'Affiches', body: 'Affiches d’annonce et d’événement.', thumb: 'example-magazine-poster' },
      { title: 'Couvertures d’articles', body: 'Couvertures de blog et de newsletter.', thumb: 'example-article-magazine' },
      { title: 'Pages web', body: 'Microsites et pages de campagne.', thumb: 'example-web-prototype' },
    ],
    galleryTitle: 'Livré par le marketing avec Open Design',
    galleryLead:
      'Des assets de campagne dans la charte, rendus à partir d’un prompt. Choisissez-en un proche de votre campagne et remplacez-y votre texte.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'Landing page de campagne' },
      { thumb: 'example-card-twitter', caption: 'Carte sociale' },
      { thumb: 'example-social-carousel', caption: 'Carrousel social' },
      { thumb: 'example-magazine-poster', caption: 'Affiche d’annonce' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Parcourir les modèles',
    faqTitle: 'FAQ marketing',
    faq: [
      { q: 'Avons-nous besoin d’un designer pour chaque asset ?', a: 'Non. L’agent rend des landing pages et des assets sociaux dans la charte à partir d’un prompt, pour que l’équipe livre le travail de campagne courant sans faire la queue au design.' },
      { q: 'Comment les assets restent-ils dans la charte ?', a: 'Votre DESIGN.md est appliqué à tout automatiquement — couleurs, typographie et ton se propagent sur chaque asset.' },
      { q: 'Les landing pages peuvent-elles vraiment passer en ligne ?', a: 'Oui — elles se rendent en HTML déployable, et les graphismes s’exportent en PNG. Ce sont des assets livrables, pas des maquettes.' },
      { q: 'Quels agents puis-je utiliser ?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI et d’autres adaptateurs natifs, avec vos propres clés de fournisseur.' },
    ],
    ctaTitle: 'Livrez votre prochaine campagne ce soir',
    ctaBody:
      'Mettez une étoile au dépôt, installez Open Design et transformez les briefs en assets dans la charte — dans l’agent que vous utilisez déjà.',
  },
};
