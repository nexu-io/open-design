# Système de design inspiré d'Uber

> Category: Médias & Consommateurs
> Plateforme de mobilité. Noir et blanc affirmé, typographie serrée, énergie urbaine.

## 1. Thème visuel & atmosphère

Le langage design d'Uber est un véritable cours magistral de minimalisme assumé -- un univers noir et blanc où chaque pixel sert un objectif et rien ne décore sans avoir mérité sa place. L'expérience entière repose sur une dualité tranchée : noir de jais (`#000000`) et blanc pur (`#ffffff`), avec pratiquement aucun gris intermédiaire pour diluer le message. Ce n'est pas le minimalisme stérile d'une startup qui n'a pas fini de se designer -- c'est la retenue délibérée d'une marque si établie qu'elle peut se permettre de chuchoter.

La police signature UberMove est une sans-serif géométrique propriétaire au caractère distinctement carré et ingénié. Les titres en UberMove Bold à 52px portent le poids d'un panneau d'affichage -- autoritaires, directs, sans compromis. La police complémentaire UberMoveText gère le corps de texte et les boutons avec un caractère légèrement plus doux et lisible en graissse moyenne (500). Ensemble, elles créent un système typographique qui évoque une carte de transport : clair, efficace, conçu pour être parcouru rapidement.

Ce qui rend le design d'Uber véritablement distinctif, c'est l'utilisation de photographies et d'illustrations à fond perdu associées à des éléments interactifs en forme de pilule (border-radius 999px). Les chips de navigation, les boutons CTA et les sélecteurs de catégories partagent tous cette forme de capsule, créant un langage d'interface tactile et adapté aux pouces, reconnaissable entre tous comme du Uber. Les illustrations -- des scènes chaleureuses et légèrement stylisées de conducteurs, de passagers et de paysages urbains -- injectent de l'humanité dans ce qui pourrait autrement être un système froid et monochrome. Le site alterne entre sections de contenu blanches et un pied de page entièrement noir, avec des mises en page en cartes utilisant les ombres les plus légères possibles (rgba(0,0,0,0.12-0.16)) pour créer une légère profondeur sans briser l'esthétique plate.

**Caractéristiques clés :**
- Fondation purement noir et blanc avec pratiquement aucun gris intermédiaire dans le chrome de l'interface
- UberMove (titres) + UberMoveText (corps/UI) -- famille de sans-serif géométriques propriétaires
- Tout en forme de pilule : boutons, chips, éléments de navigation utilisent tous un border-radius de 999px
- Illustrations chaleureuses et humaines contrastant avec l'interface monochrome stricte
- Mise en page en cartes avec des ombres ultra-douces (opacité 0,12-0,16)
- Grille d'espacement 8px avec des mises en page compactes et denses en information
- Photographies audacieuses intégrées en arrière-plans hero à fond perdu
- Pied de page noir ancrant la page dans un environnement sombre à contraste élevé

## 2. Palette de couleurs & rôles

### Primaires
- **Uber Black** (`#000000`) : La couleur définissant la marque -- utilisée pour les boutons primaires, les titres, le texte de navigation et le pied de page. Pas « presque noir » ou « noir cassé », mais un vrai noir sans compromis.
- **Pure White** (`#ffffff`) : La couleur de surface principale et le texte inversé. Utilisé pour les fonds de page, les surfaces de cartes et le texte sur les éléments noirs.

### États interactifs & boutons
- **Hover Gray** (`#e2e2e2`) : État hover des boutons blancs -- un gris clair, propre et froid, offrant un retour visuel clair sans chaleur.
- **Hover Light** (`#f3f3f3`) : Hover subtil pour les boutons blancs surélevés -- un gris à peine perceptible pour un retour d'interaction doux.
- **Chip Gray** (`#efefef`) : Arrière-plan pour les boutons secondaires/filtres et les chips de navigation -- un gris neutre et ultra-clair.

### Texte & contenu
- **Body Gray** (`#4b4b4b`) : Texte secondaire et liens du pied de page -- un vrai gris moyen sans biais chaud ou froid.
- **Muted Gray** (`#afafaf`) : Texte tertiaire, liens de pied de page atténués et contenu placeholder.

