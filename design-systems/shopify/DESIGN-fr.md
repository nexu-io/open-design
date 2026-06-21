# Système de design inspiré de Shopify

> Category: E-Commerce & Vente au détail
> Plateforme e-commerce. Cinématique dark-first, accent vert néon, typographie ultra-légère.

## 1. Thème visuel & Atmosphère

Shopify.com est un théâtre numérique dark-first — un site web qui met en scène sa plateforme de commerce comme une première cinématique. L'expérience entière se déploie sur un abîme de surfaces quasi-noires qui portent le plus ténu murmure de vert forêt profond (`#02090A`, `#061A1C`, `#102620`), créant une atmosphère nocturne qui ressemble moins à une page marketing SaaS qu'à une présentation produit exclusive lors d'une keynote technologique. Cette obscurité n'est ni froide ni corporative — c'est le noir chaleureux et enveloppant d'une expérience de luxe, comme être assis au premier rang d'un auditorium plongé dans l'obscurité.

La typographie est la vedette incontestable. NeueHaasGrotesk — un descendant raffiné de l'Helvetica — apparaît à une échelle monumentale (96px) avec un poids incroyablement léger (330-400), créant des titres qui semblent gravés dans la lumière plutôt qu'imprimés à l'encre. La fonctionnalité OpenType `ss03` donne aux formes de lettres un caractère distinctif qui distingue la typographie de Shopify de l'utilisation générique de l'Helvetica. Sous la couche d'affichage, Inter Variable gère le corps de texte avec une précision chirurgicale, utilisant des graisses variables tout aussi inhabituelles (420, 450, 550) qui se situent entre les arrêts de graisse traditionnels. Cette précision signale une entreprise qui soigne chaque détail.

La couleur est utilisée avec une extrême retenue. L'accent principal est Shopify Neon Green (`#36F4A4`) — une menthe électrique qui apparaît exclusivement sur les anneaux de focus et les points forts d'accent, pulsant comme un signal bioluminescent contre le canevas sombre. Des teintes vertes plus douces (Aloe `#C1FBD4`, Pistachio `#D4F9E0`) apportent des lavis atmosphériques. Le blanc est la seule couleur de texte qui compte sur les surfaces sombres, tandis qu'une gamme neutre à base de zinc (`#A1A1AA` à `#3F3F46`) gère la hiérarchie des informations discrètes. Le résultat est un design qui fait paraître la technologie commerciale comme si elle appartenait à un futur de science-fiction.

**Caractéristiques clés :**
- Design dark-first avec des sous-tons teal-forêt profonds (pas de noir pur)
- Typographie d'affichage ultra-légère (graisse 330) à échelle monumentale (96px) créant une présence éthérée
- Neon Green (`#36F4A4`) comme seul accent haute énergie contre l'obscurité
- Boutons à pilule complète (rayon 9999px) comme forme interactive principale
- Ombres portées multicouches créant une profondeur photographique
- Captures d'écran de produits intégrées dans des contextes d'interface sombre, s'accordant à l'obscurité environnante
- Gamme neutre à base de zinc pour la hiérarchie textuelle — équilibrée entre chaud et froid

## 2. Palette de couleurs & Rôles

### Primaire

- **Shopify White** (`#FFFFFF`) : Texte principal sur surfaces sombres, remplissages de boutons, éléments à fort contraste
- **Shopify Black** (`#000000`) : Fond du corps, texte de bouton sur blanc, base de contraste maximum (--color-shade-100)

### Secondaire & Accent

- **Neon Green** (`#36F4A4`) : L'accent signature — anneaux de focus, points forts interactifs, indicateurs d'état actif. Électrique et bioluminescent
- **Aloe** (`#C1FBD4`) : Lavis vert doux pour les arrière-plans décoratifs, cartes atmosphériques (--color-aloe-10)
- **Pistachio** (`#D4F9E0`) : Teinte verte la plus claire pour une différenciation subtile des surfaces (--color-pistachio-10)

### Surface & Arrière-plan

- **Void** (`#000000`) : Fond de page racine — noir pur pour une profondeur maximale
- **Deep Teal** (`#02090A`) : Surfaces de cartes, conteneurs de contenu — quasi-noir avec sous-ton vert
- **Dark Forest** (`#061A1C`) : Arrière-plans de sections avec caractère vert visible
- **Forest** (`#102620`) : Surfaces sombres élevées, arrière-plans d'en-tête — la teinte sombre la plus chaude
- **Dark Card Border** (`#1E2C31`) : Bordures de cartes sur surfaces sombres, définition subtile des limites

