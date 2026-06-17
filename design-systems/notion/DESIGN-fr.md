# Système de design inspiré de Notion

> Category: Productivité & SaaS
> Espace de travail tout-en-un. Minimalisme chaleureux, titres avec empattements, surfaces douces.

## 1. Thème visuel & Atmosphère

Le site de Notion incarne la philosophie de l'outil lui-même : une toile blanche qui s'efface. Le système de design repose sur des neutres chauds plutôt que sur des gris froids, créant un minimalisme distinctement accueillant qui évoque davantage un papier de qualité qu'un verre stérile. Le canevas de page est blanc pur (`#ffffff`), mais le texte n'est pas noir pur — c'est un quasi-noir chaud (`rgba(0,0,0,0.95)`) qui adoucit imperceptiblement l'expérience de lecture. La gamme de gris chauds (`#f6f5f4`, `#31302e`, `#615d59`, `#a39e98`) porte de subtils sous-tons jaune-brun, conférant à l'interface une chaleur tactile, presque analogique.

La police NotionInter (un Inter modifié) est la colonne vertébrale du système. Aux tailles d'affichage (64px), elle utilise un espacement négatif agressif (-2.125px), créant des titres qui paraissent comprimés et précis. La plage de graisses est plus large que celle des systèmes typiques : 400 pour le corps du texte, 500 pour les éléments d'interface, 600 pour les étiquettes semi-grasses et 700 pour les titres d'affichage. Les fonctionnalités OpenType `"lnum"` (chiffres alignés) et `"locl"` (formes localisées) sont activées sur les textes de grande taille, ajoutant une sophistication typographique qui récompense la lecture attentive.

Ce qui rend le langage visuel de Notion distinctif, c'est sa philosophie des bordures. Plutôt que des bordures épaisses ou des ombres, Notion utilise des bordures ultrafines `1px solid rgba(0,0,0,0.1)` — des bordures qui existent comme des chuchotements, des lignes de séparation à peine perceptibles qui créent de la structure sans lourdeur. Le système d'ombres est tout aussi mesuré : des empilements multicouches dont l'opacité cumulée ne dépasse jamais 0,05, créant une profondeur ressentie plutôt que vue.

**Caractéristiques clés :**
- NotionInter (Inter modifié) avec espacement négatif aux tailles d'affichage (-2.125px à 64px)
- Palette de neutres chauds : les gris portent des sous-tons jaune-brun (`#f6f5f4` blanc chaud, `#31302e` sombre chaud)
- Texte quasi-noir via `rgba(0,0,0,0.95)` — pas du noir pur, crée une micro-chaleur
- Bordures ultrafines : `1px solid rgba(0,0,0,0.1)` partout — séparation au poids d'un murmure
- Empilements d'ombres multicouches avec une opacité individuelle inférieure à 0,05 pour une profondeur à peine perceptible
- Notion Blue (`#0075de`) comme unique couleur d'accent pour les CTA et les éléments interactifs
- Badges en pilule (rayon 9999px) avec fonds bleus teintés pour les indicateurs d'état
- Unité d'espacement de base de 8px avec une échelle organique non rigide

## 2. Palette de couleurs & Rôles

### Primaire
- **Notion Black** (`rgba(0,0,0,0.95)` / `#000000f2`) : Texte primaire, titres, corps du texte. L'opacité à 95 % adoucit le noir pur sans sacrifier la lisibilité.
- **Blanc pur** (`#ffffff`) : Arrière-plan de page, surfaces de cartes, texte de bouton sur fond bleu.
- **Notion Blue** (`#0075de`) : CTA primaire, couleur de lien, accent interactif — la seule couleur saturée dans le chrome d'interface principal.

### Marque secondaire
- **Bleu marine profond** (`#213183`) : Couleur de marque secondaire, utilisée avec parcimonie pour l'accentuation et les sections sombres de fonctionnalités.
- **Bleu actif** (`#005bab`) : État actif/pressé du bouton — variante plus sombre de Notion Blue.