### Bordures & séparations
- **Border Black** (`#000000`) : Bordures fines d'1px pour la délimitation structurelle -- utilisées avec parcimonie sur les séparateurs et les conteneurs de formulaires.

### Ombres & profondeur
- **Shadow Light** (`rgba(0, 0, 0, 0.12)`) : Élévation standard des cartes -- un lift plume pour les cartes de contenu.
- **Shadow Medium** (`rgba(0, 0, 0, 0.16)`) : Élévation légèrement plus forte pour les boutons d'action flottants et les overlays.
- **Button Press** (`rgba(0, 0, 0, 0.08)`) : Ombre intégrée pour les états actifs/enfoncés des boutons secondaires.

### États des liens
- **Default Link Blue** (`#0000ee`) : Bleu navigateur standard pour les liens textuels soulignés -- utilisé dans le contenu du corps.
- **Link White** (`#ffffff`) : Liens sur surfaces sombres -- utilisé dans le pied de page et les sections sombres.
- **Link Black** (`#000000`) : Liens sur surfaces claires avec décoration de soulignement.

### Système de dégradés
- Le design d'Uber est **entièrement sans dégradé**. La dualité noir/blanc et les blocs de couleur plats créent toute la hiérarchie visuelle. Aucun dégradé n'apparaît nulle part dans le système -- chaque surface est une couleur solide, chaque transition est un bord dur ou une ombre.

## 3. Règles typographiques

### Famille de polices
- **Titre/Display** : `UberMove`, avec replis : `UberMoveText, system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Corps/UI** : `UberMoveText`, avec replis : `system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`

*Note : UberMove et UberMoveText sont des polices propriétaires. Pour les implémentations externes, utilisez `system-ui` ou Inter comme substitut le plus proche disponible. Le caractère géométrique et aux proportions carrées d'UberMove peut être approximé avec Inter ou DM Sans.*

### Hiérarchie

| Rôle | Police | Taille | Graisse | Hauteur de ligne | Notes |
|------|------|------|--------|-------------|-------|
| Display/Hero | UberMove | 52px (3,25rem) | 700 | 1,23 (serré) | Impact maximum, présence panneau publicitaire |
| Titre de section | UberMove | 36px (2,25rem) | 700 | 1,22 (serré) | Ancres de sections principales |
| Titre de carte | UberMove | 32px (2rem) | 700 | 1,25 (serré) | Titres de cartes et fonctionnalités |
| Sous-titre | UberMove | 24px (1,5rem) | 700 | 1,33 | En-têtes de sections secondaires |
| Petit titre | UberMove | 20px (1,25rem) | 700 | 1,40 | Titres compacts, titres de listes |
| Nav/UI grand | UberMoveText | 18px (1,13rem) | 500 | 1,33 | Liens de navigation, texte UI proéminent |
| Corps/Bouton | UberMoveText | 16px (1rem) | 400-500 | 1,25-1,50 | Texte de corps standard, libellés de boutons |
| Légende | UberMoveText | 14px (0,88rem) | 400-500 | 1,14-1,43 | Métadonnées, descriptions, petits liens |
| Micro | UberMoveText | 12px (0,75rem) | 400 | 1,67 (détendu) | Petits caractères, textes légaux |

### Principes
- **Titres en gras, corps en moyenne** : Les titres UberMove sont exclusivement en graisse 700 (gras) -- chaque titre frappe avec la force d'un panneau publicitaire. Le corps et le texte UI en UberMoveText utilisent 400-500, créant une hiérarchie visuelle claire par contraste de graisse.
- **Hauteurs de ligne serrées pour les titres** : Tous les titres utilisent des hauteurs de ligne entre 1,22-1,40 -- compactes et percutantes, conçues pour être survolées plutôt que lues.
- **Typographie fonctionnelle** : Il n'y a aucun traitement typographique décoratif nulle part. Aucun espacement des lettres, aucune transformation de texte, aucun dimensionnement ornemental. Chaque élément textuel sert un objectif de communication direct.
- **Deux polices, rôles stricts** : UberMove est exclusivement pour les titres. UberMoveText est exclusivement pour le corps, les boutons, les liens et l'UI. La frontière n'est jamais franchie.

## 4. Styles des composants

### Boutons

**Primaire Noir (CTA)**
- Arrière-plan : Uber Black (`#000000`)
- Texte : Pure White (`#ffffff`)
- Rembourrage : 10px 12px
- Rayon : 999px (pilule complète)
- Contour : aucun
- Focus : bague intégrée `rgb(255,255,255) 0px 0px 0px 2px`
- Le bouton d'action primaire -- en gras, à fort contraste, impossible à manquer