### Neutres & Texte (Gamme Zinc)

- **Shade-30** (`#D4D4D8`) : Neutre le plus clair, bordures à peine visibles sur fond sombre (--color-shade-30)
- **Muted Text** (`#A1A1AA`) : Texte secondaire, métadonnées, descriptions — la voix discrète
- **Shade-50** (`#71717A`) : Texte tertiaire, horodatages, informations les moins importantes (--color-shade-50)
- **Shade-60** (`#52525B`) : Texte désactivé, neutres décoratifs (--color-shade-60)
- **Shade-70** (`#3F3F46`) : Séparateurs subtils, limites d'interface à peine visibles (--color-shade-70)
- **Light Border** (`#E4E4E7`) : Bordures sur surfaces claires (rare — uniquement dans les modales en mode clair)

### Sémantique & Accent

- **Link Muted** (`#9797A2`) : Texte de lien atténué avec décoration de soulignement
- **Link Sage** (`#9DABAD`) : Liens atténués teintés teal
- **Link Lavender** (`#BDBDCA`) : Variante de lien plus clair
- **Link Mint** (`#99B3AD`) : Variante de lien teinté vert pour les sections thématiques

### Système de dégradés

- **Dark Teal Wash** : Dégradé radial de `#102620` au centre vers `#102620` le bord — utilisé derrière les vitrines produits
- **Green Atmospheric** : Dégradés ambiants subtilement teintés de vert derrière les sections héros, créant de la profondeur sans couleurs solides
- **Spotlight** : Zone lumineuse focalisée qui s'estompe vers le noir — crée un éclairage de présentation style keynote

## 3. Règles typographiques

### Famille de polices