### Gamme de neutres chauds
- **Blanc chaud** (`#f6f5f4`) : Teinte de surface d'arrière-plan, alternance de sections, remplissage subtil de cartes. Le sous-ton jaune est essentiel.
- **Sombre chaud** (`#31302e`) : Arrière-plan de surface sombre, texte de section sombre. Plus chaud que les gris standards.
- **Gris chaud 500** (`#615d59`) : Texte secondaire, descriptions, étiquettes atténuées.
- **Gris chaud 300** (`#a39e98`) : Texte de remplacement, états désactivés, texte de légende.

### Couleurs d'accent sémantiques
- **Bleu-vert** (`#2a9d99`) : États de succès, indicateurs positifs.
- **Vert** (`#1aae39`) : Confirmation, badges de complétion.
- **Orange** (`#dd5b00`) : États d'avertissement, indicateurs d'attention.
- **Rose** (`#ff64c8`) : Accent décoratif, mises en évidence de fonctionnalités.
- **Violet** (`#391c57`) : Fonctionnalités premium, accents profonds.
- **Brun** (`#523410`) : Accent terreux, sections de fonctionnalités chaleureuses.

### Interactif
- **Bleu de lien** (`#0075de`) : Couleur de lien primaire avec soulignement au survol.
- **Bleu clair de lien** (`#62aef0`) : Variante de lien plus claire pour les fonds sombres.
- **Bleu de focus** (`#097fe8`) : Anneau de focus sur les éléments interactifs.
- **Arrière-plan bleu de badge** (`#f2f9ff`) : Arrière-plan de badge en pilule, surface bleue teintée.
- **Texte bleu de badge** (`#097fe8`) : Texte de badge en pilule, bleu plus foncé pour la lisibilité.

### Ombres & Profondeur
- **Ombre de carte** (`rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`) : Élévation de carte multicouche.
- **Ombre profonde** (`rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px`) : Élévation profonde à cinq couches pour les modaux et contenus mis en avant.
- **Bordure murmure** (`1px solid rgba(0,0,0,0.1)`) : Bordure de séparation standard — cartes, séparateurs, sections.

## 3. Règles typographiques

### Famille de polices
- **Primaire** : `NotionInter`, avec les substituts : `Inter, -apple-system, system-ui, Segoe UI, Helvetica, Apple Color Emoji, Arial, Segoe UI Emoji, Segoe UI Symbol`
- **Fonctionnalités OpenType** : `"lnum"` (chiffres alignés) et `"locl"` (formes localisées) activées sur les textes d'affichage et de titre.

### Hiérarchie

| Rôle | Police | Taille | Graisse | Hauteur de ligne | Espacement | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Affichage Hero | NotionInter | 64px (4.00rem) | 700 | 1.00 (serré) | -2.125px | Compression maximale, titres d'affichage |
| Affichage secondaire | NotionInter | 54px (3.38rem) | 700 | 1.04 (serré) | -1.875px | Hero secondaire, titres de fonctionnalités |
| Titre de section | NotionInter | 48px (3.00rem) | 700 | 1.00 (serré) | -1.5px | Titres de sections de fonctionnalités, avec `"lnum"` |
| Sous-titre large | NotionInter | 40px (2.50rem) | 700 | 1.50 | normal | Titres de cartes, sous-sections de fonctionnalités |
| Sous-titre | NotionInter | 26px (1.63rem) | 700 | 1.23 (serré) | -0.625px | Sous-titres de section, en-têtes de contenu |
| Titre de carte | NotionInter | 22px (1.38rem) | 700 | 1.27 (serré) | -0.25px | Cartes de fonctionnalités, titres de listes |
| Corps large | NotionInter | 20px (1.25rem) | 600 | 1.40 | -0.125px | Introductions, descriptions de fonctionnalités |
| Corps | NotionInter | 16px (1.00rem) | 400 | 1.50 | normal | Texte de lecture standard |
| Corps medium | NotionInter | 16px (1.00rem) | 500 | 1.50 | normal | Navigation, texte d'interface accentué |
| Corps semi-gras | NotionInter | 16px (1.00rem) | 600 | 1.50 | normal | Étiquettes fortes, états actifs |
| Corps gras | NotionInter | 16px (1.00rem) | 700 | 1.50 | normal | Titres à la taille du corps |
| Nav / Bouton | NotionInter | 15px (0.94rem) | 600 | 1.33 | normal | Liens de navigation, texte de bouton |
| Légende | NotionInter | 14px (0.88rem) | 500 | 1.43 | normal | Métadonnées, étiquettes secondaires |
| Légende légère | NotionInter | 14px (0.88rem) | 400 | 1.43 | normal | Légendes de corps, descriptions |
| Badge | NotionInter | 12px (0.75rem) | 600 | 1.33 | 0.125px | Badges en pilule, balises, étiquettes d'état |
| Micro-étiquette | NotionInter | 12px (0.75rem) | 400 | 1.33 | 0.125px | Petites métadonnées, horodatages |

