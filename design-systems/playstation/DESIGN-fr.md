# Design System Inspired by PlayStation

> Category: Médias & Grand public
> Commerce de détail de consoles de jeu. Mise en page à trois surfaces en canal, typographie d'affichage à autorité discrète, survol en cyan avec mise à l'échelle.

## 1. Thème visuel & Atmosphère

PlayStation.com se comporte comme le service marketing d'une marque d'électronique grand public haut de gamme qui vend accessoirement du divertissement. La page est organisée comme un **canal vertical de surfaces alternées** : un en-tête et un hero quasi-noirs, une série de panneaux éditoriaux blanc papier au centre, et un pied de page bleu cobalt profond qui ancre l'ensemble de l'expérience. Entre ces modes de surface, le site mise fortement sur la photographie et les rendus 3D de produits — la console PS5, les jaquettes de jeux, les manettes DualSense — laissant le matériel accomplir le travail émotionnel tandis que le chrome reste sobre.

Le geste typographique signature est **SST Light (graisse 300) aux grandes tailles**. La famille SST personnalisée de Sony est utilisée de 22px à 54px en graisse 300, conférant aux titres d'affichage une qualité chuchotée et élégante qui évoque davantage une publicité de montre de luxe qu'un magasin de jeux. Cette « autorité discrète » est l'exact opposé du cri Manuka de The Verge ou de la densité de kiosque de Wired — PlayStation veut que la typographie s'efface pour laisser le produit mener. Le corps et l'interface misent sur les graisses 500–700, mais la voix d'*affichage* est systématiquement fine et calme.

Le seul endroit où la retenue cède est l'**interaction**. Chaque bouton principal a le même mouvement au survol : le fond passe à un cyan électrique `#1eaedb`, une bordure blanche de 2px apparaît, un anneau extérieur bleu PlayStation de 2px s'épanouit derrière, et l'ensemble du bouton **monte à l'échelle 1,2×**. Cette combinaison d'éclat de couleur, de bordure, d'anneau et de mise à l'échelle est un geste signature unique à Sony parmi les grandes marques — une miniature « animation de mise sous tension » que le site répète des centaines de fois sur une seule page.

**Caractéristiques clés :**
- Mise en page à trois surfaces en canal : hero quasi-noir, contenu blanc papier, pied de page bleu cobalt — alternés, jamais mélangés
- SST graisse 300 de 22 à 54px pour l'affichage — titres à « autorité discrète » qui laissent la photographie de produit mener
- PlayStation Blue `#0070cc` comme couleur d'ancrage de la marque ; le cyan `#1eaedb` réservé exclusivement aux états de survol/focus
- Chaque élément interactif monte à l'échelle 1,2× au survol — un lift « mise sous tension » signature unique à PlayStation
- Boutons en pilule au rayon complet 999px ; illustrations de cartes dans des rectangles arrondis de 12 à 24px
- Commerce-orange `#d53b00` utilisé exclusivement pour les CTA PlayStation Store / état d'achat
- Couverture étendue des points de rupture jusqu'à 2120px — le site s'adapte jusqu'aux contextes de navigation sur TV 4K

## 2. Palette de couleurs & Rôles

### Primaire (Ancrage de la marque)
- **PlayStation Blue** (`#0070cc`) : La couleur d'ancrage de la marque. Utilisée sur le pied de page principal, les liens en ligne, les remplissages de boutons primaires sur les surfaces sombres, et chaque marqueur « officiel ». Traitez-la comme immuable — c'est la couleur la plus associée à la marque dans la mémoire des consommateurs.
- **Console Black** (`#000000`) : Noir pur pour l'en-tête, les arrière-plans hero et les zones de présentation de produits. PlayStation utilise le noir pour encadrer le matériel comme un musée utilise le noir pour encadrer une sculpture.

### Secondaire & Accent
- **PlayStation Cyan** (`#1eaedb`) : La couleur d'interaction. Appliquée UNIQUEMENT aux états de survol, focus et actif des boutons et liens. N'apparaît jamais comme arrière-plan par défaut ni comme couleur de texte au repos. À associer avec une bordure `#ffffff` de 2px et un anneau extérieur `#0070cc` de 2px au survol pour le traitement signature complet.
- **Link Hover Blue** (`#1883fd`) : La variante plus lumineuse utilisée pour les survols de liens texte en ligne. Distinct du Cyan — c'est la couleur de lien, le Cyan est la couleur de bouton.
- **Dark Link Blue** (`#0068bd`) : La couleur de lien au repos sur les surfaces claires — un cousin légèrement plus saturé du bleu de la marque.

