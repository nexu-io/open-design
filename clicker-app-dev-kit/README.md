# Clicker App Dev Kit

> **Kit de développement professionnel** pour l'application Clicker. Tokens CSS modulaires, composants réutilisables, screens complets et documentation — prêt à intégrer dans votre stack.

---

## Description

Le **Clicker App Dev Kit** fournit tous les éléments de design et de front-end nécessaires pour implémenter l'application Clicker : un jeu de clic rapide et compétitif avec une interface pastel, des tuiles colorées et une navigation iOS native.

### Caractéristiques

- 🎨 **Design tokens** CSS avec OKLCH et couleurs pastel
- 📱 **Mobile-first**, optimisé pour iOS (safe areas, 390×844)
- 🧩 **Composants modulaires** : tuiles, navigation, avatars, boutons, onglets
- 🖥️ **4 screens complets** : Accueil, Jouer, Classement, Profil
- 🎯 **Sans framework** — HTML, CSS et JS vanilla
- 📦 **Design system** intégré pour les développeurs

---

## Structure du package

```
clicker-app-dev-kit/
├── README.md                 # Ce fichier
├── package.json              # Métadonnées du package
├── CHANGELOG.md              # Historique des versions
├── tokens/
│   └── tokens.css            # Variables CSS design tokens
├── css/
│   ├── reset.css              # Reset de base + styles html/body
│   ├── utilities.css          # Classes utilitaires et animations
│   └── components/
│       ├── button.css         # Boutons primaires et secondaires
│       ├── tile.css           # Tuiles de mode de jeu
│       ├── nav.css            # Navigation flottante iOS
│       ├── avatar.css         # Avatars utilisateur
│       ├── leaderboard.css    # Lignes de classement
│       ├── tabs.css           # Barre d'onglets
│       ├── click-zone.css     # Zone de clic et bouton de jeu
│       └── stat-card.css      # Cartes de statistiques
├── screens/
│   ├── home.html              # Écran d'accueil
│   ├── play.html              # Écran de jeu
│   ├── leaderboard.html       # Écran de classement
│   └── profil.html            # Écran de profil
├── components/
│   └── snippets.md            # Snippets HTML réutilisables
├── assets/
│   └── icons/
│       └── icons.svg          # Sprite SVG avec toutes les icônes
├── design-system/
│   └── index.html             # Design system pour développeurs
└── preview/
    └── index.html             # Aperçu iPhone des 4 screens
```

---

## Installation

### 1. Copier le package

Copiez le dossier `clicker-app-dev-kit/` dans votre projet.

### 2. Importer les tokens

Dans votre fichier CSS principal ou dans chaque screen :

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');
@import url('clicker-app-dev-kit/tokens/tokens.css');
```

### 3. Importer les modules CSS

```css
/* Base */
@import url('clicker-app-dev-kit/css/reset.css');
@import url('clicker-app-dev-kit/css/utilities.css');

/* Composants nécessaires */
@import url('clicker-app-dev-kit/css/components/button.css');
@import url('clicker-app-dev-kit/css/components/tile.css');
@import url('clicker-app-dev-kit/css/components/nav.css');
@import url('clicker-app-dev-kit/css/components/avatar.css');
@import url('clicker-app-dev-kit/css/components/leaderboard.css');
@import url('clicker-app-dev-kit/css/components/tabs.css');
@import url('clicker-app-dev-kit/css/components/click-zone.css');
@import url('clicker-app-dev-kit/css/components/stat-card.css');
```

Ou utilisez les `<link>` dans vos fichiers HTML :

```html
<link rel="stylesheet" href="tokens/tokens.css" />
<link rel="stylesheet" href="css/reset.css" />
<link rel="stylesheet" href="css/utilities.css" />
<link rel="stylesheet" href="css/components/button.css" />
<!-- ... autres composants -->
```

### 4. Utiliser le sprite d'icônes

```html
<svg width="24" height="24">
  <use href="assets/icons/icons.svg#icon-home"></use>