### Principes
- **Compression à l'échelle** : NotionInter aux tailles d'affichage utilise un espacement de -2.125px à 64px, se relâchant progressivement à -0.625px à 26px et normal à 16px. La compression crée de la densité dans les titres tout en maintenant la lisibilité aux tailles du corps.
- **Système à quatre graisses** : 400 (corps/lecture), 500 (interface/interactif), 600 (accentuation/navigation), 700 (titres/affichage). La plage de graisses plus large comparée à la plupart des systèmes permet une hiérarchie nuancée.
- **Mise à l'échelle chaleureuse** : La hauteur de ligne se resserre à mesure que la taille augmente — 1,50 pour le corps (16px), 1,23–1,27 pour les sous-titres, 1,00–1,04 pour l'affichage. Cela crée des titres plus denses et plus percutants.
- **Micro-suivi des badges** : Le texte de badge à 12px utilise un espacement positif (0,125px) — le seul suivi positif du système, créant un texte petit plus large et plus lisible.

## 4. Styles des composants

### Boutons

**Bleu primaire**
- Arrière-plan : `#0075de` (Notion Blue)
- Texte : `#ffffff`
- Rembourrage : 8px 16px
- Rayon : 4px (subtil)
- Bordure : `1px solid transparent`
- Survol : l'arrière-plan s'assombrit vers `#005bab`
- Actif : transformation scale(0.9)
- Focus : contour `2px solid`, ombre `var(--shadow-level-200)`
- Utilisation : CTA primaire (« Get Notion free », « Try it »)

**Secondaire / Tertiaire**
- Arrière-plan : `rgba(0,0,0,0.05)` (gris chaud translucide)
- Texte : `#000000` (quasi-noir)
- Rembourrage : 8px 16px
- Rayon : 4px
- Survol : changement de couleur du texte, scale(1.05)
- Actif : transformation scale(0.9)
- Utilisation : Actions secondaires, soumissions de formulaires

**Fantôme / Bouton lien**
- Arrière-plan : transparent
- Texte : `rgba(0,0,0,0.95)`
- Décoration : soulignement au survol
- Utilisation : Actions tertiaires, liens en ligne

**Bouton badge en pilule**
- Arrière-plan : `#f2f9ff` (bleu teinté)
- Texte : `#097fe8`
- Rembourrage : 4px 8px
- Rayon : 9999px (pilule complète)
- Police : 12px graisse 600
- Utilisation : Badges d'état, étiquettes de fonctionnalités, balises « New »

### Cartes & Conteneurs
- Arrière-plan : `#ffffff`
- Bordure : `1px solid rgba(0,0,0,0.1)` (bordure murmure)
- Rayon : 12px (cartes standard), 16px (cartes featured/hero)
- Ombre : `rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`
- Survol : intensification subtile de l'ombre
- Cartes d'image : rayon supérieur de 12px, l'image remplit la moitié supérieure

### Champs & Formulaires
- Arrière-plan : `#ffffff`
- Texte : `rgba(0,0,0,0.9)`
- Bordure : `1px solid #dddddd`
- Rembourrage : 6px
- Rayon : 4px
- Focus : anneau de contour bleu
- Remplacement : gris chaud `#a39e98`

