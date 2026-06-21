# Système de Design Inspiré par Figma

> Category: Design & Créatif
> Outil de design collaboratif. Multi-couleurs vives, ludique mais professionnel.

## 1. Thème Visuel & Atmosphère

L'interface de Figma est l'outil de design qui s'est designé lui-même — une leçon magistrale de sophistication typographique où une police variable personnalisée (figmaSans) module entre ultra-fin (weight 320) et gras (weight 700) avec des arrêts à des intermédiaires inhabituels (330, 340, 450, 480, 540) que la plupart des systèmes typographiques n'explorent jamais. Ce contrôle granulaire de la graisse confère à chaque élément textuel un poids visuel précisément calibré, créant une hiérarchie par micro-différences plutôt qu'avec l'instrument grossier du « normal vs gras ».

La page présente une dualité fascinante : le chrome de l'interface est strictement noir et blanc (seuls `#000000` et `#ffffff` sont détectés comme couleurs), tandis que la section hero et les vitrines produit explosent avec des dégradés multi-couleurs vives — verts électriques, jaunes éclatants, violets profonds, roses fuchsia. Cette séparation signifie que le système de design lui-même est sans couleur, traitant les sorties colorées du produit comme le contenu vedette. La page marketing de Figma est essentiellement un mur de galerie blanc exposant des œuvres colorées.

Ce qui distingue Figma au-delà de la police variable, c'est sa géométrie circulaire et en pilule. Les boutons utilisent un rayon de 50px (pilule) ou 50% (cercle parfait pour les boutons icônes), créant un aspect organique rappelant une palette d'outils. L'indicateur de focus en pointillés (`dashed 2px`) est un choix de design délibéré qui fait écho aux poignées de sélection dans l'éditeur Figma lui-même — le langage UI du site web fait référence au langage UI du produit.

**Caractéristiques Clés :**
- Police variable personnalisée (figmaSans) avec des arrêts de graisse inhabituels : 320, 330, 340, 450, 480, 540, 700
- Chrome d'interface strictement noir et blanc — la couleur n'existe que dans le contenu produit
- figmaMono pour les étiquettes techniques en majuscules avec un espacement large des lettres
- Géométrie de bouton en pilule (50px) et circulaire (50%)
- Contours de focus en pointillés évoquant les poignées de sélection de l'éditeur Figma
- Dégradés hero multi-couleurs vifs (vert, jaune, violet, rose)
- Fonctionnalité OpenType `"kern"` activée globalement
- Espacement des lettres négatif partout — même le corps de texte à -0.14px à -0.26px

## 2. Palette de Couleurs & Rôles

### Principale
- **Noir Pur** (`#000000`) : Tout le texte, tous les boutons pleins, toutes les bordures. L'unique « couleur » de l'interface.
- **Blanc Pur** (`#ffffff`) : Tous les arrière-plans, boutons blancs, texte sur surfaces sombres. L'autre moitié du binaire.

*Remarque : Le site marketing de Figma utilise UNIQUEMENT ces deux couleurs pour sa couche d'interface. Toutes les couleurs vives apparaissent exclusivement dans les captures d'écran produit, les dégradés hero et le contenu intégré.*

### Surface & Arrière-plan
- **Blanc Pur** (`#ffffff`) : Arrière-plan principal de la page et surfaces de carte.
- **Noir Verre** (`rgba(0, 0, 0, 0.08)`) : Superposition sombre subtile pour les boutons circulaires secondaires et les effets verre.
- **Blanc Verre** (`rgba(255, 255, 255, 0.16)`) : Superposition verre dépoli pour les boutons sur surfaces sombres/colorées.

### Système de Dégradé
- **Dégradé Hero** : Un dégradé multi-arrêts vif utilisant vert électrique, jaune vif, violet profond et rose fuchsia. Ce dégradé est la signature visuelle de la section hero — il représente les possibilités créatives de l'outil.
- **Dégradés de Section Produit** : Les zones produit individuelles (Design, Dev Mode, Prototypage) peuvent utiliser des thèmes de couleurs distincts dans leurs vitrines.

## 3. Règles Typographiques

### Famille de Police
- **Principale** : `figmaSans`, avec des substituts : `figmaSans Fallback, SF Pro Display, system-ui, helvetica`
- **Monospace / Étiquettes** : `figmaMono`, avec des substituts : `figmaMono Fallback, SF Mono, menlo`

### Hiérarchie

