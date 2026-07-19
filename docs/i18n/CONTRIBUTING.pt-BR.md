# Contribuindo com o Open Design

Obrigado por considerar contribuir. O OD é pequeno de propósito — a maior parte do valor mora em **arquivos** (skills, design systems, fragmentos de prompt) e não em código de framework. Isso significa que as contribuições com maior alavancagem geralmente são uma pasta, um arquivo Markdown ou um adapter do tamanho de um PR.

Este guia diz exatamente onde olhar para cada tipo de contribuição e qual a barra que um PR precisa atingir antes do merge.

<p align="center"><a href="../../CONTRIBUTING.md">English</a> · <b>Português (Brasil)</b> · <a href="CONTRIBUTING.de.md">Deutsch</a> · <a href="CONTRIBUTING.fr.md">Français</a> · <a href="CONTRIBUTING.zh-CN.md">简体中文</a> · <a href="CONTRIBUTING.ja-JP.md">日本語</a> · <a href="CONTRIBUTING.ko.md">한국어</a> · <a href="CONTRIBUTING.th.md">ภาษาไทย</a></p>

---

## Três coisas que dá pra entregar em uma tarde

| Se você quer… | Você está adicionando | Onde mora | Tamanho da entrega |
|---|---|---|---|
| Fazer o OD renderizar um novo tipo de artifact (uma nota fiscal, uma tela de Settings do iOS, um one-pager…) | um **design template** | [`design-templates/<seu-template>/`](../../design-templates/) | uma pasta com `SKILL.md` e assets de renderização |
| Adicionar uma capacidade funcional que agentes invocam durante uma tarefa | uma **Skill** | [`skills/<sua-skill>/`](../../skills/) | uma pasta com `SKILL.md` e recursos opcionais |
| Fazer o OD falar a linguagem visual de uma nova marca | um **Design System** | [`design-systems/<marca>/`](../../design-systems/) | um pacote: `manifest.json`, `DESIGN.md` e `tokens.css` |
| Plugar um novo CLI de agente de código | um **Adapter de agente** | [`apps/daemon/src/runtimes/defs/`](../../apps/daemon/src/runtimes/defs/) | uma definição e uma entrada no registro |
| Adicionar uma feature, corrigir um bug, trazer um padrão de UX do [`open-codesign`][ocod] | código | `apps/web/src/`, `apps/daemon/` | PR normal |
| Melhorar docs, traduzir uma seção para Français / Deutsch / 中文, corrigir typos | docs | `README.md`, `README.fr.md`, `README.de.md`, `README.zh-CN.md`, `docs/`, `QUICKSTART.md` | um PR |