### Navigation
- Navigation horizontale épurée sur fond blanc, non collante
- Logo de marque aligné à gauche (icône 33x34px + logotype)
- Liens : NotionInter 15px graisse 500–600, texte quasi-noir
- Survol : changement de couleur vers `var(--color-link-primary-text-hover)`
- CTA : bouton pilule bleu (« Get Notion free ») aligné à droite
- Mobile : menu hamburger replié
- Menus déroulants de produit avec menus catégorisés multi-niveaux

### Traitement des images
- Captures d'écran de produit avec bordure `1px solid rgba(0,0,0,0.1)`
- Images avec coins supérieurs arrondis : rayon `12px 12px 0px 0px`
- Les aperçus de tableau de bord/espace de travail dominent les sections de fonctionnalités
- Fonds en dégradé chaud derrière les illustrations hero (illustrations de personnages décoratives)

### Composants distinctifs

**Cartes de fonctionnalités avec illustrations**
- En-têtes illustratifs de grande taille (La Grande Vague, captures d'écran de l'interface produit)
- Carte à rayon 12px avec bordure murmure
- Titre à 22px graisse 700, description à 16px graisse 400
- Variante d'arrière-plan blanc chaud (`#f6f5f4`) pour les sections alternées

**Barre de confiance / Grille de logos**
- Logos d'entreprise (section des équipes de confiance) dans leurs couleurs de marque
- Défilement horizontal ou disposition en grille avec nombre d'équipes
- Affichage de métriques : grand nombre + description

**Cartes de métriques**
- Affichage de grand nombre (p. ex., « 4 200 $ de ROI »)
- NotionInter 40px+ graisse 700 pour la métrique
- Description dessous en texte de corps gris chaud
- Conteneur de carte avec bordure murmure

## 5. Principes de mise en page

### Système d'espacement
- Unité de base : 8px
- Échelle : 2px, 3px, 4px, 5px, 6px, 7px, 8px, 11px, 12px, 14px, 16px, 24px, 32px
- Échelle organique non rigide avec valeurs fractionnaires (5,6px, 6,4px) pour les micro-ajustements

### Grille & Conteneur
- Largeur maximale du contenu : environ 1200px
- Hero : colonne unique centrée avec un généreux rembourrage supérieur (80–120px)
- Sections de fonctionnalités : grilles à 2–3 colonnes pour les cartes
- Fonds de section blanc chaud (`#f6f5f4`) pleine largeur pour l'alternance
- Captures d'écran de code/tableau de bord délimitées avec bordure murmure

### Philosophie de l'espace blanc
- **Rythme vertical généreux** : 64–120px entre les sections principales. Notion laisse le contenu respirer avec un rembourrage vertical généreux.
- **Alternance chaleureuse** : Les sections blanches alternent avec les sections blanc chaud (`#f6f5f4`), créant un rythme visuel doux sans ruptures de couleur abruptes.
- **Densité centrée sur le contenu** : Les blocs de texte du corps sont compacts (hauteur de ligne 1,50) mais entourés de marges généreuses, créant des îlots de contenu lisible dans une mer d'espace blanc.

### Échelle des rayons de bordure
- Micro (4px) : Boutons, champs, éléments interactifs fonctionnels
- Subtil (5px) : Liens, éléments de liste, éléments de menu
- Standard (8px) : Petites cartes, conteneurs, éléments en ligne
- Confortable (12px) : Cartes standard, conteneurs de fonctionnalités, dessus d'images
- Grand (16px) : Cartes hero, contenu mis en avant, blocs promotionnels
- Pilule complète (9999px) : Badges, pilules, indicateurs d'état
- Cercle (100%) : Indicateurs d'onglets, avatars

## 6. Profondeur & Élévation