**Secondaire Blanc**
- Arrière-plan : Pure White (`#ffffff`)
- Texte : Uber Black (`#000000`)
- Rembourrage : 10px 12px
- Rayon : 999px (pilule complète)
- Hover : l'arrière-plan passe à Hover Gray (`#e2e2e2`)
- Focus : l'arrière-plan passe à Hover Gray, bague intégrée apparaît
- Utilisé sur les surfaces sombres ou comme action secondaire aux côtés du Primaire Noir

**Chip/Filtre**
- Arrière-plan : Chip Gray (`#efefef`)
- Texte : Uber Black (`#000000`)
- Rembourrage : 14px 16px
- Rayon : 999px (pilule complète)
- Actif : ombre intégrée `rgba(0,0,0,0.08)`
- Chips de navigation, sélecteurs de catégories, bascules de filtres

**Action flottante**
- Arrière-plan : Pure White (`#ffffff`)
- Texte : Uber Black (`#000000`)
- Rembourrage : 14px
- Rayon : 999px (pilule complète)
- Ombre : `rgba(0,0,0,0.16) 0px 2px 8px 0px`
- Transform : `translateY(2px)` léger décalage
- Hover : l'arrière-plan passe à `#f3f3f3`
- Contrôles de carte, retour en haut, CTAs flottants

### Cartes & conteneurs
- Arrière-plan : Pure White (`#ffffff`) sur pages blanches ; pas de différenciation distincte de l'arrière-plan des cartes
- Bordure : aucune par défaut -- les cartes sont définies par l'ombre, pas le contour
- Rayon : 8px pour les cartes de contenu standard ; 12px pour les cartes mise en avant/promues
- Ombre : `rgba(0,0,0,0.12) 0px 4px 16px 0px` pour le lift standard
- Les cartes sont denses en contenu avec un rembourrage interne minimal
- Les cartes à image principale utilisent des images à fond perdu avec texte superposé ou en dessous

### Champs & formulaires
- Texte : Uber Black (`#000000`)
- Arrière-plan : Pure White (`#ffffff`)
- Bordure : 1px solide Noir (`#000000`) -- le seul endroit où les bordures visibles apparaissent de manière proéminente
- Rayon : 8px
- Rembourrage : espacement confortable standard
- Focus : pas d'état de focus personnalisé extrait -- s'appuie sur la bague de focus standard du navigateur

### Navigation
- Navigation supérieure collante avec fond blanc
- Logo : marque verbale/icône Uber à 24x24px en noir
- Liens : UberMoveText à 14-18px, graisse 500, en Uber Black
- Chips de navigation en forme de pilule avec fond Chip Gray (`#efefef`) pour la navigation par catégories ("Réserver", "Conduire", "Entreprise", "Uber Eats")
- Bascule de menu : bouton circulaire avec 50% de border-radius
- Mobile : pattern de menu hamburger

### Traitement des images
- Scènes chaleureuses illustrées à la main (pas de photographies pour les sections de fonctionnalités)
- Style d'illustration : personnes légèrement stylisées, palette de couleurs chaude dans les illustrations, ambiance contemporaine
- Les sections hero utilisent une photographie ou illustration audacieuse en arrière-plan pleine largeur
- QR codes pour les CTAs de téléchargement d'application
- Toutes les images utilisent un border-radius standard de 8px ou 12px lorsqu'elles sont contenues dans des cartes