| Rôle | Police | Taille | Graisse | Hauteur de Ligne | Espacement des Lettres | Notes |
|------|--------|--------|---------|------------------|------------------------|-------|
| Display / Hero | figmaSans | 86px (5.38rem) | 400 | 1.00 (serré) | -1.72px | Impact maximum, tracking extrême |
| Titre de Section | figmaSans | 64px (4rem) | 400 | 1.10 (serré) | -0.96px | Titres de sections fonctionnalités |
| Sous-titre | figmaSans | 26px (1.63rem) | 540 | 1.35 | -0.26px | Texte de section mis en valeur |
| Sous-titre Léger | figmaSans | 26px (1.63rem) | 340 | 1.35 | -0.26px | Texte de section à graisse légère |
| Titre de Fonctionnalité | figmaSans | 24px (1.5rem) | 700 | 1.45 | normal | En-têtes de carte en gras |
| Corps Large | figmaSans | 20px (1.25rem) | 330–450 | 1.30–1.40 | -0.1px à -0.14px | Descriptions, introductions |
| Corps / Bouton | figmaSans | 16px (1rem) | 330–400 | 1.40–1.45 | -0.14px à normal | Corps standard, nav, boutons |
| Corps Léger | figmaSans | 18px (1.13rem) | 320 | 1.45 | -0.26px à normal | Corps de texte à graisse légère |
| Étiquette Mono | figmaMono | 18px (1.13rem) | 400 | 1.30 (serré) | 0.54px | Étiquettes de section en majuscules |
| Mono Petit | figmaMono | 12px (0.75rem) | 400 | 1.00 (serré) | 0.6px | Petites balises en majuscules |

### Principes
- **Précision de police variable** : figmaSans utilise des graisses que la plupart des systèmes ne touchent jamais — 320, 330, 340, 450, 480, 540. Cela crée une hiérarchie par de subtiles différences de graisse plutôt que par des sauts dramatiques. La différence entre 330 et 340 est presque imperceptible mais structurellement significative.
- **Le léger comme base** : La plupart du corps de texte utilise 320–340 (plus léger que le « regular » 400 typique), créant une expérience de lecture éthérée et aérienne qui correspond à l'esthétique de l'outil de design.
- **Kern partout** : Chaque élément textuel active la fonctionnalité OpenType `"kern"` — le crénage n'est pas optionnel, il est structurel.
- **Tracking négatif par défaut** : Même le corps de texte utilise un espacement de -0.1px à -0.26px, créant un texte universellement serré. Le texte Display se compresse davantage à -0.96px et -1.72px.
- **Mono pour la structure** : figmaMono en majuscules avec un espacement positif des lettres (0.54px–0.6px) crée des étiquettes repères techniques.

## 4. Styles de Composants

### Boutons

**Noir Plein (Pilule)**
- Arrière-plan : Noir Pur (`#000000`)
- Texte : Blanc Pur (`#ffffff`)
- Rayon : cercle (50%) pour les boutons icônes
- Focus : contour en pointillés 2px
- Emphase maximale

**Pilule Blanche**
- Arrière-plan : Blanc Pur (`#ffffff`)
- Texte : Noir Pur (`#000000`)
- Padding : 8px 18px 10px (vertical asymétrique)
- Rayon : pilule (50px)
- Focus : contour en pointillés 2px
- CTA standard sur surfaces sombres/colorées

**Verre Sombre**
- Arrière-plan : `rgba(0, 0, 0, 0.08)` (superposition sombre subtile)
- Texte : Noir Pur
- Rayon : cercle (50%)
- Focus : contour en pointillés 2px
- Action secondaire sur surfaces claires

**Verre Clair**
- Arrière-plan : `rgba(255, 255, 255, 0.16)` (verre dépoli)
- Texte : Blanc Pur
- Rayon : cercle (50%)
- Focus : contour en pointillés 2px
- Action secondaire sur surfaces sombres/colorées

### Cartes & Conteneurs
- Arrière-plan : Blanc Pur
- Bordure : aucune ou minimale
- Rayon : 6px (petits conteneurs), 8px (images, cartes, dialogues)
- Ombre : effets d'élévation subtils à moyens
- Captures d'écran produit comme contenu de carte

### Navigation
- Nav horizontale épurée sur blanc
- Logo : marque typographique Figma en noir
- Onglets produit : navigation par onglets en forme de pilule (50px)
- Liens : texte noir, décoration souligné 1px
- CTA : bouton pilule noir
- Survol : couleur du texte via variable CSS

### Composants Distinctifs

**Barre d'Onglets Produit**
- Onglets en forme de pilule horizontale (rayon 50px)
- Chaque onglet représente une zone produit Figma (Design, Dev Mode, Prototypage, etc.)
- Onglet actif mis en surbrillance

**Section Dégradé Hero**
- Arrière-plan dégradé multi-couleurs vif pleine largeur
- Superposition de texte blanc avec titre Display 86px
- Captures d'écran produit flottant dans le dégradé

**Indicateurs de Focus en Pointillés**
- Tous les éléments interactifs utilisent un contour `dashed 2px` au focus
- Fait référence aux poignées de sélection dans l'éditeur Figma
- Un choix de meta-design reliant le site web et le produit

## 5. Principes de Mise en Page

### Système d'Espacement
- Unité de base : 8px
- Échelle : 1px, 2px, 4px, 4.5px, 8px, 10px, 12px, 16px, 18px, 24px, 32px, 40px, 46px, 48px, 50px

### Grille & Conteneur
- Largeur maximale du conteneur : jusqu'à 1920px
- Hero : dégradé pleine largeur avec contenu centré
- Sections produit : vitrines alternées
- Footer : section sombre pleine largeur
- Responsive de 559px à 1920px

