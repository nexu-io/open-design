<!-- Machine-translated draft. Native-speaker review and corrections welcome via PR. -->
# Maintainers

<p align="center"><a href="MAINTAINERS.md">English</a> · <b>Português (Brasil)</b> · <a href="MAINTAINERS.de.md">Deutsch</a> · <a href="MAINTAINERS.fr.md">Français</a> · <a href="MAINTAINERS.zh-CN.md">简体中文</a> · <a href="MAINTAINERS.ja-JP.md">日本語</a></p>

Este documento define as regras para se tornar, atuar como e deixar o cargo de
Maintainer de `nexu-io/open-design`. A composição individual do Core Team é
mantida internamente e não é enumerada aqui — o que importa publicamente são
as regras pelas quais todos jogam.

> **Status**: v1, redigido em 2026-05-11. Documento complementar ao [`CONTRIBUTING.md`](CONTRIBUTING.md#becoming-a-maintainer) — esse arquivo direciona contribuidores para cá em busca das regras completas.

---

## Papéis

| Papel | Permissões |
|---|---|
| **Contributor** | Qualquer pessoa com pelo menos 1 merged PR. Sem permissões especiais. |
| **External Maintainer** | Um contribuidor da comunidade promovido conforme as regras abaixo. Pode revisar, dar approve, fechar/reabrir issues e fazer self-assign de issues. **Não pode clicar no merge button** — isso fica com o Core Team. |
| **Core Team** | Time interno do Open Design. Possui acesso total de escrita ao repositório e é a autoridade final em decisões de governança. Composição mantida internamente. |

O restante deste documento trata dos **External Maintainers**, salvo indicação em contrário.

---

## O que um Maintainer pode fazer que um Contributor não pode

| Ação | Contributor | Maintainer |
|---|:---:|:---:|
| Dar approve em um PR | ⚠️ conta como comentário, **não** como o approval exigido | ✓ conta como o approval exigido para o merge |
| Fechar / reabrir issues | Apenas issues que ele mesmo abriu | ✓ qualquer issue |
| Fazer self-assign em issues abertas e sem responsável (P0 primeiro) | ✗ | ✓ |

### Requisitos para merge

Qualquer PR — independentemente de quem o tenha autorado — precisa **dos três**:

1. Sem conflitos de código.
2. CI totalmente verde.
3. Pelo menos um approval de um Maintainer ou de um membro do Core Team.

O approval de um Maintainer é o caminho que a maioria dos PRs segue até o merge — é a forma mais direta pela qual a confiança em um Maintainer aparece no dia a dia do projeto.

---

## Como se tornar um Maintainer

Há **três** critérios de entrada. Todos os três precisam ser atendidos.

### 1. Volume de contribuição

- **≥ 20 merged PRs** em `nexu-io/open-design`.

Este é um piso flexível, não uma passagem automática. Atingir 20 PRs te coloca
em consideração; isso não garante o papel.

### 2. Qualidade da conta (anti-sock-puppet, anti-bot)

Avaliamos o perfil do candidato no GitHub em sete dimensões. **Passe em
pelo menos 5 das 7 linhas de admissão e não acione nenhuma linha de veto.**

| # | Dimensão | Linha de admissão | Linha de veto |
|---|---|---|---|
| 1 | Idade da conta no GitHub | ≥ 1 ano | < 90 dias |
| 2 | Repositórios públicos | ≥ 3 | 0 |
| 3 | Seguidores | ≥ 10 | < 3 |
| 4 | Razão seguidores / seguindo | > 0,30 | < 0,05 (padrão típico de follow-farm) |
| 5 | Completude do perfil | Avatar personalizado **e** pelo menos um entre bio / company / blog / twitter | Avatar padrão **e** todos os campos bio/company/blog vazios |
| 6 | Atividade entre projetos | Pelo menos um merged PR ou atividade sustentada de issue/star em **outro** repositório público | Merged PRs apenas neste repositório |
| 7 | Situação da conta | Sem restrições da plataforma GitHub (spam/banned/restored) | Qualquer uma das anteriores |

#### Dispensa para projeto inicial (expira automaticamente quando o repositório completa 6 meses)

Enquanto `nexu-io/open-design` tiver menos de seis meses desde o commit inicial,
o veto de **atividade entre projetos** (#6) pode ser dispensado por consenso do Core Team
quando:

- As dimensões 1, 2, 3 e 5 estiverem claramente acima da linha de admissão; **e**
- A qualidade dos PRs do candidato neste repositório for julgada alta na revisão
  prática feita pelo Core Team.

A dispensa precisa ser registrada no histórico interno do Core Team junto com o
nome do candidato e a data. Após o repositório completar seis meses, esta
cláusula de dispensa deixa de estar disponível.

### 3. Qualidade da contribuição (julgamento do Core Team)

Este critério é qualitativo e não baseado em fórmula. O Core Team observa:

- **Qualidade do código** dos merged PRs (correção, disciplina de escopo, respeito aos limites do repositório).
- **Qualidade das revisões** em quaisquer comentários de review deixados em PRs de outras pessoas.
- **Participação na comunidade** — Discussions, triagem de issues, engajamento no Discord.
- **Sinal de colaboração** — receptividade a feedback, disposição para revisar.

Atender aos dois primeiros critérios te coloca no pool de candidatos. Atravessar
este terceiro limiar é o que te leva à indicação.

### Processo de seleção

1. Um membro do Core Team levanta o nome do candidato internamente.
2. O Core Team chega a um consenso.
3. Um membro do Core Team faz contato em particular para confirmar que o candidato aceita.
4. Onboarding.
5. Anúncio público.

Não há PR de indicação, nem votação pública, nem mandato fixo. A intenção é
ser o **inverso do modelo de approver-vote do K8s/Apache** — no início da
vida do projeto, um consenso leve do Core Team se move mais rápido e produz
a mesma qualidade de resultado. Quando o grupo de Maintainers passar de cinco
External Maintainers, esta seção será revisitada.

---

## Responsabilidades e expectativas

**Não há cotas rígidas.** Sem contagem semanal de PR-reviews, sem taxa mínima
de triagem de issues, sem SLA para tempo de resposta. Ser Maintainer é um
reconhecimento de confiança, não um trabalho não remunerado.

O que pedimos, em espírito:

- Dê approve em PRs para os quais você tem o contexto; abstenha-se quando não tiver.
- Honre os requisitos de merge (§ "Requisitos para merge") — seu approval
  é um sinal real, não um carimbo automático.
- Mantenha o `#maintainers` informado se você for ficar fora por um período prolongado.
- Trate o roadmap ainda não público compartilhado em `#maintainers` como confidencial.

Se o Core Team observar um padrão de comportamento ruim (approvals automáticos,
fechamentos maliciosos de issues, vazamento de roadmap não anunciado, etc.),
as permissões são revogadas conforme § "Step-down — por justa causa".

---

## Acesso exclusivo de Maintainer

Além das permissões de repositório listadas acima, os Maintainers recebem
algumas coisas que a comunidade mais ampla não recebe:

- **Canal `#maintainers` no Discord** — um espaço de trabalho privado compartilhado
  com o Core Team. Usado para previews de design, rascunhos de RFC e
  coordenação interna sobre a parte ainda não pública do roadmap.
- **Roadmap confidencial** — visibilidade antecipada de trabalhos que ainda
  não foram anunciados. Os Maintainers concordam em tratar seu conteúdo como confidencial
  até que um membro do Core Team o anuncie publicamente.
- **Linha direta com o Core Team** — suas mensagens em `#maintainers` recebem
  uma resposta mais rápida e substantiva do que em Discussions públicas, e o Core
  Team genuinamente solicita o input dos Maintainers em decisões de arquitetura e roadmap.
- **Selo de Maintainer** — uma marca pública de confiança no seu perfil do GitHub e
  nas superfícies do repositório relacionadas a MAINTAINERS (será disponibilizado
  assim que o recurso de badge do GitHub estiver implementado).
- **Reconhecimento público na promoção** — anúncio no Twitter, no
  GitHub Discussions e no Discord quando você entra.

---

## Step-down

Ser Maintainer não é um cargo vitalício. Há três caminhos de saída.

### Step-down voluntário (graceful)

- O Maintainer envia mensagem ao Core Team ou posta em `#maintainers`.
- As permissões são revogadas em até 24 horas.
- O Maintainer passa para o status de **Emeritus**.
- Nenhuma justificativa pública é exigida.

### Transição por inatividade

Um Maintainer é considerado para transição por inatividade quando **qualquer** das condições abaixo ocorrer:

- 90 dias consecutivos sem qualquer sinal de atividade (merged PR, comentário de review,
  triagem de issue, participação substancial em Discussion ou no Discord), **ou**
- 60 dias consecutivos sem responder a qualquer @-mention (solicitação de
  review de PR, atribuição de issue).

Processo:

1. O Core Team faz @-mention do Maintainer em particular no `#maintainers`,
   dando uma **janela de resposta de 14 dias**.
2. Se não houver resposta substantiva em 14 dias, o Maintainer transita
   para Emeritus e as permissões são revogadas.
3. Uma nota pública curta e gentil é postada no GitHub Discussions: "Obrigado
   pelas suas contribuições — você foi movido para Emeritus, é bem-vindo
   de volta a qualquer momento."
4. Voltar é fácil — veja "Emeritus" abaixo.

### Step-down por justa causa

Acionado por:

- Comportamento ruim repetido (por exemplo, approvals automáticos em
  PRs abaixo do padrão, fechamentos maliciosos de issues, abuso de permissões).
- Violação do [Código de Conduta][coc] do projeto.
- Incidentes de gravidade de segurança (conta comprometida não reportada prontamente,
  vazamento intencional de roadmap não anunciado, etc.).

Processo:

1. Qualquer membro do Core Team pode abrir a discussão.
2. **Pelo menos 3 membros do Core Team** precisam concordar antes de qualquer ação ser tomada
   (não é exigido o consenso completo do Core Team).
3. Em até 24 horas após a decisão: permissões revogadas, remoção do
   `#maintainers`, remoção de qualquer roster de Maintainers (**não** transita
   para Emeritus).
4. A pessoa afetada é informada da decisão e dos motivos, e pode
   recorrer uma vez.

O princípio é **viés a favor de manter o Maintainer**. Um único deslize pequeno
não é motivo para step-down forçado; o caminho por justa causa é apenas para
padrões repetidos ou incidentes pontuais graves.

[coc]: https://www.contributor-covenant.org/

---

## Emeritus

Maintainers que dão step-down de forma voluntária ou transitam por inatividade tornam-se
**Emeritus**. O status de Emeritus:

- Remove permissões de write/approve/close.
- Mantém o nome da pessoa reconhecido na seção Emeritus do roster (interno).
- Mantém o acesso ao `#maintainers` no Discord (ler ou postar — escolha do Maintainer).
- Não carrega nenhuma responsabilidade contínua.

### Voltando do Emeritus

O caminho de retorno mais simples: 3 merged PRs nos 30 dias mais recentes, e então
o Core Team restaura as permissões. Não é necessária nova indicação.

O ponto do Emeritus é reconhecer que a vida acontece — um sabático,
uma mudança de emprego, um filho — sem nenhum drama ou custo social para qualquer das partes.

---

## Mudanças neste documento

As regras deste documento podem ser alteradas por consenso do Core Team. Mudanças materiais
(critérios de admissão, limiares de step-down) serão anunciadas no
GitHub Discussions antes de entrarem em vigor para qualquer candidato ativo. Esclarecimentos
editoriais podem ser aplicados diretamente.