| Niveau | Traitement | Utilisation |
|-------|-----------|-----|
| Plat (Niveau 0) | Pas d'ombre, pas de bordure | Arrière-plan de page, blocs de texte |
| Murmure (Niveau 1) | `1px solid rgba(0,0,0,0.1)` | Bordures standard, contours de cartes, séparateurs |
| Carte douce (Niveau 2) | Empilement d'ombres à 4 couches (opacité max. 0,04) | Cartes de contenu, blocs de fonctionnalités |
| Carte profonde (Niveau 3) | Empilement d'ombres à 5 couches (opacité max. 0,05, flou 52px) | Modaux, panneaux mis en avant, éléments hero |
| Focus (Accessibilité) | Contour `2px solid var(--focus-color)` | Focus clavier sur tous les éléments interactifs |

**Philosophie des ombres** : Le système d'ombres de Notion utilise plusieurs couches avec une opacité individuelle extrêmement basse (0,01 à 0,05) qui s'accumulent en une élévation douce et naturelle. L'ombre de carte à 4 couches s'étend d'un flou de 1,04px à 18px, créant un dégradé de profondeur plutôt qu'une ombre dure unique. L'ombre profonde à 5 couches s'étend jusqu'à 52px de flou à 0,05 d'opacité, produisant une occlusion ambiante qui ressemble à la lumière naturelle plutôt qu'à une profondeur générée par ordinateur. Cette approche multicouche fait en sorte que les éléments semblent intégrés dans la page plutôt que flottant au-dessus.

### Profondeur décorative
- Section hero : illustrations de personnages décoratives (style ludique, dessiné à la main)
- Alternance de sections : changements d'arrière-plan du blanc au blanc chaud (`#f6f5f4`)
- Pas de bordures de section dures — la séparation vient des changements de couleur d'arrière-plan et de l'espacement

## 7. Comportement réactif

### Points de rupture
| Nom | Largeur | Changements clés |
|------|-------|-------------|
| Mobile petit | <400px | Colonne unique serrée, rembourrage minimal |
| Mobile | 400–600px | Mobile standard, disposition empilée |
| Tablette petit | 600–768px | Les grilles à 2 colonnes commencent |
| Tablette | 768–1080px | Grilles de cartes complètes, rembourrage étendu |
| Bureau petit | 1080–1200px | Disposition bureau standard |
| Bureau | 1200–1440px | Disposition complète, largeur de contenu maximale |
| Grand bureau | >1440px | Centré, marges généreuses |

### Cibles tactiles
- Les boutons utilisent un rembourrage confortable (8px–16px vertical)
- Liens de navigation à 15px avec espacement adéquat
- Les badges en pilule ont 8px de rembourrage horizontal pour les cibles de tap
- Le bouton menu mobile utilise un bouton hamburger standard

### Stratégie de repliement
- Hero : affichage 64px → passe à 40px → 26px sur mobile, espacement proportionnel maintenu
- Navigation : liens horizontaux + CTA bleu → menu hamburger
- Cartes de fonctionnalités : 3 colonnes → 2 colonnes → colonne unique empilée
- Captures d'écran de produit : rapport d'aspect maintenu avec des images réactives
- Logos de barre de confiance : grille → défilement horizontal sur mobile
- Pied de page : multi-colonnes → colonne unique empilée
- Espacement de section : 80px+ → 48px sur mobile

### Comportement des images
- Les captures d'écran de l'espace de travail maintiennent la bordure murmure à toutes les tailles
- Les illustrations hero se mettent à l'échelle proportionnellement
- Les captures d'écran de produit utilisent des images réactives avec un rayon de bordure cohérent
- Les sections blanc chaud pleine largeur maintiennent le traitement bord à bord

## 8. Accessibilité & États

### Système de focus
- Tous les éléments interactifs reçoivent des indicateurs de focus visibles
- Contour de focus : `2px solid` avec couleur de focus + niveau d'ombre 200
- Navigation au clavier prise en charge dans tous les composants interactifs
- Texte à contraste élevé : quasi-noir sur blanc dépasse WCAG AAA (>14:1 de rapport)

### États interactifs
- **Par défaut** : Apparence standard avec bordures murmure
- **Survol** : Changement de couleur sur le texte, scale(1.05) sur les boutons, soulignement sur les liens
- **Actif/Pressé** : Transformation scale(0.9), variante d'arrière-plan plus sombre
- **Focus** : Anneau de contour bleu avec renforcement de l'ombre
- **Désactivé** : Texte gris chaud (`#a39e98`), opacité réduite

