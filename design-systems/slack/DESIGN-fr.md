# Système de design inspiré de Slack

> Category: Productivité & SaaS
> Plateforme de communication professionnelle. Palette primaire aubergine, palette multi-accents pour le logo, surfaces claires avec barre latérale sombre, ton chaleureux et accessible.

## 1. Thème visuel et atmosphère

L'identité de Slack repose sur l'idée que le travail doit se sentir humain et même un peu amusant. La surface canonique est **claire** — des zones de contenu blanches avec une barre latérale aubergine profonde (`#4A154B`) — à l'opposé des outils à dominante sombre. Ce contraste est intentionnel : la barre latérale est une ancre de navigation calme et toujours présente, tandis que la zone de contenu est lumineuse et ouverte.

La palette du logo — bleu, vert, jaune, rouge — apparaît principalement dans l'icône dièse et dans les contextes marketing, et non disséminée dans l'interface. Dans le produit lui-même, Slack utilise un système de couleurs sobre et professionnel, avec l'aubergine comme seul ancre de marque.

**Caractéristiques principales :**
- Surfaces de contenu prioritairement claires : blanc `#FFFFFF` et quasi-blanc `#F8F8F8`
- Barre latérale aubergine profonde `#4A154B` — l'élément d'interface le plus reconnaissable de la marque
- Quatre couleurs d'accent du logo (bleu, vert, jaune, rouge) utilisées avec parcimonie, uniquement comme points forts
- Larsseit pour les titres (marketing), sans-serif système pour l'interface
- Arrondi mais pas cartoonesque : rayon de 4–8px sur la plupart des composants
- Dense mais aéré : rangées de messages compactes avec une hiérarchie de fils claire
- Ton chaleureux et conversationnel — émojis, réactions et illustrations sont de première importance

---

## 2. Palette de couleurs et rôles

### Primaire de marque
| Jeton | Hex | Rôle |
|---|---|---|
| `--color-aubergine` | `#4A154B` | Arrière-plan de la barre latérale, couleur principale de la marque |
| `--color-aubergine-dark` | `#350d36` | États de survol sur les surfaces aubergine |
| `--color-aubergine-light` | `#611f69` | Mise en évidence de l'élément actif dans la barre latérale |

### Couleurs d'accent du logo (à utiliser avec parcimonie — points forts, icônes, marketing uniquement)
| Jeton | Hex | Nom | Rôle |
|---|---|---|---|
| `--color-blue` | `#36C5F0` | Bleu ciel | Icônes de canaux, liens, états informatifs |
| `--color-green` | `#2EB67D` | Vert sarcelle | Statut en ligne, états de succès |
| `--color-yellow` | `#ECB22E` | Or | Statut absent, avertissements, points forts |
| `--color-red` | `#E01E5A` | Rubis | Notifications, erreurs, badge de mentions |

### Surface et arrière-plan
| Jeton | Hex | Rôle |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | Zone principale des messages, modales |
| `--bg-secondary` | `#F8F8F8` | Panneaux de fils, surfaces secondaires |
| `--bg-tertiary` | `#F1F1F1` | Arrière-plans des champs de saisie, états de survol |
| `--bg-sidebar` | `#4A154B` | Barre latérale gauche (aubergine) |
| `--bg-sidebar-hover` | `rgba(255,255,255,0.1)` | Survol d'un élément de la barre latérale |
| `--bg-sidebar-active` | `rgba(255,255,255,0.2)` | Élément actif de la barre latérale |
| `--bg-message-hover` | `#F8F8F8` | Survol d'une rangée de message |

### Couleurs de texte
| Jeton | Hex | Rôle |
|---|---|---|
| `--text-primary` | `#1D1C1D` | Texte principal du corps (quasi-noir) |
| `--text-secondary` | `#616061` | Horodatages, étiquettes atténuées |
| `--text-sidebar` | `rgba(255,255,255,0.9)` | Noms des canaux dans la barre latérale |
| `--text-sidebar-muted` | `rgba(255,255,255,0.6)` | Éléments inactifs de la barre latérale |
| `--text-link` | `#1264A3` | Liens en ligne dans les messages |
| `--text-mention` | `#1264A3` | Couleur du texte des @mentions |

