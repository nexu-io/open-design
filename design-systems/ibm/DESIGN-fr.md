# Système de design inspiré d'IBM

> Category: Médias et grand public
> Technologie d'entreprise. Système de design Carbon, palette bleue structurée.

## 1. Thème visuel et atmosphère

Le site web d'IBM est l'incarnation numérique de l'autorité d'entreprise construite sur le système de design Carbon — un langage de design si méthodiquement structuré qu'il se lit comme une spécification d'ingénierie rendue sous forme de page web. La page fonctionne sur une dualité saisissante : une toile blanche lumineuse (`#ffffff`) avec un texte quasi noir (`#161616`), ponctuée par un unique accent inébranlable — IBM Blue 60 (`#0f62fe`). Ce n'est pas le minimalisme espiègle d'une startup tech ; c'est la précision d'entreprise distillée en pixels. Chaque élément existe dans la grille 2x rigoureuse de Carbon, chaque couleur est mappée sur un token sémantique, chaque valeur d'espacement s'aligne sur l'unité de base de 8px.

La famille typographique IBM Plex est l'épine dorsale du système. IBM Plex Sans en graisse légère (300) pour les titres d'affichage crée une qualité étonnamment aérée, presque délicate aux grandes tailles — un contrepoint délibéré à la gravité d'entreprise d'IBM. Aux tailles de corps, le poids régulier (400) avec un espacement de lettres de 0,16px sur les légendes de 14px introduit le micro-tracking méticuleux qui donne au texte Carbon une sensation d'ingénierie plutôt que de design. IBM Plex Mono sert pour le code, les données et les étiquettes techniques, complétant la trinité familiale aux côtés du rarement employé IBM Plex Serif.

Ce qui définit l'identité visuelle d'IBM au-delà du monochrome plus bleu, c'est la dépendance au système de tokens de composants de Carbon. Chaque état interactif est mappé sur une propriété personnalisée CSS préfixée par `--cds-` (Carbon Design System). Les boutons n'ont pas de couleurs codées en dur ; ils référencent `--cds-button-primary`, `--cds-button-primary-hover`, `--cds-button-primary-active`. Cette architecture tokenisée signifie que toute la couche visuelle est une mince enveloppe sur une fondation profondément systématique — l'équivalent en design d'une API bien typée.

**Caractéristiques principales :**
- IBM Plex Sans en graisse 300 (Light) pour l'affichage — gravitas d'entreprise par la retenue typographique
- IBM Plex Mono pour le code et le contenu technique avec un espacement de lettres constant de 0,16px aux petites tailles
- Couleur d'accentuation unique : IBM Blue 60 (`#0f62fe`) — chaque élément interactif, chaque CTA, chaque lien
- Système de tokens Carbon (`--cds-*`) pilotant toutes les couleurs sémantiques, permettant le changement de thème au niveau des variables
- Grille d'espacement de 8px avec adhérence stricte — aucune valeur arbitraire, tout s'aligne
- Cartes plates sans bordure sur la surface Gray 10 `#f4f4f4` — profondeur par superposition de couleurs de fond, pas d'ombres
- Champs de saisie à bordure inférieure (pas de boîte) — le motif de formulaire Carbon caractéristique
- Rayon de bordure 0px sur les boutons primaires — rectangulaire sans compromis, sans adoucissement

## 2. Palette de couleurs et rôles

### Primaire
- **IBM Blue 60** (`#0f62fe`) : La couleur interactive unique. Boutons primaires, liens, états de focus, indicateurs actifs. C'est le seul teinte chromatique dans la palette UI principale.
- **Blanc** (`#ffffff`) : Fond de page, surfaces de cartes, texte de bouton sur bleu, `--cds-background`.
- **Gray 100** (`#161616`) : Texte primaire, titres, fonds de surfaces sombres, barre de navigation, pied de page. `--cds-text-primary`.

### Échelle neutre (famille Gray)
- **Gray 100** (`#161616`) : Texte primaire, titres, chrome UI sombre, fond du pied de page.
- **Gray 90** (`#262626`) : Surfaces sombres secondaires, états de survol sur fonds sombres.
- **Gray 80** (`#393939`) : Teinte sombre tertiaire, états actifs.
- **Gray 70** (`#525252`) : Texte secondaire, texte d'aide, descriptions. `--cds-text-secondary`.
- **Gray 60** (`#6f6f6f`) : Texte de remplacement, texte désactivé.
- **Gray 50** (`#8d8d8d`) : Icônes désactivées, étiquettes atténuées.
- **Gray 30** (`#c6c6c6`) : Bordures, lignes de séparation, bordures inférieures de champs. `--cds-border-subtle`.
- **Gray 20** (`#e0e0e0`) : Bordures subtiles, contours de cartes.
- **Gray 10** (`#f4f4f4`) : Fond de surface secondaire, remplissages de cartes, rangées alternées. `--cds-layer-01`.
- **Gray 10 Hover** (`#e8e8e8`) : État de survol pour les surfaces Gray 10.