**Affichage :** NeueHaasGrotesk (descendant raffiné de l'Helvetica, police variable)
- Polices de remplacement : Helvetica, Arial, sans-serif
- Fonctionnalités OpenType : `ss03` (ensemble stylistique 3 — alternances de formes de lettres distinctives)
- Graisses disponibles : 330, 360, 400, 500, 750 (variable)
- Utilisé pour tous les titres, textes héros et grands éléments d'affichage

**Corps :** Inter-Variable
- Polices de remplacement : Helvetica, Arial, sans-serif
- Fonctionnalités OpenType : `ss03`
- Graisses disponibles : 400, 420, 450, 500, 550 (variable)
- Utilisé pour le corps de texte, les liens, les boutons, les éléments d'interface

**Mono :** ui-monospace
- Polices de remplacement : SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New
- Utilisé pour les extraits de code, les étiquettes de données, le contenu technique

### Hiérarchie

| Rôle | Taille | Graisse | Hauteur de ligne | Espacement | Notes |
|------|------|--------|-------------|----------------|-------|
| Display XL | 96px | 400 | 1.00 | — | NeueHaasGrotesk, titres héros, "ss03" |
| Display XL Bold | 90.74px | 750 | 1.00 | 4.54px | NeueHaasGrotesk, affichage d'emphase |
| Display XL Tracked | 96px | 400 | 1.00 | 2.4px | NeueHaasGrotesk, affichage espacé |
| Display Light | 96px | 330 | 0.96 | — | NeueHaasGrotesk, affichage éthéré |
| Heading 1 | 70px | 330 | 1.00 | — | NeueHaasGrotesk, titres de section |
| Heading 2 | 55px | 330 | 1.16 | — | NeueHaasGrotesk, sous-sections |
| Heading 3 | 48px | 330 | 1.14 | — | NeueHaasGrotesk, titres de fonctionnalités |
| Heading 4 | 32px | 360 | 1.14 | 0.32px | NeueHaasGrotesk, titres de cartes |
| Heading 5 | 28px | 500 | 1.28 | 0.42px | NeueHaasGrotesk, petits titres |
| Heading 6 | 24px | 400 | 1.14 | 0.36px | NeueHaasGrotesk, titres mineurs |
| Body Large | 20px | 500 | 1.40 | 0.3px | NeueHaasGrotesk / Inter, paragraphes d'accroche |
| Body | 18px | 400 | 1.56 | — | Inter-Variable, corps standard |
| Body Medium | 18px | 550 | 1.56 | — | Inter-Variable, corps mis en valeur |
| Body Small | 16px | 400 | 1.50 | — | Inter / NeueHaasGrotesk, corps compact |
| Body Small Medium | 16px | 420 | 1.50 | — | Inter-Variable, légèrement mis en valeur |
| Button | 16px | 400 | 1.50 | — | NeueHaasGrotesk, texte CTA |
| Nav Link | 18px | 500 | 1.25 | 0.72px | NeueHaasGrotesk, éléments de navigation |
| Caption | 14px | 500 | 1.49 | 0.28px | NeueHaasGrotesk / Inter, métadonnées |
| Caption Medium | 14px | 550 | 1.49 | 0.28px | Inter-Variable, légende mise en valeur |
| Overline | 15.36px | 400 | 1.50 | 1.54px | NeueHaasGrotesk, étiquettes à espacement large |
| Micro | 13px | 500 | 1.50 | -0.13px | Inter, petit texte à espacement serré |
| Label | 12px | 400 | 1.20 | 0.72px | Inter, étiquettes en majuscules |
| Code | 16px | 400 | 1.50 | — | ui-monospace, majuscules, blocs de code |
| Code Small | 12px | 400 | 1.33 | — | ui-monospace, majuscules, code inline |

### Principes

La typographie de Shopify est un chef-d'œuvre de précision avec les polices variables. La couche d'affichage vit presque exclusivement aux graisses 330-400 — un texte léger comme une plume qui semble flotter au-dessus du fond sombre comme de la lumière projetée. C'est l'opposé de l'approche grasse et lourde que la plupart des sites SaaS adoptent : là où les autres crient, Shopify chuchote à grande échelle. Les titres de 96px à la graisse 330 créent un paradoxe de taille énorme et de trait délicat qui semble à la fois monumental et fragile. La fonctionnalité OpenType `ss03` active un ensemble stylistique qui donne à des caractères spécifiques (probablement 'a', 'g' et certains chiffres) une apparence plus raffinée, distinguant la typographie de Shopify de l'usage standard de l'Helvetica Neue. Inter Variable gère la couche corps avec une précision chirurgicale, utilisant des graisses comme 420 et 550 qui existent entre les arrêts traditionnels — chaque élément de texte a exactement le poids visuel dont il a besoin.

## 4. Styles des composants

### Boutons

**Primaire (Remplissage blanc)**
- Arrière-plan : Blanc (`#FFFFFF`)
- Texte : Noir (`#000000`)
- Bordure : 2px solid transparent
- Rayon de bordure : pilule complète (9999px)
- Rembourrage : 12px 26px 12px 16px (asymétrique — plus de rembourrage à droite pour l'équilibre visuel)
- Survol : légère réduction d'opacité ou changement d'arrière-plan
- Focus : anneau de contour `#36F4A4` (Neon Green) de 2px
- Transition : all 200ms ease

**Secondaire (Fantôme/Contours)**
- Arrière-plan : transparent
- Texte : Blanc (`#FFFFFF`)
- Bordure : 2px solid Blanc (`#FFFFFF`)
- Rayon de bordure : pilule complète (9999px)
- Rembourrage : 12px 26px 12px 16px
- Survol : se remplit avec un fond blanc et du texte noir
- Focus : contour `#36F4A4` de 2px

**Badge/Étiquette (Remplissage neutre)**
- Arrière-plan : `rgba(255, 255, 255, 0.2)` (verre dépoli)
- Texte : Blanc (`#FFFFFF`)
- Bordure : aucune
- Rayon de bordure : légèrement arrondi (4px)
- Rembourrage : 12px 16px
- Police : 16px regular

### Cartes & Conteneurs

- Arrière-plan : Deep Teal (`#02090A`) sur les pages sombres
- Bordure : 1px solid `#1E2C31` (Dark Card Border) — limite à peine visible
- Rayon de bordure : 8px pour les cartes standard, 12px pour les cartes vedettes, 20px 20px 0 0 pour les cartes arrondies en haut
- Ombre : Système multicouche :
  - Au repos : `rgba(0,0,0,0.1) 0px 0px 0px 1px, rgba(0,0,0,0.1) 0px 2px 2px, rgba(0,0,0,0.1) 0px 4px 4px, rgba(0,0,0,0.1) 0px 8px 8px` + `rgba(255,255,255,0.03) 0px 1px 0px inset`
  - La surbrillance blanche incrustée crée une légère lueur sur le bord supérieur
- Survol : l'ombre s'étend, la carte peut légèrement s'éclaircir
- Transition : box-shadow 300ms ease, transform 200ms ease

### Champs de saisie & Formulaires

- Arrière-plan : transparent ou Dark Forest (`#061A1C`)
- Texte : Blanc (`#FFFFFF`)
- Bordure : 1px solid `#3F3F46` (Shade-70)
- Rayon de bordure : 8px
- Rembourrage : 12px 16px
- Focus : 2px solid `#36F4A4` (anneau de focus Neon Green)
- Texte indicatif : Shade-50 (`#71717A`)
- Transition : border-color 200ms ease

### Navigation

- Arrière-plan : transparent (superposé sur le héros sombre), devient Forest (`#102620`) au défilement
- Hauteur : ~64px
- Gauche : logo wordmark Shopify (SVG, blanc sur fond sombre)
- Centre/Droite : liens de navigation en 18px/500 NeueHaasGrotesk, blanc, espacement 0.72px
- CTA : Bouton pilule blanc "Start for free" (droite)
- CTA secondaire : Bouton fantôme avec bordure blanche
- Survol : les liens passent à Muted Text (`#A1A1AA`) ou gagnent un soulignement
- Mobile : menu hamburger, superposition sombre plein écran
- Transition : background 300ms ease au défilement

### Traitement des images

- Captures d'écran de produits : intégrées dans des contextes d'interface sombre, s'accordant à l'obscurité environnante
- Aperçus d'interface admin : affichés sur des fonds sombres avec des bordures de cartes subtiles
- Ratios d'aspect : variés — les images héros sont larges (environ 16:9), les plans de fonctionnalités sont flexibles
- Toutes les images sont à ras dans des conteneurs sombres — pas de bordures ou cadres lumineux
- Chargement différé avec des surfaces de remplacement sombres

### Indicateurs de confiance

- Statistiques affichées de manière prominente : "15+" (années), "150M+" (acheteurs)
- Chiffres à l'échelle d'affichage en NeueHaasGrotesk
- Sections d'appel à l'action de l'écosystème partenaires/développeurs
- Témoignages thématiques sombres intégrés dans le flux de la page

## 5. Principes de mise en page

### Système d'espacement

Unité de base : 8px

| Token | Valeur | Utilisation |
|-------|-------|-----|
| space-1 | 4px | Écarts inline serrés |
| space-2 | 8px | Unité de base, écarts d'icônes |
| space-3 | 12px | Rembourrage de carte, marges serrées |
| space-4 | 16px | Rembourrage d'élément standard |
| space-5 | 24px | Écarts de cartes, rembourrage de section |
| space-6 | 28px | Espacement de section moyen |
| space-7 | 32px | Ruptures de section |
| space-8 | 36px | Grand rembourrage |
| space-9 | 40px | Rembourrage de section majeure |
| space-10 | 64px | Rembourrage de section héros, grands écarts |

### Grille & Conteneur

- Largeur maximale du conteneur : ~1280px (centré)
- Héros : pleine largeur, fond sombre bord à bord avec texte centré
- Sections de fonctionnalités : mises en page à 2 colonnes avec texte et captures d'écran de produits
- Sections de statistiques : mise en page horizontale avec de grands chiffres
- Rembourrage horizontal : 64px bureau, 32px tablette, 16px mobile
- Écart de grille : 24-32px entre les blocs de contenu majeurs

### Philosophie de l'espace blanc

La stratégie d'espace blanc de Shopify est théâtrale. Les sections sont séparées par de vastes étendues d'espace sombre — 80px à 120px de respiration noire pure — qui créent le rythme d'une présentation, pas d'une page web. Chaque bloc de contenu est sa propre "diapositive" dans un défilement style keynote. Au sein des sections, l'espacement est plus serré et plus délibéré, créant une densité focale contre le vide expansif. Le contraste entre le vide au niveau macro et la précision au niveau micro est ce qui donne au site sa cadence cinématique.

### Échelle des rayons de bordure

| Valeur | Contexte |
|-------|---------|
| 4px | Étiquettes, badges, micro-éléments |
| 8px | Cartes standard, champs de saisie, conteneurs vidéo |
| 12px | Cartes vedettes, conteneurs d'images, boutons (non-pilule) |
| 20px | Cartes arrondies en haut (20px 20px 0 0), en-têtes de modales |
| 340px | Grands éléments décoratifs arrondis |
| 9999px | Boutons pilule, badges pilule, éléments de navigation |

## 6. Profondeur & Élévation

| Niveau | Traitement | Utilisation |
|-------|-----------|-----|
| Base | Pas d'ombre, surface sombre | Fond de page par défaut |
| Subtil | `rgba(0,0,0,0.1) 0px 0px 0px 1px` + lueur blanche incrustée | Cartes au repos |
| Moyen | Multicouche : anneau 1px + 2px + 4px + pile d'ombres 8px | Cartes élevées, sections vedettes |
| Élevé | `rgba(0,0,0,0.25) 0px 25px 50px -12px` | Modales, menus déroulants, superpositions |
| Focus | `0px 0px 0px 2px #36F4A4` | Anneau de focus clavier (Neon Green) |

Le système d'ombres de Shopify est inhabituellement sophistiqué. Plutôt que des valeurs d'ombre simples, les cartes utilisent une approche empilée multicouche : un anneau d'1px pour la définition des limites, des flous progressifs de 2px/4px/8px pour la déchéance naturelle de la lumière, et une délicate lueur blanche incrustée (`rgba(255,255,255,0.03)`) qui simule une surface de verre éclairée par le dessus. Sur les fonds sombres, les ombres assombrissent depuis des surfaces déjà sombres, de sorte que les ombres fonctionnent davantage comme une "occlusion ambiante" qu'une élévation traditionnelle — la carte semble s'enfoncer légèrement dans la surface plutôt que de flotter au-dessus.

### Profondeur décorative

- **Dégradés teal sombres** : Lavis radiaux ambiants derrière les sections héros et les vitrines produits
- **Effets de projecteur** : Zones lumineuses centrées qui s'estompent vers le noir, créant un éclairage théâtral style keynote
- **Lueur de bord** : Bords de couleur claire subtils sur les cartes sombres via box-shadow incrustée
- **Halos atmosphériques verts** : Légères teintes vertes dans les dégradés de fond, faisant écho à l'accent de marque

## 7. À faire & À éviter

### À faire

- Utiliser la hiérarchie de surfaces teal-noir sombre (Void → Deep Teal → Dark Forest → Forest) pour la profondeur
- Maintenir la typographie d'affichage à la graisse 330-400 — la légèreté éthérée est la signature du design
- Utiliser Neon Green (`#36F4A4`) exclusivement pour les états de focus et les points forts d'accent critiques
- Appliquer un rayon de 9999px à tous les boutons CTA primaires — la pilule complète est non négociable
- Utiliser le système d'ombres multicouches pour l'élévation des cartes — les ombres simples ont l'air plates
- Maintenir la fonctionnalité OpenType `ss03` sur tout le texte — elle fait partie de l'identité typographique
- Utiliser Inter Variable pour le corps de texte et NeueHaasGrotesk pour les titres — ne jamais intervertir leurs rôles
- Créer un espacement théâtral entre les sections (80px+) pour un rythme cinématique

### À éviter

- Ne pas utiliser le noir pur (#000000) pour le texte sur fond sombre — utiliser uniquement le blanc (#FFFFFF)
- Ne pas introduire de couleurs chaudes (orange, rouge, jaune) — la palette est strictement froide (verts, teals, neutres)
- Ne pas utiliser des graisses supérieures à 500 pour le corps de texte en NeueHaasGrotesk — les graisses lourdes brisent le ressenti éthéré
- Ne pas appliquer des accents verts sur de grandes surfaces — Neon Green est réservé aux points forts petits et précis uniquement
- Ne pas utiliser de coins aigus (rayon 0px) sur les éléments interactifs — tout est arrondi
- Ne pas ajouter de fonds lumineux — le thème sombre est fondamental, pas optionnel
- Ne pas utiliser de box-shadows à une seule couche — l'approche empilée est le système
- Ne pas définir une hauteur de ligne supérieure à 1.56 pour le corps de texte — le texte de Shopify est relativement compact
- Ne pas mélanger NeueHaasGrotesk et Inter à la même taille/rôle — leurs échelles de graisse diffèrent
- Ne pas utiliser un espacement de lettres négatif pour les titres — les titres Shopify ont un espacement neutre ou positif

## 8. Comportement responsive

### Points de rupture

| Nom | Largeur | Changements clés |
|------|-------|-------------|
| Mobile | <640px | Colonne unique, nav hamburger, texte d'affichage réduit à 48px, rembourrage 16px |
| Tablette | 640-1024px | Les grilles à 2 colonnes commencent, texte d'affichage à 70px, rembourrage 32px |
| Bureau | 1024-1440px | Mise en page complète, nav étendue, affichage 96px, rembourrage 64px |
| Grand bureau | >1440px | Conteneur max-width centré, espacement de section augmenté |

### Cibles tactiles

- Cible tactile minimale : 44x44px (WCAG AAA)
- Boutons pilule : hauteur minimale 48px avec rembourrage horizontal généreux
- Liens de navigation : zone tactile de 44px
- Surfaces de cartes : la carte entière est cliquable si liée

### Stratégie de repliement

- **Navigation** : Liens horizontaux complets → menu hamburger sous 1024px ; le logo et le bouton CTA restent visibles
- **Section héros** : Affichage 96px → 70px sur tablette → 48px sur mobile ; maintient l'alignement centré sur une seule colonne
- **Sections de fonctionnalités** : 2 colonnes texte+image → colonne unique empilée sous 768px
- **Statistiques** : Rangée horizontale → empilé verticalement sur mobile
- **Rembourrage de section** : 64px → 40px → 24px → 16px à mesure que la fenêtre se rétrécit
- **Cartes** : Grille → empilement, maintien pleine largeur sur mobile

### Comportement des images

- Captures d'écran de produits : responsives dans des conteneurs sombres, maintien du ratio d'aspect
- Images héros : pleine largeur sur tous les points de rupture, chargement différé avec des espaces réservés sombres
- Aperçus d'interface admin : mise à l'échelle proportionnelle, peuvent être recadrés sur mobile
- Toutes les images utilisent CDN (`cdn.shopify.com`) avec srcset responsive

## 9. Guide de prompts pour agents

### Référence rapide des couleurs

- CTA principal : Shopify White (`#FFFFFF`)
- Fond de page : Void Black (`#000000`)
- Surface de carte : Deep Teal (`#02090A`)
- Fond de section : Dark Forest (`#061A1C`)
- Fond élevé : Forest (`#102620`)
- Accent : Neon Green (`#36F4A4`)
- Texte de corps : Blanc (`#FFFFFF`)
- Texte atténué : Muted (`#A1A1AA`)
- Bordure sombre : Dark Card Border (`#1E2C31`)

### Exemples de prompts de composants

- "Créer une section héros sur fond noir pur (#000000) avec un titre NeueHaasGrotesk 96px/330 en blanc, un sous-titre 20px/500 en #A1A1AA, et deux boutons pilule : remplissage blanc (rayon 9999px) et fantôme avec bordure blanche de 2px"
- "Concevoir une carte de fonctionnalité sur Deep Teal (#02090A) avec une bordure #1E2C31 de 1px, rayon 12px, ombre multicouche (anneau 1px + flou 2px/4px/8px à 10% de noir), contenant un titre blanc 32px/360 et un corps de texte #A1A1AA 18px/400"
- "Construire une section de statistiques sur Dark Forest (#061A1C) avec des chiffres blancs 96px/750 (NeueHaasGrotesk), des étiquettes descriptives #A1A1AA 16px/400, et un espacement généreux de 64px entre les blocs de statistiques"
- "Créer une nav collante avec fond transparent (devient #102620 au défilement), logo Shopify blanc à gauche, liens de nav blancs 18px/500 avec espacement 0.72px, et un bouton pilule blanc 'Start for free' à droite"
- "Concevoir un tag/badge avec fond en verre dépoli rgba(255,255,255,0.2), rayon 4px, rembourrage 12px 16px, texte blanc 16px — flottant au-dessus d'une surface de carte sombre"

### Guide d'itération

Lors du raffinement des écrans existants générés avec ce système de design :
1. Se concentrer sur UN composant à la fois
2. Référencer les noms de couleurs spécifiques et les codes hexadécimaux de ce document
3. Se rappeler : c'est un design DARK-FIRST — les surfaces claires sont l'exception, pas la règle
4. Le texte d'affichage doit toujours sembler léger comme une plume (graisse 330-400) — s'il semble lourd, réduire la graisse
5. Neon Green (#36F4A4) est précieux — utiliser avec parcimonie pour le focus et l'accent uniquement
6. La hiérarchie de surfaces sombres (noir → deep teal → dark forest → forest) crée une profondeur subtile
7. Les ombres sont multicouches — une seule valeur `box-shadow` ne capturera pas le ressenti des cartes Shopify
8. La fonctionnalité OpenType `ss03` doit être active sur tout le texte pour la cohérence typographique
