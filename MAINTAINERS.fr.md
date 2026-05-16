<!-- Machine-translated draft. Native-speaker review and corrections welcome via PR. -->
# Mainteneurs

<p align="center"><a href="MAINTAINERS.md">English</a> · <a href="MAINTAINERS.pt-BR.md">Português (Brasil)</a> · <a href="MAINTAINERS.de.md">Deutsch</a> · <b>Français</b> · <a href="MAINTAINERS.zh-CN.md">简体中文</a> · <a href="MAINTAINERS.ja-JP.md">日本語</a></p>

Ce document définit les règles pour devenir Maintainer de `nexu-io/open-design`, exercer ce rôle et y renoncer. La liste nominative du Core Team est tenue en interne et n'est pas énumérée ici — ce qui compte publiquement, ce sont les règles que tout le monde respecte.

> **Statut** : v1, rédigé le 2026-05-11. Document complémentaire à [`CONTRIBUTING.md`](CONTRIBUTING.md#becoming-a-maintainer) — ce fichier renvoie les contributeurs ici pour les règles complètes.

---

## Rôles

| Rôle | Permissions |
|---|---|
| **Contributor** | Toute personne ayant au moins 1 merged PR. Aucune permission spéciale. |
| **External Maintainer** | Un contributeur de la communauté promu selon les règles ci-dessous. Peut faire des reviews, approve, fermer/rouvrir des issues, et s'auto-assigner des issues. **Ne peut pas cliquer sur le merge button** — cela reste réservé au Core Team. |
| **Core Team** | L'équipe interne d'Open Design. Détient un accès en écriture complet sur le repository et constitue l'autorité finale sur les décisions de gouvernance. La liste est tenue en interne. |

Le reste de ce document concerne les **External Maintainers** sauf indication contraire.

---

## Ce qu'un Maintainer peut faire et qu'un Contributor ne peut pas

| Action | Contributor | Maintainer |
|---|:---:|:---:|
| Approve une PR | ⚠️ compte comme un commentaire, **et non** comme l'approbation requise | ✓ compte comme l'approbation requise pour le merge |
| Fermer / rouvrir des issues | Uniquement les issues qu'ils ont eux-mêmes ouvertes | ✓ toute issue |
| S'auto-assigner des issues ouvertes et non assignées (P0 en priorité) | ✗ | ✓ |

### Conditions de merge

Toute PR — quel que soit son auteur — nécessite **les trois** éléments suivants :

1. Aucun conflit de code.
2. CI entièrement au vert.
3. Au moins une approbation d'un Maintainer ou d'un membre du Core Team.

L'approbation d'un Maintainer est la voie empruntée par la plupart des PR pour être mergées — c'est la manière la plus directe dont la confiance d'un Maintainer se manifeste dans le quotidien du projet.

---

## Comment devenir Maintainer

Il existe **trois** critères d'entrée. Tous les trois doivent être remplis.

### 1. Volume de contributions

- **≥ 20 merged PRs** sur `nexu-io/open-design`.

Il s'agit d'un seuil minimal indicatif, et non d'un sésame automatique. Atteindre 20 PRs vous met dans la liste des candidats à examiner ; cela ne garantit pas le rôle.

### 2. Qualité du compte (anti-sock-puppet, anti-bot)

Nous évaluons le profil GitHub du candidat selon sept dimensions. **Il faut passer au moins 5 des 7 lignes d'admission, et ne déclencher aucune ligne de veto.**

| # | Dimension | Ligne d'admission | Ligne de veto |
|---|---|---|---|
| 1 | Ancienneté du compte GitHub | ≥ 1 an | < 90 jours |
| 2 | Repos publics | ≥ 3 | 0 |
| 3 | Followers | ≥ 10 | < 3 |
| 4 | Ratio followers / following | > 0,30 | < 0,05 (schéma typique de follow-farm) |
| 5 | Complétude du profil | Avatar personnalisé **et** au moins l'un des éléments suivants : bio / company / blog / twitter | Avatar par défaut **et** bio/company/blog tous vides |
| 6 | Activité inter-projets | Au moins une merged PR ou une activité soutenue (issues/stars) sur **un autre** repo public | Merged PRs uniquement sur ce repo |
| 7 | Statut du compte | Aucune restriction de la plateforme GitHub (spam/banni/restauré) | L'un quelconque des cas ci-dessus |

#### Dérogation projet jeune (expire automatiquement quand le repo atteint 6 mois)

Tant que `nexu-io/open-design` a moins de six mois depuis le commit initial, le veto sur l'**activité inter-projets** (#6) peut faire l'objet d'une dérogation par consensus du Core Team lorsque :

- Les dimensions 1, 2, 3 et 5 sont nettement au-dessus de la ligne d'admission ; **et**
- La qualité des PRs du candidat sur ce repo est jugée élevée par la review pratique du Core Team.

Toute dérogation doit être consignée dans le registre interne du Core Team avec le nom du candidat et la date. Une fois que le repo atteint six mois, cette clause de dérogation n'est plus disponible.

### 3. Qualité des contributions (jugement du Core Team)

Ce critère est qualitatif et non basé sur une formule. Le Core Team examine :

- **La qualité du code** des merged PRs (correction, discipline de portée, respect des frontières du repo).
- **La qualité des reviews** dans les commentaires de review laissés sur les PRs des autres.
- **La participation à la communauté** — Discussions, triage d'issues, engagement sur Discord.
- **Les signaux de collaboration** — réactivité aux retours, volonté de réviser.

Passer les deux premiers critères vous fait entrer dans le pool de candidats. Franchir ce troisième seuil est ce qui vous fait nommer.

### Processus de sélection

1. Un membre du Core Team présente le candidat en interne.
2. Le Core Team parvient à un consensus.
3. Un membre du Core Team prend contact en privé pour confirmer que le candidat est volontaire.
4. Onboarding.
5. Annonce publique.

Il n'y a pas de PR de nomination, pas de vote public, pas de mandat à durée fixe. L'intention est l'**inverse du modèle approver-vote de K8s/Apache** — au début de la vie du projet, un consensus léger du Core Team va plus vite et produit la même qualité de résultat. Lorsque la cohorte de Maintainers dépassera cinq External Maintainers, cette section sera réexaminée.

---

## Responsabilités et attentes

**Il n'y a pas de quotas stricts.** Pas de nombre hebdomadaire de reviews de PR, pas de taux minimal de triage d'issues, pas de SLA sur les délais de réponse. Être Maintainer est une reconnaissance de confiance, pas un emploi non rémunéré.

Ce que nous demandons, dans l'esprit :

- Approve les PRs pour lesquelles vous avez le contexte ; abstenez-vous quand ce n'est pas le cas.
- Honorez les conditions de merge (§ « Conditions de merge ») — votre approbation est un signal réel, pas un tampon de complaisance.
- Tenez `#maintainers` informé si vous comptez disparaître pour une période prolongée.
- Traitez la roadmap encore non publique partagée dans `#maintainers` comme confidentielle.

Si le Core Team observe un schéma de comportement problématique (approbations de complaisance, fermetures malveillantes d'issues, fuite d'éléments de roadmap non annoncés, etc.), les permissions sont révoquées au titre du § « Step-down — pour motif valable ».

---

## Accès réservé aux Maintainers

Au-delà des permissions de repository listées ci-dessus, les Maintainers reçoivent quelques avantages que la communauté plus large n'a pas :

- **Canal Discord `#maintainers`** — un espace de travail privé partagé avec le Core Team. Utilisé pour les previews de design, les drafts de RFC et la coordination interne sur la partie non encore publique de la roadmap.
- **Roadmap confidentielle** — visibilité anticipée sur des travaux qui n'ont pas encore été annoncés. Les Maintainers s'engagent à traiter ce contenu comme confidentiel jusqu'à ce qu'un membre du Core Team l'annonce publiquement.
- **Ligne directe avec le Core Team** — vos messages dans `#maintainers` reçoivent une réponse plus rapide et plus substantielle que les Discussions publiques, et le Core Team sollicite réellement l'avis des Maintainers sur les décisions d'architecture et de roadmap.
- **Badge Maintainer** — une marque publique de confiance sur votre profil GitHub et sur les surfaces du repo liées aux MAINTAINERS (déploiement progressif une fois la fonctionnalité de badge GitHub en place).
- **Reconnaissance publique lors de la promotion** — annonce sur Twitter, dans les GitHub Discussions et sur Discord lors de votre arrivée.

---

## Step-down

Être Maintainer n'est pas une nomination à vie. Il existe trois voies de sortie.

### Step-down volontaire

- Le Maintainer envoie un message au Core Team ou poste dans `#maintainers`.
- Les permissions sont révoquées dans les 24 heures.
- Le Maintainer passe au statut **Emeritus**.
- Aucune justification publique n'est requise.

### Transition pour inactivité

Un Maintainer est éligible à une transition pour inactivité lorsque **l'un** des cas suivants se produit :

- 90 jours consécutifs sans signal d'activité (merged PR, commentaire de review, triage d'issue, participation substantielle aux Discussions ou à Discord), **ou**
- 60 jours consécutifs sans répondre à aucune @-mention (demande de review de PR, assignation d'issue).

Processus :

1. Le Core Team @-mentionne le Maintainer en privé dans `#maintainers`, en accordant une **fenêtre de réponse de 14 jours**.
2. En l'absence de réponse substantielle sous 14 jours, le Maintainer passe au statut Emeritus et ses permissions sont révoquées.
3. Une note publique brève et bienveillante est postée dans les GitHub Discussions : « Merci pour vos contributions — vous avez été placé en Emeritus, vous êtes le bienvenu pour revenir à tout moment. »
4. Le retour est facile — voir « Emeritus » ci-dessous.

### Step-down pour motif valable

Déclenché par :

- Comportement problématique répété (par ex., approbations de complaisance sur des PRs en deçà des standards, fermetures malveillantes d'issues, abus de permissions).
- Violation du [Code de Conduite][coc] du projet.
- Incidents de niveau sécurité (compte compromis non signalé rapidement, fuite intentionnelle d'éléments de roadmap non annoncés, etc.).

Processus :

1. Tout membre du Core Team peut ouvrir la discussion.
2. **Au moins 3 membres du Core Team** doivent être d'accord avant qu'une action soit prise (le consensus complet du Core Team n'est pas requis).
3. Dans les 24 heures suivant la décision : permissions révoquées, retrait de `#maintainers`, retrait de toute liste de Maintainers (ne passe **pas** au statut Emeritus).
4. La personne concernée est informée de la décision et de ses motifs, et peut faire appel une fois.

Le principe est de **pencher en faveur du maintien du Maintainer**. Un seul petit écart ne constitue pas un motif de step-down forcé ; la voie pour motif valable est réservée aux schémas répétés ou aux incidents ponctuels graves.

[coc]: https://www.contributor-covenant.org/

---

## Emeritus

Les Maintainers qui se retirent volontairement ou qui transitent par inactivité passent au statut **Emeritus**. Le statut Emeritus :

- Retire les permissions d'écriture/approve/fermeture.
- Conserve la mention du nom de la personne dans la section Emeritus de la liste (interne).
- Conserve l'accès au canal Discord `#maintainers` (en lecture ou en écriture — au choix du Maintainer).
- N'implique aucune responsabilité continue.

### Revenir depuis Emeritus

La voie de retour la plus simple : 3 merged PRs au cours des 30 derniers jours, après quoi le Core Team restaure les permissions. Aucune nouvelle nomination n'est requise.

L'objectif d'Emeritus est de reconnaître que la vie suit son cours — un congé sabbatique, un changement d'emploi, un enfant — sans aucun drame ni coût social pour aucune des parties.

---

## Modifications de ce document

Les règles de ce document peuvent être amendées par consensus du Core Team. Les changements substantiels (critères d'admission, seuils de step-down) seront annoncés dans les GitHub Discussions avant de prendre effet pour tout candidat actif. Les clarifications éditoriales peuvent être intégrées directement.