### Composants distinctifs

**Navigation par pilules de catégories**
- Rangée horizontale de boutons en forme de pilule pour la navigation de premier niveau ("Réserver", "Conduire", "Entreprise", "Uber Eats", "À propos")
- Chaque pilule : fond Chip Gray, texte noir, rayon 999px
- État actif indiqué par fond noir avec texte blanc (inversion)

**Hero avec double action**
- Hero divisé : texte/CTA à gauche, carte/illustration à droite
- Deux champs de saisie côte à côte pour départ/destination
- Bouton CTA "Voir les prix" en pilule noire

**Cartes Plan-Ahead**
- Cartes promouvant des fonctionnalités comme "Uber Reserve" et la planification de trajets
- Riches en illustrations avec des images chaleureuses et centrées sur l'humain
- Boutons CTA noirs avec texte blanc en bas

## 5. Principes de mise en page

### Système d'espacement
- Unité de base : 8px
- Échelle : 4px, 6px, 8px, 10px, 12px, 14px, 16px, 18px, 20px, 24px, 32px
- Rembourrage des boutons : 10px 12px (compact) ou 14px 16px (confortable)
- Rembourrage interne des cartes : environ 24-32px
- Espacement vertical des sections : généreux mais efficace -- environ 64-96px entre les sections principales

### Grille & conteneur
- Largeur maximale du conteneur : environ 1136px, centré
- Hero : mise en page divisée avec texte à gauche, visuel à droite
- Sections de fonctionnalités : grilles de cartes à 2 colonnes ou une seule colonne pleine largeur
- Pied de page : grille de liens multi-colonnes sur fond noir
- Sections pleine largeur s'étendant jusqu'aux bords du viewport

### Philosophie des espaces vides
- **Efficace, pas aérien** : L'espace vide d'Uber est fonctionnel -- assez pour séparer, jamais assez pour sembler vide. C'est un espacement de système de transport : compact, clair, orienté vers le but.
- **Cartes denses en contenu** : Les cartes condensent les informations serré avec un espacement interne minimal, s'appuyant sur l'ombre et le rayon pour définir les limites.
- **Espace de respiration des sections** : Les sections principales obtiennent un généreux espacement vertical, mais à l'intérieur des sections, les éléments sont étroitement groupés.

### Échelle des border-radius
- Tranchant (0px) : Pas de coins carrés sur les éléments interactifs
- Standard (8px) : Cartes de contenu, champs de saisie, zones de liste
- Confortable (12px) : Cartes mises en avant, conteneurs plus grands, cartes de liens
- Pilule complète (999px) : Tous les boutons, chips, éléments de navigation, pilules
- Cercle (50%) : Images d'avatar, conteneurs d'icônes, contrôles circulaires

## 6. Profondeur & élévation

| Niveau | Traitement | Utilisation |
|-------|-----------|-----|
| Plat (Niveau 0) | Pas d'ombre, fond solide | Fond de page, contenu inline, sections textuelles |
| Subtil (Niveau 1) | `rgba(0,0,0,0.12) 0px 4px 16px` | Cartes de contenu standard, blocs de fonctionnalités |
| Moyen (Niveau 2) | `rgba(0,0,0,0.16) 0px 4px 16px` | Cartes surélevées, éléments overlay |
| Flottant (Niveau 3) | `rgba(0,0,0,0.16) 0px 2px 8px` + translateY(2px) | Boutons d'action flottants, contrôles de carte |
| Enfoncé (Niveau 4) | `rgba(0,0,0,0.08) inset` (spread 999px) | États actifs/enfoncés des boutons |
| Bague de focus | `rgb(255,255,255) 0px 0px 0px 2px inset` | Indicateurs de focus clavier |

**Philosophie des ombres** : Uber utilise les ombres purement comme outil structurel, jamais décoratif. Les ombres sont toujours noires à très faible opacité (0,08-0,16), créant le minimum de lift nécessaire pour séparer les couches de contenu. Les rayons de flou sont modérés (8-16px) -- assez pour sembler naturels mais jamais dramatiques. Pas d'ombres colorées, pas d'empilements d'ombres, pas d'effets de lueur ambiante. La profondeur est communiquée davantage par le contraste des sections noir/blanc que par l'élévation des ombres.

