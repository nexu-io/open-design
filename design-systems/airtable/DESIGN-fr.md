# Système de design inspiré d'Airtable

> Category: Design & Créatif
> Hybride tableur-base de données. Esthétique colorée, conviviale et structurée.

## 1. Thème visuel & Atmosphère

Le site d'Airtable est une plateforme propre et adaptée aux entreprises, qui traduit une « simplicité sophistiquée » grâce à une toile blanche, un texte bleu marine profond (`#181d26`) et Airtable Blue (`#1b61c9`) comme couleur d'accentuation interactive principale. La famille de polices Haas (variantes display + text) crée un système typographique de précision suisse avec un espacement positif des lettres sur l'ensemble du site.

**Caractéristiques clés :**
- Toile blanche avec texte bleu marine profond (`#181d26`)
- Airtable Blue (`#1b61c9`) comme couleur principale pour les CTA et les liens
- Système à double police Haas + Haas Groot Disp
- Espacement positif des lettres sur le corps de texte (0.08px–0.28px)
- Boutons à rayon 12px, cartes 16px–32px
- Ombre multi-couches teintée de bleu : `rgba(45,127,249,0.28) 0px 1px 3px`
- Tokens de thème sémantiques : nommage de variables CSS `--theme_*`

## 2. Palette de couleurs & Rôles

### Primaire
- **Bleu marine profond** (`#181d26`) : Texte principal
- **Airtable Blue** (`#1b61c9`) : Boutons CTA, liens
- **Blanc** (`#ffffff`) : Surface principale
- **Spotlight** (`rgba(249,252,255,0.97)`) : `--theme_button-text-spotlight`

### Sémantique
- **Vert succès** (`#006400`) : `--theme_success-text`
- **Texte faible** (`rgba(4,14,32,0.69)`) : `--theme_text-weak`
- **Secondaire actif** (`rgba(7,12,20,0.82)`) : `--theme_button-text-secondary-active`

### Neutre
- **Gris foncé** (`#333333`) : Texte secondaire
- **Bleu moyen** (`#254fad`) : Variante de lien/bleu d'accentuation
- **Bordure** (`#e0e2e6`) : Bordures de carte
- **Surface claire** (`#f8fafc`) : Surface subtile

### Ombres
- **Teintée de bleu** (`rgba(0,0,0,0.32) 0px 0px 1px, rgba(0,0,0,0.08) 0px 0px 2px, rgba(45,127,249,0.28) 0px 1px 3px, rgba(0,0,0,0.06) 0px 0px 0px 0.5px inset`)
- **Douce** (`rgba(15,48,106,0.05) 0px 0px 20px`)

## 3. Règles typographiques

### Familles de polices
- **Principale** : `Haas`, replis : `-apple-system, system-ui, Segoe UI, Roboto`
- **Display** : `Haas Groot Disp`, repli : `Haas`

### Hiérarchie

| Rôle | Police | Taille | Graisse | Interligne | Espacement |
|------|------|------|--------|-------------|----------------|
| Display Hero | Haas | 48px | 400 | 1.15 | normal |
| Display Gras | Haas Groot Disp | 48px | 900 | 1.50 | normal |
| Titre de section | Haas | 40px | 400 | 1.25 | normal |
| Sous-titre | Haas | 32px | 400–500 | 1.15–1.25 | normal |
| Titre de carte | Haas | 24px | 400 | 1.20–1.30 | 0.12px |
| Fonctionnalité | Haas | 20px | 400 | 1.25–1.50 | 0.1px |
| Corps | Haas | 18px | 400 | 1.35 | 0.18px |
| Corps Medium | Haas | 16px | 500 | 1.30 | 0.08–0.16px |
| Bouton | Haas | 16px | 500 | 1.25–1.30 | 0.08px |
| Légende | Haas | 14px | 400–500 | 1.25–1.35 | 0.07–0.28px |

## 4. Styles des composants

### Boutons
- **Bleu principal** : `#1b61c9`, texte blanc, rembourrage 16px 24px, rayon 12px
- **Blanc** : fond blanc, texte `#181d26`, rayon 12px, bordure blanche 1px
- **Consentement aux cookies** : fond `#1b61c9`, rayon 2px (vif)

### Cartes : `1px solid #e0e2e6`, rayon 16px–24px
### Champs de saisie : Styling Haas standard

## 5. Mise en page
- Espacement : 1–48px (base 8px)
- Rayon : 2px (petit), 12px (boutons), 16px (cartes), 24px (sections), 32px (grand), 50% (cercles)

## 6. Profondeur
- Système d'ombre multi-couches teintée de bleu
- Ambiance douce : `rgba(15,48,106,0.05) 0px 0px 20px`

## 7. À faire et à ne pas faire
### À faire : Utiliser Airtable Blue pour les CTA, Haas avec un tracking positif, boutons à rayon 12px
### À ne pas faire : Omettre l'espacement positif des lettres, utiliser des ombres lourdes

## 8. Comportement responsive
Points de rupture : 425–1664px (23 points de rupture)

## 9. Guide d'invite Agent
- Texte : Bleu marine profond (`#181d26`)
- CTA : Airtable Blue (`#1b61c9`)
- Arrière-plan : Blanc (`#ffffff`)
- Bordure : `#e0e2e6`