Se você não tem certeza em qual balde sua ideia se encaixa, [abra primeiro uma discussion / issue](https://github.com/nexu-io/open-design/issues/new) e te apontamos para a superfície certa.

---

## Setup local

O setup completo numa página mora em [`QUICKSTART.pt-BR.md`](QUICKSTART.pt-BR.md). O TL;DR para contribuidores:

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable           # selects the pinned pnpm from packageManager
pnpm install
pnpm tools-dev run web    # daemon + web foreground loop
pnpm typecheck            # tsc -b --noEmit
pnpm --filter @open-design/web build  # build do pacote web quando necessário
```

Node `~24` e pnpm `10.33.x` são obrigatórios. `nvm` / `fnm` são opcionais; use `nvm install 24 && nvm use 24` ou `fnm install 24 && fnm use 24` se preferir gerenciar Node assim. macOS, Linux e WSL2 são os caminhos principais. Windows nativo é suportado; veja [`docs/windows-troubleshooting.md`](../../docs/windows-troubleshooting.md) para os tropeços de configuração mais comuns.

Você não precisa de nenhum CLI de agente no `PATH` para desenvolver o próprio OD — o daemon dirá "no agents found" e cairá no caminho **Anthropic API · BYOK**, que é o loop de dev mais rápido de qualquer jeito.

---

## Adicionando um novo design template

Um design template é uma pasta sob [`design-templates/`](../../design-templates/) com um `SKILL.md` na raiz, seguindo a [convenção `SKILL.md`][skill] do Claude Code mais nossa extensão opcional `od:`. Ele reúne a forma e os assets de renderização de um artifact exibido na galeria Templates.

### → Veja o guia completo em [`docs/skills-contributing.md`](../../docs/skills-contributing.md)

### Layout da pasta do design template

```text
design-templates/your-template/
├── SKILL.md                    # required
├── assets/template.html        # optional but recommended — the seed file
├── references/                 # optional — knowledge files the agent reads
│   ├── layouts.md
│   ├── components.md
│   └── checklist.md
└── example.html                # strongly recommended — a real, hand-built sample
```

### Frontmatter do `SKILL.md`

As três primeiras chaves são a base spec do Claude Code — `name`, `description`, `triggers`. Tudo sob `od:` é específico do OD e opcional, mas **`od.mode`** decide em qual grupo o template aparece (Prototype / Deck / Template / Design system).

```yaml
---
name: your-template
description: |
  One-paragraph elevator pitch. The agent reads this verbatim to decide
  if the user's brief matches. Be concrete: surface, audience, what's in
  the artifact, what's not.
triggers:
  - "your trigger phrase"
  - "another phrase"
  - "中文触发词"
od:
  mode: prototype           # prototype | deck | template | design-system
  platform: desktop         # desktop | mobile
  scenario: marketing       # free-form tag for grouping
  featured: 1               # any positive integer surfaces it under "Showcase examples"
  preview:
    type: html              # html | jsx | pptx | markdown
  design_system:
    requires: true          # does the template read the active DESIGN.md?
  craft:
    requires: [typography, color, anti-ai-slop]
  example_prompt: "A copy-pastable prompt that nicely shows what this template does."
---

# Your Template

Body is free-form Markdown describing the workflow the agent should follow…
```

A gramática ativa completa (`od.mode`, `od.surface`, `od.craft.requires`, `od.critique.policy`, dicas de galeria e mais) vive em [`docs/skills-protocol.md`](../../docs/skills-protocol.md). Campos portáveis antigos como `od.inputs`, `od.parameters` e `od.capabilities_required` ainda podem aparecer em bundles externos, mas não são consumidos pelo registro de skills/templates.

### Barra para mergear um novo design template

Somos exigentes com templates porque eles são uma superfície voltada para o usuário. Um novo template precisa:

1. **Trazer um `example.html` real.** Feito à mão, abre direto do disco e parece algo que um designer entregaria. Sem lorem ipsum, sem hero placeholder `<svg><rect/></svg>`. Se você não consegue construir o exemplo, provavelmente o template ainda não está pronto.
2. **Passar no checklist anti-AI-slop** no corpo. Sem gradiente roxo, sem ícones genéricos de emoji, sem card arredondado com borda lateral de destaque, sem Inter como fonte de *display*, sem stats inventados. Leia a seção **Anti-AI-slop machinery** do README para a lista completa.
3. **Placeholders honestos.** Quando o agente não tem um número real, escreva `—` ou um bloco cinza com label, não "10× mais rápido".
4. **Ter um `references/checklist.md`** com pelo menos os gates P0 (o que o agente precisa passar antes de emitir `<artifact>`). Pegue o formato em [`design-templates/guizang-ppt/references/checklist.md`](../../design-templates/guizang-ppt/) ou [`design-templates/dating-web/references/checklist.md`](../../design-templates/dating-web/).
5. **Adicionar um screenshot** em `docs/screenshots/skills/<skill>.png` se o template for featured. PNG, ~1024×640 retina, capturado do `example.html` real em zoom-out do navegador.
6. **Ser uma única pasta self-contained.** Sem imports de CDN além do que outros templates já usam; sem fontes que você não licenciou; sem imagens maiores que ~250 KB.

Se você forkar um design template existente (por exemplo, partir do `dating-web` e remixar para um `recruiting-web`), preserve o LICENSE original e a autoria em `references/` e mencione isso na descrição do PR.

### Design templates já entregues — pegue um para imitar

- Showcase visual, protótipo de tela única: [`design-templates/dating-web/`](../../design-templates/dating-web/), [`design-templates/digital-eguide/`](../../design-templates/digital-eguide/)
- Fluxo mobile multi-frame: [`design-templates/mobile-onboarding/`](../../design-templates/mobile-onboarding/), [`design-templates/gamified-app/`](../../design-templates/gamified-app/)
- Documento / template (sem design system obrigatório): [`design-templates/pm-spec/`](../../design-templates/pm-spec/), [`design-templates/weekly-update/`](../../design-templates/weekly-update/)
- Modo deck: [`design-templates/guizang-ppt/`](../../design-templates/guizang-ppt/) (bundled literalmente de [op7418/guizang-ppt-skill][guizang]) e [`design-templates/simple-deck/`](../../design-templates/simple-deck/)

---

## Adicionando uma Skill funcional

Uma Skill funcional é uma capacidade que o agente invoca durante uma tarefa para trabalhar sobre a entrada do usuário. Comece em [`skills/README.md`](../../skills/README.md) para entender a divisão de responsabilidades, em [`skills/AGENTS.md`](../../skills/AGENTS.md) para o contrato da pasta e em [`docs/skills-protocol.md`](../../docs/skills-protocol.md) para a gramática `SKILL.md` compartilhada. O scanner lazy do daemon percorre as raízes de Skills na próxima requisição `/api/skills`; em desenvolvimento local, não é preciso rebuild nem reiniciar o daemon.

---

## Adicionando um novo Design System

Um novo design system do repositório é um pacote sob [`design-systems/<slug>/`](../../design-systems/), não um arquivo Markdown isolado. Os 151 sistemas incluídos já usam o contrato de pacote abaixo. O daemon ainda aceita pastas apenas com `DESIGN.md` para compatibilidade com conteúdo antigo ou instalado pelo usuário, mas esse não é o formato para novos sistemas incluídos. O catálogo é reescaneado a cada requisição `/api/design-systems`: atualize a superfície Design System depois de editar, sem reiniciar o daemon.

### Layout mínimo do pacote

```text
design-systems/your-brand/
├── manifest.json
├── DESIGN.md
└── tokens.css
```

`manifest.json` guarda id estável, nome exibido, categoria, descrição, proveniência e caminhos declarados. `DESIGN.md` explica a intenção de design aos agentes; `tokens.css` é a folha canônica de tokens semânticos compilados. O contrato completo está em [`docs/design-systems.md`](../../docs/design-systems.md) e [`design-systems/_schema/AGENTS.md`](../../design-systems/_schema/AGENTS.md).

### Formato do `DESIGN.md`

```markdown
# YourBrand Design System

## Visual Theme
…

## Color Roles
…

## Typography
…

## Layout and Spacing
## Components and States
## Motion and Interaction
## Accessibility
## Anti-patterns
```

Não há schema fixo de nove seções. O guard de qualidade do pacote exige pelo menos sete seções H2 substanciais, sem impor nomes, ordem ou numeração. Use títulos adequados ao sistema real.

### Barra para mergear um novo design system

1. **Inclua os três arquivos obrigatórios.** O slug da pasta e `manifest.id` devem coincidir e usar ASCII normalizado (`linear.app` → `linear-app`, `x.ai` → `x-ai`).
2. **Escreva pelo menos sete H2 substanciais.** Não adicione títulos vazios apenas para atingir a contagem.
3. **Mantenha prosa e tokens consistentes.** Cores, tipografia, espaçamento e motion descritos em `DESIGN.md` devem corresponder a `tokens.css`, que precisa passar nos guards compartilhados.
4. **Use evidência real e proveniência clara.** Amostre o produto ou site de origem e registre a fonte no manifest ou nas evidências do pacote.
5. **Escreva copy útil para o catálogo.** `manifest.name`, `category` e `description` são os metadados principais do picker; evite fluff.

Os sistemas de produto derivados do upstream são importados de [`VoltAgent/awesome-design-md`][acd2] via [`scripts/sync-design-systems.ts`](../../scripts/sync-design-systems.ts). Se sua marca pertence ao upstream, **mande o PR para lá primeiro** — pegamos automaticamente no próximo sync. A pasta `design-systems/` também contém adições do próprio projeto que não cabem no upstream.

---

## Adicionando um novo CLI de agente de código

Plugar um novo agente (por exemplo, o CLI `foo-coder` de alguma loja nova) exige uma definição em [`apps/daemon/src/runtimes/defs/`](../../apps/daemon/src/runtimes/defs/) e uma entrada em `runtimes/registry.ts`:

```ts
import type { RuntimeAgentDef } from '../types.js';

export const fooAgentDef = {
  id: 'foo',
  name: 'Foo Coder',
  bin: 'foo',
  versionArgs: ['--version'],
  fallbackModels: [{ id: 'default', label: 'Default', default: true }],
  buildArgs: (prompt) => ['exec', '-p', prompt],
  streamFormat: 'plain',           // or 'claude-stream-json' if it speaks that
} satisfies RuntimeAgentDef;
```

Importe a definição em [`runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts) e adicione-a a `BASE_AGENT_DEFS`; o mecanismo compartilhado a detecta no `PATH`, mostra no picker e monta sua invocação. Reutilize um `streamFormat` existente quando o formato no wire coincidir. Um formato de wire realmente novo também exige um parser em [`apps/daemon/src/runtimes/`](../../apps/daemon/src/runtimes/) ou [`apps/daemon/src/agent-protocol/`](../../apps/daemon/src/agent-protocol/), testes do parser e um branch de dispatch correspondente em [`server.ts`](../../apps/daemon/src/server.ts).