### Surface & Arrière-plan
- **Paper White** (`#ffffff`) : Canevas de contenu principal pour les panneaux éditoriaux entre l'en-tête et le pied de page.
- **Ice Mist** (`#f5f7fa`) : La fin atmosphérique du dégradé de section claire. Utilisé subtilement derrière certains panneaux pour les soulever du blanc pur.
- **Divider Tint** (`#f3f3f3`) : La couleur discrète de règle horizontale entre les rangées de contenu.
- **Masthead Black** (`#000000`) : Barre de navigation supérieure et canevas hero — réservé aux zones mettant le produit en avant.
- **Shadow Black** (`#121314`) : L'ancrage de départ du dégradé de section sombre lorsqu'un panneau nécessite une profondeur atmosphérique.
- **Filter Mist** (`rgba(245, 247, 250, 0.3)`) : Arrière-plan translucide utilisé derrière les barres de filtre persistantes — le seul moment de « glassmorphisme » sur le site.

### Neutres & Texte
- **Display Ink** (`#000000`) : Titres d'affichage principaux sur les surfaces blanches.
- **Deep Charcoal** (`#1f1f1f`) : Titres de corps et couleur de lien au repos — légèrement plus doux que le noir pur pour réduire l'anneau visuel sur les grands blocs.
- **Body Gray** (`#6b6b6b`) : Texte de corps secondaire et métadonnées.
- **Mute Gray** (`#cccccc`) : Étiquettes tertiaires, états désactivés.
- **Placeholder Ink** (`rgba(0, 0, 0, 0.6)`) : Texte de substitution de formulaire — 60% de noir, pas une valeur grise distincte.
- **Inverse White** (`#ffffff`) : Texte principal sur les surfaces sombres et bleues.
- **Dark-Link Blue** (`#53b1ff`) : La couleur de lien au repos sur les surfaces sombres/noires — une variante aérienne plus claire de PlayStation Blue pour la lisibilité sur fond noir.

### Sémantique & Commerce
- **Commerce Orange** (`#d53b00`) : Réservé aux CTA d'état d'achat PlayStation Store, aux indications de prix et aux badges « en promotion ». La seule couleur chaude du site — à utiliser avec parcimonie et jamais en dehors d'un contexte commercial.
- **Commerce Orange Active** (`#aa2f00`) : L'état pressé/actif des boutons de commerce.
- **Warning Red** (`#c81b3a`) : Erreurs de formulaire et avertissements d'action destructrice.
- **Shadow Wash 80** (`rgba(0, 0, 0, 0.8)`) : Le voile dramatique utilisé derrière le texte hero sur la photographie de produit.
- **Shadow Wash 16** (`rgba(0, 0, 0, 0.16)`) : Anneau d'élévation de faible poids sur les cartes.
- **Shadow Wash 08** (`rgba(0, 0, 0, 0.08)`) : Élévation de carte en plume — à peine visible mais séparant les panneaux blancs du fond blanc.
- **Shadow Wash 06** (`rgba(0, 0, 0, 0.06)`) : L'ombre la plus légère du système.

### Système de dégradés
PlayStation utilise **deux dégradés de section** et rien d'autre :
- **Dégradé de section claire** : de `#ffffff` → `#f5f7fa` — un lavis presque imperceptible qui soulève discrètement un panneau du canevas.
- **Dégradé de section sombre** : de `#121314` → `#000000` — un court lavis vertical qui donne aux panneaux hero un léger vignettage sans introduire de décalage de teinte.

Les deux dégradés sont utilisés **uniquement comme arrière-plans de section**, jamais à l'intérieur des composants. Il n'y a pas de boutons dégradés, pas de texte dégradé, pas d'halos lumineux. La marque est bleue — pas bleu-violet, pas bleu-cyan.

## 3. Règles typographiques

### Famille de polices
- **SST** / **Playstation SST** (Sony, propriétaire) — fallback : `Arial`, `Helvetica`. La police mondiale personnalisée de Sony, conçue par Toshi Omagari et Akira Kobayashi. Couvre les graisses 300 / 500 / 600 / 700 sur la page d'accueil. La graisse **300 de 22 à 54px** est la signature typographique de PlayStation.
- **SST (condensed / alternate)** — fallback : `helvetica`, `arial`. Une variante compressée utilisée dans quelques modules d'interface où la largeur est importante.
- **Arial** — fallback utilitaire pour la rare variante de bouton qui s'affiche en sans-serif système.

### Hiérarchie