### Couleurs sémantiques
| Jeton | Hex | Rôle |
|---|---|---|
| `--color-success` | `#2EB67D` | Notifications de succès, états positifs |
| `--color-warning` | `#ECB22E` | États d'avertissement |
| `--color-danger` | `#E01E5A` | États d'erreur, actions destructrices |
| `--color-info` | `#36C5F0` | Points forts informatifs |

### Bordure et séparateur
| Jeton | Hex | Rôle |
|---|---|---|
| `--border-default` | `#DDDDDD` | Séparateurs standard, bordures de cartes |
| `--border-subtle` | `#F1F1F1` | Séparateurs discrets entre les rangées |
| `--border-focus` | `#1264A3` | Couleur de l'anneau de focus |

---

## 3. Règles typographiques

### Polices de caractères
| Rôle | Officielle | Substitut web |
|---|---|---|
| Titres d'affichage / Marketing | Larsseit | `'Larsseit', 'Helvetica Neue', Arial, sans-serif` |
| Interface / Corps / Chrome | Slack Lato (personnalisé) | `system-ui, -apple-system, BlinkMacSystemFont, sans-serif` |
| Code / Monospace | — | `'Monaco', 'Menlo', 'Courier New', monospace` |

> Slack utilise **Larsseit** pour les titres marketing et une variante Lato personnalisée pour l'interface du produit. Pour une utilisation web, `system-ui` est le substitut le plus sûr.

### Échelle typographique

| Niveau | Taille | Graisse | Hauteur de ligne | Espacement des lettres | Usage |
|---|---|---|---|---|---|
| Affichage XL | 48px | 800 | 1.1 | -1px | Titres héros marketing |
| Affichage L | 36px | 700 | 1.15 | -0.5px | Héros de section |
| Titre 1 | 28px | 700 | 1.25 | normal | Titres de modales, en-têtes de page |
| Titre 2 | 22px | 700 | 1.3 | normal | Titres de cartes, sections de paramètres |
| Titre 3 | 18px | 700 | 1.35 | normal | En-têtes de sous-sections |
| Corps L | 16px | 400 | 1.5 | normal | Texte des messages, descriptions |
| Corps | 15px | 400 | 1.46667 | normal | Texte d'interface par défaut (taille de base de Slack) |
| Corps SM | 13px | 400 | 1.38462 | normal | Métadonnées secondaires |
| Légende | 12px | 400 | 1.33 | normal | Horodatages, indices |
| Code | 12px | 400 | 1.5 | normal | Code en ligne, blocs de code |

### Règles typographiques
- La taille de corps de base de Slack est **15px** — légèrement inférieure à 16px pour plus de densité
- Canaux non lus : graisse 700 — le gras est le principal indicateur de non-lu
- Horodatages : 12px `--text-secondary`, affichés au survol uniquement
- Blocs de code : arrière-plan `#F8F8F8`, bordure `1px solid #DDDDDD`, border-radius 4px
- Ne jamais utiliser de tailles de police inférieures à 12px
- Titres marketing : espacement des lettres `-1px` pour les grandes tailles d'affichage

---

## 4. Styles des composants

### Boutons

```css
/* Primary */
.btn-primary {
  background: #4A154B;
  color: #FFFFFF;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
  border: none;
}
.btn-primary:hover { background: #611f69; }

/* Secondary */
.btn-secondary {
  background: #FFFFFF;
  color: #1D1C1D;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
}
.btn-secondary:hover { background: #F8F8F8; }

/* Danger */
.btn-danger {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 4px;
}
.btn-danger:hover { background: #B3114A; }
```