Barra para mergear:

1. **Uma sessão real funciona end-to-end** com o novo agente — cole o log do daemon na descrição do PR mostrando que ele conseguiu streamar um artifact.
2. **`docs/agent-adapters.md`** atualizado com as peculiaridades do CLI (precisa de arquivo de chave? aceita imagem? qual a flag não-interativa?).
3. **A tabela "Supported coding agents" do README** ganha uma linha.

---

## Atualizando metadados de `max_tokens` dos modelos

O chat em modo API envia `max_tokens` para o provider upstream em toda requisição. O cliente web pega esse número de uma busca em três níveis em [`apps/web/src/state/maxTokens.ts`](../../apps/web/src/state/maxTokens.ts):

1. O override explícito do usuário em Settings, se definido.
2. Caso contrário, o default por modelo em [`apps/web/src/state/litellm-models.json`](../../apps/web/src/state/litellm-models.json) — uma fatia vendored do `model_prices_and_context_window.json` do [BerriAI/litellm][litellm] (MIT). Cobre ~2k modelos de chat de Anthropic, OpenAI, DeepSeek, Groq, Together, Mistral, Gemini, Bedrock, Vertex, OpenRouter etc.
3. Caso contrário, `FALLBACK_MAX_TOKENS = 8192`.

Para incluir um modelo recém-lançado, regere o JSON vendored:

```bash
node --experimental-strip-types scripts/sync-litellm-models.ts
```

O script busca o catálogo do LiteLLM, filtra entradas `mode: 'chat'`, projeta cada uma para `max_output_tokens` (com fallback em `max_tokens`) e grava um snapshot ordenado. Faça commit do `litellm-models.json` regerado junto com o PR que disparou o refresh.

A tabela OVERRIDES em `maxTokens.ts` é para o caso raro em que o LiteLLM está faltando ou errado para um id de modelo que de fato usamos — por exemplo, `mimo-v2.5-pro` (o LiteLLM só entrega o MiMo via aliases `openrouter/xiaomi/...` e `novita/xiaomimimo/...`, e nenhum bate com o id canônico que a API direta da Xiaomi usa). Mantenha-a pequena; tudo que o LiteLLM acerta pertence ao upstream.

[litellm]: https://github.com/BerriAI/litellm

---

## Manutenção de localização

Alemão usa o formal `Sie` porque o OD fala com uma audiência mista de criadores solo, agências e times de engenharia; até feedback do projeto mostrar que uma voz informal `du` se encaixa melhor, alemão formal é o default menos surpreendente. PRs de locale devem traduzir chrome de UI, docs principais e metadados visuais de galeria em `apps/web/src/i18n/content.ts`, mas não devem traduzir `skills/`, `design-systems/` nem corpos de prompt que os agentes executam. Esses prompts-fonte são mantidos como entradas de workflow, e manter um único idioma de fonte evita multiplicar QA de prompt entre locales. Ao adicionar ou renomear uma skill, design system ou prompt template, atualize os metadados de display em alemão e rode `pnpm --filter @open-design/web test`; o `content.test.ts` falha se a cobertura de display em alemão sair de sincronia. Erros do daemon, nomes de arquivos exportados e texto de artifact gerado pelo agente são limitações conhecidas, a menos que um PR explicitamente os englobe.