| Rôle | Police | Taille | Graisse | Hauteur de ligne | Espacement des lettres | Notes |
|---|---|---|---|---|---|---|
| Hero Display (XL) | SST | 54px / 3.38rem | 300 | 1.25 | -0.1px | Le plus grand moment SST sur la page — titre de luxe à graisse discrète |
| Hero Display (L) | SST | 44px / 2.75rem | 300 | 1.25 | 0.1px | Titres hero secondaires |
| Large Display | SST | 35px / 2.20rem | 300 | 1.25 | — | Titres de panneaux de fonctionnalité |
| Mid Display | SST | 28px / 1.75rem | 300 | 1.25 | 0.1px | En-têtes de section |
| Compact Display | SST | 22px / 1.38rem | 300 | 1.25 | 0.1px | Titres de modules — toujours en graisse légère 300 |
| Playstation SST Sub | Playstation SST | 22.5px / 1.41rem | 400 | 1.30 | — | Sous-titre promotionnel |
| UI Heading Small | SST | 18px / 1.13rem | 600 | 1.00 | — | En-têtes d'interface compacts |
| Button / CTA | SST | 18px / 1.13rem | 500 | 1.25 | 0.4px | Étiquette de bouton principal |
| Button / Emphasized | SST | 18px / 1.13rem | 700 | 1.25 | 0.45px | CTA à emphase élevée (acheter, s'abonner) |
| Button Serif | SST | 18px / 1.13rem | 600 | 1.50 | — | Étiquette de bouton secondaire |
| Body Relaxed | SST | 18px / 1.13rem | 400 | 1.50 | 0.1px | Corps de lecture standard |
| Link Body | SST | 18px / 1.13rem | 400 | 1.50 | — | Texte de lien en ligne |
| Compact Button | SST | 14px / 0.88rem | 700 | 1.25 | 0.324px | Mini CTA dans les cartes |
| Utility Caption | SST | 14px / 0.88rem | 500 | 1.50 | — | Légendes, étiquettes de tags |
| Caption Body | SST | 14px / 0.88rem | 400 | 1.50 | — | Métadonnées standard |
| Playstation Caption Bold | Playstation SST | 14px / 0.88rem | 700 | 1.40 | — | Légende accentuée |
| Playstation Caption Mid | Playstation SST | 14px / 0.88rem | 600 | 1.40 | — | Légende semi-grasse |
| Playstation Button | Playstation SST | 14.4px / 0.90rem | 700 | 1.00 | 0.144px | Bouton d'interface avec interligne serré |
| Playstation Tab | Playstation SST | 14px / 0.88rem | 400 | 1.10 | 0.14px | Étiquette d'onglet/pilule |
| Playstation Compact Caption | Playstation SST | 12.8px / 0.80rem | 400 | 1.10 | — | Plus petite légende d'interface |
| Micro Caption | SST | 12px / 0.75rem | 500 | 1.50 | — | Microcopy de pied de page, texte légal |
| Compact Caption Bold | SST | 12.06px / 0.75rem | 700 | 1.50 | — | Micro texte accentué |

### Principes
- **La graisse 300 aux grandes tailles est la voix.** PlayStation est la seule grande marque de consoles qui utilise un affichage à graisse légère pour ses titres hero. Résistez à l'envie de « mettre à niveau » la typographie d'affichage à 500 ou 700 — la discrétion est la personnalité.
- **Les sauts de graisse se produisent au niveau de l'interface.** En dessous de 18px, le système passe aux graisses 500–700 pour la lisibilité. Le gradient de graisse de 300 (affichage) → 400 (corps) → 500 (légendes) → 700 (boutons) est la hiérarchie.
- **L'espacement des lettres est à peine présent.** La plupart des valeurs sont de 0,1 à 0,45px, positives ou légèrement négatives. Le `-0.1px` sur le hero de 54px resserre juste assez la typographie d'affichage pour paraître « conçue » sans en faire une déclaration typographique.
- **Deux casings SST.** « SST » et « Playstation SST » sont fonctionnellement la même famille avec des jeux de métriques légèrement différents (Playstation SST est plus serré aux petites tailles). Traitez-les comme interchangeables pour des usages hors de la licence interne de Sony.
- **Pas de tout-majuscules.** Contrairement à The Verge ou Wired, PlayStation utilise rarement les étiquettes en MAJUSCULES. Les accrocheurs et tags restent en casse de titre ou de phrase — un autre geste d'« autorité discrète ».
- **Pas de sérif nulle part.** Le système entier est sans-sérif. Il n'y a pas de contrepoint à voix imprimée.

## 4. Styles des composants

### Boutons

**Primaire — Pilule PlayStation Blue**
- Arrière-plan : `#0070cc` (PlayStation Blue)
- Texte : `#ffffff`, SST 18px / 500 / 0.4px tracking
- Bordure : aucune au repos
- Rayon de bordure : `999px` — pilule complète
- Rembourrage : ~`12px 24px` (variable selon la classe de taille)
- Contour : `rgb(255, 255, 255) none 0px` au repos
- **Survol (geste signature)** :
  - L'arrière-plan passe à `#1eaedb` (PlayStation Cyan)
  - Le texte reste `#ffffff`
  - Une bordure `#ffffff` de 2px apparaît
  - Un anneau extérieur `#0070cc` de 2px s'épanouit (`0 0 0 2px #0070cc`)
  - `transform: scale(1.2)` — le bouton grandit réellement de 20%
- Actif : `opacity: 0.6` — un assombrissement rapide pour signaler la pression
- Focus : Identique au survol, mais l'anneau devient une ombre de focus `rgb(0, 114, 206) 0px 0px 0px 2px`
- Transition : ~180ms ease sur l'arrière-plan, le transform et l'ombre

**Secondaire — Contour blanc sur fond sombre**
- Arrière-plan : `#ffffff`
- Texte : `#0172ce` (variante PlayStation Blue)
- Bordure : `2px outset #000000` — une vraie bordure `outset`, extrêmement rare en CSS moderne
- Rayon : variable (souvent `999px` ou `36px`)
- Rembourrage : `16px 20px`
- Survol : même remplissage cyan signature + scale(1.2) + traitement de l'anneau
- Focus : même traitement de l'anneau

**Commerce Orange**
- Arrière-plan : `#d53b00` (Commerce Orange)
- Texte : `#ffffff`, SST 18px / 700 / 0.45px tracking
- Rayon de bordure : `999px` — pilule
- Utilisé uniquement pour les CTA PS Store / Acheter / S'abonner Plus
- Actif : l'arrière-plan s'assombrit à `#aa2f00`
- Survol : suit la règle d'inversion cyan comme tous les autres boutons (PAS un survol spécifique à l'orange)