### Champs de saisie
```css
.input {
  background: #FFFFFF;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  color: #1D1C1D;
  font-size: 15px;
  padding: 8px 12px;
  height: 36px;
}
.input:focus {
  border-color: #1264A3;
  box-shadow: 0 0 0 2px rgba(18,100,163,0.25);
  outline: none;
}
```

### Élément de canal dans la barre latérale
```css
.channel-item {
  height: 28px;
  padding: 0 16px;
  border-radius: 6px;
  color: rgba(255,255,255,0.7);
  font-size: 15px;
  font-weight: 400;
}
.channel-item:hover {
  background: rgba(255,255,255,0.1);
  color: #FFFFFF;
}
.channel-item.active {
  background: rgba(255,255,255,0.2);
  color: #FFFFFF;
}
.channel-item.unread {
  color: #FFFFFF;
  font-weight: 700;
}
```

### Badge non lu
```css
.badge {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  min-width: 18px;
}
```

### Pièces jointes de message / Cartes
```css
.attachment {
  border-left: 4px solid #DDDDDD;
  background: #F8F8F8;
  border-radius: 0 4px 4px 0;
  padding: 8px 12px;
  margin: 4px 0;
}
```

### Réactions
```css
.reaction {
  border: 1px solid #DDDDDD;
  border-radius: 24px;
  background: #F8F8F8;
  padding: 2px 8px;
  font-size: 13px;
  cursor: pointer;
}
.reaction:hover { background: #F1F1F1; }
.reaction.active {
  background: rgba(18,100,163,0.1);
  border-color: #1264A3;
}
```

---

## 5. Principes de mise en page

### Mise en page à trois colonnes
```
┌──────────────┬──────────────────────────────┬─────────────┐
│   Sidebar    │        Message Area          │   Thread    │
│   (240px)    │          (flex: 1)           │  (400px)    │
│  #4A154B     │          #FFFFFF             │  optional   │
└──────────────┴──────────────────────────────┴─────────────┘
```

### Système d'espacement (base 4px)
| Jeton | Valeur | Usage |
|---|---|---|
| `--space-1` | 4px | Espaces serrés |
| `--space-2` | 8px | Rembourrage de composant |
| `--space-3` | 12px | Rembourrage des champs de saisie |
| `--space-4` | 16px | Rembourrage standard |
| `--space-6` | 24px | Rembourrage de carte |
| `--space-8` | 32px | Espaces entre sections |

### Structure de la barre latérale
```
[Workspace Name ▼]
────────────────────
Threads
All DMs
Drafts & Sent
────────────────────
▼ Channels
  # general
  # random
  # design  ● (unread)
────────────────────
▼ Direct Messages
  John Doe
  Jane Smith
```

### Compositeur de message
- Épinglé en bas de la zone de message
- `border: 1px solid #DDDDDD`, `border-radius: 8px`, `margin: 0 16px 16px`
- Barre d'outils : émoji, pièce jointe, format, bouton d'envoi

---

## 6. Profondeur et élévation

Slack utilise des ombres légères sur une surface claire :

| Niveau | Usage | Ombre |
|---|---|---|
| Plat | Rangées de messages, éléments de la barre latérale | none |
| Bas | Cartes, champs de saisie | `0 1px 3px rgba(0,0,0,0.08)` |
| Moyen | Menus déroulants, popovers | `0 4px 12px rgba(0,0,0,0.12)` |
| Élevé | Modales, dialogues | `0 8px 24px rgba(0,0,0,0.15)` |
| Superposition | Arrière-plans de modales | `rgba(0,0,0,0.5)` |

---

## 7. À faire et à ne pas faire

### ✅ À faire
- Utiliser l'aubergine `#4A154B` pour la barre latérale — c'est l'élément d'interface le plus iconique de Slack
- Garder la zone de contenu principale blanche et claire
- Utiliser `#1D1C1D` (quasi-noir) pour tout le texte du corps, pas le noir pur
- Mettre les noms de canaux en gras pour indiquer le statut non lu — la graisse est l'indicateur
- Utiliser les quatre couleurs d'accent uniquement pour les rôles sémantiques (succès, avertissement, danger, info)
- Appliquer `border-left: 4px` sur les pièces jointes et les intégrations de messages
- Afficher les horodatages au survol uniquement
- Utiliser `#1264A3` pour les liens et les états de focus
- Garder les éléments de la barre latérale compacts : hauteur 28px, border-radius 6px

