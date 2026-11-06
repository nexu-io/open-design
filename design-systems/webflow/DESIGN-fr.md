# Système de design inspiré de Webflow

> Category: Design & Créatif
> Constructeur web visuel. Esthétique de site marketing soignée avec accents bleus.

## 1. Thème visuel & atmosphère

Le site de Webflow est une plateforme visuellement riche et orientée outil qui communique le concept de « design sans code » à travers des surfaces blanches épurées, le bleu signature de Webflow（`#146ef5`）et une palette de couleurs secondaires abondante（violet, rose, vert, orange, jaune, rouge）. La police personnalisée WF Visual Sans Variable crée un système typographique confiant et précis, avec un grammage 600 pour l'affichage et 500 pour le corps de texte.

**Caractéristiques clés :**
- Canvas blanc avec texte presque noir（`#080808`）
- Bleu Webflow（`#146ef5`）comme couleur de marque et d'interaction principale
- WF Visual Sans Variable — police variable personnalisée avec un grammage 500–600
- Palette secondaire riche : violet `#7a3dff`, rose `#ed52cb`, vert `#00d722`, orange `#ff6b00`, jaune `#ffae13`, rouge `#ee1d36`
- Rayon de bordure conservateur de 4px–8px — net, non arrondi
- Empilements d'ombres multicouches（5 ombres en cascade）
- Étiquettes en majuscules : 10px–15px, grammage 500–600, espacement large（0,6px–1,5px）
- Animation translate(6px) au survol des boutons

## 2. Palette de couleurs & rôles

### Primaire
- **Presque Noir**（`#080808`）: Texte principal
- **Bleu Webflow**（`#146ef5`）: `--_color---primary--webflow-blue`, CTA principal et liens
- **Bleu 400**（`#3b89ff`）: `--_color---primary--blue-400`, bleu interactif plus clair
- **Bleu 300**（`#006acc`）: `--_color---blue-300`, variante de bleu plus foncée
- **Bleu survol bouton**（`#0055d4`）: `--mkto-embed-color-button-hover`

### Accents secondaires
- **Violet**（`#7a3dff`）: `--_color---secondary--purple`
- **Rose**（`#ed52cb`）: `--_color---secondary--pink`
- **Vert**（`#00d722`）: `--_color---secondary--green`
- **Orange**（`#ff6b00`）: `--_color---secondary--orange`
- **Jaune**（`#ffae13`）: `--_color---secondary--yellow`
- **Rouge**（`#ee1d36`）: `--_color---secondary--red`

### Neutre
- **Gris 800**（`#222222`）: Texte secondaire foncé
- **Gris 700**（`#363636`）: Texte intermédiaire
- **Gris 300**（`#ababab`）: Texte atténué, espace réservé
- **Gris moyen**（`#5a5a5a`）: Texte des liens
- **Gris bordure**（`#d8d8d8`）: Bordures, séparateurs
- **Bordure survol**（`#898989`）: Bordure au survol

### Ombres
- **Cascade à 5 couches** : `rgba(0,0,0,0) 0px 84px 24px, rgba(0,0,0,0.01) 0px 54px 22px, rgba(0,0,0,0.04) 0px 30px 18px, rgba(0,0,0,0.08) 0px 13px 13px, rgba(0,0,0,0.09) 0px 3px 7px`

## 3. Règles typographiques

### Police : `WF Visual Sans Variable`, repli : `Arial`

| Rôle | Taille | Grammage | Hauteur de ligne | Espacement | Notes |
|------|------|--------|-------------|----------------|-------|
| Hero d'affichage | 80px | 600 | 1,04 | -0,8px | |
| Titre de section | 56px | 600 | 1,04 | normal | |
| Sous-titre | 32px | 500 | 1,30 | normal | |
| Titre de fonctionnalité | 24px | 500–600 | 1,30 | normal | |
| Corps | 20px | 400–500 | 1,40–1,50 | normal | |
| Corps standard | 16px | 400–500 | 1,60 | -0,16px | |
| Bouton | 16px | 500 | 1,60 | -0,16px | |
| Étiquette majuscule | 15px | 500 | 1,30 | 1,5px | uppercase |
| Légende | 14px | 400–500 | 1,40–1,60 | normal | |
| Badge majuscule | 12,8px | 550 | 1,20 | normal | uppercase |
| Micro majuscule | 10px | 500–600 | 1,30 | 1px | uppercase |
| Code : Inconsolata（police monospace complémentaire）

## 4. Style des composants

### Boutons
- Transparent : texte `#080808`, translate(6px) au survol
- Cercle blanc : rayon 50%, fond blanc
- Badge bleu : fond `#146ef5`, rayon 4px, grammage 550

### Cartes : `1px solid #d8d8d8`, rayon 4px–8px
### Badges : fond teinté bleu à 10% d'opacité, rayon 4px

## 5. Mise en page
- Espacement : échelle fractionnelle（1px, 2,4px, 3,2px, 4px, 5,6px, 6px, 7,2px, 8px, 9,6px, 12px, 16px, 24px）
- Rayon : 2px, 4px, 8px, 50% — conservateur, net
- Points de rupture : 479px, 768px, 992px

## 6. Profondeur : système d'ombres en cascade à 5 couches

## 7. À faire et à éviter
- À faire : Utiliser WF Visual Sans Variable avec un grammage 500–600. Bleu（`#146ef5`）pour les CTA. Rayon 4px. translate(6px) au survol.
- À éviter : Ne pas arrondir les éléments fonctionnels au-delà de 8px. Ne pas utiliser les couleurs secondaires sur les CTA principaux.

## 8. Responsive : 479px, 768px, 992px

## 9. Guide de prompt Agent
- Texte : Presque Noir（`#080808`）
- CTA : Bleu Webflow（`#146ef5`）
- Arrière-plan : Blanc（`#ffffff`）
- Bordure : `#d8d8d8`
- Secondaire : Violet `#7a3dff`, Rose `#ed52cb`, Vert `#00d722`