**Ghost transparent**
- Arrière-plan : transparent
- Texte : `#1f1f1f` (Deep Charcoal)
- Bordure : `1px solid #dedede`
- Rembourrage : `0 10px` (serré, optimisé pour la navigation)
- Survol : remplissage cyan, texte blanc, bordure blanche de 2px, scale(1.2)
- Actif : le texte passe à `#0072ce`, opacity 0.6

**Cercle icône**
- Arrière-plan : `rgba(0, 0, 0, 0.2)` sur la photographie ; `#ffffff` sur les surfaces claires
- Rayon de bordure : `100%` — cercle parfait
- Utilisé pour les flèches précédent/suivant de carrousel et les boutons de partage
- Survol : s'éclaircit vers `var(--color-role-backgrounds-primary-link-hover)` (environ `#e5e5e5` sur fond clair)

**Mini CTA (dans la carte)**
- SST 14px / 700 / 0.324px tracking
- Rembourrage ~8px 16px
- Rayon : `999px`
- Utilisé à l'intérieur des cartes de jeux pour les mini CTA « Acheter maintenant » / « Ajouter au panier »

### Cartes & Conteneurs

**Carte hero (Fonctionnalité de jeu)**
- Arrière-plan : photographie/rendu — généralement ancré dans le noir
- Rayon de bordure : `24px` ou `19px` pour les cartes de fonctionnalité
- Rembourrage : 32–48px intérieur
- Ombre : `rgba(0, 0, 0, 0.8) 0px 5px 9px 0px` — une ombre portée dramatique utilisée uniquement lorsqu'une carte chevauche la photographie hero
- Survol : léger transform de mise à l'échelle, le contour cyan apparaît sur le CTA principal

**Vignette de couverture de jeu**
- Arrière-plan : illustration de couverture de jeu, sans rembourrage
- Rayon de bordure : `12px` ou `13px` (images) / `19px` (cadre de carte)
- Ombre : `rgba(0, 0, 0, 0.08) 0px 5px 9px 0px` — élévation en plume
- Survol : le CTA principal de la carte s'allume en cyan, la carte elle-même peut monter à l'échelle 1,02×
- Transition : 200ms ease sur le transform

**Panneau de contenu (blanc)**
- Arrière-plan : `#ffffff` ou le dégradé de section claire `#ffffff → #f5f7fa`
- Bordure : généralement aucune ; séparé des voisins par l'espacement et de légères ombres
- Rayon : `12px`–`24px` selon la hiérarchie du panneau
- Ombre : `rgba(0, 0, 0, 0.06) 0px 5px 9px 0px` — la plus légère du système

**Carte sombre sur fond sombre**
- Arrière-plan : `rgba(0, 0, 0, 0.2)` sur photographie
- Rayon de bordure : `6px` (compact) ou `24px` (fonctionnalité)
- Utilisé pour les incrustations « kit de presse » ou « bloc de statistiques » sur vidéo hero

### Champs de saisie & Formulaires
- **Par défaut** : arrière-plan `#ffffff`, bordure `1px solid #cccccc`, rayon de bordure `3px` (plus serré que le reste du système — les champs sont le seul endroit où PlayStation devient vraiment compact), texte SST 16px en `#1f1f1f`, texte substitutif `rgba(0, 0, 0, 0.6)`.
- **Focus** : anneau de focus `#0070cc` de 2px via `box-shadow: 0 0 0 2px #0070cc`. Pas de changement de couleur de bordure — l'anneau fait le travail.
- **Erreur** : la bordure et le texte passent à `#c81b3a` (Warning Red), texte d'erreur en ligne en dessous dans le même rouge.
- **Transition** : ~180ms ease sur la bordure et l'ombre.

