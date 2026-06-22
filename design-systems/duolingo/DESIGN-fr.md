# Système de design inspiré de Duolingo

> Category: Productivité & SaaS
> Plateforme d'apprentissage des langues. Vert hibou lumineux, ombres épaisses, joie gamifiée.

## 1. Thème visuel et atmosphère

Duolingo est la gamification rendue en langage visuel. L'interface est délibérément lumineuse, avec le **vert hibou** (`#58cc02`) comme couleur primaire de marque, et une épaisse ombre de 4px en bas de chaque élément interactif qui ressemble à un bouton 3D attendant d'être pressé. La page est blanche (`#ffffff`) avec des bordures épaisses de 2–3px dans un gris profond (`#e5e5e5`), et l'ensemble du système se lit comme une application iOS de 2015 réincarnée avec une meilleure hiérarchie.

La typographie utilise **Feather Bold** (un sans-serif arrondi personnalisé) pour le chrome et **Mona Sans** (ou Inter) pour le corps du texte. Les tailles d'affichage sont grandes et confiantes — Duolingo ne murmure jamais. Les titres portent souvent un trait souligné vert ou reposent sur une pastille verte, et la mascotte Duo (un hibou vert) apparaît comme un personnage d'illustration actif, non comme un logo statique.

Le langage des formes est amical : rayons de 16–20px sur les cartes, 12px sur les boutons, 9999px sur les puces et les barres de progression. L'iconographie est remplie, arrondie et codée par couleur selon la compétence — chaque surface de leçon possède une combinaison de couleurs identifiable instantanément.