### Interactif
- **Blue 60** (`#0f62fe`) : Interactif primaire — boutons, liens, focus. `--cds-link-primary`, `--cds-button-primary`.
- **Blue 70** (`#0043ce`) : État de survol des liens. `--cds-link-primary-hover`.
- **Blue 80** (`#002d9c`) : État actif/pressé pour les éléments bleus.
- **Blue 10** (`#edf5ff`) : Surface teintée bleue, fond de rangée sélectionnée.
- **Focus Blue** (`#0f62fe`) : `--cds-focus` — bordure en retrait de 2px sur les éléments focalisés.
- **Focus Inset** (`#ffffff`) : `--cds-focus-inset` — anneau intérieur blanc pour le focus sur fonds sombres.

### Support et statut
- **Red 60** (`#da1e28`) : Erreur, danger. `--cds-support-error`.
- **Green 50** (`#24a148`) : Succès. `--cds-support-success`.
- **Yellow 30** (`#f1c21b`) : Avertissement. `--cds-support-warning`.
- **Blue 60** (`#0f62fe`) : Informationnel. `--cds-support-info`.

### Thème sombre (thème Gray 100)
- **Fond** : Gray 100 (`#161616`). `--cds-background`.
- **Layer 01** : Gray 90 (`#262626`). Surfaces de cartes et de conteneurs.
- **Layer 02** : Gray 80 (`#393939`). Surfaces élevées.
- **Texte primaire** : Gray 10 (`#f4f4f4`). `--cds-text-primary`.
- **Texte secondaire** : Gray 30 (`#c6c6c6`). `--cds-text-secondary`.
- **Bordure subtile** : Gray 80 (`#393939`). `--cds-border-subtle`.
- **Interactif** : Blue 40 (`#78a9ff`). Les liens et éléments interactifs s'éclaircissent pour le contraste.

## 3. Règles typographiques

### Famille de polices
- **Primaire** : `IBM Plex Sans`, avec replis : `Helvetica Neue, Arial, sans-serif`
- **Monospace** : `IBM Plex Mono`, avec replis : `Menlo, Courier, monospace`
- **Serif** (utilisation limitée) : `IBM Plex Serif`, pour les contextes éditoriaux/expressifs
- **Police d'icônes** : `ibm_icons` — glyphes d'icônes propriétaires à 20px

### Hiérarchie

| Rôle | Police | Taille | Graisse | Hauteur de ligne | Espacement de lettres | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display 01 | IBM Plex Sans | 60px (3.75rem) | 300 (Light) | 1.17 (70px) | 0 | Impact maximal, graisse légère pour l'élégance |
| Display 02 | IBM Plex Sans | 48px (3.00rem) | 300 (Light) | 1.17 (56px) | 0 | Héros secondaire, repli responsive |
| Heading 01 | IBM Plex Sans | 42px (2.63rem) | 300 (Light) | 1.19 (50px) | 0 | Titre expressif |
| Heading 02 | IBM Plex Sans | 32px (2.00rem) | 400 (Regular) | 1.25 (40px) | 0 | Titres de section |
| Heading 03 | IBM Plex Sans | 24px (1.50rem) | 400 (Regular) | 1.33 (32px) | 0 | Titres de sous-section |
| Heading 04 | IBM Plex Sans | 20px (1.25rem) | 600 (Semibold) | 1.40 (28px) | 0 | Titres de cartes, en-têtes de fonctionnalités |
| Heading 05 | IBM Plex Sans | 20px (1.25rem) | 400 (Regular) | 1.40 (28px) | 0 | Titres de cartes plus légers |
| Body Long 01 | IBM Plex Sans | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Texte de lecture standard |
| Body Long 02 | IBM Plex Sans | 16px (1.00rem) | 600 (Semibold) | 1.50 (24px) | 0 | Corps accentué, étiquettes |
| Body Short 01 | IBM Plex Sans | 14px (0.88rem) | 400 (Regular) | 1.29 (18px) | 0.16px | Corps compact, légendes |
| Body Short 02 | IBM Plex Sans | 14px (0.88rem) | 600 (Semibold) | 1.29 (18px) | 0.16px | Légendes grasses, éléments de navigation |
| Caption 01 | IBM Plex Sans | 12px (0.75rem) | 400 (Regular) | 1.33 (16px) | 0.32px | Métadonnées, horodatages |
| Code 01 | IBM Plex Mono | 14px (0.88rem) | 400 (Regular) | 1.43 (20px) | 0.16px | Code en ligne, terminal |
| Code 02 | IBM Plex Mono | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Blocs de code |
| Mono Display | IBM Plex Mono | 42px (2.63rem) | 400 (Regular) | 1.19 (50px) | 0 | Décoration mono pour héros |

