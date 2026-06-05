# Changelog

Toutes les modifications notables de ce package seront documentées ici.

## [1.0.0] — 2025-06-05

### Added
- Design tokens CSS avec variables OKLCH et couleurs pastel (`tokens/tokens.css`)
- Reset CSS de base avec styles html/body (`css/reset.css`)
- Classes utilitaires et animations (`css/utilities.css`)
- 8 modules de composants CSS modulaires :
  - `button.css` — Boutons primaires et secondaires
  - `tile.css` — Tuiles de mode de jeu avec 6 variantes de couleur
  - `nav.css` — Navigation flottante iOS style
  - `avatar.css` — Avatars utilisateur (40px et 72px)
  - `leaderboard.css` — Lignes et rangs de classement
  - `tabs.css` — Barre d'onglets segmentée
  - `click-zone.css` — Bouton de clic principal et statistiques de jeu
  - `stat-card.css` — Cartes de statistiques profil
- 4 screens HTML complets et fonctionnels :
  - `home.html` — Accueil avec grille de tuiles
  - `play.html` — Jeu Time Attack avec logique JS
  - `leaderboard.html` — Classement avec onglets et données JS
  - `profil.html` — Profil utilisateur avec historique et partage
- `components/snippets.md` — Documentation des snippets HTML réutilisables
- `assets/icons/icons.svg` — Sprite SVG avec toutes les icônes de l'application
- `design-system/index.html` — Design system orienté développeur
- `preview/index.html` — Aperçu des 4 screens dans des cadres iPhone simulés
- `README.md` — Guide complet en français et anglais

### Notes
- Mobile-first, cible iOS (390×844)
- Sans framework JS — HTML, CSS et JavaScript vanilla
- Police DM Sans requise via Google Fonts

---

## Versioning

Ce projet suit [Semantic Versioning](https://semver.org/lang/fr/).