### Philosophie des Espaces Blancs
- **Rythme de galerie** : Un espacement généreux laisse chaque section produit respirer comme sa propre exposition.
- **Sections colorées comme respiration visuelle** : Le hero en dégradé et les vitrines produit apportent un repos chromatique entre les sections d'interface monochromes.

### Échelle de Rayon de Bordure
- Minimal (2px) : Petits éléments de lien
- Subtil (6px) : Petits conteneurs, séparateurs
- Confortable (8px) : Cartes, images, dialogues
- Pilule (50px) : Boutons d'onglet, CTAs
- Cercle (50%) : Boutons icônes, éléments circulaires

## 6. Profondeur & Élévation

| Niveau | Traitement | Utilisation |
|--------|------------|-------------|
| Plat (Niveau 0) | Aucune ombre | Arrière-plan de page, la plupart des textes |
| Surface (Niveau 1) | Carte blanche sur section dégradé/sombre | Cartes, vitrines produit |
| Élevé (Niveau 2) | Ombre subtile | Cartes flottantes, états de survol |

**Philosophie des Ombres** : Figma utilise les ombres avec parcimonie. Les principaux mécanismes de profondeur sont le **contraste d'arrière-plan** (contenu blanc sur sections colorées/sombres) et la dimensionnalité inhérente des captures d'écran produit elles-mêmes.

## 7. À Faire & À Éviter

### À Faire
- Utiliser figmaSans avec des graisses variables précises (320–540) — le contrôle granulaire de la graisse EST le design
- Maintenir l'interface strictement noir et blanc — la couleur provient uniquement du contenu produit
- Utiliser la géométrie en pilule (50px) et circulaire (50%) pour tous les éléments interactifs
- Appliquer des contours de focus en pointillés 2px — le motif d'accessibilité signature
- Activer la fonctionnalité `"kern"` sur tous les textes
- Utiliser figmaMono en majuscules avec un espacement positif des lettres pour les étiquettes
- Appliquer un espacement des lettres négatif partout (-0.1px à -1.72px)

### À Éviter
- Ne pas ajouter de couleurs à l'interface — la palette monochrome est absolue
- Ne pas utiliser les graisses de police standard (400, 500, 600, 700) — utiliser les arrêts uniques de la police variable (320, 330, 340, 450, 480, 540)
- Ne pas utiliser de coins vifs sur les boutons — géométrie en pilule et circulaire uniquement
- Ne pas utiliser de contours de focus pleins — les pointillés sont la signature
- Ne pas augmenter la graisse du corps de texte au-delà de 450 — l'esthétique légère est fondamentale
- Ne pas utiliser d'espacement positif des lettres sur le corps de texte — il est toujours négatif

## 8. Comportement Responsive

### Points de Rupture
| Nom | Largeur | Changements Clés |
|-----|---------|-----------------|
| Petit Mobile | <560px | Mise en page compacte, empilée |
| Tablette | 560–768px | Ajustements mineurs |
| Petit Bureau | 768–960px | Mises en page 2 colonnes |
| Bureau | 960–1280px | Mise en page standard |
| Grand Bureau | 1280–1440px | Élargi |
| Ultra-large | 1440–1920px | Largeur maximale |

### Stratégie de Réduction
- Texte hero : 86px → 64px → 48px
- Onglets produit : défilement horizontal sur mobile
- Sections fonctionnalités : colonne unique empilée
- Footer : multi-colonnes → empilé

## 9. Guide de Prompt Agent

### Référence Rapide des Couleurs
- Tout : « Noir Pur (#000000) » et « Blanc Pur (#ffffff) »
- Verre Sombre : « rgba(0, 0, 0, 0.08) »
- Verre Clair : « rgba(255, 255, 255, 0.16) »

### Exemples de Prompts de Composant
- « Créer un hero sur un dégradé multi-couleurs vif (vert, jaune, violet, rose). Titre à 86px figmaSans graisse 400, line-height 1.0, letter-spacing -1.72px. Texte blanc. Bouton CTA pilule blanc (rayon 50px, padding 8px 18px). »
- « Concevoir une barre d'onglets produit avec des boutons en forme de pilule (rayon 50px). Actif : fond noir, texte blanc. Inactif : transparent, texte noir. figmaSans à 20px graisse 480. »
- « Créer une étiquette de section : figmaMono 18px, majuscules, letter-spacing 0.54px, texte noir. Kern activé. »
- « Créer du corps de texte à 20px figmaSans graisse 330, line-height 1.40, letter-spacing -0.14px. Noir Pur sur blanc. »

### Guide d'Itération
1. Utiliser les arrêts de graisse de la police variable avec précision : 320, 330, 340, 450, 480, 540, 700
2. L'interface est toujours noir + blanc — ne jamais ajouter de couleurs au chrome
3. Contours de focus en pointillés, pas pleins
4. L'espacement des lettres est toujours négatif sur le corps, toujours positif sur les étiquettes mono
5. Pilule (50px) pour les boutons/onglets, cercle (50%) pour les boutons icônes