### Contraste des couleurs
- Texte primaire (rgba(0,0,0,0.95)) sur blanc : rapport d'environ 18:1
- Texte secondaire (#615d59) sur blanc : rapport d'environ 5,5:1 (WCAG AA)
- CTA bleu (#0075de) sur blanc : rapport d'environ 4,6:1 (WCAG AA pour grand texte)
- Texte de badge (#097fe8) sur fond de badge (#f2f9ff) : rapport d'environ 4,5:1 (WCAG AA pour grand texte)

## 9. Guide des prompts pour agents

### Référence rapide des couleurs
- CTA primaire : Notion Blue (`#0075de`)
- Arrière-plan : Blanc pur (`#ffffff`)
- Arrière-plan alternatif : Blanc chaud (`#f6f5f4`)
- Texte de titre : Quasi-noir (`rgba(0,0,0,0.95)`)
- Texte du corps : Quasi-noir (`rgba(0,0,0,0.95)`)
- Texte secondaire : Gris chaud 500 (`#615d59`)
- Texte atténué : Gris chaud 300 (`#a39e98`)
- Bordure : `1px solid rgba(0,0,0,0.1)`
- Lien : Notion Blue (`#0075de`)
- Anneau de focus : Bleu de focus (`#097fe8`)

### Exemples de prompts de composants
- « Créez une section hero sur fond blanc. Titre à 64px NotionInter graisse 700, hauteur de ligne 1,00, espacement -2,125px, couleur rgba(0,0,0,0.95). Sous-titre à 20px graisse 600, hauteur de ligne 1,40, couleur #615d59. Bouton CTA bleu (#0075de, rayon 4px, rembourrage 8px 16px, texte blanc) et bouton fantôme (arrière-plan transparent, texte quasi-noir, soulignement au survol). »
- « Concevez une carte : fond blanc, bordure 1px solid rgba(0,0,0,0.1), rayon 12px. Utilisez l'empilement d'ombres : rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px. Titre à 22px NotionInter graisse 700, espacement -0,25px. Corps à 16px graisse 400, couleur #615d59. »
- « Créez un badge en pilule : fond #f2f9ff, texte #097fe8, rayon 9999px, rembourrage 4px 8px, 12px NotionInter graisse 600, espacement 0,125px. »
- « Créez la navigation : en-tête blanc. NotionInter 15px graisse 600 pour les liens, texte quasi-noir. CTA pilule bleu 'Get Notion free' aligné à droite (fond #0075de, texte blanc, rayon 4px). »
- « Concevez un layout de sections alternées : les sections blanches alternent avec les sections blanc chaud (#f6f5f4). Chaque section a un rembourrage vertical de 64–80px, largeur maximale 1200px centrée. Titre de section à 48px graisse 700, hauteur de ligne 1,00, espacement -1,5px. »

### Guide d'itération
1. Toujours utiliser des neutres chauds — les gris de Notion ont des sous-tons jaune-brun (#f6f5f4, #31302e, #615d59, #a39e98), jamais de gris-bleu
2. L'espacement des lettres s'adapte à la taille de police : -2,125px à 64px, -1,875px à 54px, -0,625px à 26px, normal à 16px
3. Quatre graisses : 400 (lire), 500 (interagir), 600 (accentuer), 700 (annoncer)
4. Les bordures sont des murmures : 1px solid rgba(0,0,0,0.1) — jamais plus épaisses
5. Les ombres utilisent 4–5 couches avec une opacité individuelle ne dépassant jamais 0,05
6. Le fond de section blanc chaud (#f6f5f4) est essentiel pour le rythme visuel
7. Badges en pilule (9999px) pour les statuts/balises, rayon 4px pour les boutons et champs
8. Notion Blue (#0075de) est la seule couleur saturée dans l'interface principale — l'utiliser avec parcimonie pour les CTA et liens