### Navigation

- **Barre de navigation supérieure** : bande noire (`#000000`) pleine largeur avec le logo PlayStation (blanc) aligné à gauche, liens de catégorie centrés en SST 14–16px / 500, et un petit CTA « Se connecter » aligné à droite.
- **Survol d'un lien de navigation** : la couleur passe de `#ffffff` à `#1883fd` (Link Hover Blue), sans soulignement.
- **Section active** : marquée par un soulignement discret de 2px en `#0070cc`.
- **Mobile** : la navigation se replie en un tiroir hamburger. À l'intérieur du tiroir, les liens s'empilent verticalement avec des espacements de 16px et un rembourrage horizontal de 20px.
- **Comportement persistant** : la navigation reste épinglée en haut au défilement ; lorsqu'elle entre dans une zone de surface claire, elle **ne s'inverse pas** — elle reste sur fond noir tout au long.

### Traitement des images

- **Ratios d'aspect** : 16:9 pour vidéo/photographie hero, 1:1 pour les rendus de consoles, 3:4 pour les couvertures de jeux, 4:3 pour les images lifestyle.
- **Coins** : arrondis à `12px`, `13px` ou `24px` selon le contexte de la carte. Les couvertures de jeux reçoivent `6–12px`, les images hero `24px`.
- **Pleine largeur** : uniquement dans le hero de l'en-tête et les bannières promotionnelles du pied de page. Tout le reste se trouve dans une colonne de contenu avec rembourrage.
- **Ombre** : portée dramatique `rgba(0, 0, 0, 0.8) 0 5px 9px 0` sur les heros, légère en plume `rgba(0, 0, 0, 0.06) 0 5px 9px 0` sur les vignettes de grille.
- **Survol** : l'image reste statique, le cadre de la carte et le CTA principal répondent.
- **Chargement paresseux** : `loading="lazy"` sur tout ce qui est sous le pli, `eager` sur le hero de l'en-tête.

### Pilule du magasin de jeux (Distinctive)
- Arrière-plan : `#ffffff`
- Texte : `#000000`, SST 14px / 500
- Rembourrage : `14px 18px`
- Rayon : `9999px` — pilule complète
- Une étiquette pilule neutre qui se place à côté des couvertures de jeux pour indiquer la plateforme (« PS5 », « PS4 », « PSVR2 »). Contraste blanc sur fond sombre.

## 5. Principes de mise en page

### Système d'espacement
- **Unité de base** : 8px.
- **Échelle** : 1, 2, 3, 4.5, 5, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21px.
- **Rembourrage de section** : 48–96px vertical entre les grands panneaux. Les transitions du hero vers le contenu utilisent l'extrémité supérieure.
- **Rembourrage de carte** : 20–32px intérieur. Les cartes hero de fonctionnalité peuvent atteindre 48px.
- **Espacement en ligne** : 8–12px entre le titre et le sous-titre, 12–16px entre le sous-titre et le CTA.
- **Micro-échelle** : Les valeurs 1/2/3/4.5/5/9/10/12 sont utilisées pour le rembourrage des pilules, l'espacement des légendes et les décalages de bordures — pas pour le rythme éditorial.

