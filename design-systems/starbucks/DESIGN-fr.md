# Design System Inspiré de Starbucks

> Category: E-Commerce & Retail
> Marque mondiale de café en grande distribution. Système vert à quatre niveaux, toile crème chaleureuse, boutons en pilule complète.

## 1. Thème Visuel & Atmosphère

Le design system de Starbucks est un **vaisseau amiral retail chaleureux et affirmé** qui porte le vert de son tablier de devanture sur toutes les surfaces. La toile alterne entre un crème neutre-chaud (`#f2f0eb`) et un blanc cassé céramique (`#edebe9`) — des couleurs qui évoquent les matériaux réels du point de vente : les serviettes en papier, les murs du café, les finitions bois — tandis que le **Starbucks Green** signature (`#006241`) ancre le moment de marque sur les bandes hero, les CTAs et l'expérience Rewards. Les verts se déclinent en quatre teintes calibrées (Starbucks, Accent, House, Uplift), chacune assignée à un rôle de surface précis, et l'or (`#cba258`) n'apparaît qu'autour des moments de cérémonie liés au statut Rewards — jamais comme accent général.

La typographie porte l'essentiel de la voix de marque. La police propriétaire **SoDoSans** (exclusive à Starbucks) couvre quasiment toutes les surfaces avec un interlettrage serré de `-0.16px` — elle se lit confiante et accueillante plutôt que sévère comme dans un magazine de mode. Ce qui est inhabituel : la page Rewards bascule vers une serif chaude (`"Lander Tall", "Iowan Old Style", Georgia`) pour certains titres phares, évoquant subtilement l'atmosphère nostalgique d'un tableau de café. Et les pages Careers utilisent une écriture manuscrite (`"Kalam", "Comic Sans MS", cursive`) pour les touches personnelles de nom sur les tasses. Trois polices, trois contextes — le système est discipliné sur quand chacune apparaît.

Les surfaces respirent grâce à une géométrie arrondie. Chaque bouton est une pilule complète de 50px. Les cartes adoptent un rectangle arrondi de 12px. Le CTA flottant « Frap » — un bouton de commande circulaire de 56px en Green Accent (`#00754A`) — est le mouvement d'élévation signature du produit : il flotte en bas à droite avec une pile d'ombres en couches (`0 0 6px rgba(0,0,0,0.24)` base + `0 8px 12px rgba(0,0,0,0.14)` ambient) et se comprime via `scale(0.95)` à l'appui. Les élévations sont par ailleurs retenues — les ombres des cartes restent à un alpha murmuré de `0.14/0.24`, la nav globale obtient une pile d'ombres discrète à trois couches. L'ensemble du système évoque une signalétique de café soignée : lisible, chaleureuse, et jamais criarde.

