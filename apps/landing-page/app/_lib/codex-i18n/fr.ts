/*
 * Textes français de la collection design Codex.
 * Traduits depuis la version anglaise de référence.
 */
import type { CodexCopyOverride } from './index';

export const fr: CodexCopyOverride = {
  collectionEyebrow: 'Sélection éditoriale',
  collectionHeading: 'Les plugins design qui font livrer à Codex de vraies interfaces',
  collectionLede:
    'OpenAI Codex écrit du code qui fonctionne. Livré à lui-même, il retombe sur des polices sans risque, des espacements moyens et du Helvetica centré. Voici les plugins qui lui donnent du goût : des skills esthétiques et des règles de design system. Installez-en un, ou faites-les tourner tous dans Open Design.',
  collectionStats: [
    { value: '50', label: 'plugins sélectionnés' },
    { value: '13', label: 'dépôts sources' },
    { value: 'Open', label: 'source & vérifié' },
  ],
  collectionIntro:
    'Chaque plugin ci-dessous existe vraiment et renvoie à sa source. Tous remplissent l’un de ces deux rôles : fixer le parti pris esthétique avant le code, et transformer votre design system en règles que l’agent respecte.',
  collectionCategoryBlurbs: [
    'Reprenez la main sur les choix esthétiques par défaut de Codex, avant la première ligne de code.',
    'Transformez vos tokens et vos composants en règles que Codex suit au lieu d’improviser.',
  ],
  collectionCloserHeading: 'Passez la config. Designez avec Codex dans Open Design',
  filterAll: 'Tout',
  collectionCloserBody:
    'Open Design est le workspace de design open source et agent-native qui tourne autour de Codex. Il garde vos systèmes, vos skills et vos templates cohérents pour que l’agent livre un travail qui vous appartient.',
  categoryFrontend: 'Frontend & UI',
  categoryDesignSystems: 'Design systems',
  ctaDownload: 'Télécharger Open Design',
  ctaStarList: 'Star la liste',
  ctaBrowseAll: 'Parcourir tous les plugins',
  ctaViewSource: 'Voir la source',
  ctaOurRepo: 'codex-design sur GitHub',
  cardKind: 'Plugin',
  cardWhatItDoes: 'Ce qu’il fait',
  cardCta: 'Voir le plugin',
  detailWhatIsIt: 'De quoi il s’agit',
  detailWhyForDesign: 'Pourquoi ça compte pour le design',
  detailHowWithCodex: 'Comment le faire tourner avec Codex',
  detailExampleTag: 'Quand y avoir recours',
  detailSource: 'Source',
  detailCategory: 'Catégorie',
  detailMaintainer: 'Auteur',
  detailTags: 'Tags',
  detailLicense: 'Licence',
  detailCovers: 'Ce que ça couvre',
  detailUpstream: 'Depuis le SKILL.md en amont',
  detailCodexNote: 'Compatible Codex',
  detailTraction: 'Traction',
  detailRepo: 'Dépôt source',
  detailStars: 'Stars',
  installHeading: 'Comment l’installer',
  installRunInCodex: 'Lancez ceci dans Codex.',
  installRestart: 'Redémarrez Codex pour qu’il charge le nouveau skill.',
  installClone: 'Clonez le dépôt.',
  installPoint: 'Pointez Codex sur le fichier du skill.',
  installThenUse: 'Décrivez ensuite l’interface voulue. Codex suit le skill.',
  installNote:
    'Chaque plugin présenté ici est gratuit, open source, et renvoie à sa vraie source amont.',
  installNoteCta: 'Parcourir toute la collection',
  detailMoreOnList: 'En savoir plus sur la liste codex-design',
  detailRelated: 'Autres plugins design pour Codex',
  finalEyebrow: 'Prochaine étape',
  detailCloserHeading: 'Designez avec Open Design, sans la config',
  detailCloserBody:
    'Installez ce plugin vous-même, ou faites tourner toute une couche design sélectionnée autour de Codex avec Open Design. Apportez votre clé, gardez la main sur ce que vous produisez.',
  skills: {
    'gpt-taste': {
      tagline: 'Construit des pages primables avec du scroll GSAP et des grilles bento sans trous.',
      whatIsIt:
        'Une directive frontend qui force la variance de mise en page par sélection aléatoire simulée du hero, de la typo, des composants et des paradigmes GSAP. Elle impose aussi une structure de page AIDA et de grands espacements entre sections.',
      whyForDesign: [
        'Les titres de hero restent sur deux ou trois lignes : les conteneurs s’élargissent au lieu de former des murs de texte.',
        'Les grilles bento utilisent grid-flow-dense, donc aucune cellule ne reste vide ou cassée.',
        'Les libellés méta bon marché sont bannis et le contraste du texte des boutons est vérifié avant livraison.',
      ],
      howWithCodex: [
        'Demandez une page ; le skill émet un bloc design_plan avant toute ligne de code UI.',
        'Vérifiez ses choix aléatoires : mise en page du hero, pile de polices, composants, paradigmes GSAP.',
        'Contrôlez les points de pre-flight : calcul de largeur du hero, densité de grille, chasse aux libellés, contraste.',
      ],
    },
    'stitch-design-taste': {
      tagline: 'Rédige un DESIGN.md qui oriente Google Stitch vers des écrans non génériques.',
      whatIsIt:
        'Génère un fichier DESIGN.md optimisé pour la génération d’écrans de Google Stitch. Il encode l’ambiance, la couleur, la typo, les composants, la mise en page, le mouvement et une liste explicite de patterns interdits.',
      whyForDesign: [
        'Les écrans Stitch héritent d’un seul accent sous 80 % de saturation, au lieu de dégradés violets néon.',
        'Les heros centrés et les trois rangées de cartes égales sont interdits au-delà de la variance fixée.',
        'Les états de chargement et vides deviennent des squelettes composés, plus des spinners génériques.',
      ],
      howWithCodex: [
        'Décrivez l’ambiance du projet ; le skill fixe les scores de densité, de variance et de mouvement.',
        'Il produit un DESIGN.md en sept sections, avec codes hex et rôles de couleur fonctionnels.',
        'Fournissez ce fichier directement à Stitch, ou via le serveur MCP de Stitch.',
      ],
    },
    'image-to-code': {
      tagline: 'Génère d’abord des images de design, les analyse, puis construit le code frontend correspondant.',
      whatIsIt:
        'Un workflow qui part de l’image pour les tâches web visuelles. L’agent génère des images de référence par section, en extrait typo, espacement, couleur et composants, puis implémente le site en conséquence.',
      whyForDesign: [
        'Le code suit une vraie référence visuelle, donc l’implémentation ne dérive pas vers des mises en page génériques.',
        'Chaque section reçoit sa propre grande image, ce qui garde le texte et l’espacement analysables.',
        'Les heros restent sous trois lignes de titre et sans empilement de conteneurs imbriqués.',
      ],
      howWithCodex: [
        'Indiquez le nombre de sections ; dans Codex, le skill génère une image par section.',
        'Demandez un rendu de détail plus rapproché si un bouton ou une typo reste illisible.',
        'Faites-lui lancer la vérification de clarté avant d’écrire le moindre fichier d’implémentation.',
      ],
    },
    'imagegen-frontend-mobile': {
      tagline: 'Génère des parcours d’écrans d’app mobile premium en images, pas en code.',
      whatIsIt:
        'Un skill exclusivement image pour les concepts et parcours d’écrans mobiles, sur iOS, Android et produits cross-platform. Il présente les écrans dans des mockups de téléphone épurés et n’écrit jamais de code.',
      whyForDesign: [
        'Les écrans respectent les zones sûres et les régions système, au lieu de ressembler à des sites web dans un téléphone.',
        'Une bible de design verrouillée garde palette, typo et icônes cohérentes sur chaque écran.',
        'Les jeux multi-écrans forment un parcours crédible, pas des mockups isolés sans lien.',
      ],
      howWithCodex: [
        'Indiquez la catégorie d’app et le nombre d’écrans ; chaque écran devient sa propre image.',
        'Le skill choisit d’abord un mode de plateforme : iOS, Android, ou cross-platform neutre.',
        'Demandez-lui de régénérer tout écran où le texte est petit ou le cadrage inégal.',
      ],
    },
    'imagegen-frontend-web': {
      tagline: 'Génère une image de référence horizontale par section de landing page.',
      whatIsIt:
        'Un skill de direction artistique pour les références de design de site. Il génère une image horizontale distincte par section, avec une palette unique verrouillée et une composition de hero variée sur l’ensemble.',
      whyForDesign: [
        'Une landing page à huit sections donne huit comps lisibles, pas un panneau compressé unique.',
        'La composition du hero varie au-delà du réflexe surexploité texte à gauche, image à droite.',
        'Une seule palette, une échelle typo et une famille de CTA tiennent sur toutes les images générées.',
      ],
      howWithCodex: [
        'Précisez le nombre de sections voulu ; sans indication, les landing pages passent par défaut à six.',
        'Le skill annonce le compte, puis étiquette chaque image par numéro de section.',
        'Donnez des mots d’ambiance comme éditorial ou cinématographique pour orienter l’échelle du hero et le fond.',
      ],
    },
    'minimalist-ui': {
      tagline: 'Construit des interfaces éditoriales monochromes et chaudes, avec des grilles bento plates.',
      whatIsIt:
        'Un protocole frontend pour interfaces minimales façon document. Il fixe une palette monochrome chaude, une hiérarchie typographique serif et mono, des cartes bento bordées en 1px, et des accents pastel discrets.',
      whyForDesign: [
        'Chaque carte et chaque séparateur utilise une seule bordure gris clair en 1px, avec un rayon net.',
        'Les accents viennent uniquement de quatre pastels délavés, réservés aux tags et au code inline.',
        'Les sections gagnent en profondeur grâce à des images en faible opacité, plutôt qu’à des fonds vides et plats.',
      ],
      howWithCodex: [
        'Demandez une page ; le skill fixe d’abord le macro-espace blanc, py-24 ou py-32.',
        'Il limite la largeur du texte à max-w-4xl et applique aussitôt les variables monochromes.',
        'Les fondus d’entrée au scroll passent par IntersectionObserver, uniquement sur transform et opacity.',
      ],
    },
    'design-taste-frontend': {
      tagline: 'Lit le brief, choisit une direction, livre des interfaces sans effet de gabarit.',
      whatIsIt:
        'Un skill frontend anti-générique pour landing pages, portfolios et refontes. Il énonce une lecture du design, règle les curseurs de variance, de mouvement et de densité, puis fait passer un long contrôle de pre-flight.',
      whyForDesign: [
        'Les briefs enterprise reçoivent le package officiel du design system, pas du CSS imitatif fait main.',
        'Le pre-flight bannit les tirets cadratins, les eyebrows de numérotation de section, les indices de scroll et les intentions de CTA en double.',
        'La répétition de mise en page est plafonnée : huit sections utilisent au moins quatre familles différentes.',
      ],
      howWithCodex: [
        'L’agent énonce une lecture du design en une ligne avant d’écrire le moindre code.',
        'Il règle trois curseurs : variance du design, intensité du mouvement et densité visuelle.',
        'Chaque case du pre-flight doit être cochée, sinon la page n’est pas terminée.',
      ],
    },
    'industrial-brutalist-ui': {
      tagline: 'Construit des interfaces rigides façon print suisse ou terminal CRT, avec un grain analogique.',
      whatIsIt:
        'Un design system pour interfaces qui fusionnent le print typographique suisse avec une esthétique de terminal militaire. Il impose des grilles rigides, un contraste extrême d’échelle typo, un seul accent rouge danger et une dégradation analogique simulée.',
      whyForDesign: [
        'Un seul substrat est choisi par projet, donc le clair et le sombre ne se mélangent jamais.',
        'border-radius est totalement rejeté : chaque angle reste à quatre-vingt-dix degrés.',
        'Les filtres de trame, de scanlines et de bruit empêchent les surfaces de lire comme du vectoriel plat.',
      ],
      howWithCodex: [
        'Choisissez un seul archétype : print industriel suisse ou terminal CRT de télémétrie tactique.',
        'Les titres macro utilisent clamp avec un tracking négatif ; les métadonnées, une petite monospace en majuscules.',
        'Des écarts de grille de 1px avec des fonds contrastés produisent les lignes de séparation ultra-fines.',
      ],
    },
    'redesign-existing-projects': {
      tagline: 'Audite un site existant et le fait progresser sans casser ses fonctionnalités.',
      whatIsIt:
        'Un workflow de scan, diagnostic et correction pour projets existants. Il audite la typo, la couleur, la mise en page, les états, le contenu, les icônes et la qualité du code, puis applique des améliorations ciblées dans la stack en place.',
      whyForDesign: [
        'Les dégradés IA violet-bleu et les trois rangées de cartes égales sont remplacés par des alternatives réfléchies.',
        'Les boutons d’un groupe de cartes s’alignent sur une seule ligne basse, malgré des contenus variés.',
        'Les états manquants de survol, focus, chargement, vide et erreur sont complétés.',
      ],
      howWithCodex: [
        'Il scanne d’abord la base de code pour identifier le framework et la méthode de style.',
        'Il liste chaque pattern générique et chaque point faible avant de toucher à quoi que ce soit.',
        'Les corrections arrivent par ordre de priorité : polices, couleur, états, mise en page, composants, finition typo.',
      ],
    },
    'brandkit': {
      tagline: 'Génère des planches de charte graphique, systèmes de logo et decks d’identité en images.',
      whatIsIt:
        'Un skill de génération d’images pour planches de brand-kit. Il produit des systèmes de logo, des panneaux de couleur et de typo, des mockups et des images d’ambiance, organisés sur une planche de présentation en grille.',
      whyForDesign: [
        'Un système de panneaux 3x3 par défaut couvre logo, construction, couleur, typo et applications.',
        'Les concepts de logo suivent une méthode énoncée : monogramme, fusion de métaphores ou espace négatif.',
        'Les planches ont un rythme : panneaux sobres, fonctionnels, émotionnels et techniques, plutôt qu’une intensité uniforme.',
      ],
      howWithCodex: [
        'Donnez la marque et la catégorie ; le skill choisit d’abord un mode visuel.',
        'Il opte par défaut pour une planche 3x3, ou un mini-deck de référence 2x3.',
        'Gardez le texte sobre : nom de marque, un tagline, une commande, quelques libellés.',
      ],
    },
    'cinematic-scroll-storytelling': {
      tagline: 'Des recettes Lenis et GSAP ScrollTrigger pour des landing pages pilotées au scroll.',
      whatIsIt:
        'Du code fonctionnel pour un preloader, des révélations de texte découpé et masqué, des révélations de section, des scènes épinglées calées sur le scroll, des piles de cartes sticky et de la parallaxe, avec Lenis et GSAP ScrollTrigger.',
      whyForDesign: [
        'Des tokens de mouvement fixent durées, décalages, offsets et flou pour des révélations cohérentes.',
        'Chaque effet a une branche reduced-motion qui garde mise en page et contraste intacts.',
        'Un ordre de construction pose d’abord la page statique, puis le mouvement, évitant les scènes de scroll emmêlées.',
      ],
      howWithCodex: [
        'Installez gsap et lenis, puis branchez Lenis dans le ticker de GSAP.',
        'Marquez les sections avec les attributs data pour les révélations, les piles et la parallaxe.',
        'Ajoutez les scènes épinglées calées sur le scroll en dernier, puis déroulez la checklist QA.',
      ],
    },
    'webgl-3d-object': {
      tagline: 'Un mesh hero Three.js éclairé, matériau PBR et vraies ombres.',
      whatIsIt:
        'Une recette Three.js pour un objet hero à facettes : géométrie d’icosaèdre, MeshStandardMaterial, caméra en perspective, lumières principale et de contour, plan d’ombre, lente rotation flottante.',
      whyForDesign: [
        'Une vraie géométrie et un vrai éclairage produisent arêtes, reflets et ombres que les transforms CSS ne savent pas simuler.',
        'Des presets de matériau couvrent le métal premium, la céramique douce et les looks tech teintés de lueur.',
        'Le mouvement se limite à une rotation lente et un léger balancement : le texte reste prioritaire.',
      ],
      howWithCodex: [
        'Ajoutez la coque de canvas carrée, puis lancez l’initialiseur Three.js dessus.',
        'Réglez color, metalness, roughness et emissive pour coller à l’ambiance de la marque.',
        'Confirmez la gestion du redimensionnement et la libération de la géométrie, du matériau et du renderer.',
      ],
    },
    'css-border-gradient': {
      tagline: 'Ajoute un bord en dégradé soigné aux cartes, modales et surfaces hero.',
      whatIsIt:
        'Une recette CSS pour des bordures en dégradé subtiles via la superposition de padding-box et border-box, plus une variante en pseudo-élément masqué pour les surfaces à fond complexe.',
      whyForDesign: [
        'Donne une définition de bord premium sans la lueur criarde des bordures néon.',
        'La variante masquée préserve un fond existant au lieu de l’écraser.',
        'Les valeurs par défaut gardent les arrêts sous 0.4 d’opacité : les bordures cadrent au lieu de rivaliser.',
      ],
      howWithCodex: [
        'Orientez Codex vers une carte ou un panneau tarifaire qui a besoin d’un meilleur bord.',
        'Choisissez le pattern simple pour les fonds pleins, masqué pour les fonds complexes.',
        'Vérifiez les thèmes clair et sombre séparément, car l’alpha se transpose rarement.',
      ],
    },
    'high-end-visual-design': {
      tagline: 'Bloque les défauts génériques de l’IA et impose une mise en page et un mouvement dignes d’une agence.',
      whatIsIt:
        'Un skill directif qui bannit les réflexes de design par défaut de l’IA, puis force l’agent à choisir un archétype d’ambiance et un archétype de mise en page avant d’écrire la moindre ligne de code UI.',
      whyForDesign: [
        'Inter, Roboto et les icônes Lucide épaisses sont bannis : le rendu cesse de sentir le gabarit.',
        'Les cartes reçoivent une coque externe et un cœur interne imbriqués, donnant aux conteneurs une vraie profondeur usinée.',
        'Le padding des sections démarre à py-24 : les mises en page respirent au lieu de s’entasser.',
      ],
      howWithCodex: [
        'Demandez une page à Codex ; il lance d’abord son moteur de variance en silence.',
        'Il pose la texture de fond et l’échelle typo, puis construit des conteneurs à double biseau.',
        'Il injecte un mouvement cubic-bezier sur mesure, puis déroule sa checklist avant sortie.',
      ],
    },
    'pick-ui-library': {
      tagline: 'Associe une tâche frontend à un seul choix de bibliothèque, sélectionné et assumé.',
      whatIsIt:
        'Un skill de consultation, invoqué explicitement. Il fait correspondre une tâche donnée à une seule bibliothèque recommandée, tirée d’un tableau sélectionné couvrant primitives, mouvement, graphiques, virtualisation, état et styling.',
      whyForDesign: [
        'Une recommandation par tâche : plus de menu d’options à débattre.',
        'Il regarde d’abord package.json, pour réutiliser ce que le projet possède déjà.',
        'Il repère les dropdowns et toasts faits main et les remplace par des primitives accessibles.',
      ],
      howWithCodex: [
        'Invoquez-le explicitement ; il ne se déclenche jamais seul.',
        'Décrivez la tâche, pas le nom de la bibliothèque, par exemple « il me faut des toasts ».',
        'Il nomme une bibliothèque, en explique l’usage, puis l’intègre.',
      ],
    },
    'apple-design': {
      tagline: 'Les principes d’interface fluide d’Apple traduits en ressorts et gestes pour le web.',
      whatIsIt:
        'Un savoir distillé des conférences design d’Apple à la WWDC, surtout Designing Fluid Interfaces, transposé en CSS, Pointer Events et bibliothèques de ressorts. Couvre réactivité, interruptibilité, inertie, matériaux, typographie et accessibilité.',
      whyForDesign: [
        'Le retour se déclenche au pointer-down : les éléments pressés cessent de paraître inertes.',
        'Les animations partent de la valeur affichée en temps réel, sans saut visible en cas d’interruption.',
        'Les gestes vifs projettent un point d’arrivée : le lancer atterrit là où le geste visait.',
      ],
      howWithCodex: [
        'Demandez à Codex de construire une sheet, un drawer ou une interaction de glissement.',
        'Il suit le pointeur au 1:1 avec pointer capture et enregistre l’historique de vélocité.',
        'Au relâchement, il transmet la vélocité à un ressort avec les valeurs d’amortissement fournies.',
      ],
    },
    'animation-vocabulary': {
      tagline: 'Transforme une description floue de mouvement en son terme technique exact.',
      whatIsIt:
        'Un glossaire à recherche inversée. L’utilisateur décrit vaguement un effet de mouvement et le skill renvoie le terme précis, cité mot pour mot, avec des variantes proches quand plusieurs conviennent.',
      whyForDesign: [
        'Donne au designer le mot juste pour prompter un agent.',
        'Désambiguïse les paires proches comme clip-path et mask, pop in et bounce.',
        'Refuse d’inventer des termes : la nomenclature reste fiable.',
      ],
      howWithCodex: [
        'Décrivez ce que vous avez vu, par exemple « le scroll élastique d’iOS ».',
        'Il renvoie le terme en gras plus une définition de glossaire en une ligne.',
        'Demandez des variantes quand deux termes pourraient convenir.',
      ],
    },
    'emil-design-eng': {
      tagline: 'Les règles d’Emil Kowalski pour le timing d’animation, l’easing et la finition des composants.',
      whatIsIt:
        'Encode une philosophie de design engineering : cadre de décision d’animation, conseils sur les ressorts, principes de composant, techniques de clip-path, gestion des gestes, règles de performance et checklist de revue.',
      whyForDesign: [
        'Les actions fréquentes perdent toute animation : les command palettes restent instantanées.',
        'Les entrées démarrent à scale(0.95), jamais scale(0) : rien ne surgit de nulle part.',
        'Les popovers s’agrandissent depuis leur déclencheur plutôt que leur centre, préservant le lien spatial.',
      ],
      howWithCodex: [
        'Demandez à Codex de relire du code UI ; il renvoie un tableau Avant, Après, Pourquoi.',
        'Pour tout nouveau mouvement, il répond : faut-il animer, pourquoi, quel easing, à quelle vitesse.',
        'Il applique la checklist et signale transition: all ainsi que les durées au-delà de 300 ms.',
      ],
    },
    'ui-ux-pro-max-design': {
      tagline: 'Un point d’entrée unique qui aiguille le travail de logo, d’identité, de slides, de bannière et d’icône.',
      whatIsIt:
        'Un skill de design unifié qui aiguille les tâches vers des sous-skills ou des modules intégrés. Les modules couvrent la génération de logo, les mockups d’identité d’entreprise, les slides HTML, les bannières, les visuels sociaux et les icônes SVG via des scripts Gemini.',
      whyForDesign: [
        'Logo, mockups d’identité et deck viennent tous d’une seule entrée de marque.',
        'Les icônes sont générées en texte SVG : elles restent éditables, pas matricielles.',
        'Les règles de bannière imposent des zones sûres, deux polices maximum et un seul CTA.',
      ],
      howWithCodex: [
        'Exportez d’abord GEMINI_API_KEY et installez google-genai et pillow.',
        'Lancez scripts/logo/search.py pour un brief de design, puis generate.py pour les images.',
        'Passez le logo à scripts/cip/generate.py pour produire des mockups livrables.',
      ],
    },
    'ui-ux-pro-max-banner-design': {
      tagline: 'Conçoit des bannières aux bonnes dimensions en HTML, puis les exporte en PNG.',
      whatIsIt:
        'Un workflow de bannière en cinq étapes : recueillir le besoin, chercher une direction artistique, construire la bannière en HTML et CSS avec des visuels générés, capturer aux pixels exacts de la plateforme, puis présenter des options à itérer.',
      whyForDesign: [
        'Chaque bannière s’exporte aux pixels exacts de la plateforme : rien n’est rogné ni redimensionné.',
        'Les visuels générés sont rendus sans texte : les titres restent en HTML net.',
        'Trois directions artistiques par demande : on compare avant de s’engager.',
      ],
      howWithCodex: [
        'Répondez aux questions d’objectif, de plateforme, de contenu, de marque, de style et de quantité.',
        'Il construit une bannière HTML par direction artistique, zones sûres appliquées.',
        'Il capture chacune à la largeur et à la hauteur fixées, en compressant les fichiers trop lourds.',
      ],
    },
    'ui-ux-pro-max-ui-styling': {
      tagline: 'Construit des interfaces accessibles avec des composants shadcn et des utilitaires Tailwind.',
      whatIsIt:
        'Combine une couche de composants shadcn sur des primitives Radix, une couche de styling utilitaire Tailwind et une couche de design visuel sur canvas. Inclut des fichiers de référence pour le theming, l’accessibilité, les règles responsive et la personnalisation.',
      whyForDesign: [
        'Les dialogs et menus héritent de la gestion du focus de Radix : l’accessibilité n’est pas rajoutée après coup.',
        'Les couleurs de thème vivent dans des variables CSS : le dark mode reste cohérent.',
        'Des breakpoints mobile-first : les mises en page partent du petit écran et montent en complexité.',
      ],
      howWithCodex: [
        'Lancez npx shadcn@latest init pour configurer le framework et le thème.',
        'Ajoutez des composants avec npx shadcn@latest add button card dialog form.',
        'Lancez scripts/tailwind_config_gen.py pour générer une config avec des tokens personnalisés.',
      ],
    },
    'ui-ux-pro-max-brand': {
      tagline: 'Garde la charte de marque, les design tokens et les assets synchronisés.',
      whatIsIt:
        'Un skill d’identité de marque bâti autour de scripts qui injectent le contexte de marque dans les prompts, valident les assets, extraient les couleurs et synchronisent brand-guidelines.md vers du JSON de design tokens et des variables CSS.',
      whyForDesign: [
        'Un seul fichier markdown fait foi pour les tokens et le CSS.',
        'Les couleurs extraites sont comparées à la palette, ce qui repère la dérive tôt.',
        'Les assets sont vérifiés en nommage, taille et format avant validation.',
      ],
      howWithCodex: [
        'Éditez docs/brand-guidelines.md, puis lancez scripts/sync-brand-to-tokens.cjs.',
        'Vérifiez avec scripts/inject-brand-context.cjs --json.',
        'Contrôlez tout nouveau fichier avec scripts/validate-asset.cjs avant de le livrer.',
      ],
    },
    'ui-ux-pro-max-slides': {
      tagline: 'Construit des decks de présentation en HTML avec Chart.js et des patterns de mise en page.',
      whatIsIt:
        'Un petit skill d’aiguillage pour les présentations HTML stratégiques. Il analyse une sous-commande, puis charge des fichiers de référence couvrant les patterns de mise en page, un template HTML, des formules de copywriting et des stratégies de slide.',
      whyForDesign: [
        'Les slides sont en HTML : typo et espacement suivent de vrais design tokens.',
        'Chart.js gère les slides de données : les chiffres restent vivants au lieu d’images collées.',
        'Les patterns de mise en page sont pris dans un jeu défini, gardant le deck cohérent.',
      ],
      howWithCodex: [
        'Invoquez-le avec la sous-commande create, plus un sujet et un nombre de slides.',
        'Il charge references/create.md et suit ce workflow de création.',
        'Il puise patterns de mise en page et formules de copywriting dans les fichiers de référence.',
      ],
    },
    'design-system-tokens': {
      tagline: 'Design tokens à trois couches, specs de composant et génération de slides conforme aux tokens.',
      whatIsIt:
        'Un skill de design system couvrant les couches de tokens primitifs, sémantiques et de composant sous forme de variables CSS, plus des specs d’états de composant et un générateur de slides qui construit des decks à partir de ces mêmes tokens.',
      whyForDesign: [
        'La couche de tokens sémantiques fait du passage clair/sombre un changement de config, pas une réécriture.',
        'Les specs de composant tabulent les états par défaut, survol, actif et désactivé : la passation ne laisse aucune ambiguïté.',
        'Un validateur signale les valeurs hex en dur, gardant composants et slides sur le système de tokens.',
      ],
      howWithCodex: [
        'Lancez generate-tokens.cjs sur une config de tokens JSON pour produire votre fichier de variables CSS.',
        'Demandez les specs de composant à Codex, puis lancez validate-tokens.cjs sur src/ pour repérer les valeurs brutes.',
        'Utilisez search-slides.py avec les flags de position et de contexte pour choisir les mises en page d’un deck.',
      ],
    },
    'editorial-ui-style': {
      tagline: 'Mise en page magazine en serif Gelasio sur une grille stricte de 8pt.',
      whatIsIt:
        'Un skill de directives de design system pour un look éditorial moderne : serif Gelasio en corps comme en titrage, Ubuntu Mono, un quasi-noir #111111 sur surfaces blanches, et une grille de base de 8pt.',
      whyForDesign: [
        'Titrage et corps en serif d’une même famille gardent les longues lectures typographiquement cohérentes.',
        'Une grille de base de 8pt impose un rythme vertical entre titres, corps de texte et espacements.',
        'Le seuil d’accessibilité inclut la prise en charge du reduced-motion, des cibles tactiles de 44px et la gestion du contraste élevé.',
      ],
      howWithCodex: [
        'Demandez à Codex de reformuler l’intention de design, puis de définir les tokens avant de toucher aux composants.',
        'Réclamez des règles de composant couvrant anatomie, variantes, états et comportement responsive.',
        'Terminez par la checklist QA pour qu’un relecteur de code puisse vérifier le rendu.',
      ],
    },
    'terracotta-ui-style': {
      tagline: 'Accent argile sur crème, titres DM Serif Display, lecture au long cours.',
      whatIsIt:
        'Un skill de directives pour une interface éditoriale gorgée de soleil : surfaces crème #F3E9D8, un unique accent terracotta #C56A3C, titres DM Serif Display, JetBrains Mono. Calibré pour les blogs et le storytelling.',
      whyForDesign: [
        'Une seule couleur d’accent : l’emphase reste rare et les titres portent la hiérarchie.',
        'Les surfaces crème chaudes réduisent l’éblouissement des longs articles face aux pages blanc pur.',
        'Des titres en serif de titrage sur un corps brun encre posent un rythme éditorial net.',
      ],
      howWithCodex: [
        'Orientez Codex vers les tokens terracotta et crème avant qu’il n’écrive le moindre composant.',
        'Demandez anatomie, variantes et états par composant, avec des tokens d’espacement nommés explicitement.',
        'Réclamez anti-patterns et notes de migration quand vous reprenez une UI existante incohérente.',
      ],
    },
    'dithered-ui-style': {
      tagline: 'Ombrage en motif de points et palette réduite pour des écrans rétro, très contrastés.',
      whatIsIt:
        'Un skill de directives pour des interfaces tramées qui utilisent des motifs de points pour simuler des nuances à partir d’une palette réduite. Corps Open Sans, titrage Space Grotesk, IBM Plex Mono, accents bleu et violet.',
      whyForDesign: [
        'Les motifs de points remplacent les dégradés : l’ombrage survit à un jeu de couleurs volontairement restreint.',
        'Un rendu très contrasté garde le texte lisible même quand les surfaces portent une texture de motif dense.',
        'Les règles bannissent le mouvement décoratif, empêchant le traitement rétro de virer au bruit visuel.',
      ],
      howWithCodex: [
        'Indiquez d’abord à Codex la limite de palette, puis laissez-le en déduire les règles d’ombrage par motif.',
        'Demandez les états vide, chargement et erreur pour que les surfaces à motif restent lisibles.',
        'Vérifiez les zones cliquables et les états de focus, que ce skill signale explicitement.',
      ],
    },
    'neumorphism-ui-style': {
      tagline: 'Surfaces extrudées douces en gris pierre, typo Space Mono.',
      whatIsIt:
        'Un skill de directives pour une UI neumorphique : ombres internes et externes sur une surface monochrome gris pierre #E7E5E4, un accent sarcelle #006666, Space Mono en titrage et corps, un espacement de densité compacte.',
      whyForDesign: [
        'Des surfaces monochromes : la profondeur vient de l’ombre, pas du contraste de couleur.',
        'L’espacement compact convient aux panneaux riches en contrôles comme les dashboards et les écrans de réglages.',
        'Les règles interdisent de mêler les métaphores visuelles : l’extrusion douce reste le seul langage de profondeur.',
      ],
      howWithCodex: [
        'Faites poser à Codex les tokens de surface et d’ombre avant de styler le moindre contrôle.',
        'Demandez des états de focus visibles, car les ombres douces seules laissent tomber les utilisateurs au clavier.',
        'Exigez du HTML sémantique avant l’ARIA, comme le précise ce skill.',
      ],
    },
    'bento-ui-style': {
      tagline: 'Grille de blocs variés sur crème, typo Inter, échelle compacte.',
      whatIsIt:
        'Un skill de directives pour les mises en page bento qui présentent le contenu en blocs de grille de tailles variées. Inter partout, une échelle typo compacte de 12 à 32, des accents pêche et bleu sur crème.',
      whyForDesign: [
        'Des tailles de bloc variées portent la hiérarchie : la grille elle-même fait le classement.',
        'Une échelle typo compacte de 12 à 32 loge du texte dense dans de petites tuiles.',
        'La surface crème #FFF5E6 garde les bords de bloc lisibles sans bordures lourdes.',
      ],
      howWithCodex: [
        'Demandez à Codex d’attribuer à chaque bloc une taille selon la priorité du contenu.',
        'Définissez les tokens d’espacement sur l’échelle de 4 à 32 avant de disposer les tuiles.',
        'Réclamez la gestion du débordement et des libellés longs, que ce skill liste comme cas limites.',
      ],
    },
    'claymorphism-ui-style': {
      tagline: 'Formes 3D rebondies et arrondies, titres Poppins, bleu sur blanc.',
      whatIsIt:
        'Un skill de directives pour une UI claymorphique : des formes douces, arrondies et rebondies qui imitent l’argile malléable. Titrage Poppins, corps Montserrat, un accent bleu #3B82F6 et un texte bleu profond sur blanc.',
      whyForDesign: [
        'Les formes rebondies et arrondies donnent aux boutons une évidence d’appui sans libellé supplémentaire.',
        'Un texte bleu profond #1C398E sur blanc tient le contraste pendant que la palette reste ludique.',
        'Les règles interdisent de mêler les métaphores : la profondeur argile ne se combine jamais au verre ni au plat.',
      ],
      howWithCodex: [
        'Demandez d’abord à Codex les tokens de rayon et d’ombre, car ils définissent le look argile.',
        'Associez le titrage Poppins au corps Montserrat comme spécifié, pas deux sans-serif similaires.',
        'Vérifiez que les états focus-visible et désactivé survivent au traitement de formes douces.',
      ],
    },
    'brutalism-ui-style': {
      tagline: 'Mises en page inspirées du béton brut, titrage Darker Grotesque, rouge et ocre.',
      whatIsIt:
        'Un skill de directives pour une UI brutaliste puisée dans l’architecture de béton brut des années 1950 : dépouillée, fonctionnelle, volontairement heurtée. Titrage Darker Grotesque, rouge #DD614C et ocre #DAA144 sur blanc.',
      whyForDesign: [
        'Des éléments francs et dépouillés abandonnent la décoration : structure et texte portent le poids.',
        'Deux accents forts, rouge et ocre, remplacent entièrement dégradés et ombres.',
        'Le plancher d’accessibilité s’applique quand même : les mises en page heurtées gardent contraste et focus visible.',
      ],
      howWithCodex: [
        'Dites à Codex que le ton est franc et dépouillé avant qu’il ne choisisse les composants.',
        'Ancrez chaque règle à un token ou un seuil, comme l’exigent les portes qualité.',
        'Associez chaque règle « à faire » à un exemple concret « à ne pas faire » lors de la relecture.',
      ],
    },
    'hallmark-design-skill': {
      tagline: 'Un flux de design anti-générique avec 58 portes et une variété structurelle imposée.',
      whatIsIt:
        'Un skill de design pour assistants de code IA, avec un flux de construction par défaut et trois verbes : audit, redesign et study. Il pousse la variété structurelle pour que deux constructions ne partagent pas le même rythme de page.',
      whyForDesign: [
        'Des règles de diversification imposent des macrostructures, des navs et des footers différents d’une construction à l’autre.',
        'Des tokens verrouillés bannissent les valeurs hex ou font-family en ligne qui contournent le bloc de tokens.',
        'Chaque sortie est vérifiée aux largeurs de 320, 375, 414 et 768 pixels.',
      ],
      howWithCodex: [
        'Laissez le scan de pre-flight lire d’abord les polices, la palette et les bibliothèques de mouvement en place.',
        'Répondez à la porte audience, cas d’usage et ton, ou dites d’y aller.',
        'Lancez hallmark audit sur une page pour une liste de corrections priorisée, sans modification.',
      ],
    },
    'impeccable': {
      tagline: 'Une vingtaine de commandes pour construire, critiquer et affiner des interfaces frontend.',
      whatIsIt:
        'Un skill de design frontend dont les commandes se regroupent en build, evaluate, refine, enhance, fix et iterate. Il lit le contexte du projet et une référence de registre, puis écrit du code de niveau production.',
      whyForDesign: [
        'La séparation par registre envoie pages marketing et UI produit vers des règles de design distinctes.',
        'Des interdits absolus rejettent le texte en dégradé, les bordures à liseré latéral et les eyebrows au-dessus de chaque section.',
        'Les planchers de contraste sont explicites : 4.5:1 pour le corps de texte, 3:1 pour le grand texte.',
      ],
      howWithCodex: [
        'Lancez context.mjs une fois par session pour que le skill charge PRODUCT.md et DESIGN.md.',
        'Invoquez une commande comme critique, polish ou animate avec un fichier cible.',
        'Utilisez le mode live avec un dev server actif pour générer des variantes dans le navigateur.',
      ],
    },
    'design-dna': {
      tagline: 'Extrait un design de référence en JSON structuré, puis génère à partir de lui.',
      whatIsIt:
        'Un workflow en trois phases qui capture l’identité d’un design à travers tokens mesurables, style qualitatif et effets visuels. Il produit un JSON Design DNA complet, puis applique ce JSON à un nouveau contenu.',
      whyForDesign: [
        'Transforme une capture ou une URL en valeurs nommées de couleur, de typo et d’espacement.',
        'Consigne l’ambiance, la composition et la voix de marque, pas seulement des tokens mesurables.',
        'Capture les effets Canvas, WebGL, shader et scroll que le CSS seul ne sait pas exprimer.',
      ],
      howWithCodex: [
        'Demandez le schéma pour voir les trois dimensions avant toute analyse.',
        'Confiez à Codex des images de référence ou des URL et réclamez un JSON DNA rempli.',
        'Passez le JSON avec votre contenu pour générer une page HTML autonome.',
      ],
    },
    'material-3': {
      tagline: 'Implémentez Material Design 3 de Google sur Compose, Flutter et le web.',
      whatIsIt:
        'Un guide de Material Design 3 couvrant l’espace de noms de tokens md.sys, plus de 30 composants, la mise en page adaptative, le theming et M3 Expressive. Jetpack Compose est la cible principale ; Flutter et @material/web sont secondaires.',
      whyForDesign: [
        'Des tokens de couleur, de typo, de forme et d’élévation remplacent les valeurs hex et de rayon en dur.',
        'Des surfaces tonales portent la profondeur à la place des ombres, conformément à la spec MD3 actuelle.',
        'Un audit noté évalue dix catégories et liste les corrections par ordre de priorité.',
      ],
      howWithCodex: [
        'Nommez la plateforme pour que Codex choisisse Compose, Flutter ou les propriétés CSS personnalisées.',
        'Demandez un composant et obtenez la bonne variante avec le câblage des tokens.',
        'Lancez l’audit sur une URL ou des fichiers source pour un rapport de conformité.',
      ],
    },
    'make-interfaces-feel-better': {
      tagline: 'Seize règles concrètes de finition UI avec une checklist de revue.',
      whatIsIt:
        'Un ensemble de principes de design engineering pour la finition d’interface : rayons concentriques, alignement optique, ombres en couches, animations d’entrée décalées, chiffres tabulaires, zones cliquables et spécificité des transitions.',
      whyForDesign: [
        'Nomme des valeurs exactes : l’échelle à l’appui est toujours 0.96, jamais au jugé.',
        'Corrige le décalage de rayons imbriqués qui fait paraître la plupart des composants bancals.',
        'Attrape le décalage de mise en page dû aux chiffres qui changent avant qu’il n’atteigne les utilisateurs.',
      ],
      howWithCodex: [
        'Orientez Codex vers un composant et demandez-lui d’appliquer les principes.',
        'Demandez une revue ; les constats reviennent en tableaux Avant et Après.',
        'Déroulez la checklist de quatorze points avant de merger tout changement frontend.',
      ],
    },
    'visual-plan': {
      tagline: 'Transforme des plans en texte en documents relisables, avec wireframes et prototypes.',
      whatIsIt:
        'Un mode de planification structuré pour agents de code. Les plans deviennent des documents parcourables, avec diagrammes en ligne, code, modèles de données, questions ouvertes et, en option, un canvas en tête ou un prototype live.',
      whyForDesign: [
        'Les plans d’UI s’ouvrent sur des planches de wireframe, une par état visible pour l’utilisateur.',
        'Les relecteurs commentent des éléments ancrés au lieu de débattre dans le chat.',
        'Les parcours multi-étapes reçoivent un prototype manipulable à côté des maquettes statiques.',
      ],
      howWithCodex: [
        'Installez-le via la CLI Agent-Native, puis lancez la commande /visual-plan.',
        'Collez un plan Codex ou Markdown existant pour servir de source.',
        'Lisez les retours, corrigez le plan et vérifiez le résultat enregistré.',
      ],
    },
    'kami': {
      tagline: 'Compose CV, livres blancs, decks et landing pages sur un même langage de design.',
      whatIsIt:
        'Un système de templates pour documents professionnels et landing pages produit. Canvas parchemin chaud, accent bleu encre, hiérarchie menée par le serif, avec des templates pour neuf types de documents plus quinze primitives de diagramme.',
      whyForDesign: [
        'Une couleur d’accent et une famille serif gardent chaque livrable visuellement cohérent.',
        'Un contrat de densité signale les pages de contenu remplies à moins de la moitié.',
        'Les primitives de diagramme couvrent architecture, organigrammes, quadrants, chronologies et graphiques.',
      ],
      howWithCodex: [
        'Dites ce qu’il vous faut ; l’arbre de décision choisit le template correspondant.',
        'Laissez d’abord Codex distiller votre contenu brut en un content.json validé.',
        'Lancez le script de build pour produire HTML, PDF et rapports de vérification.',
      ],
    },
    'masked-reveal': {
      tagline: 'Révèle les titres mot à mot via un masque de débordement au scroll.',
      whatIsIt:
        'Un pattern GSAP ScrollTrigger qui découpe un titre en spans de mots masqués et les décale vers le haut à mesure que le texte entre dans le viewport. Inclut un pattern de nettoyage React.',
      whyForDesign: [
        'Un décalage au niveau du mot paraît plus calme et plus éditorial qu’une animation lettre à lettre.',
        'Les lecteurs d’écran reçoivent tout de même le texte complet via un aria-label.',
        'Les utilisateurs en reduced-motion voient un texte statique, sans aucune transform.',
      ],
      howWithCodex: [
        'Marquez un titre avec data-masked-reveal et ajoutez les règles de mask CSS.',
        'Appelez le helper de découpe, qui évite le plugin payant SplitText.',
        'Enveloppez dans un contexte GSAP en React pour que ScrollTrigger se nettoie au changement de route.',
      ],
    },
    'framed-grid-layout': {
      tagline: 'Construit des mises en page éditoriales précises avec des cadres fins et des équerres d’angle.',
      whatIsIt:
        'Un pattern de grille à douze colonnes où chaque section s’aligne sur des colonnes partagées dans des boîtes encadrées en 1px. Des équerres d’angle en L sont dessinées en couches de fond sur une texture diagonale en faible opacité.',
      whyForDesign: [
        'Chaque section partage une couleur de bordure, une taille d’équerre, une échelle d’espacement.',
        'Les équerres d’angle ne demandent aucun markup supplémentaire : la structure reste en CSS.',
        'La mise en page reste claire même si l’on retire la couche de texture.',
      ],
      howWithCodex: [
        'Demandez une page technique ou éditoriale et obtenez d’abord la grille parente.',
        'Attribuez des classes de span explicites plutôt que des largeurs de section improvisées.',
        'Vérifiez que les bords des cadres s’alignent verticalement et horizontalement aux deux breakpoints.',
      ],
    },
    'container-lines': {
      tagline: 'Trace de discrètes lignes de repère verticales aux bords de votre conteneur de contenu.',
      whatIsIt:
        'Un pattern CSS qui ajoute des lignes verticales de 1px aux deux bords du conteneur de contenu, plus de petits carrés d’angle en option. Les repères passent derrière le contenu et ignorent les événements de pointeur.',
      whyForDesign: [
        'Révèle la largeur du conteneur : les sections hero lâches gagnent une tension structurelle.',
        'Les repères partagent la max-width et le padding du conteneur : ils ne dérivent jamais.',
        'Les événements de pointeur sont désactivés : les lignes ne bloquent jamais clics ni sélection.',
      ],
      howWithCodex: [
        'Ajoutez la classe container-lines à la coque de mise en page.',
        'Placez les carrés d’angle uniquement sur de vrais coins de conteneur ou de section.',
        'Vérifiez que les lignes restent discrètes sur fond clair comme sombre.',
      ],
    },
    'skeuomorphic-ui': {
      tagline: 'Donne aux boutons et panneaux une profondeur tactile avec dégradés et ombres en couches.',
      whatIsIt:
        'Une recette de surface pour une UI web tactile : remplissages en dégradé vertical, une bordure en dégradé réfléchissant de 1px, des ombres externes et internes empilées. Texte embossé, icônes et micro-texture en option.',
      whyForDesign: [
        'Les états relevé et enfoncé inversent la profondeur : les contrôles se lisent comme physiques.',
        'La profondeur reste directionnelle, lumière en haut et ombre en bas.',
        'Met en garde contre le mélange de glassmorphism, neumorphism et skeuomorphism dans un même composant.',
      ],
      howWithCodex: [
        'Posez les tokens de base une fois, puis ajustez-les par marque et par thème.',
        'Appliquez la surface relevée aux cartes, boutons, onglets et boîtiers de contrôle.',
        'Ajoutez la variante enfoncée uniquement aux toggles actifs et aux onglets sélectionnés.',
      ],
    },
    'beautiful-shadows': {
      tagline: 'Trois utilitaires d’ombre Tailwind prêts à l’emploi pour une élévation neutre en couches.',
      whatIsIt:
        'Un jeu de classes d’ombre arbitraires Tailwind précises, en trois intensités. Chacune empile plusieurs couches neutres en faible opacité au lieu de l’échelle d’ombre par défaut de Tailwind.',
      whyForDesign: [
        'L’élévation reste neutre, sans halo coloré qui teinterait la surface en dessous.',
        'Trois intensités fixes correspondent respectivement aux contrôles, aux cartes et aux médias hero.',
        'Des couches empilées en faible opacité se lisent comme une vraie profondeur, pas comme une ombre portée brute.',
      ],
      howWithCodex: [
        'Demandez à Codex d’appliquer l’utilitaire md aux cartes, panneaux et popovers.',
        'Réservez l’utilitaire lg aux médias hero et aux conteneurs de type modale.',
        'Associez chaque ombre à un remplissage de surface net et à un rayon cohérent.',
      ],
    },
    'dither-background': {
      tagline: 'Fond canvas avec un tramage Bayer 4x4 visible et des pixels carrés.',
      whatIsIt:
        'Une recette canvas qui rend un champ procédural quasi noir à partir de value noise, de FBM et d’un seuil Bayer 4x4, dessiné en cellules carrées agrandies.',
      whyForDesign: [
        'Les cellules agrandies gardent la matrice de tramage lisible au lieu de s’effondrer en grain de film.',
        'Une palette monochrome à six paliers garde le texte de premier plan lisible sans surcouche lourde.',
        'Vignette et masse décentrée donnent une seule zone focale lumineuse, pas une luminosité uniforme.',
      ],
      howWithCodex: [
        'Placez le canvas fixe derrière le contenu et mettez pointer-events à none.',
        'Réglez cellSize entre 5px et 10px pour la lisibilité de la matrice.',
        'Ajustez les valeurs de wave, cloud, ridge et vignette pour sculpter la masse.',
      ],
    },
    'webgl-laser': {
      tagline: 'Un faisceau shader plein écran, cœur incandescent et brume teintée aux couleurs de la marque.',
      whatIsIt:
        'Un fragment shader WebGL brut qui dessine un fin laser vertical sur un quad plein écran. Le cœur reste quasi blanc ; le halo et la fumée FBM suivent votre accent.',
      whyForDesign: [
        'Halo et fumée se lisent depuis votre accent de marque au lieu d’un bleu en dur.',
        'Des largeurs de cœur et de lueur distinctes gardent le faisceau en lame, pas en barre.',
        'La fumée se concentre près du faisceau et se dissipe vers l’extérieur, préservant le contraste du texte.',
      ],
      howWithCodex: [
        'Définissez une propriété personnalisée --brand-accent, que le shader convertit en RGB.',
        'Placez le canvas fixe derrière le contenu avec pointer-events none.',
        'Réglez coreWidth, glowWidth, smokeDensity et xOffset pour positionner le faisceau.',
      ],
    },
    'mesh-gradient-dark-blue-clean': {
      tagline: 'Un système bleu marine quasi noir avec un champ mesh dans une coque hero.',
      whatIsIt:
        'Une direction bleu foncé avec tokens de couleur CSS, une coque hero à bordure en dégradé, un champ mesh sur canvas, une pilule de nav en verre, des nœuds flottants, des rails et des CTA appariés.',
      whyForDesign: [
        'Le mesh se loge dans la coque hero : il pilote la composition au lieu de la décorer.',
        'Des tokens nommés fixent les valeurs de fond, de coque, de ligne, de texte et d’accent sur toute la page.',
        'Rails, carrés d’angle et pilules de nœud donnent à la coque minimale une structure technique.',
      ],
      howWithCodex: [
        'Collez le bloc de tokens, puis construisez la fondation de page et la coque hero.',
        'Ajoutez le canvas mesh dans la coque, derrière son contenu.',
        'Placez quelques nœuds, rails et marqueurs, puis gardez les boucles de dérive lentes.',
      ],
    },
    'agency-grid-layout-minimal': {
      tagline: 'Grille éditoriale multi-colonnes, titres surdimensionnés et petits libellés en majuscules.',
      whatIsIt:
        'Une direction de mise en page pour sites d’agence : coques de grille larges, titres de titrage surdimensionnés, petites métadonnées en majuscules dans les colonnes adjacentes, et blocs d’image architecturaux.',
      whyForDesign: [
        'Un placement strict en colonnes fait lire chaque position d’élément comme intentionnelle.',
        'Le contraste d’échelle entre titres de titrage et minuscules métadonnées porte la hiérarchie.',
        'L’espace négatif est préservé plutôt que rempli, gardant la page éditoriale.',
      ],
      howWithCodex: [
        'Posez d’abord une coque en max-width large, avec des divisions de colonnes visibles.',
        'Ancrez un titre hero sur la plupart des colonnes, le texte d’appui dans une colonne latérale.',
        'Construisez les rangées de services en listings multi-colonnes avec de minuscules libellés de métadonnées.',
      ],
    },
    'glass-dark-mode-clock': {
      tagline: 'Surfaces sombres dépolies bâties autour d’un cadran de calibration circulaire.',
      whatIsIt:
        'Une direction en verre sombre centrée sur un cadran façon horloge : base quasi noire avec grilles de faisceaux, capsules de nav dépolies, et une pièce maîtresse en anneaux et graduations superposés.',
      whyForDesign: [
        'Un cadran dominant ancre la mise en page au lieu de rester un widget décoratif.',
        'Lignes de faisceau et réticules s’alignent sur le cadran, renforçant la logique de calibration.',
        'Une palette monochrome : la clarté vient des reflets du verre, pas d’accents saturés.',
      ],
      howWithCodex: [
        'Partez d’une base quasi noire avec de faibles repères de grille et de faisceaux.',
        'Construisez nav, pilules et boutons en capsules de verre sombre avec des contours de reflet de 1px.',
        'Superposez le cadran : anneau externe, graduations, libellés rotatifs, emblème central.',
      ],
    },
    'gsap-skills': {
      tagline: 'Le jeu d’animation GSAP officiel, des tweens de base à ScrollTrigger et React.',
      whatIsIt:
        'Le jeu de skills officiel de GreenSock pour construire de l’animation web avec GSAP. Huit modules couvrent l’API de base, les timelines, ScrollTrigger, les plugins, React, les autres frameworks, la performance et les utilitaires.',
      whyForDesign: [
        'Le mouvement suit la vraie API de GSAP au lieu de laisser l’agent deviner la syntaxe.',
        'ScrollTrigger et timelines sont séquencés correctement, pas empilés au petit bonheur.',
        'Des règles de performance gardent l’animation fluide au lieu de saccader au scroll.',
      ],
      howWithCodex: [
        'Installez le jeu de skills GSAP pour que Codex puisse charger le module pertinent.',
        'Demandez le mouvement voulu ; le bon module gère l’API.',
        'Piochez le module React ou frameworks à l’intérieur d’un arbre de composants.',
      ],
    },
    'animation-review': {
      tagline: 'Repère, améliore et relit le mouvement face à un niveau d’exigence senior.',
      whatIsIt:
        'Trois des skills de mouvement d’Emil Kowalski fonctionnant en une seule boucle : repérer ce qui devrait s’animer, améliorer le mouvement existant, et relire le code d’animation face à un haut niveau d’exigence.',
      whyForDesign: [
        'Fait ressortir l’UI qui devrait bouger mais ne bouge pas, et rejette le mouvement superflu.',
        'Transforme le vague « rends ça plus agréable » en un audit de mouvement priorisé.',
        'Tient l’animation à un niveau d’exigence nommé, pas au goût personnel.',
      ],
      howWithCodex: [
        'Lancez la passe de repérage pour localiser les occasions de mouvement dans votre UI.',
        'Appliquez la passe d’amélioration pour retravailler le code d’animation existant.',
        'Lancez la passe de revue avant de livrer pour attraper le mouvement bâclé.',
      ],
    },
  },
};