### Grille & Conteneur
- **Largeur maximale** : ~1920px (points de rupture détectés par dembrandt jusqu'à 2120px). Les conteneurs se plafonnent généralement autour de `1280–1920px` selon le panneau.
- **Modèles de colonnes** : grille responsive à 12 colonnes qui se résout en rangées de vignettes de jeux à 3/4/6 colonnes selon la hiérarchie. Les zones hero couvrent souvent 12 colonnes ; les vignettes mises en avant s'organisent en configurations 6+3+3 ou 4+4+4.
- **Rembourrage extérieur** : 16px mobile → 48px tablette → 64–96px bureau.
- **Gouttières** : 16–24px entre les colonnes, plus serrées (8–12px) à l'intérieur des groupes de vignettes.

### Philosophie des espaces blancs
PlayStation traite les espaces blancs comme une marque de luxe traite l'éclairage de sa boutique — comme un signal premium. Il y a notablement plus de respiration verticale entre les modules que sur tout autre grand site de vente au détail, et les panneaux éditoriaux blancs ne contiennent souvent qu'un titre + une image + un CTA au rembourrage hero. L'effet est un « rythme galerie » où chaque produit obtient sa propre salle plutôt que de rivaliser dans une grille de vignettes.

### Échelle des rayons de bordure
- **2px** — boutons de bannière de cookies et petite interface d'administration
- **3px** — champs de formulaire, panneaux d'onglets (plus serré que tout le reste — un signal délibéré d'« interface fonctionnelle »)
- **6px** — boutons compacts et images en ligne
- **12px** — images de couvertures de jeux standard et images de contenu
- **13px** — certains wrappers de figure (un décalage de 1px par rapport à 12px pour l'imbrication)
- **19px** — cartes de fonctionnalité
- **20px** — spans de tags en ligne
- **24px** — cartes hero, cadres de fonctionnalité principaux
- **36px** — navigation en pilule complète et variantes de boutons secondaires
- **48px** — grands boutons de fonctionnalité
- **999px / 100%** — boutons principaux en pilule complète et boutons icône circulaires

Onze valeurs de rayon discrètes — l'un des systèmes de rayon les plus riches de tous les sites de ce catalogue. La gamme existe parce que PlayStation utilise délibérément des rayons différents pour des *hiérarchies* différentes : 3px pour l'utilitaire, 12px pour les médias, 24px pour les fonctionnalités, 999px pour les CTA.

## 6. Profondeur & Élévation

| Niveau | Traitement | Usage |
|---|---|---|
| 0 | Aucune ombre | Contenu par défaut sur `#ffffff` |
| 1 | `rgba(0, 0, 0, 0.06) 0 5px 9px 0` | Élévation légère en plume pour panneau éditorial |
| 2 | `rgba(0, 0, 0, 0.08) 0 5px 9px 0` | Élévation standard de vignette de grille |
| 3 | `rgba(0, 0, 0, 0.16) 0 5px 9px 0` | Carte accentuée (survol ou actif) |
| 4 | `rgba(0, 0, 0, 0.8) 0 5px 9px 0` | Ombre de superposition hero — portée dramatique sur photographie |
| 5 | `0 0 0 2px #0070cc` (anneau de focus) | État de focus du bouton principal |
| 6 | `0 0 0 2px #000000` (anneau de survol) | Anneau de survol du bouton secondaire |
| 7 | Dégradé de section `#121314 → #000000` | Profondeur atmosphérique sur les panneaux hero sombres |

La philosophie de profondeur de PlayStation est **en couches mais sobre**. L'échelle d'ombres va de 0,06 à 0,16 pour les états normaux, puis saute à 0,8 pour les portées hero — il n'y a pas de milieu à 0,2, 0,3, 0,4. L'effet est que la majeure partie de la page est presque plate, mais lorsqu'une carte hero doit flotter sur la photographie, elle *flotte* vraiment. L'élévation est soit chuchotée soit criée, jamais marmonnée.

### Profondeur décorative
- **Dégradés de section** (sombre et clair, les deux décrits ci-dessus) — utilisés uniquement comme arrière-plans de section
- **Anneaux de focus/survol** à 2px, toujours bleus ou cyan selon l'état
- **Pas de lueurs, flous ou effets atmosphériques** au-delà des deux dégradés de section
- **Pas de boutons ou textes dégradés** — le système visuel est composé de blocs de couleur unie partout sauf lors des transitions de section

## 7. À faire et à ne pas faire

### À faire
- **Faites** utiliser PlayStation Blue (`#0070cc`) comme remplissage principal de CTA et ancrage du pied de page. C'est la couleur d'ancrage de la marque.
- **Faites** utiliser la graisse SST 300 pour chaque titre d'affichage de 22px et plus. Le titre à graisse discrète est la voix.
- **Faites** appliquer la signature de survol complète à chaque bouton principal : remplissage cyan + bordure blanche de 2px + anneau extérieur bleu de 2px + `scale(1.2)`.
- **Faites** utiliser le rayon pilule complet (`999px`) sur les boutons principaux et de commerce.
- **Faites** réserver PlayStation Cyan (`#1eaedb`) exclusivement aux états de survol, focus et actif — jamais comme arrière-plan au repos.
- **Faites** utiliser Commerce Orange (`#d53b00`) uniquement sur les CTA PlayStation Store / d'achat et les indications de prix.
- **Faites** alterner les panneaux hero sombres avec les panneaux de contenu blancs et ancrez avec un pied de page bleu profond — la mise en page à trois surfaces en canal est le rythme de la page.
- **Faites** utiliser des ombres portées hero dramatiques `rgba(0, 0, 0, 0.8)` lorsqu'une carte chevauche la photographie de produit.
- **Faites** garder la barre de navigation supérieure noire à chaque position de défilement — elle ne s'inverse pas en blanc au-dessus des panneaux clairs.

### À ne pas faire
- **Ne mettez pas** les titres d'affichage en gras. La graisse 300 de 22 à 54px est la voix de PlayStation. La typographie d'affichage en graisse 700 donne l'impression d'« un autre revendeur de jeux ».
- **N'utilisez pas** d'étiquettes ou d'accrocheurs EN MAJUSCULES. PlayStation utilise rarement les majuscules — c'est une marque à autorité discrète, pas une marque de signalisation de danger.
- **N'utilisez pas** de boutons, textes ou arrière-plans dégradés en dehors des deux dégradés de section déclarés.
- **N'introduisez pas** de couleurs chaudes en dehors de Commerce Orange. Pas de CTA rouges, pas de surlignages jaunes, pas de pilules de succès vertes.
- **N'utilisez pas** de coins carrés sur les boutons ou médias. Le système a onze rayons — choisissez-en un, mais jamais `0`.
- **Ne sautez pas** le mouvement de survol `scale(1.2)` sur les boutons principaux. Le lift-scale est une signature d'interaction de la marque.
- **N'utilisez pas** de type sérif. Le système est 100% SST sans-sérif.
- **Ne laissez pas** le cyan `#1eaedb` apparaître comme couleur de texte ou d'arrière-plan au repos. Il n'existe qu'en mouvement.
- **Ne concevez pas** des panneaux qui se font concurrence pour l'attention. Le rythme d'espaces blancs de PlayStation donne à chaque module sa propre « salle de galerie ».

## 8. Comportement adaptatif

### Points de rupture

| Nom | Largeur | Changements clés |
|---|---|---|
| Petit mobile | <400px | Colonne unique, navigation repliée en hamburger, SST hero redimensionné à ~28px |
| Mobile | 400–599px | Colonne unique, vignettes empilées en pleine largeur, rembourrage ouvert à 16px |
| Grand mobile | 600–767px | Toujours colonne unique mais option à 2 colonnes dans certains modules |
| Tablette portrait | 768–1023px | Grille de jeux à 2 colonnes, navigation toujours condensée |
| Tablette paysage | 1024–1279px | Grille à 3–4 colonnes, navigation complète restaurée |
| Bureau | 1280–1599px | Grille éditoriale complète, échelle d'affichage hero maximale (44–54px) |
| Grand bureau | 1600–1919px | Conteneur plafonné à 1600px, marges élargies |
| 4K / Grand écran | ≥1920px | Conteneur étendu à 1920px max, contenu hero mis à l'échelle pour correspondre à la distance de visionnage TV |
| Ultra-large | ≥2120px | Point de rupture extrême — la page reste ancrée, les marges extérieures absorbent la largeur supplémentaire |

La balayage dembrandt a détecté 30 points de rupture entre 320px et 2120px — une plage adaptative inhabituellement large. PlayStation se règle spécifiquement pour les **contextes grand écran** (1920–2120px) car les propriétaires de PS5 naviguent fréquemment sur le site via des TV grâce au navigateur de la console ou via la diffusion vers TV depuis un téléphone. La plupart des sites de vente au détail arrêtent de se régler à 1440px ; PlayStation continue jusqu'à la 4K.

### Cibles tactiles
- Les boutons pilule principaux font ~48–56px de haut (texte SST 18px + ~12–16px de rembourrage vertical) — confortablement WCAG AAA.
- Les liens de navigation sont plus petits (~32–40px de haut) sur bureau ; sur mobile, ils s'élargissent à 48px+ à l'intérieur du tiroir.
- Les boutons cercle icône font 40–48px — adaptés au tactile.

### Stratégie de repli
- **Navigation** : navigation complète → condensée → tiroir hamburger à mesure que la fenêtre rétrécit. Le logo reste épinglé à gauche ; le CTA reste épinglé à droite.
- **Grille** : 6 col → 4 col → 3 col → 2 col → 1 col. Les cartes de vignettes de jeux se reforment sans recadrer les illustrations de couverture.
- **Espacement** : le rembourrage de section se resserre de 96px → 64px → 48px → 32px → 24px à mesure que la fenêtre rétrécit.
- **Typographie** : SST hero passe de 54px → 44px → 35px → 28px → 22px. La graisse légère 300 est préservée à chaque taille.
- **Photographie hero** : changement de direction artistique — le bureau utilise des recadrages larges 16:9, le mobile utilise des recadrages 4:3 ou 1:1 avec le produit centré.

### Comportement des images
- Raster adaptatif (`srcset` + `<picture>` avec direction artistique), ratios d'aspect préservés par point de rupture.
- Prêt pour la 4K : le site sert des images haute densité à 1920px+ pour éviter la mise à l'échelle lors de la navigation TV.
- `loading="lazy"` sur tout ce qui est sous le pli ; le hero est `eager` avec un indice de préchargement.

## 9. Guide de prompt pour agents

### Référence rapide des couleurs
- **CTA principal** : « PlayStation Blue (`#0070cc`) »
- **Accent de survol / Focus** : « PlayStation Cyan (`#1eaedb`) »
- **Arrière-plan (surface blanche)** : « Paper White (`#ffffff`) »
- **Arrière-plan (surface sombre)** : « Console Black (`#000000`) »
- **Texte de titre sur blanc** : « Display Ink (`#000000`) »
- **Texte de corps sur blanc** : « Deep Charcoal (`#1f1f1f`) »
- **Texte de corps sur noir** : « Inverse White (`#ffffff`) »
- **Accent commerce / Achat** : « Commerce Orange (`#d53b00`) »
- **Ancrage du pied de page** : « PlayStation Blue (`#0070cc`) »

### Exemples de prompts de composants
1. *« Créez un bouton CTA principal avec un remplissage PlayStation Blue `#0070cc`, texte blanc en SST 18px / 500 / 0.4px tracking, rayon de bordure 999px, rembourrage 12px × 24px. Au survol, l'arrière-plan passe à `#1eaedb` PlayStation Cyan, une bordure `#ffffff` de 2px apparaît, un anneau extérieur `#0070cc` de 2px s'épanouit via box-shadow, et l'ensemble du bouton monte à l'échelle 1,2× — le tout en une transition ease de 180ms. »*
2. *« Concevez un panneau hero sur un canevas Console Black `#000000` avec un titre SST graisse 300 de 54px en `#ffffff` avec un letter-spacing de -0.1px et une hauteur de ligne de 1.25. Placez un seul CTA principal en dessous avec le traitement de survol PlayStation standard. Aucune étiquette EN MAJUSCULES nulle part. »*
3. *« Construisez une vignette de couverture de jeu : image en ratio 3:4 avec rayon de bordure de 12px, ombre portée légère en plume `rgba(0, 0, 0, 0.08) 0 5px 9px 0`, un titre SST 700 de 14px en dessous, un tag de plateforme SST 500 de 12px, et un mini CTA principal de 14px / 700 / 0.324px tracking en PlayStation Blue. »*
4. *« Créez un bouton pilule de commerce pour un achat PlayStation Store : remplissage Commerce Orange `#d53b00`, texte `#ffffff` en SST 18px / 700 / 0.45px tracking, rayon 999px, rembourrage 12px × 28px. L'état actif s'assombrit à `#aa2f00`. Le survol suit l'inversion cyan standard avec mise à l'échelle 1,2×. »*
5. *« Concevez un panneau de contenu blanc entre des sections hero sombres : arrière-plan `#ffffff` avec le subtil dégradé de section claire `#ffffff → #f5f7fa`, rayon de bordure 24px, rembourrage intérieur 48px, élévation légère en plume `rgba(0, 0, 0, 0.06) 0 5px 9px 0`, un titre SST 300 de 35px, un paragraphe de corps de 18px, et un seul CTA principal. »*

### Guide d'itération
Lors de l'affinage des écrans existants générés avec ce système de design :
1. **Auditez la graisse d'affichage.** Chaque titre de 22px et plus doit être SST graisse 300. Si vous voyez la graisse 500 ou 700 à l'échelle hero, vous avez perdu la voix PlayStation.
2. **Auditez le traitement de survol.** Chaque bouton principal doit monter à l'échelle 1,2× au survol avec la combinaison remplissage cyan + bordure blanche + anneau bleu. Manquez l'un des quatre et la signature d'interaction est brisée.
3. **Auditez les coins.** Chaque conteneur et bouton doit atterrir sur 2, 3, 6, 12, 13, 19, 20, 24, 36, 48 ou 999px / 100%. Les coins carrés brisent la voix.
4. **Auditez la prolifération des couleurs.** Seuls PlayStation Blue (`#0070cc`), Cyan (`#1eaedb`), Commerce Orange (`#d53b00`), et les gris/noirs/blancs déclarés doivent apparaître dans le chrome. Si vous voyez une autre teinte, corrigez-la.
5. **Auditez l'alternance des surfaces.** La page doit alterner hero sombre → contenu blanc → hero sombre → contenu blanc → pied de page bleu. Si deux panneaux de même surface sont adjacents, insérez une transition.
6. **Auditez la casse.** Casse de phrase et casse de titre uniquement. Aucune étiquette, bouton ou accrocheur EN MAJUSCULES. Si vous voyez des majuscules, convertissez.
7. **Auditez le poids des ombres.** L'opacité des ombres doit atterrir sur 0,06 / 0,08 / 0,16 / 0,8 — rien entre les deux. Si vous voyez des ombres portées à 0,1, 0,2, 0,3, 0,5, corrigez au palier déclaré le plus proche.
8. **Auditez les espaces blancs.** Si deux modules semblent « compétitifs » (se disputant l'attention), ajoutez 48–96px de respiration verticale. Le rythme galerie de PlayStation est non négociable.