## 7. À faire & à ne pas faire

### À faire
- Utiliser le vrai noir (`#000000`) et le blanc pur (`#ffffff`) comme palette primaire -- le contraste saisissant EST Uber
- Utiliser 999px de border-radius pour tous les boutons, chips et éléments de navigation en forme de pilule
- Garder tous les titres en UberMove Bold (700) pour un impact au niveau panneau publicitaire
- Utiliser des ombres ultra-douces (opacité 0,12-0,16) pour l'élévation des cartes -- à peine visibles
- Maintenir le style de mise en page compact et dense en information -- Uber priorise l'efficacité sur l'aérien
- Utiliser des illustrations chaleureuses et centrées sur l'humain pour adoucir l'interface monochrome
- Appliquer un rayon de 8px pour les cartes de contenu et 12px pour les conteneurs mis en avant
- Utiliser UberMoveText avec la graisse 500 pour la navigation et les textes UI proéminents
- Associer les boutons primaires noirs avec les boutons secondaires blancs pour les mises en page à double action

### À ne pas faire
- Ne pas introduire de couleur dans le chrome de l'interface -- l'interface d'Uber est strictement noire, blanche et grise
- Ne pas utiliser de coins arrondis inférieurs à 999px sur les boutons -- la forme de pilule complète est un élément identitaire central
- Ne pas appliquer d'ombres lourdes ou de drop-shadows à haute opacité -- la profondeur est chuchotée
- Ne pas utiliser de polices serif nulle part -- la typographie d'Uber est exclusivement sans-serif géométrique
- Ne pas créer de mises en page aérées et spacieuses avec un espace blanc excessif -- la densité d'Uber est intentionnelle
- Ne pas utiliser de dégradés ou de superpositions de couleurs -- chaque surface est une couleur plate et solide
- Ne pas mélanger UberMove dans le corps du texte ou UberMoveText dans les titres -- la hiérarchie est stricte
- Ne pas utiliser de bordures décoratives -- les bordures sont fonctionnelles (champs, séparateurs) ou absentes
- Ne pas adoucir le contraste noir/blanc avec des blancs cassés ou des presque-noirs -- la dualité est délibérée

## 8. Comportement responsive

### Points de rupture
| Nom | Largeur | Changements clés |
|------|-------|-------------|
| Mobile Petit | 320px | Mise en page minimale, une colonne, saisies empilées, typographie compacte |
| Mobile | 600px | Mobile standard, mise en page empilée, nav hamburger |
| Tablette Petite | 768px | Les grilles à deux colonnes commencent, mises en page de cartes étendues |
| Tablette | 1119px | Mise en page tablette complète, contenu hero côte à côte |
| Desktop Petit | 1120px | Grille desktop activée, pilules de nav horizontales |
| Desktop | 1136px | Mise en page desktop complète, largeur maximale du conteneur, hero divisé |

### Cibles tactiles
- Tous les boutons pilule : hauteur minimale 44px (10-14px de rembourrage vertical + hauteur de ligne)
- Chips de navigation : rembourrage généreux de 14px 16px pour un tap pouce confortable
- Contrôles circulaires (menu, fermer) : rayon 50% garantit des cibles grandes et faciles à atteindre
- Les surfaces de cartes servent de cibles tactiles pleine zone sur mobile

### Stratégie de repli
- **Navigation** : La nav horizontale en pilules se replie en menu hamburger avec bascule circulaire
- **Hero** : La mise en page divisée (texte + carte/visuel) s'empile en une seule colonne -- texte au-dessus, visuel en dessous
- **Champs de saisie** : Les saisies départ/destination côte à côte s'empilent verticalement
- **Cartes de fonctionnalités** : La grille à 2 colonnes se replie en cartes empilées pleine largeur
- **Titres** : L'affichage 52px diminue à travers 36px, 32px, 24px, 20px
- **Pied de page** : La grille de liens multi-colonnes se replie en accordéon ou colonne unique empilée
- **Pilules de catégories** : Défilement horizontal avec débordement sur les petits écrans