Para instruções passo a passo sobre adicionar um novo locale (dicionário de UI, README, language switcher, terminologia regional), veja [`TRANSLATIONS.md`](../../TRANSLATIONS.md).

---

## Estilo de código

Não somos pedantes com formatação (Prettier on save está ok), mas duas regras são inegociáveis porque aparecem na pilha de prompt e na API voltada ao usuário:

1. **Aspas simples em JS/TS.** Strings ficam com aspas simples a menos que escapar fique feio. O codebase já está consistente — siga.
2. **Comentários em inglês.** Mesmo se o PR é para traduzir algo para alemão ou 中文, comentários de código ficam em inglês para mantermos um único conjunto de referências grepáveis.

Além disso:

- **Não narre.** Sem `// import the module`, sem `// loop through items`. Se o código se lê obviamente, o comentário é ruído. Reserve comentários para intenção não-óbvia ou restrições que o código não consegue expressar.
- **TypeScript** em `apps/web/src/`. O daemon (`apps/daemon/`) é JavaScript ESM puro com JSDoc onde tipos importam — mantenha assim.
- **Sem novas dependências top-level** sem um parágrafo na descrição do PR sobre o que ganhamos vs. quantos bytes despachamos. A lista de deps em [`package.json`](../../package.json) é pequena de propósito.
- **Rode `pnpm typecheck`** antes do push. CI roda; falhar lá rende um comentário "please fix".

---

## Commits & pull requests

- **Uma preocupação por PR.** Adicionar uma skill + refatorar o parser + bumpar uma dep são três PRs.
- **Título é imperativo + escopo.** `add dating-web skill`, `fix daemon SSE backpressure when CLI hangs`, `docs: clarify storage contract`.
- **Use o template de PR.** Preencha cada seção de [`.github/pull_request_template.md`](../../.github/pull_request_template.md) — Why, What users will see, Surface area, Screenshots (se UI), Bug fix verification (se correção de bug), Validation. Seções vazias ganham um comentário "please fill in".
- **Corpo explica o porquê.** "O que isso faz" geralmente é óbvio do diff; "por que isso precisa existir" raramente é.
- **Referencie uma issue** se houver. Se não houver e o PR for não-trivial, abra uma antes para combinarmos que a mudança é desejada antes de você gastar o tempo.
- **Sem squash durante review.** Empurre fixups; squash no merge.
- **Sem force-push em branch compartilhado** a não ser que o reviewer tenha pedido.

Não exigimos CLA. A Apache-2.0 nos cobre; sua contribuição é licenciada nos mesmos termos.

---

## Reportando bugs

Abra uma issue com:

- O que você executou (a invocação `pnpm tools-dev ...` exata).
- Qual CLI de agente foi selecionado (ou se você estava no caminho BYOK).
- O par skill + design system que disparou.
- A **tail relevante de stderr do daemon** — a maior parte dos relatos "o artifact nunca renderizou" são diagnosticados em 30 segundos quando dá pra ver `spawn ENOENT` ou o erro real do CLI.
- Um screenshot se for UI.