### ❌ À ne pas faire
- Ne pas utiliser une zone de contenu principale sombre — Slack est prioritairement clair
- Ne pas disperser bleu/vert/jaune/rouge comme accents décoratifs
- Ne pas utiliser le noir pur `#000000` pour le texte
- Ne pas utiliser des bulles de dialogue — les messages sont des rangées plates
- Ne pas créer des boutons à grand rayon — 4px est la norme
- Ne pas afficher les horodatages en permanence
- Ne pas utiliser les MAJUSCULES pour les noms de canaux
- Ne pas utiliser des tailles de police inférieures à 12px

---

## 8. Comportement responsive

### Points de rupture
| Point de rupture | Largeur | Mise en page |
|---|---|---|
| Mobile | < 768px | Panneau unique, barre latérale en tiroir gauche |
| Tablette | 768–1024px | Barre latérale + zone de messages uniquement |
| Bureau | > 1024px | Mise en page complète à trois colonnes |

### Adaptations mobiles
- Barre latérale : tiroir gauche, glisser à droite pour ouvrir
- Barre d'onglets du bas : Accueil, MDs, Activité, Vous
- Panneau de fil : superposition plein écran
- Compositeur : épinglé au-dessus du clavier
- Éléments de la liste de canaux : hauteur de cible tactile 44px
- Barre d'en-tête aubergine conservée sur mobile

---

## 9. Guide de prompt pour agent

Lors de la génération de designs dans le style Slack, suivez cette approche :

**Application des couleurs :**
> Définissez `background: #FFFFFF` comme canevas principal. Utilisez `#4A154B` (aubergine) pour la barre latérale. Tout le texte principal est `#1D1C1D`. Les liens et les anneaux de focus utilisent `#1264A3`. Les quatre couleurs du logo — `#36C5F0`, `#2EB67D`, `#ECB22E`, `#E01E5A` — sont uniquement sémantiques : info, succès, avertissement, danger.

**Typographie :**
> Utilisez `system-ui, -apple-system, sans-serif` pour toute l'interface. La taille de base est 15px. Canaux non lus : graisse 700. Texte du corps : graisse 400. Horodatages : 12px `#616061`, survol uniquement. Code : `Monaco, Menlo, monospace`, 12px, arrière-plan `#F8F8F8`.

**Mise en page :**
> Trois colonnes : barre latérale aubergine de 240px + zone de messages blanche flexible + panneau de fil optionnel de 400px. Éléments de la barre latérale : hauteur 28px, rayon 6px, gras si non lu. Compositeur : épinglé en bas, `border: 1px solid #DDDDDD`, `border-radius: 8px`.

**Composants :**
> Boutons : rayon 4px, hauteur 36px, primaire aubergine. Champs de saisie : bordure `1px solid #DDDDDD`, anneau de focus `#1264A3`. Rangées de messages : plates, sans bulles, avatar circulaire de 36px. Réactions : pilule `border: 1px solid #DDDDDD`, `border-radius: 24px`.

**Ton :**
> Slack est chaleureux, professionnel et humain. Les états vides utilisent des illustrations amicales. Les appels à l'action sont directs : « Envoyer un message », « Commencer ». Les messages d'erreur sont clairs et utiles. Jamais alarmant.

**Antipatterns à éviter :**
> Pas de zone de contenu sombre. Pas de bulles de dialogue. Pas de texte noir pur. Pas d'accents multi-couleurs dispersés. Pas de noms de canaux en MAJUSCULES. Pas de police inférieure à 12px. Pas de grand rayon de bouton.
