# Clicker App — Snippets HTML Réutilisables

> Copiez-collez ces snippets dans vos fichiers HTML. Ils utilisent les classes CSS du kit.

---

## Tuile de mode de jeu (Tile)

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

**Variantes de couleur** : `.tile-lavender`, `.tile-yellow`, `.tile-mint`, `.tile-blush`, `.tile-sky`, `.tile-coral`

---

## Ligne de classement (Leaderboard Row)

```html
<div class="lb-row">
  <span class="lb-rank top">4</span>
  <div class="lb-avatar norm">SR</div>
  <span class="lb-name">Sam R.</span>
  <span class="lb-score">9 832</span>
</div>
```

**Variantes de rang** : `.gold`, `.silver`, `.bronze`, `.top`
**Variantes d'avatar** : `.gold`, `.silver`, `.bronze`, `.norm`, `.me`
**Utilisateur courant** : ajoutez `.me` sur `.lb-row` et `.lb-avatar`

---

## Carte de statistique (Stat Card)

```html
<div class="stat-card">
  <p class="num">3 240</p>
  <p class="lab">Score max</p>
</div>
```

Utilisé dans une grille 2×2 :

```html
<div class="stats-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
  <div class="stat-card">...</div>
  <div class="stat-card">...</div>
  <div class="stat-card">...</div>
  <div class="stat-card">...</div>
</div>
```

---

## Ligne d'historique (History Row)

```html
<div class="hist-row">
  <div class="hist-icon" style="background:var(--tile-lavender)">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
  </div>
  <div class="hist-info">
    <p class="hist-mode">Time Attack</p>
    <p class="hist-date">Aujourd’hui · 14:32</p>
  </div>
  <span class="hist-score">3 240</span>
</div>
```

---

## Navigation flottante (Bottom Nav)

```html
<nav class="bottom-nav" aria-label="Navigation">
  <a href="home.html" class="nav-btn active" aria-label="Accueil">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  </a>
  <a href="profil.html" class="nav-btn" aria-label="Profil">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  </a>
  <a href="play.html" class="nav-main" aria-label="Jouer">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <path d="M5 3l14 9-14 9V3z"/>
    </svg>
  </a>
  <a href="leaderboard.html" class="nav-btn" aria-label="Classement">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
      <path d="M4 22h16"/>
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.24C7.85 18.75 7 20.24 7 22"/>
      <path d="M14 14.66V17c0 .55.47.98.97 1.24C16.15 18.75 17 20.24 17 22"/>
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
    </svg>
  </a>
</nav>
```

**Note** : le bouton actif reçoit la classe `.active`.

---

## Barre d'onglets (Tab Bar)

```html
<div class="tab-bar">
  <button class="tab-btn active">Global</button>
  <button class="tab-btn">Amis</button>
  <button class="tab-btn">Semaine</button>
</div>
```

---

## Avatar

```html
<div class="avatar">AL</div>
<div class="avatar avatar-lg">AL</div>
```

---

## Boutons

```html
<!-- Primaire -->
<button class="btn-primary">
  <svg>...</svg>
  Action principale
</button>

<!-- Secondaire -->
<button class="btn-secondary">
  <svg>...</svg>
  Action secondaire
</button>
```

---

## Cercle décoratif

```html
<div class="decor-circle" style="width:180px; height:180px; background:var(--circle-terracotta); top:-60px; right:-40px; opacity:0.25;"></div>
```