### Comportement des images
- Les illustrations s'adaptent proportionnellement à l'intérieur de leurs conteneurs
- Les images hero maintiennent le rapport d'aspect, peuvent être recadrées sur les petits écrans
- Les sections QR code se masquent sur mobile (le téléchargement de l'application passe aux liens directs vers les stores)
- Les images de cartes maintiennent un border-radius de 8-12px à toutes les tailles

## 9. Guide des prompts Agent

### Référence de couleurs rapide
- Bouton primaire : "Uber Black (#000000)"
- Fond de page : "Pure White (#ffffff)"
- Texte de bouton (sur noir) : "Pure White (#ffffff)"
- Texte de bouton (sur blanc) : "Uber Black (#000000)"
- Texte secondaire : "Body Gray (#4b4b4b)"
- Texte tertiaire : "Muted Gray (#afafaf)"
- Fond de chip : "Chip Gray (#efefef)"
- État hover : "Hover Gray (#e2e2e2)"
- Ombre de carte : "rgba(0,0,0,0.12) 0px 4px 16px"
- Fond de pied de page : "Uber Black (#000000)"

### Exemples de prompts de composants
- "Créer une section hero sur Pure White (#ffffff) avec un titre à 52px UberMove Bold (700), hauteur de ligne 1,23. Utiliser le texte Uber Black (#000000). Ajouter un sous-titre en Body Gray (#4b4b4b) à 16px UberMoveText graisse 400 avec hauteur de ligne 1,50. Placer un bouton CTA pilule Uber Black (#000000) avec texte Pure White, rayon 999px, rembourrage 10px 12px."
- "Concevoir une barre de navigation de catégories avec des boutons pilule horizontaux. Chaque pilule : fond Chip Gray (#efefef), texte Uber Black (#000000), rembourrage 14px 16px, border-radius 999px. La pilule active s'inverse en fond Uber Black avec texte Pure White. Utiliser UberMoveText à 14px graisse 500."
- "Construire une carte de fonctionnalité sur Pure White (#ffffff) avec border-radius 8px et ombre rgba(0,0,0,0.12) 0px 4px 16px. Titre en UberMove à 24px graisse 700, description en Body Gray (#4b4b4b) à 16px UberMoveText. Ajouter un bouton CTA pilule noir en bas."
- "Créer un pied de page sombre sur Uber Black (#000000) avec texte de titre Pure White (#ffffff) en UberMove à 20px graisse 700. Liens de pied de page en Muted Gray (#afafaf) à 14px UberMoveText. Les liens passent à Pure White au hover. Mise en page grille multi-colonnes."
- "Concevoir un bouton d'action flottant avec fond Pure White (#ffffff), rayon 999px, rembourrage 14px et ombre rgba(0,0,0,0.16) 0px 2px 8px. Le hover fait passer le fond à #f3f3f3. À utiliser pour le retour en haut ou les contrôles de carte."

### Guide d'itération
1. Se concentrer sur UN composant à la fois
2. Référencer la palette stricte noir/blanc -- "utiliser Uber Black (#000000)" et non "le rendre sombre"
3. Toujours spécifier 999px de rayon pour les boutons et les pilules -- c'est non négociable pour l'identité Uber
4. Décrire la famille de polices explicitement -- "UberMove Bold pour le titre, UberMoveText Medium pour le label"
5. Pour les ombres, utiliser "ombre chuchotée (rgba(0,0,0,0.12) 0px 4px 16px)" -- jamais de lourds drop-shadows
6. Garder les mises en page compactes et denses en information -- Uber est efficace, pas aérien
7. Les illustrations doivent être chaleureuses et humaines -- décrire "des personnes stylisées dans des tons chauds" et non des formes abstraites
8. Associer des CTAs noirs avec des secondaires blancs pour des mises en page à double action équilibrées