**Caractéristiques clés :**
- Vert hibou (`#58cc02`) comme couleur de marque dominante, utilisée sur plus de 30% de la surface
- Épaisse ombre de 4px en bas de chaque bouton (l'affordance « pression tactile »)
- Bordures solides de 2–3px, jamais de filets
- Feather Bold (affichage arrondi) + Mona Sans (corps)
- Grand texte confiant — les tailles d'affichage commencent à 48px et montent
- Mascotte-personnage : Duo le hibou apparaît à l'onboarding, lors des erreurs, des séries
- Orange série (`#ff9600`) et rose gemme (`#ce82ff`) comme couleurs de marque secondaires

## 2. Palette de couleurs & rôles

### Primaire
- **Vert hibou** (`#58cc02`) : Primaire marque, CTA principal, bonne réponse.
- **Vert hibou profond** (`#58a700`) : Couleur de pression/ombre pour les boutons verts.
- **Vert hibou clair** (`#89e219`) : Survol, remplissages doux.
- **Vert hibou pâle** (`#dbf8c5`) : Surface douce, bannière de succès.

### Accents secondaires
- **Orange série** (`#ff9600`) : Compteur de série, icône de flamme, énergie premium.
- **Orange série profond** (`#cc7a00`) : Orange enfoncé.
- **Rose gemme** (`#ce82ff`) : Monnaie gemme, Super Duolingo.
- **Bleu anguille** (`#1cb0f6`) : Bouton d'indice, lien d'information.
- **Rouge cardinal** (`#ff4b4b`) : Mauvaise réponse, vie perdue.
- **Jaune abeille** (`#ffc800`) : Badge pro, récompense.

### Surface
- **Neige** (`#ffffff`) : Arrière-plan principal.
- **Anguille** (`#f7f7f7`) : Séparation de section, surface secondaire.
- **Cygne** (`#e5e5e5`) : Arrière-plan désactivé, bloc encastré.
- **Loup** (`#777777`) : Séparateur foncé, texte secondaire.

### Encre & texte
- **Noir anguille** (`#3c3c3c`) : Texte principal.
- **Loup** (`#777777`) : Texte secondaire, légendes.
- **Lièvre** (`#afafaf`) : Désactivé, espace réservé.

### Bordure
- **Cygne** (`#e5e5e5`) : Bordure standard de 2px.
- **Lièvre** (`#afafaf`) : Bordure accentuée au survol.

## 3. Règles typographiques

### Famille de polices
- **Affichage / UI / Titres** : `Feather Bold`, avec repli : `'DIN Round Pro', 'Helvetica Neue', sans-serif`
- **Corps / Texte long** : `Mona Sans`, avec repli : `'Helvetica Neue', system-ui, sans-serif`
- **Code (rare, écoles/admin)** : `JetBrains Mono`, avec repli : `ui-monospace, Menlo, monospace`

### Hiérarchie

| Rôle | Police | Taille | Graisse | Hauteur de ligne | Espacement | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Affichage | Feather Bold | 56px (3.5rem) | 800 | 1.05 | -0.01em | Héros d'onboarding |
| H1 | Feather Bold | 32px (2rem) | 800 | 1.15 | -0.005em | Titre de page |
| H2 | Feather Bold | 24px (1.5rem) | 800 | 1.2 | normal | En-tête de section |
| H3 | Feather Bold | 18px (1.125rem) | 700 | 1.25 | normal | Titre de carte, ligne de leçon |
| Corps grand | Mona Sans | 17px (1.0625rem) | 500 | 1.5 | normal | Consigne de leçon, instruction |
| Corps | Mona Sans | 15px (0.9375rem) | 400 | 1.5 | normal | Prose standard |
| Légende | Mona Sans | 13px (0.8125rem) | 600 | 1.4 | 0.01em | Compteur XP, métadonnées |
| Bouton | Feather Bold | 16px (1rem) | 800 | 1.2 | 0.02em | Libellé de bouton standard |
| Série | Feather Bold | 14px (0.875rem) | 800 | 1.2 | normal | Numéro de série, sur la flamme |

### Principes
- **800 est la valeur par défaut** : Feather Bold s'exécute à 800 sur les titres et les boutons. 700 semble faible dans ce système.
- **Grand texte** : les tailles de titres sont 25–40% plus grandes que les marques de produits typiques — la confiance comme identité.
- **Lettres arrondies** : chaque glyphe a des terminaisons douces ; les empattements tranchants rompraient le contrat de convivialité.

## 4. Styles des composants

### Boutons

**Primaire (Vert hibou)**
- Arrière-plan : `#58cc02`
- Texte : `#ffffff`
- Rembourrage : 14px 24px
- Rayon : 16px
- Border-bottom : 4px solid `#58a700` (l'ombre épaisse)
- Survol : arrière-plan `#89e219`
- Actif : translate-y 4px, border-bottom 0 (le bouton « s'enfonce »)
- Utilisation : « Continuer », « Vérifier », CTA principal.

**Secondaire (Blanc avec ombre basse)**
- Arrière-plan : `#ffffff`
- Texte : `#777777`
- Bordure : 2px solid `#e5e5e5`
- Border-bottom : 4px solid `#e5e5e5`
- Rayon : 16px
- Rembourrage : 14px 24px
- Survol : texte `#3c3c3c`, bordure `#afafaf`

**Orange série**
- Arrière-plan : `#ff9600`
- Texte : `#ffffff`
- Border-bottom : 4px solid `#cc7a00`
- Utilisation : objectif de série, « Commencer la série »

**Erreur (Rouge cardinal)**
- Arrière-plan : `#ff4b4b`
- Texte : `#ffffff`
- Border-bottom : 4px solid `#cc3b3b`
- Utilisation : retour sur mauvaise réponse.

### Cartes / Tuiles de leçon
- Arrière-plan : `#ffffff`
- Bordure : 2px solid `#e5e5e5`
- Border-bottom : 4px solid `#e5e5e5`
- Rayon : 16px
- Rembourrage : 16px
- Survol : élévation de 2px, ombre `0 4px 0 #d7d7d7`

### Nœud de l'arbre de compétences (Bulle de leçon)
- Taille : 80×72px
- Arrière-plan : teinte couleur compétence (vert pour actif, gris pour verrouillé)
- Border-bottom : 6px solid variante plus sombre
- Rayon : 50% (circulaire)
- Actif : pulsation 1.0 → 1.05 toutes les 1.6s

### Champs de saisie
- Arrière-plan : `#ffffff`
- Bordure : 2px solid `#e5e5e5`
- Rayon : 12px
- Rembourrage : 12px 16px
- Focus : bordure `#1cb0f6` (bleu anguille), anneau `0 0 0 3px rgba(28, 176, 246, 0.2)`

### Barre de progression
- Piste : `#e5e5e5`
- Remplissage : `#58cc02` (ou `#ff9600` pour la série)
- Rayon : 9999px
- Hauteur : 16px
- Remplissage animé : 320ms ease-out lors de l'incrémentation.

## 5. Espacement & mise en page

- **Unité de base** : 4px. Échelle : 4, 8, 12, 16, 24, 32, 48, 64.
- **Conteneur** : max 1080px, gouttière de 24px.
- **Colonne de l'arbre de leçons** : 320px de large ; centré sur le bureau.

## 6. Mouvement

- **Durée** : 180ms pour la pression du bouton ; 320ms pour le déverrouillage du nœud de compétence ; 1.6s pour le pulse du nœud actif.
- **Easing** : `cubic-bezier(0.34, 1.56, 0.64, 1)` (back-out, léger dépassement) pour les déverrouillages.
- **Mascotte** : Duo cligne des yeux toutes les 4–6s, saute lors des jalons de série (480ms ease-out ressort).

## 7. Directives d'utilisation

- Gardez le vert hibou à haute saturation, les épaisses ombres basses et la géométrie arrondie des leçons ensemble ; les boutons verts plats seuls ne se lisent pas comme Duolingo.
- Réservez le texte en gras surdimensionné pour les moments de leçon, de série et de progression où le produit a besoin d'encouragement ou de retour.
- Utilisez les mouvements ludiques avec parcimonie autour des changements d'état de progression, en évitant les animations rebondissantes génériques sur chaque contrôle.