Para bugs da pilha de prompt ("o agente emitiu um hero com gradiente roxo, a blacklist de slop deveria proibir isso"), inclua a **mensagem completa do assistente** para conseguirmos ver se a violação foi do modelo ou do prompt.

---

## Fazendo perguntas

- Pergunta de arquitetura, pergunta de design, "isso é bug ou mau uso" → [GitHub Discussions](https://github.com/nexu-io/open-design/discussions) (preferido — pesquisável para o próximo).
- "Como escrevo uma skill que faz X" → Abra uma discussion. Respondemos e transformamos a resposta em [`docs/skills-protocol.md`](../../docs/skills-protocol.md) se for um padrão faltante.

---

## O que não aceitamos

Para manter o projeto focado, por favor não abra PRs que:

- **Embutam um runtime de modelo.** Toda a aposta do OD é "seu CLI existente já basta". Não despachamos `pi-ai`, chaves OpenAI nem loaders de modelo.
- **Reescrevam o frontend para fora da stack atual sem discussão prévia.** Next.js 16 App Router + React 18 + TS é a linha. Sem Astro, Solid, Svelte ou outras reescritas de framework a menos que mantenedores explicitamente queiram essa migração.
- **Substituam o daemon por uma função serverless.** O ponto inteiro do daemon é ter um `cwd` real e spawnar um CLI real. Deploy do SPA na Vercel está ok; o daemon continua daemon.
- **Adicionem telemetria ou coleta externa de dados fora do contrato de privacidade.** Analytics de produto e replay de sessão mascarado dependem de consentimento; telemetria sanitizada de segurança/confiabilidade fica sempre ativa em builds configurados. Todo novo evento, campo ou destino deve preservar os limites de consentimento, minimização e sanitização descritos em [`PRIVACY.md`](../../PRIVACY.md).
- **Empacotem um binário** sem arquivo de licença e atribuição de autoria ao lado.

Se não tem certeza se sua ideia se encaixa, abra uma discussion antes de escrever o código.

---

<!-- Machine-translated section; native-speaker review welcome via PR. -->
## Tornando-se um Maintainer

Se você vem contribuindo de forma consistente e quer saber como é o caminho para se tornar um Maintainer, as regras estão em **[`MAINTAINERS.md`](../../MAINTAINERS.md)**. A versão curta:

- Um Maintainer pode revisar, aprovar e fechar issues. O botão de merge continua com o Core Team — sua aprovação ainda conta como a aprovação obrigatória para merge.
- A barra é **≥ 20 merged PRs** mais uma verificação publicada de qualidade da conta (anti-bot, anti-sock-puppet) mais um julgamento do Core Team sobre a qualidade da contribuição. Não há formulário de inscrição; o Core Team levanta candidatos internamente e entra em contato.
- **Não há cotas, nem SLAs, nem mandato fixo.** Sair é fácil e reversível (Emeritus → volte quando a vida acalmar).
- Todos os limiares, o fluxo de nomeação, as regras de step-down e o waiver de projeto inicial estão em [`MAINTAINERS.md`](../../MAINTAINERS.md). Leia esse documento se algo acima te interessar.

O tl;dr: mande bons PRs, revise com cuidado, apareça nas [Discussions][discussions] / no [Discord][discord], e o resto se resolve sozinho.

[discussions]: https://github.com/nexu-io/open-design/discussions
[discord]: https://discord.gg/mHAjSMV6gz

---

## Licença

Ao contribuir, você concorda que sua contribuição é licenciada sob a [Licença Apache-2.0](../../LICENSE) deste repositório, com a exceção dos arquivos dentro de [`design-templates/guizang-ppt/`](../../design-templates/guizang-ppt/), que mantêm sua licença MIT original e atribuição de autoria a [op7418](https://github.com/op7418).

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills
[guizang]: https://github.com/op7418/guizang-ppt-skill
[acd2]: https://github.com/VoltAgent/awesome-design-md
[ocod]: https://github.com/OpenCoworkAI/open-codesign