</svg>
```

---

## API des composants

| Classe | Description | Variantes |
|--------|-------------|-----------|
| `.tile` | Tuile de mode de jeu | `.tile-lavender`, `.tile-yellow`, `.tile-mint`, `.tile-blush`, `.tile-sky`, `.tile-coral` |
| `.tile-grid` | Grille 2 colonnes pour les tuiles | — |
| `.tile-arrow` | Flèche en bas à droite de la tuile | — |
| `.bottom-nav` | Navigation flottante iOS | — |
| `.nav-btn` | Bouton de navigation | `.active` |
| `.nav-main` | Bouton principal (Play) | `.active` |
| `.btn-primary` | Bouton primaire (fond foncé) | — |
| `.btn-secondary` | Bouton secondaire (bordure) | — |
| `.avatar` | Avatar utilisateur | `.avatar-lg` (72px) |
| `.tab-bar` | Barre d'onglets segmentée | — |
| `.tab-btn` | Bouton d'onglet | `.active` |
| `.stat-num` | Nombre monospace tabulaire | — |
| `.stat-card` | Carte de statistique | — |
| `.click-btn` | Bouton de clic principal (220px) | `.animate-pulse-soft` |
| `.lb-row` | Ligne de classement | `.me`, `.gold`, `.silver`, `.bronze` |
| `.lb-rank` | Numéro de rang | `.top`, `.gold`, `.silver`, `.bronze` |
| `.lb-avatar` | Avatar dans le classement | `.gold`, `.silver`, `.bronze`, `.norm`, `.me` |
| `.decor-circle` | Cercle décoratif flou | — |
| `.screen` | Conteneur d'écran mobile | — |

### Animations

| Classe | Description |
|--------|-------------|
| `.animate-pulse-soft` | Pulsation douce infinie (2.5s) |
| `@keyframes float-up` | Animation de remontée (+1 flottant) |

---

## Usage exemple

### Tuile de mode de jeu

```html
<div class="tile tile-lavender" onclick="location.href='play.html'">
  <div class="tile-icon">
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>
  </div>
  <span class="tile-title">Time<br/>Attack</span>
  <span class="tile-desc">60 secondes, clique max</span>
  <div class="tile-arrow">
    <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
  </div>
</div>
```

### Navigation flottante

```html
<nav class="bottom-nav" aria-label="Navigation">
  <a href="home.html" class="nav-btn active" aria-label="Accueil">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  </a>
  <a href="play.html" class="nav-main" aria-label="Jouer">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M5 3l14 9-14 9V3z"/>
    </svg>
  </a>
  <!-- ... autres boutons -->
</nav>
```

### Barre d'onglets

```html
<div class="tab-bar">
  <button class="tab-btn active">Global</button>
  <button class="tab-btn">Amis</button>
  <button class="tab-btn">Semaine</button>
</div>
```

### Carte de statistique

```html
<div class="stat-card">
  <p class="num">3 240</p>
  <p class="lab">Score max</p>
</div>
```

---

## Guide d'intégration des screens

Les 4 screens dans `screens/` sont des fichiers HTML autonomes et fonctionnels. Chaque screen :

1. Importe tous les modules CSS nécessaires
2. Contient son propre CSS inline pour les layouts spécifiques
3. Inclut la logique JavaScript nécessaire

### Pour intégrer dans une application existante

**Option A — Iframe**

Chargez chaque screen dans une iframe mobile :

```html
<iframe src="clicker-app-dev-kit/screens/home.html"
        style="width:390px; height:844px; border:none; border-radius:40px;">
</iframe>
```

**Option B — Copier le markup**

Copiez le contenu de `<body>` du screen souhaité dans votre application, en vous assurant d'importer les CSS du kit.

**Option C — Composants frameworks**

Utilisez `components/snippets.md` pour recréer les composants dans React, Vue, Svelte, etc.

---

## Dépendances

- **Google Font : DM Sans** — Utilisée pour les titres et les textes display
  ```html
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
  ```
- **Aucun framework JavaScript** requis
- **Navigateurs supportés** : Safari iOS 15+, Chrome 100+, Firefox 100+

---

## Preview

Ouvrez `preview/index.html` dans votre navigateur pour voir les 4 screens dans des cadres iPhone simulés.

Ouvrez `design-system/index.html` pour consulter la documentation visuelle des tokens et composants.

---

## Licence

Ce package est fourni en l'état pour usage interne et développement.

---

## English

### Description

The **Clicker App Dev Kit** provides all design and front-end elements needed to implement the Clicker app: a fast-paced competitive clicking game with a pastel interface, colorful tiles, and native iOS navigation.

### Installation

Copy the `clicker-app-dev-kit/` folder into your project and import the CSS modules as shown above.

### Preview

Open `preview/index.html` to see all 4 screens in simulated iPhone frames.
Open `design-system/index.html` for the visual documentation of tokens and components.
