# Système de design inspiré de Vercel

> Category: Outils développeur
> Déploiement frontend. Précision noir et blanc, police Geist.

## 1. Thème visuel & atmosphère

Le site de Vercel est la thèse visuelle d'une infrastructure développeur rendue invisible — un système de design si sobre qu'il frôle le philosophique. La page est d'un blanc écrasant (`#ffffff`) avec du texte quasi-noir (`#171717`), créant un vide de galerie où chaque élément mérite son pixel. Ce n'est pas le minimalisme comme décoration ; c'est le minimalisme comme principe d'ingénierie. Le système de design Geist traite l'interface comme un compilateur traite le code — chaque jeton superflu est éliminé jusqu'à ce qu'il ne reste que la structure.

La famille de polices Geist sur mesure est la pièce maîtresse. Geist Sans utilise un interlettrage négatif agressif (-2,4 px à -2,88 px en taille d'affichage), créant des titres qui semblent compressés, urgents et ingéniés — comme du code minifié pour la production. Aux tailles de corps, l'espacement se détend, mais la précision géométrique persiste. Geist Mono complète le système en tant que compagnon à espacement fixe pour le code, les sorties terminal et les étiquettes techniques. Les deux polices activent `"liga"` OpenType (ligatures) globalement, ajoutant une couche de sophistication typographique qui récompense une lecture attentive.

Ce qui distingue Vercel des autres systèmes de design monochrome, c'est sa philosophie d'ombre-comme-bordure. Au lieu des bordures CSS traditionnelles, Vercel utilise `box-shadow: 0px 0px 0px 1px rgba(0,0,0,0.08)` — une ombre à décalage zéro, flou zéro, extension 1 px, qui crée une ligne semblable à une bordure sans les implications du modèle de boîte. Cette technique permet aux bordures d'exister dans la couche d'ombre, permettant des transitions plus douces, des coins arrondis sans découpe, et un poids visuel plus subtil que les bordures traditionnelles. Tout le système de profondeur repose sur des piles d'ombres multicouches où chaque couche remplit un rôle précis : une pour la bordure, une pour l'élévation douce, une pour la profondeur ambiante.

**Caractéristiques clés :**
- Geist Sans avec un interlettrage négatif extrême (-2,4 px à -2,88 px en affichage) — le texte comme infrastructure compressée
- Geist Mono pour le code et les étiquettes techniques avec `"liga"` OpenType activé globalement
- Technique d'ombre-comme-bordure : `box-shadow 0px 0px 0px 1px` remplace les bordures traditionnelles partout
- Piles d'ombres multicouches pour une profondeur nuancée (bordure + élévation + ambiance en déclarations uniques)
- Toile quasi-blanche avec texte `#171717` — pas tout à fait noir, créant une douceur de micro-contraste
- Couleurs d'accent propres aux flux de travail : Ship Red (`#ff5b4f`), Preview Pink (`#de1d8d`), Develop Blue (`#0a72ef`)
- Système d'anneau de focus utilisant `hsla(212, 100%, 48%, 1)` — un bleu saturé pour l'accessibilité
- Badges en pilule (9999 px) avec fonds teintés pour les indicateurs d'état

## 2. Palette de couleurs & rôles

### Principales
- **Vercel Black** (`#171717`) : Texte principal, titres, arrière-plans de surface sombre. Pas du noir pur — la légère chaleur évite la dureté.
- **Pure White** (`#ffffff`) : Arrière-plan de page, surfaces de carte, texte de bouton sur fond sombre.
- **True Black** (`#000000`) : Usage secondaire, `--geist-console-text-color-default`, utilisé dans des contextes console/code spécifiques.

### Couleurs d'accent de flux de travail
- **Ship Red** (`#ff5b4f`) : `--ship-text`, l'étape de flux de travail « déployer en production » — corail-rouge chaud et urgent.
- **Preview Pink** (`#de1d8d`) : `--preview-text`, le flux de travail de déploiement de prévisualisation — magenta-rose vif.
- **Develop Blue** (`#0a72ef`) : `--develop-text`, le flux de travail de développement — bleu vif et concentré.

### Couleurs console / code
- **Console Blue** (`#0070f3`) : `--geist-console-text-color-blue`, bleu de coloration syntaxique.
- **Console Purple** (`#7928ca`) : `--geist-console-text-color-purple`, violet de coloration syntaxique.
- **Console Pink** (`#eb367f`) : `--geist-console-text-color-pink`, rose de coloration syntaxique.

### Interactif
- **Link Blue** (`#0072f5`) : Couleur de lien principale avec décoration de soulignement.
- **Focus Blue** (`hsla(212, 100%, 48%, 1)`) : `--ds-focus-color`, anneau de focus sur les éléments interactifs.
- **Ring Blue** (`rgba(147, 197, 253, 0.5)`) : `--tw-ring-color`, utilitaire d'anneau Tailwind.

### Échelle de gris
- **Gray 900** (`#171717`) : Texte principal, titres, texte de navigation.
- **Gray 600** (`#4d4d4d`) : Texte secondaire, texte de description.
- **Gray 500** (`#666666`) : Texte tertiaire, liens atténués.
- **Gray 400** (`#808080`) : Texte de placeholder, états désactivés.
- **Gray 100** (`#ebebeb`) : Bordures, contours de carte, séparateurs.
- **Gray 50** (`#fafafa`) : Teinte de surface subtile, mise en évidence d'ombre intérieure.

### Surface & superposition
- **Overlay Backdrop** (`hsla(0, 0%, 98%, 1)`) : `--ds-overlay-backdrop-color`, fond de modal/dialogue.
- **Selection Text** (`hsla(0, 0%, 95%, 1)`) : `--geist-selection-text-color`, mise en évidence de sélection de texte.
- **Badge Blue Bg** (`#ebf5ff`) : Arrière-plan de badge en pilule, surface bleue teintée.
- **Badge Blue Text** (`#0068d6`) : Texte de badge en pilule, bleu plus foncé pour la lisibilité.

### Ombres & profondeur
- **Border Shadow** (`rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`) : La signature — remplace les bordures traditionnelles.
- **Subtle Elevation** (`rgba(0, 0, 0, 0.04) 0px 2px 2px`) : Légère élévation pour les cartes.
- **Card Stack** (`rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, rgba(0,0,0,0.04) 0px 8px 8px -8px, #fafafa 0px 0px 0px 1px`) : Ombre de carte multicouche complète.
- **Ring Border** (`rgb(235, 235, 235) 0px 0px 0px 1px`) : Anneau-bordure gris clair pour les onglets et les images.

## 3. Règles typographiques

### Famille de polices
- **Principale** : `Geist`, avec replis : `Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol`
- **Monospace** : `Geist Mono`, avec replis : `ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New`
- **Fonctionnalités OpenType** : `"liga"` activé globalement sur tout le texte Geist ; `"tnum"` pour les chiffres tabulaires sur des légendes spécifiques.

### Hiérarchie

| Rôle | Police | Taille | Graisse | Hauteur de ligne | Interlettrage | Notes |
|------|--------|--------|---------|------------------|---------------|-------|
| Display Hero | Geist | 48px (3,00rem) | 600 | 1,00–1,17 (serré) | -2,4px à -2,88px | Compression maximale, impact panneau d'affichage |
| Titre de section | Geist | 40px (2,50rem) | 600 | 1,20 (serré) | -2,4px | Titres de sections de fonctionnalités |
| Sous-titre large | Geist | 32px (2,00rem) | 600 | 1,25 (serré) | -1,28px | En-têtes de carte, sous-sections |
| Sous-titre | Geist | 32px (2,00rem) | 400 | 1,50 | -1,28px | Sous-titres plus légers |
| Titre de carte | Geist | 24px (1,50rem) | 600 | 1,33 | -0,96px | Cartes de fonctionnalités |
| Titre de carte léger | Geist | 24px (1,50rem) | 500 | 1,33 | -0,96px | En-têtes de carte secondaires |
| Corps large | Geist | 20px (1,25rem) | 400 | 1,80 (détendu) | normal | Introductions, descriptions de fonctionnalités |
| Corps | Geist | 18px (1,13rem) | 400 | 1,56 | normal | Texte de lecture standard |
| Corps petit | Geist | 16px (1,00rem) | 400 | 1,50 | normal | Texte d'interface standard |
| Corps medium | Geist | 16px (1,00rem) | 500 | 1,50 | normal | Navigation, texte mis en valeur |
| Corps semi-gras | Geist | 16px (1,00rem) | 600 | 1,50 | -0,32px | Étiquettes fortes, états actifs |
| Bouton / Lien | Geist | 14px (0,88rem) | 500 | 1,43 | normal | Boutons, liens, légendes |
| Bouton petit | Geist | 14px (0,88rem) | 400 | 1,00 (serré) | normal | Boutons compacts |
| Légende | Geist | 12px (0,75rem) | 400–500 | 1,33 | normal | Métadonnées, étiquettes |
| Mono corps | Geist Mono | 16px (1,00rem) | 400 | 1,50 | normal | Blocs de code |
| Mono légende | Geist Mono | 13px (0,81rem) | 500 | 1,54 | normal | Étiquettes de code |
| Mono petit | Geist Mono | 12px (0,75rem) | 500 | 1,00 (serré) | normal | `text-transform: uppercase`, étiquettes techniques |
| Micro badge | Geist | 7px (0,44rem) | 700 | 1,00 (serré) | normal | `text-transform: uppercase`, tout petits badges |

### Principes
- **La compression comme identité** : Geist Sans en taille d'affichage utilise un interlettrage de -2,4 px à -2,88 px — le suivi négatif le plus agressif de tout système de design majeur. Cela crée un texte qui semble _minifié_, comme du code optimisé pour la production. Le suivi se détend progressivement à mesure que la taille diminue : -1,28 px à 32 px, -0,96 px à 24 px, -0,32 px à 16 px, et normal à 14 px.
- **Les ligatures partout** : Chaque élément de texte Geist active `"liga"` OpenType. Les ligatures ne sont pas décoratives — elles sont structurelles, créant des combinaisons de glyphes plus serrées et plus efficaces.
- **Trois graisses, des rôles stricts** : 400 (corps/lecture), 500 (interface/interactif), 600 (titres/emphase). Pas de gras (700) sauf pour les tout petits micro-badges. Cette plage de graisses étroite crée la hiérarchie par la taille et le suivi, pas par la graisse.
- **Mono pour l'identité** : Geist Mono en majuscules avec `"tnum"` ou `"liga"` sert de voix « console développeur » — étiquettes techniques compactes qui relient le site marketing au produit.

## 4. Styles de composants

### Boutons

**Blanc principal (bordure par ombre)**
- Arrière-plan : `#ffffff`
- Texte : `#171717`
- Rembourrage : 0px 6px (minimal — largeur pilotée par le contenu)
- Rayon : 6px (légèrement arrondi)
- Ombre : `rgb(235, 235, 235) 0px 0px 0px 1px` (anneau-bordure)
- Survol : l'arrière-plan passe à `var(--ds-gray-1000)` (sombre)
- Focus : contour `2px solid var(--ds-focus-color)` + ombre `var(--ds-focus-ring)`
- Usage : bouton secondaire standard

**Sombre principal (déduit du système Geist)**
- Arrière-plan : `#171717`
- Texte : `#ffffff`
- Rembourrage : 8px 16px
- Rayon : 6px
- Usage : CTA principal (« Start Deploying », « Get Started »)

**Bouton en pilule / Badge**
- Arrière-plan : `#ebf5ff` (bleu teinté)
- Texte : `#0068d6`
- Rembourrage : 0px 10px
- Rayon : 9999px (pilule complète)
- Police : 12px graisse 500
- Usage : badges d'état, étiquettes, labels de fonctionnalités

**Grande pilule (navigation)**
- Arrière-plan : transparent ou `#171717`
- Rayon : 64px–100px
- Usage : navigation par onglets, sélecteurs de section

### Cartes & conteneurs
- Arrière-plan : `#ffffff`
- Bordure : via ombre — `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Rayon : 8px (standard), 12px (cartes vedettes/images)
- Pile d'ombres : `rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px`
- Cartes image : `1px solid #ebebeb` avec rayon supérieur 12px
- Survol : intensification subtile de l'ombre

### Champs de saisie & formulaires
- Radio : style standard avec arrière-plan de focus `var(--ds-gray-200)`
- Ombre de focus : `1px 0 0 0 var(--ds-gray-alpha-600)`
- Contour de focus : `2px solid var(--ds-focus-color)` — anneau de focus bleu cohérent
- Bordure : via technique d'ombre, pas de bordure traditionnelle

### Navigation
- Navigation horizontale épurée sur fond blanc, sticky
- Logotype Vercel aligné à gauche, 262x52px
- Liens : Geist 14px graisse 500, texte `#171717`
- Actif : graisse 600 ou soulignement
- CTA : boutons sombres en pilule (« Start Deploying », « Contact Sales »)
- Mobile : menu hamburger replié
- Menus déroulants produit avec menus à plusieurs niveaux

### Traitement des images
- Captures d'écran de produit avec bordure `1px solid #ebebeb`
- Images arrondies en haut : rayon `12px 12px 0px 0px`
- Captures d'écran de tableau de bord/code dominent les sections de fonctionnalités
- Arrière-plans en dégradé doux derrière les images hero (multi-couleurs pastels)

### Composants distinctifs

**Pipeline de flux de travail**
- Pipeline horizontal en trois étapes : Develop → Preview → Ship
- Chaque étape a sa propre couleur d'accent : Bleu → Rose → Rouge
- Reliées par des lignes/flèches
- La métaphore visuelle de la proposition de valeur centrale de Vercel

**Barre de confiance / Grille de logos**
- Logos d'entreprises (Perplexity, ChatGPT, Cursor, etc.) en niveaux de gris
- Défilement horizontal ou disposition en grille
- Séparation subtile par bordure `#ebebeb`

**Cartes de métriques**
- Affichage de grand nombre (ex. : « 10x faster »)
- Geist 48px graisse 600 pour la métrique
- Description en dessous en texte de corps gris
- Conteneur de carte avec bordure par ombre

## 5. Principes de mise en page

### Système d'espacement
- Unité de base : 8px
- Échelle : 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 16px, 32px, 36px, 40px
- Notable : saut de 16px à 32px — pas de 20px ni 24px dans l'échelle principale

### Grille & conteneur
- Largeur maximale du contenu : environ 1200px
- Hero : colonne unique centrée avec généreux rembourrage supérieur
- Sections de fonctionnalités : grilles à 2–3 colonnes pour les cartes
- Séparateurs pleine largeur utilisant `border-bottom: 1px solid #171717`
- Captures d'écran de code/tableau de bord en pleine largeur ou contenues avec bordure

### Philosophie des espaces blancs
- **Vide de galerie** : Rembourrage vertical massif entre les sections (80px–120px+). L'espace blanc EST le design — il communique que Vercel n'a rien à prouver et rien à cacher.
- **Texte compressé, espace expansé** : L'interlettrage négatif agressif sur les titres est contrebalancé par de généreux espaces blancs environnants. Le texte est dense ; l'espace autour de lui est vaste.
- **Rythme de section** : Les sections blanches alternent avec des sections blanches — il n'y a pas de variation de couleur entre les sections. La séparation provient des bordures (bordures par ombre) et de l'espacement seul.

### Échelle de rayons de bordure
- Micro (2px) : Extraits de code en ligne, petits spans
- Subtil (4px) : Petits conteneurs
- Standard (6px) : Boutons, liens, éléments fonctionnels
- Confortable (8px) : Cartes, éléments de liste
- Image (12px) : Cartes vedettes, conteneurs d'images (arrondis en haut)
- Large (64px) : Pilules de navigation par onglets
- XL (100px) : Grands liens de navigation
- Pilule complète (9999px) : Badges, pilules d'état, étiquettes
- Cercle (50%) : Bouton de menu, conteneurs d'avatar

## 6. Profondeur & élévation

| Niveau | Traitement | Usage |
|--------|------------|-------|
| Plat (Niveau 0) | Pas d'ombre | Arrière-plan de page, blocs de texte |
| Anneau (Niveau 1) | `rgba(0,0,0,0.08) 0px 0px 0px 1px` | Ombre-comme-bordure pour la plupart des éléments |
| Anneau léger (Niveau 1b) | `rgb(235,235,235) 0px 0px 0px 1px` | Anneau plus léger pour les onglets, les images |
| Carte subtile (Niveau 2) | Anneau + `rgba(0,0,0,0.04) 0px 2px 2px` | Cartes standard avec élévation minimale |
| Carte complète (Niveau 3) | Anneau + Subtil + `rgba(0,0,0,0.04) 0px 8px 8px -8px` + anneau intérieur `#fafafa` | Cartes vedettes, panneaux mis en évidence |
| Focus (Accessibilité) | Contour `2px solid hsla(212, 100%, 48%, 1)` | Focus clavier sur tous les éléments interactifs |

**Philosophie des ombres** : Vercel possède sans doute le système d'ombres le plus sophistiqué du design web moderne. Plutôt que d'utiliser les ombres pour l'élévation au sens traditionnel du Material Design, Vercel utilise des piles d'ombres multicouches où chaque couche a un but architectural distinct : une crée la « bordure » (0px extension, 1px), une autre ajoute de la douceur ambiante (2px de flou), une autre gère la profondeur à distance (8px de flou avec extension négative), et un anneau intérieur (`#fafafa`) crée la mise en évidence subtile qui fait « briller » la carte de l'intérieur. Cette approche en couches signifie que les cartes semblent construites, non flottantes.

### Profondeur décorative
- Dégradé hero : dégradé doux multi-couleurs pastels derrière le contenu hero (à peine visible, atmosphérique)
- Bordures de section : `1px solid #171717` (ligne sombre pleine) entre les sections majeures
- Pas de variation de couleur d'arrière-plan — la profondeur provient entièrement de la superposition d'ombres et du contraste des bordures

## 7. À faire & à ne pas faire

### À faire
- Utiliser Geist Sans avec un interlettrage négatif agressif en taille d'affichage (-2,4 px à -2,88 px à 48px)
- Utiliser l'ombre-comme-bordure (`0px 0px 0px 1px rgba(0,0,0,0.08)`) au lieu des bordures CSS traditionnelles
- Activer `"liga"` sur tout le texte Geist — les ligatures sont structurelles, pas optionnelles
- Utiliser le système à trois graisses : 400 (corps), 500 (interface), 600 (titres)
- Appliquer les couleurs d'accent de flux de travail (Rouge/Rose/Bleu) uniquement dans leur contexte de flux de travail
- Utiliser des piles d'ombres multicouches pour les cartes (bordure + élévation + ambiance + mise en évidence intérieure)
- Conserver la palette de couleurs achromatique — les gris de `#171717` à `#ffffff` sont le système
- Utiliser `#171717` au lieu de `#000000` pour le texte principal — la micro-chaleur compte

### À ne pas faire
- Ne pas utiliser d'interlettrage positif sur Geist Sans — il est toujours négatif ou nul
- Ne pas utiliser la graisse 700 (gras) sur le texte de corps — 600 est le maximum, réservé aux titres
- Ne pas utiliser de `border` CSS traditionnel sur les cartes — utiliser la technique de bordure par ombre
- Ne pas introduire de couleurs chaudes (oranges, jaunes, verts) dans le chrome de l'interface
- Ne pas appliquer les couleurs d'accent de flux de travail (Ship Red, Preview Pink, Develop Blue) de manière décorative
- Ne pas utiliser d'ombres lourdes (> 0,1 opacité) — le système d'ombres est au niveau du murmure
- Ne pas augmenter l'interlettrage du texte de corps — Geist est conçu pour rester serré
- Ne pas utiliser le rayon en pilule (9999px) sur les boutons d'action principaux — les pilules sont réservées aux badges/étiquettes
- Ne pas omettre l'anneau intérieur `#fafafa` dans les ombres de carte — c'est l'éclat qui fait fonctionner le système

## 8. Comportement responsive

### Points de rupture
| Nom | Largeur | Changements clés |
|-----|---------|------------------|
| Mobile petit | <400px | Colonne unique serrée, rembourrage minimal |
| Mobile | 400–600px | Mobile standard, disposition empilée |
| Tablette petite | 600–768px | Les grilles à 2 colonnes commencent |
| Tablette | 768–1024px | Grilles de cartes complètes, rembourrage étendu |
| Desktop petit | 1024–1200px | Disposition desktop standard |
| Desktop | 1200–1400px | Disposition complète, largeur de contenu maximale |
| Grand desktop | >1400px | Centré, marges généreuses |

### Zones de toucher
- Les boutons utilisent un rembourrage confortable (8px–16px vertical)
- Liens de navigation à 14px avec espacement adéquat
- Les badges en pilule ont 10px de rembourrage horizontal pour les zones de toucher
- Le bouton de menu mobile utilise un bouton circulaire à rayon 50%

### Stratégie de réduction
- Hero : affichage 48px → réduit, maintient le suivi négatif proportionnellement
- Navigation : liens horizontaux + CTA → menu hamburger
- Cartes de fonctionnalités : 3 colonnes → 2 colonnes → colonne unique empilée
- Captures d'écran de code : conserver le rapport d'aspect, peuvent défiler horizontalement
- Logos de la barre de confiance : grille → défilement horizontal
- Pied de page : multi-colonnes → colonne unique empilée
- Espacement des sections : 80px+ → 48px sur mobile

### Comportement des images
- Les captures d'écran de tableau de bord conservent le traitement des bordures à toutes les tailles
- Le dégradé hero s'adoucit/se simplifie sur mobile
- Les captures d'écran de produit utilisent des images responsive avec un rayon de bordure cohérent
- Les sections pleine largeur conservent le traitement bord-à-bord

## 9. Guide de prompt pour agent

### Référence rapide des couleurs
- CTA principal : Vercel Black (`#171717`)
- Arrière-plan : Pure White (`#ffffff`)
- Texte des titres : Vercel Black (`#171717`)
- Texte de corps : Gray 600 (`#4d4d4d`)
- Bordure (ombre) : `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Lien : Link Blue (`#0072f5`)
- Anneau de focus : Focus Blue (`hsla(212, 100%, 48%, 1)`)

### Exemples de prompts de composants
- « Crée une section hero sur fond blanc. Titre en 48px Geist graisse 600, line-height 1,00, letter-spacing -2,4px, couleur #171717. Sous-titre en 20px Geist graisse 400, line-height 1,80, couleur #4d4d4d. Bouton CTA sombre (#171717, rayon 6px, rembourrage 8px 16px) et bouton fantôme (blanc, bordure-ombre rgba(0,0,0,0.08) 0px 0px 0px 1px, rayon 6px). »
- « Conçois une carte : fond blanc, pas de bordure CSS. Utilise la pile d'ombres : rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px. Rayon 8px. Titre en 24px Geist graisse 600, letter-spacing -0,96px. Corps en 16px graisse 400, #4d4d4d. »
- « Construis un badge en pilule : fond #ebf5ff, texte #0068d6, rayon 9999px, rembourrage 0px 10px, 12px Geist graisse 500. »
- « Crée une navigation : en-tête blanc sticky. Geist 14px graisse 500 pour les liens, texte #171717. CTA en pilule sombre "Start Deploying" aligné à droite. Bordure-ombre en bas : rgba(0,0,0,0.08) 0px 0px 0px 1px. »
- « Conçois une section de flux de travail montrant trois étapes : Develop (couleur de texte #0a72ef), Preview (#de1d8d), Ship (#ff5b4f). Chaque étape : étiquette 14px Geist Mono en majuscules + titre 24px Geist graisse 600 + description 16px graisse 400 en #4d4d4d. »

### Guide d'itération
1. Toujours utiliser l'ombre-comme-bordure au lieu de la bordure CSS — `0px 0px 0px 1px rgba(0,0,0,0.08)` est la base
2. L'interlettrage s'adapte à la taille de police : -2,4px à 48px, -1,28px à 32px, -0,96px à 24px, normal à 14px
3. Trois graisses seulement : 400 (lire), 500 (interagir), 600 (annoncer)
4. La couleur est fonctionnelle, jamais décorative — les couleurs de flux de travail (Rouge/Rose/Bleu) marquent uniquement les étapes du pipeline
5. L'anneau intérieur `#fafafa` dans les ombres de carte est ce qui confère aux cartes Vercel leur subtil éclat intérieur
6. Geist Mono en majuscules pour les étiquettes techniques, Geist Sans pour tout le reste