**Caractéristiques Clés :**
- Système de marque vert à quatre niveaux (Starbucks / Accent / House / Uplift), chacun assigné à un rôle de surface distinct — pas un unique « vert de marque »
- L'or est réservé aux seuls moments de cérémonie Rewards-status ; jamais un accent polyvalent
- Toile neutre-chaude (`#f2f0eb` / `#edebe9`) au lieu du blanc froid — référence aux matériaux du café
- Police propriétaire personnalisée (SoDoSans) avec un interlettrage serré de `-0.16px` comme voix universelle
- Changements de police contextuels : serif (Lander Tall) pour Rewards, script (Kalam) pour les noms sur tasses Careers
- Boutons en pilule complète (`50px` de rayon) universels, `scale(0.95)` à l'appui comme micro-interaction signature
- CTA circulaire flottant « Frap » (`56px`, remplissage Green Accent, pile d'ombres en couches) — l'élément d'élévation signature du produit
- Surfaces de cartes cadeaux conçues comme un **produit physique photographié** — chaque carte est une photographie illustrée distincte plutôt qu'un graphisme généré
- Rayon de carte de 12px + ombres ultra-douces maintiennent les cartes de contenu plates avec une légère impression de relief
- Échelle d'espacement en rem ancrée à 1,6rem (~16px) = `--space-3`, montant jusqu'à 6,4rem (~64px)

**Rythme de page en blocs de couleur :** Hero crème → Sections de contenu blanches → Bande fonctionnelle vert foncé (`#1E3932`) avec texte blanc → Zone utilitaire crème → Pied de page vert foncé (`#1E3932`) avec texte or / blanc — un signet espresso-sombre autour du corps lumineux.

## 2. Palette de Couleurs & Rôles

**Pages sources analysées :** page d'accueil, rewards, cartes cadeaux, détail produit (Pink Energy Drink), nutrition produit (Cold Brew).

### Primaire

- **Starbucks Green** (`#006241`) : Le vert de marque historique. Utilisé sur les titres h1, les en-têtes de section primaires sur la page Rewards, et comme signal de marque principal partout où une couleur dominante unique est nécessaire.
- **Green Accent** (`#00754A`) : Un vert légèrement plus vif et plus lumineux. La couleur principale des CTAs remplis (« Explore our afternoon menu », « See the spring menu ») et le remplissage du bouton circulaire Frap flottant.
- **House Green** (`#1E3932`) : Le vert de marque profond quasi-noir. Surface du pied de page, arrière-plans des bandes fonctionnelles, surfaces sombres des statuts de récompense, et la bande hero « Free coffee is just the beginning » sur Rewards.
- **Green Uplift** (`#2b5148`) : Un vert mi-foncé secondaire utilisé avec parcimonie sur les accents décoratifs et les moments de dégradé sombre.
- **Green Light** (`#d4e9e2`) : Un léger lavis vert menthe utilisé pour les teintes d'état de formulaire valide et les surfaces utilitaires vert clair.

### Secondaire & Accent

- **Gold** (`#cba258`) : Réservé presque exclusivement à la cérémonie de statut Rewards — callouts de niveau Gold, badges de partenariat (SkyMiles, Bonvoy), et accents à connotation premium. Jamais une couleur de marque polyvalente.
- **Gold Light** (`#dfc49d`) : Or plus doux pour les lavis de fond sur les sections de niveau gold.
- **Gold Lightest** (`#faf6ee`) : Lavis crème-or de surface de page utilisé sous les sections de partenariat sur la page Rewards — relie l'accent or au système neutre chaud.

### Surface & Arrière-plan

- **White** (`#ffffff`) : Surface principale des cartes et des modales. Également remplissage des tuiles de cartes cadeaux.
- **Neutral Cool** (`#f9f9f9`) : Surface gris frais subtil utilisée sur les menus déroulants (menu déroulant « Account »), les enveloppes de cartes de formulaires et les conteneurs utilitaires discrets.
- **Neutral Warm** (`#f2f0eb`) : La **toile de page principale** crème chaude pour les zones utilitaires Rewards et les bandes hero.
- **Ceramic** (`#edebe9`) : Un crème légèrement plus chaud/foncé pour les séparateurs de zones, les lavis de sections de page doux et la bande de partenariat Rewards.
- **Black** (`#000000`) : Encre profonde réservée à la bande CTA sombre en haut de page (« Join now ») et aux boutons de connexion en haut de nav à contraste élevé.

### Neutres & Texte

- **Text Black** (`rgba(0, 0, 0, 0.87)`) : Couleur principale des titres et du corps du texte sur les surfaces claires. Pas du noir pur — un noir à 87 % d'opacité qui se lit plus chaud.
- **Text Black Soft** (`rgba(0, 0, 0, 0.58)`) : Texte secondaire/métadonnées sur les surfaces claires.
- **Text White** (`rgba(255, 255, 255, 1)`) : Couleur principale des titres/corps du texte sur les surfaces vert foncé.
- **Text White Soft** (`rgba(255, 255, 255, 0.70)`) : Texte secondaire sur les surfaces vert foncé — descriptions des liens du pied de page, texte de légende.
- **Rewards Green** (`#33433d`) : Un vert ardoise doux dédié, utilisé uniquement dans les blocs de texte de la page Rewards — une couleur de lecture légèrement plus « terreuse » que Text Black qui signale « surface de récompense » sans utiliser le Starbucks Green complet.

### Sémantique & Accent

- **Red** (`#c82014`) : État d'erreur et destructif (formulaire invalide, actions destructives).
- **Yellow** (`#fbbc05`) : État d'avertissement, touche de marque historique.
- **Green Light** (`#d4e9e2` à 33 % d'opacité = `hsl(160 32% 87% / 33%)`) : Teinte de fond pour les champs de formulaire valides.
- **Red Tint** (`hsl(4 82% 43% / 5%)`) : Teinte de champ invalide sur les formulaires.

### Gammes Alpha Noir / Blanc

Deux gammes translucides parallèles pour les superpositions et le texte secondaire :
- `rgba(0,0,0,0.06)` à `rgba(0,0,0,0.90)` par paliers de 10 % — pour les superpositions sombres sur les surfaces claires
- `rgba(255,255,255,0.10)` à `rgba(255,255,255,0.90)` par paliers de 10 % — pour les superpositions claires sur les surfaces sombres

### Système de Dégradés

Aucun token de dégradé structurel observé. La hiérarchie des surfaces est en blocs de couleur solide tout au long — le système s'appuie sur sa palette de surfaces crème/vert à cinq niveaux plutôt que sur des dégradés.

## 3. Règles Typographiques

### Famille de Polices

- **Principale :** `SoDoSans, "Helvetica Neue", Helvetica, Arial, sans-serif` — la police d'entreprise propriétaire de Starbucks, utilisée sur quasiment toutes les surfaces
- **Fallback de chargement :** `"Helvetica Neue", Helvetica, Arial, sans-serif` — ce que voient les utilisateurs avant le chargement de SoDoSans
- **Rewards Serif :** `"Lander Tall", "Iowan Old Style", Georgia, serif` — utilisée sur des moments de titre spécifiques de la page Rewards pour un rendu éditorial chaleureux
- **Careers Script :** `"Kalam", "Comic Sans MS", cursive` — utilisée exclusivement pour les touches décoratives de « nom sur tasse » des pages Careers, faisant référence aux noms écrits à la main sur les tasses Starbucks

Aucun ensemble de fonctionnalités OpenType explicitement activé au niveau `:root`.

### Hiérarchie

| Rôle | Taille | Graisse | Hauteur de ligne | Interlettrage | Notes |
|------|--------|---------|-----------------|---------------|-------|
| Display (text-10) | 5,0rem / 80px | 400–600 | 1,2 | -0,16px | Plus grand affichage Rewards/hero |
| Jumbo (text-9) | 3,6rem / 58px | 400–600 | 1,2 | -0,16px | Titres hero secondaires |
| Hero Large (text-8) | 2,8rem / 45px | 400–600 | 1,2–1,5 | -0,16px | Titres de sections d'accueil |
| H1 | 24px | 600 | 36px | -0,16px | Titre principal couleur Starbucks Green |
| H2 | 24px | 400 | 36px | -0,16px | Titre de section à graisse normale en Text Black |
| Body Large | 19px | 400–600 | 33,25px (~1,75) | -0,16px | Texte d'intro hero, corps des bandes fonctionnelles |
| Body (text-3) | 1,6rem / 16px | 400 | 1,5 (24px) | -0,01em | Corps de texte par défaut |
| Small (text-2) | 1,4rem / ~14px | 400–600 | 1,5 | -0,01em | Libellé de bouton, métadonnées, libellés de formulaires |
| Micro (text-1) | 1,3rem / ~13px | 400 | 1,5 | -0,01em | État de libellé flottant actif, micro-texte de légende |
| Button Label | 14–16px | 400–600 | 1,2 | -0,01em | Tous les libellés de boutons en pilule |

**Tokens d'interlettrage :**
- `letterSpacingNormal` : `-0,01em` (par défaut — serré, caractéristique)
- `letterSpacingLoose` : `0,1em` (majuscules accentuées)
- `letterSpacingLooser` : `0,15em` (libellés en style majuscules, emphase extrême)

**Tokens de hauteur de ligne :**
- `lineHeightNormal` : `1,5` (corps)
- `lineHeightCompact` : `1,2` (affichage/boutons)

### Principes

- **L'approche négative serrée (`-0,01em`)** est appliquée presque universellement — l'ensemble du produit se lit légèrement compressé, ce qui confère à SoDoSans sa présence confiante sans paraître étouffée.
- **Les changements de graisse portent la hiérarchie, pas les changements de taille.** H1 et H2 partagent la même taille de 24px/36px ; seule la graisse (600 vs 400) et la couleur (Starbucks Green vs Text Black) les distinguent.
- **Les tokens de taille utilisent le rem, ancré à `1rem = 10px`** sur ce site (via une astuce `font-size: 62.5%` à la racine). Ainsi `1,6rem` = 16px, `2,4rem` = 24px, etc. L'échelle est sémantique (textSize-1 à textSize-10), pas des valeurs en pixels arbitraires.
- **Les changements de police spécifiques au contexte** — serif sur Rewards, script sur Careers — sont délibérés et localisés. Ne jamais les mélanger avec le sans-serif principal au sein d'une même surface.
- **Le texte du corps n'est jamais en noir pur** — il se situe à `rgba(0,0,0,0.87)` pour correspondre à la température de la toile neutre-chaude.

### Note sur les Substituts de Polices

SoDoSans est la propriété exclusive de Starbucks (sous licence de House Industries, non disponible publiquement). Substituts open source raisonnables :
- **Inter** (Google Fonts) — proportions humanistes géométriques similaires, large gamme de graisses
- **Manrope** — légèrement plus arrondi, sentiment similaire de confiance
- **Nunito Sans** — plus chaleureux, bon substitut pour une marque « café »

En cas de substitution, vérifier que le tracking serré de `-0,01em` / `-0,16px` se lit toujours bien ; certaines polices open source nécessitent `-0,005em` à la place.

Lander Tall (la serif Rewards) est personnalisée — substituts open source : **Iowan Old Style** (déjà dans le fallback), **Lora**, ou **Source Serif Pro**. Kalam (script Careers) est disponible directement sur Google Fonts.

## 4. Styles des Composants

### Boutons

**1. Rempli Principal — « Explore our afternoon menu / Sign up for free »**
- Arrière-plan : `#00754A` (Green Accent)
- Texte : `#ffffff`
- Bordure : `1px solid #00754A`
- Rayon : `50px` (pilule complète)
- Padding : `7px 16px`
- Police : SoDoSans, 16px, graisse 600, interlettrage `-0,01em`
- État actif : `transform: scale(0.95)` via `--buttonActiveScale`
- Transition : `all 0.2s ease`

**2. Contour Principal — « Give them a try / Start an order »**
- Arrière-plan : transparent
- Texte : `#00754A` (Green Accent)
- Bordure : `1px solid #00754A`
- Même rayon/padding/actif/transition que le Rempli Principal

**3. Rempli Noir — « Join now »**
- Arrière-plan : `#000000`
- Texte : `#ffffff`
- Bordure : `1px solid #000000`
- Rayon : `50px`, Padding : `7px 16px`
- Police : 14px, graisse 600
- Utilisé sur la bande de conversion en haut de page et les moments de conversion similaires

**4. Contour Sombre — « Sign in »**
- Arrière-plan : transparent
- Texte : `rgba(0, 0, 0, 0.87)` (Text Black)
- Bordure : `1px solid rgba(0, 0, 0, 0.87)`
- Rayon : `50px`, Padding : `7px 16px`
- Police : 14px, graisse 600

**5. Vert sur Vert Inversé — « See the spring menu »**
- Arrière-plan : `#ffffff`
- Texte : `#00754A`
- Bordure : `1px solid #ffffff`
- Utilisé quand la surface derrière le bouton est la bande House Green vert foncé — bouton blanc avec texte vert au lieu d'une pilule verte remplie sur fond vert

**6. Contour sur Fond Sombre — « Learn more / Order now »**
- Arrière-plan : transparent
- Texte : `#ffffff`
- Bordure : `1px solid #ffffff`
- Utilisé sur les bandes fonctionnelles vert foncé pour l'action secondaire associée à un CTA rempli blanc

**7. Consentement Accord (variante vert foncé)**
- Arrière-plan : `rgb(0, 130, 72)` (une variante de vert spécifique utilisée dans le module de consentement aux cookies)
- Texte : `#ffffff`
- Sans bordure, rayon `50px`, padding `7px 16px`, 14px / graisse 400
- Légèrement plus vif que Green Accent — réservé à l'action Accepter de la bannière de consentement

**8. Frap — Bouton de Commande Circulaire Flottant**
- Arrière-plan : `#00754A` (Green Accent)
- Icône : `#ffffff`
- Taille : `5,6rem / 56px` (standard), `4rem / 40px` (variante mini)
- Rayon : `50%` (cercle complet)
- Fixe en bas à droite, décalage tactile de `-0,8rem` pour plus de confort au toucher
- Pile d'ombres : base `0 0 6px rgba(0,0,0,0.24)` + ambient `0 8px 12px rgba(0,0,0,0.14)`
- État actif : l'ombre ambient disparaît en `0 8px 12px rgba(0,0,0,0)`
- C'est l'élément d'élévation signature du produit — il flotte au-dessus de chaque surface défilée

**9. Onglet de Retour d'Expérience Pleine Largeur — « Provide feedback »**
- Arrière-plan : `#00754A`
- Texte : `#ffffff`
- Rayon : `12px 12px 0px 0px` (arrondi uniquement en haut)
- Padding : `8px 16px`
- Police : 14px, graisse 400
- Positionné fixe en bas à droite dans la fenêtre, attaché au bord de la vue

### Cartes & Conteneurs

**Carte de Contenu (par défaut)**
- Arrière-plan : `#ffffff` (`--cardBackgroundColor`)
- Rayon : `12px` (`--cardBorderRadius`)
- Ombre : `0px 0px .5px 0px rgba(0,0,0,0.14), 0px 1px 1px 0px rgba(0,0,0,0.24)` (`--cardBoxShadow`)
- Utilisée pour : cartes fonctionnelles, tuiles d'articles de menu, panneaux de statut de récompense

**Tuile de Carte Cadeau**
- Arrière-plan : la photographie illustrée remplit la carte (pas de fond uni)
- Rayon : similaire aux cartes (`~12px`, légèrement plus serré sur les coins)
- Ombre : plus légère que la carte par défaut — ces cartes sont traitées comme des cartes physiques posées sur la toile
- Libellées par catégorie au-dessus de la grille de cartes (Spring, Thank You, Birthday, Celebration, Mother's Day, Appreciation, Encouragement, Milestones, Anytime)

**Cartes de Statut Rewards (signature de la page Rewards)**
- Grille à trois colonnes : Bronze / Gold / Silver-ish — chacune est un panneau vert foncé (`#1E3932`) avec :
  - Anneau d'en-tête avec dégradé/couleur coloré(e)
  - Badge numéroté « Level »
  - Titre de statut en grande graisse 600 SoDoSans
  - Liste d'étoiles / avantages en texte blanc/blanc translucide
  - Légende de progression en bas « As you earn more stars… »

**Carte de Partenariat (Rewards)**
- Arrière-plan : `#faf6ee` (Gold Lightest) surface crème chaude
- Contenu : logos des partenaires (« SkyMiles », « Bonvoy ») centrés, avec texte descriptif en dessous
- Rayon et ombre suivent la spécification de la carte par défaut

**Menu Déroulant (menu déroulant Account, nav supérieure)**
- Arrière-plan : `#f9f9f9` (Neutral Cool)
- Éléments du menu à `24px / graisse 400` en Text Black
- Sans bordure — simple changement de surface d'arrière-plan par rapport à la nav blanche

**Modale**
- Padding : `2,4rem` (`--modalPadding`)
- Padding supérieur : `8,8rem` (`--modalTopPadding`) — laisse de la place pour le bouton fermer / l'en-tête
- Padding vertical combiné : `11,2rem`
- Rayon hérite de la spécification de carte (`12px`)

### Inputs & Formulaires

**Input à Libellé Flottant**
- Le libellé flotte au-dessus de la bordure de l'input quand il est ciblé/rempli
- Taille de police du libellé sur bureau : `1,9rem` par défaut, s'anime à `1,4rem` quand actif
- Taille de police du libellé sur mobile : `1,6rem` par défaut, s'anime à `1,3rem` actif
- Décalage horizontal du libellé : `12px` depuis la gauche
- Translation du libellé actif : vers le haut à `-12px` avec translation Y `-50%`
- Padding du champ : `12px`
- Padding horizontal du formulaire : `1,6rem`
- Validation : le champ valide obtient une teinte `rgba(green-light, 0.33)` ; le champ invalide obtient une teinte `rgba(red, 0.05)`
- Transition : `0,3s option-label-marker-expansion cubic-bezier(0.32, 2.32, 0.61, 0.27)` sur l'input coché

**Icône d'Option (case à cocher/bouton radio)**
- Padding : `3px` intérieur
- Utilise l'animation cubic-bezier d'input coché ci-dessus (une courbe de dépassement légèrement « élastique » à 2,32)

### Navigation

**Nav Globale (barre supérieure)**
- Position fixe avec des hauteurs progressives : `64px` xs → `72px` mobile → `83px` tablette → `99px` bureau
- Pile d'ombres : `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` — élévation douce à trois couches
- Gauche : logo wordmark Starbucks, décalé de `99px` (md) / `131px` (lg) depuis le bord gauche
- Liens principaux en ligne en SoDoSans graisse 400–600 : Menu · Rewards · Gift Cards
- Droite : lien Find a store + Sign in (contour) + Join now (rempli noir)

**Sous-nav (deuxième barre, ex. Rewards interne)**
- Hauteur : `53px` (sous-nav globale) / `48px` (sous-nav interne)
- Typiquement un groupe d'onglets horizontal sous la nav globale

**Nav Mobile**
- Se réduit en tiroir hamburger sous le point de rupture tablette
- Le bouton flottant Frap persiste en bas à droite quel que soit l'état de la nav

### Traitement des Images

- **Photographie hero** : Les photos de produits (boissons en verre transparent avec arrière-plans colorés — corail, sauge, ambre chaud) occupent ~40vw d'une mise en page hero divisée ; le texte occupe les 60vw restants (`--headerCrateProportion: 40vw` / `--contentCrateProportion: 60vw`)
- **Illustrations de cartes cadeaux** : Chaque carte est une photographie illustrée distincte (touche peinte, allure dessinée à la main, palette de couleurs chaudes). Jamais de graphismes génériques.
- **Imagerie de cérémonie Rewards** : Photographies d'écrans de l'application Starbucks Rewards tenues en main, compositions en angle — photographie de produit en contexte.
- **Miniatures du menu** : Photographie de produit carrée ou 4:3 avec des arrière-plans blancs/crème propres, légère ombre portée douce autour du verre.
- **Fondu des images** : transition `opacity 0.3s ease-in` au chargement de l'image (`--imageFadeTransition`).

### Bande Fonctionnelle (bande hero vert foncé)

Section pleine largeur `#1E3932` (House Green) avec :
- Gauche : titre blanc + sous-titre + rangée de CTAs
- Droite : photographie de produit ou illustration
- Ratio de division ~40/60 ou 50/50 selon la section
- Texte blanc partout avec `rgba(255,255,255,0.70)` pour la copie secondaire
- Les CTAs suivent l'association Vert sur Vert Inversé (rempli blanc) + Contour sur Fond Sombre (contour blanc)

### Extenseur / Accordéon

- Durée : `300ms` (`--expanderDuration`)
- Courbe de timing : `cubic-bezier(0.25, 0.46, 0.45, 0.94)` — un ease-out mesuré
- Utilisé pour les sections FAQ sur Rewards et la page des cartes cadeaux

### Module de Consentement aux Cookies

Carte modale vert foncé en haut de page avec les boutons « Agree » (rempli vert) et « Manage preferences » (contour). Apparaît à la première visite ; pouvant être fermée.

### Composants de Détail Produit (cluster signature PDP)

Un cluster de composants répétitif utilisé sur les pages de produits du menu (ex. `/menu/product/40498/iced` pour le détail d'une boisson, `/menu/product/.../nutrition` pour les informations nutritionnelles). Ces composants étendent l'inventaire des composants sans modifier les tokens.

**Sélecteur d'Options de Taille**
- Rangée horizontale de 4 boutons icône de tasse (Tall / Grande / Venti / Trenta)
- Chaque élément : icône silhouette de tasse en haut, nom de taille en dessous (16/700 en Starbucks Green), légende en onces liquides (13/400 en Text Black Soft)
- État actif : un anneau circulaire vert (`2px solid #00754A`) autour de l'icône de tasse sélectionnée
- Inactif : pas d'anneau, même typographie
- Rangée pleine largeur, espacement égal
- Rayon du conteneur : `12px` ou plat ; les icônes individuelles sont circulaires `50%`
- Padding : `16px 24px` interne

**Sélecteur d'Ajout / Lait (rectangle en contour)**
- Arrière-plan : `#ffffff`
- Bordure : `1px solid #d6dbde` (Input Border)
- Rayon : `4px`
- Pleine largeur dans sa colonne
- Libellé flottant au-dessus de la bordure supérieure : « Add-ins » / « Milk » / « Add-ins » — 13/700 en Text Black, majuscules, interlettrage `0,325px`
- Valeur affichée centrée (ex. « Ice », « Coconut », « Strawberry Fruit Inclusions scoop ») : 16/400 Text Black
- Icône chevron vers le bas à droite en Text Black Soft
- Focus : la bordure passe en Green Accent (`#00754A`)

**Pas Numérique**
- Intégré dans une rangée d'ajout quand une quantité est requise (ex. cuillère de Strawberry Fruit Inclusions)
- Bouton `−` moins + nombre de comptage + bouton `+` plus, tous en ligne à droite du libellé
- Boutons : circulaires `32×32px` avec bordure `1px solid #d6dbde`, icône gris neutre
- Nombre de comptage : 16/700 Text Black centré

**Bouton Personnaliser**
- Arrière-plan : `#ffffff`
- Texte : `#00754A` (Green Accent)
- Bordure : `1.5px solid #00754A`
- Rayon : `50px` (pilule complète)
- Padding : `14px 40px` (nettement plus grand que les pilules par défaut — c'est une action primaire secondaire)
- Libellé : « Customize » avec une icône paillette dorée ✨ intégrée à gauche
- Utilisé pour : entrer dans le flux de personnalisation de boisson après la sélection de taille/lait

**Bouton Ajouter à la Commande (PDP)**
- Arrière-plan : `#00754A` (Green Accent)
- Texte : `#ffffff`
- Rayon : `50px`
- Padding : `14px 32px`
- Épinglé en haut à droite de la carte produit et/ou aligné à droite dans la bande de disponibilité en magasin
- Même comportement actif scale(0.95) que les autres CTAs principaux

**Pilule de Coût Rewards — « 200★ item »**
- Arrière-plan : transparent
- Bordure : `1px solid #cba258` (Gold)
- Texte : `#cba258` (Gold)
- Rayon : `50px` (pilule complète)
- Padding : `4px 12px`
- Contenu : « 200★ item » où `★` est un petit glyphe d'étoile pleine — indique le nombre d'étoiles Rewards nécessaires pour échanger cet article
- Police : Proxima Nova 13/700 avec interlettrage `0,5px`
- Utilisée uniquement sur les produits échangeables avec des Rewards

**Bande de Description Produit**
- Bande pleine largeur vert foncé (`#1E3932` House Green)
- Contient de haut en bas :
  1. Pilule de Coût Rewards (or) si applicable
  2. Texte de description du produit en blanc (16/400/1,5)
  3. Résumé nutritionnel en ligne (« 140 calories, 25g sugar, 2.5g fat ») avec infobulle d'icône — 14/700 blanc
  4. Bouton pilule blanc-contour-sur-vert « Full nutrition & ingredients list »
- Padding : `32px` vertical
- Apparaît sous la bande d'en-tête principale du produit

**Tableau des Ingrédients / Informations Nutritionnelles**
- Mise en page à deux colonnes sur la page Nutrition
- Colonne gauche : en-tête « Ingredients » + liste ou texte de remplacement « Not available for this item » avec un paragraphe explicatif en Text Black Soft 14/400
- Colonne droite : en-tête « Nutrition » + rangées libellé/valeur
- Chaque rangée : libellé de nutriment (Proxima Nova 14/400) à gauche, valeur (ex. « 140 calories », « 25g », « 205 mg** ») à droite, séparés par un filet `1px solid #e7e7e7` en dessous
- Note de bas de page pour les marqueurs de caféine/astérisque en 13/400 Text Black Soft en bas
- Modèle réutilisable pour les tableaux d'informations nutritionnelles conformes à la réglementation

**Sélecteur de Disponibilité en Magasin**
- Apparaît sur la bande fonctionnelle vert foncé au-dessus de la rangée d'options de taille
- Rectangle arrondi pleine largeur avec intérieur blanc translucide
- Texte : « For item availability, choose a store » en blanc, 14/400
- Côté droit : affordance chevron vers le bas + icône SVG sac de shopping en contour blanc
- Rayon : `4px`
- Hauteur : ~48px

**Fil d'Ariane PDP**
- Trace « Menu / Refreshers / Pink Energy Drink » au-dessus du titre du produit
- Séparateur : caractère `/` en Text Black Soft
- La page actuelle n'est pas liée, les pages précédentes sont des liens soulignés en vert accent
- Police : 14/400 Proxima Nova
- Apparaît sur toutes les pages PDP

**Lien Chevron Retour (sous-pages nutrition / détail PDP)**
- Lien texte « ← Back » au-dessus des en-têtes de section sur la page nutrition
- Texte en Green Accent (`#00754A`) 14/700 Proxima Nova
- Chevron gauche `<` dans le même vert
- Alternative au fil d'ariane complet sur les sous-pages profondes

## 5. Principes de Mise en Page

### Système d'Espacement

Échelle sémantique en rem (ancrée à `1rem = 10px`) :

| Token | Rem | Pixels | Utilisation typique |
|-------|-----|--------|--------------------|
| `--space-1` | `0,4rem` | 4px | Padding en ligne le plus serré |
| `--space-2` | `0,8rem` | 8px | Petit espace, padding vertical des boutons |
| `--space-3` | `1,6rem` | 16px | Par défaut — padding des cartes, gouttière extérieure xs |
| `--space-4` | `2,4rem` | 24px | Espacement interne de section, gouttière extérieure md |
| `--space-5` | `3,2rem` | 32px | Espacement majeur entre sections |
| `--space-6` | `4rem` | 40px | Grands espaces, gouttière extérieure lg, caisse d'en-tête |
| `--space-7` | `4,8rem` | 48px | Espacement section à section |
| `--space-8` | `5,6rem` | 56px | Très grand espace — hauteur du Frap |
| `--space-9` | `6,4rem` | 64px | Padding de section le plus large |

**Tokens de gouttière :**
- `--outerGutter: 1,6rem` (16px, par défaut / mobile)
- `--outerGutterMedium: 2,4rem` (24px, tablette)
- `--outerGutterLarge: 4,0rem` (40px, bureau)

**Constante de rythme universel :** `1,6rem` (16px) apparaît sur chaque page comme gouttière extérieure par défaut, référence de padding des cartes et taille 3 du corps du texte — l'unité d'espacement la plus fréquente du système.

### Grille & Conteneur

- Échelle de largeur de colonnes : `--columnWidthSmall: 343px` / `Medium: 500px` / `Large: 720px` / `XLarge: 1440px`
- La grille de cartes cadeaux utilise une grille responsive de 3 à 5 colonnes de tuiles `~343px`
- Section de statut Rewards : panneaux vert foncé à 3 colonnes aux points de rupture `lg+`
- Hero : division asymétrique 40 % (image) / 60 % (contenu) via `--headerCrateProportion` / `--contentCrateProportion`

### Philosophie de l'Espace Blanc

L'espace blanc porte la sensation de « beaucoup d'espace dans le café ». Le padding des sections penche vers le généreux (40–64px). Les blocs de contenu sont séparés par des espaces blancs plutôt que des séparateurs. La toile crème (`#f2f0eb`) est elle-même une respiration visuelle entre les cartes blanches et les bandes fonctionnelles vertes.

### Échelle des Rayons de Bordure

| Valeur | Utilisation |
|--------|-------------|
| `12px` | Cartes, modales, tuiles d'articles de menu (`--cardBorderRadius`) |
| `12px 12px 0 0` | Onglet de retour d'expérience pleine largeur (arrondi uniquement en haut) |
| `50px` | Tous les boutons — rayon pilule complète (`--buttonBorderRadius`) |
| `50%` | Icônes circulaires, bouton flottant Frap, miniatures d'avatar |
| Spécial | `3,3333%/5,298%` elliptique pour les maquettes Starbucks-Visa-Card (`--svcRoundedCorners`) |

## 6. Profondeur & Élévation

| Niveau | Traitement | Utilisation |
|--------|-----------|-------------|
| Carte | `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)` | Cartes de contenu par défaut — double ombre ultra-douce |
| Nav Globale | `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` | Élévation douce à triple couche sur la barre supérieure fixe |
| Frap Base | `0 0 6px rgba(0,0,0,0.24)` | Halo de base autour du CTA circulaire flottant |
| Frap Ambient | `0 8px 12px rgba(0,0,0,0.14)` | Ambient directionnel empilé — fait flotter le Frap vers l'avant |
| Carte Cadeau | Légère ombre portée autour de la photographie illustrée | Effet de carte physique pour les tuiles de cadeaux |
| Starbucks Card (SVC) | `drop-shadow(0 4px 1px rgba(0,0,0,0.11)) drop-shadow(0 0 2px rgba(0,0,0,0.24))` | Ombres de filtre SVG empilées pour les visuels Starbucks Card |

**Philosophie des ombres :** Ultra-douces, en couches sur du solide — le système ne recourt jamais à une seule ombre portée lourde. Il empile plutôt 2 à 3 ombres à faible alpha avec des décalages différents pour simuler l'éclairage ambient + direct du monde réel. Le bouton Frap est l'élément le plus élevé sur chaque page.

### Profondeur Décorative

- **Pas de système de dégradés** — les surfaces sont en blocs de couleur solide
- **Les bandes en blocs de couleur** portent la profondeur perçue (les bandes vert foncé se lisent comme des « zones fonctionnelles en retrait » entre les sections crème/blanc)
- **Les ombres de filtre SVG** sur les visuels Starbucks Card ajoutent une légère physicalité 3D sans box-shadow

## 7. À Faire & À Éviter

### À Faire
- Utiliser Neutral Warm (`#f2f0eb`) ou Ceramic (`#edebe9`) comme toile de page au lieu du blanc pur — la crème chaude est la signature
- Assigner les niveaux de vert à leur rôle de surface prévu — Starbucks Green pour les titres, Green Accent pour les CTAs, House Green pour les bandes profondes, Uplift pour le décoratif
- Maintenir le tracking serré à `-0,01em` / `-0,16px` sur SoDoSans dans l'ensemble du système
- Utiliser un rayon en pilule complète de 50px sur chaque bouton sans exception
- Appliquer `transform: scale(0.95)` comme état actif universel des boutons
- Réserver l'or exclusivement aux moments de cérémonie de statut Rewards
- Utiliser SoDoSans pour presque tout ; passer à la serif Lander Tall uniquement pour les titres éditoriaux Rewards ; réserver le script Kalam pour les moments de « nom sur tasse » Careers
- Empiler 2 à 3 ombres à faible alpha plutôt qu'une seule ombre portée plus lourde pour l'élévation
- Utiliser le CTA circulaire Frap comme point d'entrée de commande flottant persistant sur chaque surface marchande
- Laisser la toile crème respirer entre les cartes de contenu — utiliser l'espace blanc, pas les séparateurs

### À Éviter
- Ne pas utiliser le blanc pur comme toile de page — la température crème chaude est structurellement importante
- Ne pas choisir « un seul vert de marque » — le système à quatre verts est intentionnel ; utiliser uniquement `#006241` partout aplatit la marque
- Ne pas utiliser l'or comme accent polyvalent — c'est un signal Rewards uniquement
- Ne pas arrondir les coins des boutons au carré — la pilule de 50px est universelle
- Ne pas introduire de remplissages dégradés — le système est en blocs de couleur tout au long
- Ne pas différencier h1 et h2 par la taille — la hiérarchie vient de la graisse + couleur (600 Starbucks Green vs 400 Text Black)
- Ne pas utiliser le noir pur pour le corps du texte — `rgba(0,0,0,0.87)` correspond à la toile chaude
- Ne pas omettre le retour actif `scale(0.95)` sur les boutons — c'est une micro-interaction signature
- Ne pas empiler des ombres uniques lourdes ; toujours en coucher 2 à 3 à faible alpha
- Ne pas introduire de serif ou de scripts dans le flux d'achat principal — ils appartiennent respectivement aux contextes Rewards et Careers

## 8. Comportement Responsive

### Points de Rupture

Déduits des tokens de largeur de composants et des hauteurs progressives de nav :

| Nom | Largeur | Changements clés |
|-----|---------|-----------------|
| xs | < 480px | Nav globale 64px ; menu hamburger ; mises en page à une colonne ; boutons pilule pleine largeur |
| Mobile | 480–767px | Nav globale 72px ; grille de cartes cadeaux 2 colonnes ; padding des cartes réduit |
| Tablette | 768–1023px | Nav globale 83px ; grille de cartes cadeaux 3 colonnes ; début de la division hero |
| Bureau | 1024–1439px | Nav globale 99px ; grille de cartes cadeaux 4 colonnes ; hero asymétrique complet 40/60 |
| XLarge | 1440px+ | Contenu limité à `--columnWidthXLarge` ; grille de cartes cadeaux 5 colonnes ; marges crème supplémentaires |

### Cibles Tactiles

- Les boutons pilule avec padding `7px 16px` mesurent ~32px de hauteur — en dessous du minimum WCAG AAA de 44px pour les surfaces tactiles uniquement. Sur mobile, le padding des boutons peut être visuellement élargi pour atteindre le minimum.
- Le bouton circulaire flottant Frap à `56px` est bien au-dessus du minimum.
- Le Frap utilise `--frapTouchOffset: calc(-1 * .8rem)` pour étendre la zone de toucher de 8px au-delà du bord visuel.
- Les inputs à libellé flottant augmentent la taille de police du libellé sur mobile (base 1,6rem vs 1,9rem bureau) — plus facile à toucher et à lire à bout de bras.

### Stratégie de Réduction

- **La hauteur de la nav globale évolue progressivement** : 64 → 72 → 83 → 99px selon les points de rupture, pas une valeur unique
- **La division hero se réduit** : division asymétrique 40/60 → empilé (image en haut, contenu en dessous) sur mobile
- **Grille de cartes cadeaux** : 5 colonnes → 4 → 3 → 2 → 1 selon les points de rupture avec des largeurs de carte ajustées
- **Bandes fonctionnelles** : restent pleine largeur mais le texte + l'imagerie s'empilent verticalement sur mobile
- **Gouttière extérieure évolue** : 16px → 24px → 40px à mesure que la fenêtre s'agrandit
- **Panneaux de statut Rewards à 3 colonnes** : s'empilent en colonne unique sur mobile

### Comportement des Images

- La photographie de produit hero se recadre plus serrée verticalement sur mobile ; le contenu devient l'ancre visuelle
- Les illustrations des cartes cadeaux préservent le ratio d'aspect ; la grille de cartes se redistribue
- Transition de fondu `opacity 0.3s ease-in` au chargement de l'image (prévient l'apparition brusque)
- La photographie de l'application Rewards-en-main évolue proportionnellement ; ne s'étire jamais

## 9. Guide de Prompt pour Agents

### Référence Rapide des Couleurs

- CTA principal : « Green Accent (`#00754A`) »
- Texte CTA principal : « White (`#ffffff`) »
- Titre de marque : « Starbucks Green (`#006241`) »
- Bande fonctionnelle / pied de page : « House Green (`#1E3932`) »
- Toile de page : « Neutral Warm (`#f2f0eb`) »
- Toile de carte : « White (`#ffffff`) »
- Texte des titres sur fond clair : « Text Black (`rgba(0,0,0,0.87)`) »
- Corps du texte sur fond clair : « Text Black Soft (`rgba(0,0,0,0.58)`) »
- Corps du texte sur fond vert foncé : « Text White Soft (`rgba(255,255,255,0.70)`) »
- Accent Rewards : « Gold (`#cba258`) »
- Texte Rewards : « Rewards Green (`#33433d`) »
- Destructif : « Red (`#c82014`) »

### Exemples de Prompts de Composants

1. « Crée un bouton pilule CTA principal Starbucks avec un arrière-plan Green Accent (`#00754A`), texte blanc « Explore our afternoon menu », police SoDoSans à 16px graisse 600 avec interlettrage `-0,01em`, `border-radius: 50px` (pilule complète), padding `7px 16px`. Applique `transform: scale(0.95)` comme état actif avec une transition `0.2s ease`. »

2. « Conçois une carte de contenu avec un arrière-plan White (`#ffffff`) à `border-radius: 12px`, ombre en couches `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)`. Padding du contenu `16–24px` (`--space-3` à `--space-4`). Placée sur une toile de page Neutral Warm (`#f2f0eb`) avec un espace de `16px` par rapport aux éléments adjacents. »

3. « Construis le bouton de commande circulaire flottant Frap — diamètre `56px`, remplissage Green Accent (`#00754A`), icône sac de shopping blanc centré. Ombres en couches : `0 0 6px rgba(0,0,0,0.24)` + `0 8px 12px rgba(0,0,0,0.14)`. Position fixe en bas à droite avec un décalage tactile de `-0,8rem`. L'état actif fait disparaître l'ombre ambient en `0 8px 12px rgba(0,0,0,0)` avec `scale(0.95)`. »

4. « Construis une bande fonctionnelle vert foncé — section pleine largeur avec arrière-plan House Green (`#1E3932`). Colonne gauche : titre h2 SoDoSans blanc à 24px graisse 600, suivi d'un paragraphe de corps Text White Soft (`rgba(255,255,255,0.70)`) et d'une rangée de CTAs avec deux boutons (rempli blanc avec texte Green Accent pour le principal, Outlined-on-Dark bordure blanche pour le secondaire). Colonne droite : photographie de produit. Ratio de division 40/60, empilé verticalement en dessous de `768px`. »

5. « Crée une carte de statut Rewards — panneau House Green (`#1E3932`) avec `border-radius: 12px`, bande supérieure dégradée colorée (niveau Bronze/Silver/Gold). Titre en SoDoSans 24px graisse 600 en blanc. Liste des avantages en puces blanches avec légendes secondaires `rgba(255,255,255,0.70)`. Texte de progression en bas en Text White Soft. Empile 3 panneaux en grille à `lg+`, colonne unique sur mobile. »

6. « Conçois une tuile de carte cadeau — rayon de carte correspondant à `12px`, remplie d'une photographie illustrée (touche aquarelle peinte à la main) comme surface complète. Légère ombre portée donnant l'impression d'une carte physique sur la toile crème. Regroupe sous un libellé de catégorie (« Spring », « Thank You », « Birthday ») en SoDoSans 24px graisse 400 au-dessus de la grille. »

7. « Crée un en-tête de détail produit Starbucks — bande House Green (`#1E3932`) avec fil d'ariane « Menu / Refreshers / Pink Energy Drink » en blanc 14/400 au-dessus du titre du produit en SoDoSans 32/700 majuscules blanc. Photographie du produit centrée sous le titre. Sous la photo : rangée de sélecteur de taille à 4 icônes de tasse — chaque bouton icône de tasse montre une silhouette de tasse verticale, le nom de la taille (« Tall » / « Grande » / « Venti » / « Trenta ») en blanc 16/700, et les onces liquides en Text White Soft 13/400. La taille sélectionnée entoure l'icône de tasse d'un anneau circulaire `2px solid #00754A`. »

8. « Construis un flux de personnalisation Starbucks — sous le sélecteur de taille, 3 rangées d'input en rectangle contour empilées (fond blanc, bordure `1px solid #d6dbde`, rayon `4px`). Chacune a un libellé flottant (« Add-ins », « Milk », « Add-ins ») au-dessus de la bordure supérieure en Text Black majuscules 13/700. Valeur centrée (ex. « Ice », « Coconut »). Côté droit : chevron vers le bas en Text Black Soft. Pour la rangée de cuillère, intègre un pas numérique (`−` `1` `+` avec des boutons contour circulaires `32px`). Sous les trois champs : pilule verte contour « Customize » avec icône paillette dorée, rayon `50px`, padding `14px 40px`. Associe avec une pilule remplie Green Accent « Add to Order » dans la même rangée. »

9. « Conçois une bande de description de produit Starbucks — House Green (`#1E3932`) pleine largeur sous l'en-tête de produit. En haut : une Pilule de Coût Rewards contour doré « 200★ item » (rayon `50px`, padding `4px 12px`, bordure et texte or `#cba258`). En dessous : description du produit en blanc 16/400/1,5. Résumé nutritionnel en ligne en blanc 14/700 (« 140 calories, 25g sugar, 2.5g fat ») avec infobulle d'icône. Bouton pilule blanc-contour-sur-vert « Full nutrition &amp; ingredients list ». Padding vertical de 32px. »

10. « Crée un tableau d'informations nutritionnelles Starbucks — mise en page à deux colonnes dans une carte White. Colonne gauche : en-tête « Ingredients » (24/400 Text Black), suivi d'une liste d'ingrédients ou d'un paragraphe de remplacement « Not available for this item » en 14/400 Text Black Soft. Colonne droite : en-tête « Nutrition », puis rangées libellé/valeur (nom du nutriment à gauche, valeur à droite) séparées par des filets `1px solid #e7e7e7`. Typographie : libellés en 14/400 Text Black, valeurs en 14/700 Text Black alignées à droite. Notes de bas de page avec marqueurs astérisque en 13/400 Text Black Soft en bas. »

### Guide d'Itération

Lors du raffinement des écrans existants générés avec ce design system :
1. Se concentrer sur UN composant à la fois
2. Référencer les noms de couleurs spécifiques et les codes hex de ce document
3. Utiliser des descriptions en langage naturel (« toile crème chaude », « système vert à quatre niveaux ») en parallèle des valeurs exactes
4. Préserver universellement la pilule de 50px + l'état actif `scale(0.95)`
5. Vérifier que les verts sont assignés à leur rôle correct (Green Accent pour les CTAs, Starbucks Green pour les titres, House Green pour les bandes)
6. Ne pas introduire de dégradés — le système est en blocs de couleur
7. Maintenir le tracking SoDoSans à `-0,01em` / `-0,16px` partout

### Lacunes Connues

- SoDoSans est une police propriétaire non disponible sur Google Fonts — lors d'une implémentation publique, utiliser Inter ou Manrope comme substitut et documenter le remplacement
- Lander Tall (serif Rewards) est également personnalisée — substituer avec Iowan Old Style, Lora, ou Source Serif Pro
- Les timings d'animation spécifiques par composant au-delà des quelques documentés (`--duration: 0.4s`, `--iconTransition: all ease-out 0.2s`, `--expanderDuration: 300ms`) ne sont pas capturés pour chaque surface interactive
- Le style complet de l'état d'erreur de formulaire (graisse de bordure rouge, placement de l'icône) visible sur le token de teinte mais pas entièrement extrait
- Les composants spécifiques aux pages Careers (carte nom sur tasse, grille radio de recherche) sont référencés dans les noms de tokens mais non couverts par cette extraction
- Les spécifications détaillées de maquette Starbucks Visa Card / Starbucks-Card (SVC) sont suggérées par les tokens `--svcRoundedCorners` et `--svcShadowFilter` mais pas entièrement documentées