### Principes
- **Graisse légère aux tailles d'affichage** : L'ensemble de types expressif de Carbon utilise la graisse 300 (Light) à partir de 42px+. Cela crée une tension distincte — le contenu parle avec autorité d'entreprise tandis que les letterforms murmurent avec légèreté typographique.
- **Micro-tracking aux petites tailles** : 0,16px d'espacement de lettres à 14px et 0,32px à 12px. Ces valeurs apparemment négligeables sont l'arme secrète de Carbon pour la lisibilité aux tailles compactes — elles ouvrent juste assez les letterforms serrées d'IBM Plex.
- **Trois graisses fonctionnelles** : 300 (affichage/expressif), 400 (corps/lecture), 600 (emphase/étiquettes UI). La graisse 700 est intentionnellement absente de l'échelle typographique de production.
- **Productif vs. Expressif** : Les ensembles productifs utilisent des hauteurs de ligne plus serrées (1,29) pour les UI denses. Les ensembles expressifs respirent davantage (1,40–1,50) pour le marketing et le contenu éditorial.

## 4. Stylisation des composants

### Boutons

**Bouton primaire (bleu)**
- Fond : `#0f62fe` (Blue 60) → `--cds-button-primary`
- Texte : `#ffffff` (blanc)
- Padding : 14px 63px 14px 15px (asymétrique — espace pour l'icône de fin)
- Bordure : 1px solid transparent
- Rayon de bordure : 0px (rectangle net — la signature Carbon)
- Hauteur : 48px (par défaut), 40px (compact), 64px (expressif)
- Survol : `#0353e9` (Blue 60 Hover) → `--cds-button-primary-hover`
- Actif : `#002d9c` (Blue 80) → `--cds-button-primary-active`
- Focus : `2px solid #0f62fe` en retrait + `1px solid #ffffff` intérieur

**Bouton secondaire (gris)**
- Fond : `#393939` (Gray 80)
- Texte : `#ffffff`
- Survol : `#4c4c4c` (Gray 70)
- Actif : `#6f6f6f` (Gray 60)
- Même padding/rayon que le primaire

**Bouton tertiaire (Ghost Blue)**
- Fond : transparent
- Texte : `#0f62fe` (Blue 60)
- Bordure : 1px solid `#0f62fe`
- Survol : texte `#0353e9` + teinte de fond Blue 10
- Rayon de bordure : 0px

**Bouton Ghost**
- Fond : transparent
- Texte : `#0f62fe` (Blue 60)
- Padding : 14px 16px
- Bordure : aucune
- Survol : teinte de fond `#e8e8e8`

**Bouton Danger**
- Fond : `#da1e28` (Red 60)
- Texte : `#ffffff`
- Survol : `#b81921` (Red 70)

### Cartes et conteneurs
- Fond : `#ffffff` sur thème blanc, `#f4f4f4` (Gray 10) pour les cartes élevées
- Bordure : aucune (design plat — pas de bordure ni d'ombre sur la plupart des cartes)
- Rayon de bordure : 0px (en accord avec l'esthétique des boutons rectangulaires)
- Survol : le fond passe à `#e8e8e8` (Gray 10 Hover) pour les cartes cliquables
- Padding du contenu : 16px
- Séparation : superposition de couleurs de fond (blanc → gray 10 → blanc) plutôt que des ombres

### Champs de saisie et formulaires
- Fond : `#f4f4f4` (Gray 10) — `--cds-field`
- Texte : `#161616` (Gray 100)
- Padding : 0px 16px (horizontal uniquement)
- Hauteur : 40px (par défaut), 48px (grand)
- Bordure : aucune sur les côtés/en haut — `2px solid transparent` en bas
- Bordure inférieure active : `2px solid #161616` (Gray 100)
- Focus : bordure inférieure `2px solid #0f62fe` (Blue 60) — `--cds-focus`
- Erreur : bordure inférieure `2px solid #da1e28` (Red 60)
- Étiquette : 12px IBM Plex Sans, espacement de 0,32px, Gray 70
- Texte d'aide : 12px, Gray 60
- Remplacement : Gray 60 (`#6f6f6f`)
- Rayon de bordure : 0px (haut) — les champs ont des coins nets

### Navigation
- Fond : `#161616` (Gray 100) — masthead sombre pleine largeur
- Hauteur : 48px
- Logo : logo IBM à 8 barres, blanc sur sombre, aligné à gauche
- Liens : 14px IBM Plex Sans, graisse 400, `#c6c6c6` (Gray 30) par défaut
- Survol de lien : texte `#ffffff`
- Lien actif : `#ffffff` avec indicateur de bordure inférieure
- Sélecteur de plateforme : onglets horizontaux alignés à gauche
- Recherche : champ de recherche coulissant déclenché par icône
- Mobile : hamburger avec panneau coulissant vers la gauche

### Liens
- Par défaut : `#0f62fe` (Blue 60) sans soulignement
- Survol : `#0043ce` (Blue 70) avec soulignement
- Visité : reste Blue 60 (pas de changement d'état visité)
- Liens en ligne : soulignés par défaut dans le corps du texte

### Composants distinctifs

**Bloc de contenu (Héros/Fonctionnalité)**
- Bandes de fond pleine largeur alternant blanc/gray-10
- Titre aligné à gauche avec type d'affichage de 60px ou 48px
- Bouton bleu primaire avec icône de flèche comme CTA
- Image/illustration alignée à droite ou en dessous sur mobile

**Tuile (carte cliquable)**
- Fond : `#f4f4f4` ou `#ffffff`
- Bordure inférieure pleine largeur ou changement de fond au survol
- Icône de flèche en bas à droite au survol
- Pas d'ombre — la planéité est l'identité

**Tag/Étiquette**
- Fond : couleur contextuelle à 10% d'opacité (ex. : Blue 10, Red 10)
- Texte : couleur de grade 60 correspondante
- Padding : 4px 8px
- Rayon de bordure : 24px (pilule — exception à la règle 0px)
- Police : 12px graisse 400

**Bannière de notification**
- Barre pleine largeur, typiquement fond Blue 60 ou Gray 100
- Texte blanc, 14px
- Icône de fermeture/rejet alignée à droite

## 5. Principes de mise en page

### Système d'espacement
- Unité de base : 8px (grille 2x de Carbon)
- Échelle d'espacement des composants : 2px, 4px, 8px, 12px, 16px, 24px, 32px, 40px, 48px
- Échelle d'espacement de mise en page : 16px, 24px, 32px, 48px, 64px, 80px, 96px, 160px
- Mini unité : 8px (espacement utilisable minimal)
- Padding à l'intérieur des composants : généralement 16px
- Espace entre cartes/tuiles : 1px (filet) ou 16px (standard)

### Grille et conteneur
- Grille à 16 colonnes (système de grille 2x de Carbon)
- Largeur maximale du contenu : 1584px (point de rupture maximum)
- Gouttières de colonnes : 32px (16px sur mobile)
- Marges : 16px (mobile), 32px (tablette+)
- Le contenu couvre généralement 8 à 12 colonnes pour des longueurs de ligne lisibles
- Les sections pleine largeur alternent avec le contenu délimité

### Philosophie des espaces blancs
- **Densité fonctionnelle** : Carbon favorise la densité productive plutôt que les espaces blancs expansifs. Les sections sont étroitement emballées par rapport aux systèmes de design grand public — cela reflète l'ADN entreprise d'IBM.
- **Zonage par couleur de fond** : Au lieu de rembourrage massif entre les sections, IBM utilise des couleurs de fond alternées (blanc → gray 10 → blanc) pour créer une séparation visuelle avec un espace vertical minimal.
- **Rythme cohérent de 48px** : Les transitions de sections majeures utilisent un espacement vertical de 48px. Les sections héros peuvent utiliser 80px–96px.

### Échelle de rayon de bordure
- **0px** : Boutons primaires, champs de saisie, tuiles, cartes — le traitement dominant. Carbon est fondamentalement rectangulaire.
- **2px** : Occasionnellement sur de petits éléments interactifs (tags)
- **24px** : Tags/étiquettes (forme pilule — la seule exception arrondie)
- **50%** : Cercles d'avatar, conteneurs d'icônes

## 6. Profondeur et élévation

| Niveau | Traitement | Utilisation |
|-------|-----------|-----|
| Plat (Niveau 0) | Pas d'ombre, fond `#ffffff` | Surface de page par défaut |
| Layer 01 | Pas d'ombre, fond `#f4f4f4` | Cartes, tuiles, sections alternées |
| Layer 02 | Pas d'ombre, fond `#e0e0e0` | Panneaux élevés dans Layer 01 |
| Raised | `0 2px 6px rgba(0,0,0,0.3)` | Menus déroulants, infobulles, menus de débordement |
| Overlay | `0 2px 6px rgba(0,0,0,0.3)` + scrim sombre | Boîtes de dialogue modales, panneaux latéraux |
| Focus | `2px solid #0f62fe` en retrait + `1px solid #ffffff` | Anneau de focus clavier |
| Bordure inférieure | `2px solid #161616` sur le bord inférieur | Champ de saisie actif, indicateur d'onglet actif |

**Philosophie des ombres** : Carbon évite délibérément les ombres. IBM obtient la profondeur principalement par la superposition de couleurs de fond — en empilant des surfaces de gris progressivement plus sombres plutôt qu'en ajoutant des box-shadows. Cela crée une esthétique plate, inspirée de l'impression, où la hiérarchie est communiquée par la valeur de couleur et non par la lumière simulée. Les ombres sont réservées exclusivement aux éléments flottants (menus déroulants, infobulles, modales) où l'élément chevauche réellement le contenu. Cette retenue donne à la rare ombre un impact significatif — quand quelque chose flotte dans Carbon, c'est important.

## 7. À faire et à ne pas faire

### À faire
- Utiliser IBM Plex Sans en graisse 300 pour les tailles d'affichage (42px+) — la légèreté est intentionnelle
- Appliquer un espacement de 0,16px sur le texte de corps de 14px et 0,32px sur les légendes de 12px
- Utiliser un rayon de bordure de 0px sur les boutons, les champs, les cartes et les tuiles — les rectangles sont le système
- Référencer les noms de tokens `--cds-*` lors de l'implémentation (ex. : `--cds-button-primary`, `--cds-text-primary`)
- Utiliser la superposition de couleurs de fond (blanc → gray 10 → gray 20) pour la profondeur au lieu des ombres
- Utiliser une bordure inférieure (pas de boîte) pour les indicateurs de champs de saisie
- Maintenir la hauteur de bouton par défaut de 48px et le rembourrage asymétrique pour accueillir les icônes
- Appliquer Blue 60 (`#0f62fe`) comme unique couleur d'accentuation — un seul bleu pour tout régir

### À ne pas faire
- Ne pas arrondir les coins des boutons — le rayon 0px est l'identité Carbon
- Ne pas utiliser d'ombres sur les cartes ou les tuiles — la planéité est le point
- Ne pas introduire de couleurs d'accentuation supplémentaires — le système IBM est monochrome + bleu
- Ne pas utiliser la graisse 700 (Bold) — l'échelle s'arrête à 600 (Semibold)
- Ne pas ajouter d'espacement de lettres au texte de taille d'affichage — le tracking ne s'applique qu'à 14px et en dessous
- Ne pas encadrer les champs de saisie avec des bordures complètes — les champs Carbon n'utilisent que la bordure inférieure
- Ne pas utiliser de fonds dégradés — les surfaces IBM sont des couleurs unies plates
- Ne pas dévier de la grille d'espacement de 8px — chaque valeur doit être divisible par 8 (avec 2px et 4px pour les micro-ajustements)

## 8. Comportement responsive

### Points de rupture
| Nom | Largeur | Changements clés |
|------|-------|-------------|
| Small (sm) | 320px | Colonne unique, navigation hamburger, marges de 16px |
| Medium (md) | 672px | Les grilles à 2 colonnes commencent, contenu élargi |
| Large (lg) | 1056px | Navigation complète visible, grilles de 3 à 4 colonnes |
| X-Large (xlg) | 1312px | Densité maximale de contenu, mises en page larges |
| Max | 1584px | Largeur maximale du contenu, centré avec marges |

### Cibles tactiles
- Hauteur de bouton : 48px par défaut, minimum 40px (compact)
- Liens de navigation : hauteur de rangée de 48px pour le toucher
- Hauteur de champ : 40px par défaut, 48px grand
- Boutons d'icônes : cible tactile carrée de 48px
- Éléments de menu mobile : rangées pleine largeur de 48px

### Stratégie de réduction
- Héros : affichage 60px → 42px → titre 32px à mesure que le viewport rétrécit
- Navigation : masthead horizontal complet → hamburger avec panneau coulissant
- Grille : 4 colonnes → 2 colonnes → colonne unique
- Tuiles/cartes : grille horizontale → pile verticale
- Images : maintenir le ratio d'aspect, max-width 100%
- Pied de page : groupes de liens multicolonnes → colonne unique empilée
- Padding de section : 48px → 32px → 16px

### Comportement des images
- Images responsives avec `max-width: 100%`
- Les illustrations de produits s'adaptent proportionnellement
- Les images héros peuvent passer de côte à côte à empilées en dessous
- Les visualisations de données maintiennent le ratio d'aspect avec défilement horizontal sur mobile

## 9. Guide de prompts pour agents

### Référence rapide des couleurs
- CTA primaire : IBM Blue 60 (`#0f62fe`)
- Fond : Blanc (`#ffffff`)
- Texte de titre : Gray 100 (`#161616`)
- Texte de corps : Gray 100 (`#161616`)
- Texte secondaire : Gray 70 (`#525252`)
- Surface/Carte : Gray 10 (`#f4f4f4`)
- Bordure : Gray 30 (`#c6c6c6`)
- Lien : Blue 60 (`#0f62fe`)
- Survol de lien : Blue 70 (`#0043ce`)
- Anneau de focus : Blue 60 (`#0f62fe`)
- Erreur : Red 60 (`#da1e28`)
- Succès : Green 50 (`#24a148`)

### Exemples de prompts de composants
- "Créez une section héros sur fond blanc. Titre à 60px IBM Plex Sans graisse 300, hauteur de ligne 1,17, couleur #161616. Sous-titre à 16px graisse 400, hauteur de ligne 1,50, couleur #525252, largeur maximale 640px. Bouton CTA bleu (fond #0f62fe, texte #ffffff, rayon de bordure 0px, hauteur 48px, padding 14px 63px 14px 15px)."
- "Concevez une tuile carte : fond #f4f4f4, rayon de bordure 0px, padding 16px. Titre à 20px IBM Plex Sans graisse 600, hauteur de ligne 1,40, couleur #161616. Corps à 14px graisse 400, espacement de lettres 0,16px, hauteur de ligne 1,29, couleur #525252. Survol : le fond passe à #e8e8e8."
- "Construisez un champ de formulaire : fond #f4f4f4, rayon de bordure 0px, hauteur 40px, padding horizontal 16px. Étiquette au-dessus à 12px graisse 400, espacement de lettres 0,32px, couleur #525252. Bordure inférieure : 2px solid transparent par défaut, 2px solid #0f62fe au focus. Remplacement : #6f6f6f."
- "Créez une barre de navigation sombre : fond #161616, hauteur 48px. Logo IBM blanc aligné à gauche. Liens à 14px IBM Plex Sans graisse 400, couleur #c6c6c6. Survol : texte #ffffff. Actif : #ffffff avec bordure inférieure de 2px."
- "Construisez un composant tag : fond Blue 10 (#edf5ff), texte Blue 60 (#0f62fe), padding 4px 8px, rayon de bordure 24px, 12px IBM Plex Sans graisse 400."

### Guide d'itération
1. Toujours utiliser un rayon de bordure de 0px sur les boutons, les champs et les cartes — c'est non négociable dans Carbon
2. Espacement de lettres uniquement aux petites tailles : 0,16px à 14px, 0,32px à 12px — jamais sur le texte d'affichage
3. Trois graisses : 300 (affichage), 400 (corps), 600 (emphase) — pas de gras
4. Blue 60 est l'unique couleur d'accentuation — ne pas introduire de teintes d'accentuation secondaires
5. La profondeur vient de la superposition de couleurs de fond (blanc → `#f4f4f4` → `#e0e0e0`), pas des ombres
6. Les champs de saisie n'ont qu'une bordure inférieure, jamais entièrement encadrés
7. Utiliser le préfixe `--cds-` pour le nommage des tokens afin de rester compatible Carbon
8. 48px est la hauteur universelle des éléments interactifs
