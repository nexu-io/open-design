# Design System Inspirado na IBM

> Category: Media & Consumer
> Tecnologia corporativa. Sistema de design Carbon, paleta de azuis estruturada.

## 1. Tema Visual & Atmosfera

O site da IBM é a materialização digital da autoridade corporativa construída sobre o Carbon Design System — uma linguagem de design tão metodicamente estruturada que parece uma especificação de engenharia renderizada como página web. A página opera em uma dualidade marcante: uma tela branca (`#ffffff`) com texto quase preto (`#161616`), pontuada por um único e inabalável destaque — IBM Blue 60 (`#0f62fe`). Isso não é o minimalismo lúdico de startups de tecnologia; é precisão corporativa destilada em pixels. Cada elemento existe dentro da rígida grade 2x do Carbon, cada cor mapeia para um token semântico, cada valor de espaçamento encaixa na unidade base de 8px.

A família tipográfica IBM Plex é a espinha dorsal do sistema. IBM Plex Sans em peso leve (300) para títulos de exibição cria uma qualidade inesperadamente arejada, quase delicada em tamanhos grandes — um contraponto deliberado à gravidade corporativa da IBM. Em tamanhos de corpo, o peso regular (400) com letter-spacing de 0.16px em legendas de 14px introduz o microrastreamento meticuloso que faz o texto Carbon parecer engenheirado em vez de simplesmente projetado. IBM Plex Mono serve para código, dados e rótulos técnicos, completando a trindade da família ao lado do IBM Plex Serif, raramente utilizado.

O que define a identidade visual da IBM além do monocromático-mais-azul é a dependência do sistema de tokens de componentes do Carbon. Cada estado interativo mapeia para uma propriedade customizada CSS prefixada com `--cds-` (Carbon Design System). Botões não têm cores fixas no código; eles referenciam `--cds-button-primary`, `--cds-button-primary-hover`, `--cds-button-primary-active`. Essa arquitetura tokenizada significa que toda a camada visual é uma fina película sobre uma fundação profundamente sistemática — o equivalente de design de uma API bem tipada.

**Características Principais:**
- IBM Plex Sans no peso 300 (Light) para exibição — gravidade corporativa através da contenção tipográfica
- IBM Plex Mono para código e conteúdo técnico com letter-spacing consistente de 0.16px em tamanhos pequenos
- Cor de destaque única: IBM Blue 60 (`#0f62fe`) — cada elemento interativo, cada CTA, cada link
- Sistema de tokens Carbon (`--cds-*`) controlando todas as cores semânticas, permitindo troca de tema no nível das variáveis
- Grade de espaçamento de 8px com aderência estrita — sem valores arbitrários, tudo alinhado
- Cartões planos e sem bordas sobre superfície Gray 10 `#f4f4f4` — profundidade através de camadas de cor de fundo, não sombras
- Inputs com borda inferior (não encaixotados) — o padrão de formulário característico do Carbon
- Border-radius de 0px em botões primários — retangularidade sem concessões, sem suavização

## 2. Paleta de Cores & Funções

### Primárias
- **IBM Blue 60** (`#0f62fe`): A cor interativa singular. Botões primários, links, estados de foco, indicadores ativos. É o único matiz cromático na paleta de UI principal.
- **Branco** (`#ffffff`): Fundo da página, superfícies de cartões, texto de botão sobre azul, `--cds-background`.
- **Gray 100** (`#161616`): Texto primário, títulos, fundos de superfícies escuras, barra de navegação, rodapé. `--cds-text-primary`.

### Escala de Neutros (Família Gray)
- **Gray 100** (`#161616`): Texto primário, títulos, interface escura, fundo do rodapé.
- **Gray 90** (`#262626`): Superfícies escuras secundárias, estados hover em fundos escuros.
- **Gray 80** (`#393939`): Escuro terciário, estados ativos.
- **Gray 70** (`#525252`): Texto secundário, texto auxiliar, descrições. `--cds-text-secondary`.
- **Gray 60** (`#6f6f6f`): Texto placeholder, texto desabilitado.
- **Gray 50** (`#8d8d8d`): Ícones desabilitados, rótulos esmaecidos.
- **Gray 30** (`#c6c6c6`): Bordas, linhas divisórias, bordas inferiores de inputs. `--cds-border-subtle`.
- **Gray 20** (`#e0e0e0`): Bordas sutis, contornos de cartões.
- **Gray 10** (`#f4f4f4`): Fundo de superfície secundária, preenchimento de cartões, linhas alternadas. `--cds-layer-01`.
- **Gray 10 Hover** (`#e8e8e8`): Estado hover para superfícies Gray 10.

### Interativas
- **Blue 60** (`#0f62fe`): Interativo primário — botões, links, foco. `--cds-link-primary`, `--cds-button-primary`.
- **Blue 70** (`#0043ce`): Estado hover de link. `--cds-link-primary-hover`.
- **Blue 80** (`#002d9c`): Estado ativo/pressionado para elementos azuis.
- **Blue 10** (`#edf5ff`): Superfície com tonalidade azul, fundo de linha selecionada.
- **Focus Blue** (`#0f62fe`): `--cds-focus` — borda inset de 2px em elementos com foco.
- **Focus Inset** (`#ffffff`): `--cds-focus-inset` — anel interno branco para foco em fundos escuros.

### Suporte & Status
- **Red 60** (`#da1e28`): Erro, perigo. `--cds-support-error`.
- **Green 50** (`#24a148`): Sucesso. `--cds-support-success`.
- **Yellow 30** (`#f1c21b`): Aviso. `--cds-support-warning`.
- **Blue 60** (`#0f62fe`): Informativo. `--cds-support-info`.

### Tema Escuro (Tema Gray 100)
- **Fundo**: Gray 100 (`#161616`). `--cds-background`.
- **Layer 01**: Gray 90 (`#262626`). Superfícies de cartões e containers.
- **Layer 02**: Gray 80 (`#393939`). Superfícies elevadas.
- **Texto Primário**: Gray 10 (`#f4f4f4`). `--cds-text-primary`.
- **Texto Secundário**: Gray 30 (`#c6c6c6`). `--cds-text-secondary`.
- **Borda Sutil**: Gray 80 (`#393939`). `--cds-border-subtle`.
- **Interativo**: Blue 40 (`#78a9ff`). Links e elementos interativos ficam mais claros para garantir contraste.

## 3. Regras Tipográficas

### Família de Fontes
- **Primária**: `IBM Plex Sans`, com fallbacks: `Helvetica Neue, Arial, sans-serif`
- **Monoespaçada**: `IBM Plex Mono`, com fallbacks: `Menlo, Courier, monospace`
- **Serifada** (uso limitado): `IBM Plex Serif`, para contextos editoriais/expressivos
- **Fonte de Ícone**: `ibm_icons` — glifos de ícone proprietários em 20px

### Hierarquia

| Função | Fonte | Tamanho | Peso | Altura de Linha | Letter Spacing | Notas |
|--------|-------|---------|------|-----------------|----------------|-------|
| Display 01 | IBM Plex Sans | 60px (3.75rem) | 300 (Light) | 1.17 (70px) | 0 | Impacto máximo, peso leve para elegância |
| Display 02 | IBM Plex Sans | 48px (3.00rem) | 300 (Light) | 1.17 (56px) | 0 | Hero secundário, fallback responsivo |
| Heading 01 | IBM Plex Sans | 42px (2.63rem) | 300 (Light) | 1.19 (50px) | 0 | Título expressivo |
| Heading 02 | IBM Plex Sans | 32px (2.00rem) | 400 (Regular) | 1.25 (40px) | 0 | Títulos de seção |
| Heading 03 | IBM Plex Sans | 24px (1.50rem) | 400 (Regular) | 1.33 (32px) | 0 | Títulos de subseção |
| Heading 04 | IBM Plex Sans | 20px (1.25rem) | 600 (Semibold) | 1.40 (28px) | 0 | Títulos de cartões, cabeçalhos de funcionalidades |
| Heading 05 | IBM Plex Sans | 20px (1.25rem) | 400 (Regular) | 1.40 (28px) | 0 | Títulos de cartões mais leves |
| Body Long 01 | IBM Plex Sans | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Texto de leitura padrão |
| Body Long 02 | IBM Plex Sans | 16px (1.00rem) | 600 (Semibold) | 1.50 (24px) | 0 | Corpo enfatizado, rótulos |
| Body Short 01 | IBM Plex Sans | 14px (0.88rem) | 400 (Regular) | 1.29 (18px) | 0.16px | Corpo compacto, legendas |
| Body Short 02 | IBM Plex Sans | 14px (0.88rem) | 600 (Semibold) | 1.29 (18px) | 0.16px | Legendas em negrito, itens de navegação |
| Caption 01 | IBM Plex Sans | 12px (0.75rem) | 400 (Regular) | 1.33 (16px) | 0.32px | Metadados, timestamps |
| Code 01 | IBM Plex Mono | 14px (0.88rem) | 400 (Regular) | 1.43 (20px) | 0.16px | Código inline, terminal |
| Code 02 | IBM Plex Mono | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Blocos de código |
| Mono Display | IBM Plex Mono | 42px (2.63rem) | 400 (Regular) | 1.19 (50px) | 0 | Decorativo mono para hero |

### Princípios
- **Peso leve em tamanhos de exibição**: O conjunto tipográfico expressivo do Carbon usa peso 300 (Light) em 42px ou mais. Isso cria uma tensão distintiva — o conteúdo fala com autoridade corporativa enquanto as formas das letras sussurram com leveza tipográfica.
- **Microrastreamento em tamanhos pequenos**: letter-spacing de 0.16px em 14px e 0.32px em 12px. Esses valores aparentemente insignificantes são a arma secreta do Carbon para legibilidade em tamanhos compactos — eles abrem as formas compactas do IBM Plex apenas o suficiente.
- **Três pesos funcionais**: 300 (exibição/expressivo), 400 (corpo/leitura), 600 (ênfase/rótulos de UI). O peso 700 está intencionalmente ausente da escala tipográfica de produção.
- **Produtivo vs. Expressivo**: Conjuntos produtivos usam alturas de linha mais compactas (1.29) para interfaces densas. Conjuntos expressivos respiram mais (1.40-1.50) para conteúdo de marketing e editorial.

## 4. Estilização de Componentes

### Botões

**Botão Primário (Azul)**
- Fundo: `#0f62fe` (Blue 60) → `--cds-button-primary`
- Texto: `#ffffff` (Branco)
- Padding: 14px 63px 14px 15px (assimétrico — espaço para ícone final)
- Borda: 1px solid transparent
- Border-radius: 0px (retângulo nítido — a assinatura Carbon)
- Altura: 48px (padrão), 40px (compacto), 64px (expressivo)
- Hover: `#0353e9` (Blue 60 Hover) → `--cds-button-primary-hover`
- Ativo: `#002d9c` (Blue 80) → `--cds-button-primary-active`
- Foco: `2px solid #0f62fe` inset + `1px solid #ffffff` interno

**Botão Secundário (Gray)**
- Fundo: `#393939` (Gray 80)
- Texto: `#ffffff`
- Hover: `#4c4c4c` (Gray 70)
- Ativo: `#6f6f6f` (Gray 60)
- Mesmo padding/radius que o primário

**Botão Terciário (Ghost Azul)**
- Fundo: transparent
- Texto: `#0f62fe` (Blue 60)
- Borda: 1px solid `#0f62fe`
- Hover: texto `#0353e9` + tonalidade de fundo Blue 10
- Border-radius: 0px

**Botão Ghost**
- Fundo: transparent
- Texto: `#0f62fe` (Blue 60)
- Padding: 14px 16px
- Borda: nenhuma
- Hover: tonalidade de fundo `#e8e8e8`

**Botão de Perigo**
- Fundo: `#da1e28` (Red 60)
- Texto: `#ffffff`
- Hover: `#b81921` (Red 70)

### Cartões & Containers
- Fundo: `#ffffff` no tema claro, `#f4f4f4` (Gray 10) para cartões elevados
- Borda: nenhuma (design plano — sem borda ou sombra na maioria dos cartões)
- Border-radius: 0px (combinando com a estética de botão retangular)
- Hover: fundo muda para `#e8e8e8` (Gray 10 Hover) em cartões clicáveis
- Padding de conteúdo: 16px
- Separação: camadas de cor de fundo (branco → gray 10 → branco) em vez de sombras

### Inputs & Formulários
- Fundo: `#f4f4f4` (Gray 10) — `--cds-field`
- Texto: `#161616` (Gray 100)
- Padding: 0px 16px (somente horizontal)
- Altura: 40px (padrão), 48px (grande)
- Borda: nenhuma nas laterais/topo — `2px solid transparent` inferior
- Borda inferior ativa: `2px solid #161616` (Gray 100)
- Foco: borda inferior `2px solid #0f62fe` (Blue 60) — `--cds-focus`
- Erro: borda inferior `2px solid #da1e28` (Red 60)
- Rótulo: 12px IBM Plex Sans, letter-spacing 0.32px, Gray 70
- Texto auxiliar: 12px, Gray 60
- Placeholder: Gray 60 (`#6f6f6f`)
- Border-radius: 0px (topo) — inputs têm cantos nítidos

### Navegação
- Fundo: `#161616` (Gray 100) — masthead escuro em largura total
- Altura: 48px
- Logo: logotipo IBM de 8 barras, branco sobre escuro, alinhado à esquerda
- Links: 14px IBM Plex Sans, peso 400, `#c6c6c6` (Gray 30) padrão
- Hover de link: texto `#ffffff`
- Link ativo: `#ffffff` com indicador de borda inferior
- Alternador de plataforma: abas horizontais alinhadas à esquerda
- Busca: campo de busca deslizante ativado por ícone
- Mobile: hambúrguer com painel deslizante à esquerda

### Links
- Padrão: `#0f62fe` (Blue 60) sem sublinhado
- Hover: `#0043ce` (Blue 70) com sublinhado
- Visitado: permanece Blue 60 (sem alteração de estado visitado)
- Links inline: sublinhados por padrão no corpo do texto

### Componentes Distintivos

**Bloco de Conteúdo (Hero/Destaque)**
- Faixas de fundo branco/gray-10 alternadas em largura total
- Título alinhado à esquerda com tipo display de 60px ou 48px
- CTA como botão primário azul com ícone de seta
- Imagem/ilustração alinhada à direita ou abaixo no mobile

**Tile (Cartão Clicável)**
- Fundo: `#f4f4f4` ou `#ffffff`
- Hover com deslocamento de fundo ou borda inferior em largura total
- Ícone de seta no canto inferior direito no hover
- Sem sombra — a planura é a identidade

**Tag / Rótulo**
- Fundo: cor contextual com 10% de opacidade (ex.: Blue 10, Red 10)
- Texto: cor correspondente de grau 60
- Padding: 4px 8px
- Border-radius: 24px (pílula — exceção à regra de 0px)
- Fonte: 12px peso 400

**Banner de Notificação**
- Barra em largura total, tipicamente com fundo Blue 60 ou Gray 100
- Texto branco, 14px
- Ícone de fechar/dispensar alinhado à direita

## 5. Princípios de Layout

### Sistema de Espaçamento
- Unidade base: 8px (grade 2x do Carbon)
- Escala de espaçamento de componentes: 2px, 4px, 8px, 12px, 16px, 24px, 32px, 40px, 48px
- Escala de espaçamento de layout: 16px, 24px, 32px, 48px, 64px, 80px, 96px, 160px
- Unidade mínima: 8px (menor espaçamento utilizável)
- Padding dentro de componentes: tipicamente 16px
- Espaço entre cartões/tiles: 1px (fio de cabelo) ou 16px (padrão)

### Grade & Container
- Grade de 16 colunas (sistema de grade 2x do Carbon)
- Largura máxima de conteúdo: 1584px (breakpoint máximo)
- Calhas de coluna: 32px (16px no mobile)
- Margem: 16px (mobile), 32px (tablet+)
- Conteúdo tipicamente abrange 8-12 colunas para comprimentos de linha legíveis
- Seções em sangria total alternam com conteúdo contido

### Filosofia de Espaço em Branco
- **Densidade funcional**: Carbon favorece densidade produtiva em detrimento de espaço em branco expansivo. As seções são compactadas em comparação com sistemas de design voltados ao consumidor — isso reflete o DNA corporativo da IBM.
- **Zoneamento por cor de fundo**: Em vez de padding massivo entre seções, a IBM usa cores de fundo alternadas (branco → gray 10 → branco) para criar separação visual com espaço vertical mínimo.
- **Ritmo consistente de 48px**: Transições de seções principais usam espaçamento vertical de 48px. Seções hero podem usar 80px–96px.

### Escala de Border-Radius
- **0px**: Botões primários, inputs, tiles, cartões — o tratamento dominante. Carbon é fundamentalmente retangular.
- **2px**: Ocasionalmente em pequenos elementos interativos (tags)
- **24px**: Tags/rótulos (formato pílula — a única exceção arredondada)
- **50%**: Círculos de avatar, containers de ícone

## 6. Profundidade & Elevação

| Nível | Tratamento | Uso |
|-------|-----------|-----|
| Plano (Nível 0) | Sem sombra, fundo `#ffffff` | Superfície padrão da página |
| Layer 01 | Sem sombra, fundo `#f4f4f4` | Cartões, tiles, seções alternadas |
| Layer 02 | Sem sombra, fundo `#e0e0e0` | Painéis elevados dentro do Layer 01 |
| Elevado | `0 2px 6px rgba(0,0,0,0.3)` | Dropdowns, tooltips, menus overflow |
| Sobreposição | `0 2px 6px rgba(0,0,0,0.3)` + véu escuro | Diálogos modais, painéis laterais |
| Foco | `2px solid #0f62fe` inset + `1px solid #ffffff` | Anel de foco pelo teclado |
| Borda inferior | `2px solid #161616` na borda inferior | Input ativo, indicador de aba ativa |

**Filosofia de Sombras**: Carbon é deliberadamente avesso a sombras. A IBM alcança profundidade primariamente através de camadas de cor de fundo — empilhando superfícies de cinzas progressivamente mais escuros em vez de adicionar box-shadows. Isso cria uma estética plana inspirada na impressão gráfica, onde a hierarquia é comunicada pelo valor da cor, não por luz simulada. Sombras são reservadas exclusivamente para elementos flutuantes (dropdowns, tooltips, modais) onde o elemento genuinamente sobrepõe o conteúdo. Essa contenção dá ao raro uso de sombra um impacto significativo — quando algo flutua no Carbon, tem importância.

## 7. O que Fazer e Não Fazer

### Fazer
- Use IBM Plex Sans no peso 300 para tamanhos de exibição (42px+) — a leveza é intencional
- Aplique letter-spacing de 0.16px no texto de corpo em 14px e 0.32px em legendas de 12px
- Use border-radius de 0px em botões, inputs, cartões e tiles — retângulos são o sistema
- Referencie os nomes de token `--cds-*` ao implementar (ex.: `--cds-button-primary`, `--cds-text-primary`)
- Use camadas de cor de fundo (branco → gray 10 → gray 20) para profundidade em vez de sombras
- Use borda inferior (não caixa completa) para indicadores de campo de input
- Mantenha a altura padrão de 48px nos botões e padding assimétrico para acomodar ícones
- Aplique Blue 60 (`#0f62fe`) como único destaque — um azul para governar todos

### Não Fazer
- Não arredonde os cantos dos botões — radius de 0px é a identidade Carbon
- Não use sombras em cartões ou tiles — a planura é o ponto central
- Não introduza cores de destaque adicionais — o sistema da IBM é monocromático + azul
- Não use peso 700 (Bold) — a escala para em 600 (Semibold)
- Não adicione letter-spacing a texto em tamanhos de exibição — o rastreamento é apenas para 14px e abaixo
- Não envolva inputs com bordas completas — os inputs Carbon usam apenas borda inferior
- Não use fundos gradientes — as superfícies da IBM são cores sólidas e planas
- Não se desvie da grade de espaçamento de 8px — cada valor deve ser divisível por 8 (com 2px e 4px para micro-ajustes)

## 8. Comportamento Responsivo

### Breakpoints
| Nome | Largura | Principais Alterações |
|------|---------|----------------------|
| Small (sm) | 320px | Coluna única, nav hambúrguer, margens de 16px |
| Medium (md) | 672px | Grades de 2 colunas começam, conteúdo expandido |
| Large (lg) | 1056px | Navegação completa visível, grades de 3-4 colunas |
| X-Large (xlg) | 1312px | Densidade máxima de conteúdo, layouts amplos |
| Max | 1584px | Largura máxima de conteúdo, centralizado com margens |

### Áreas de Toque
- Altura do botão: 48px padrão, mínimo 40px (compacto)
- Links de navegação: altura de linha de 48px para toque
- Altura do input: 40px padrão, 48px grande
- Botões de ícone: área de toque quadrada de 48px
- Itens do menu mobile: linhas de 48px em largura total

### Estratégia de Colapso
- Hero: exibição de 60px → 42px → título de 32px conforme o viewport diminui
- Navegação: masthead horizontal completo → hambúrguer com painel deslizante
- Grade: 4 colunas → 2 colunas → coluna única
- Tiles/cartões: grade horizontal → pilha vertical
- Imagens: manter proporção, max-width 100%
- Rodapé: grupos de links multicoluna → coluna única empilhada
- Padding de seção: 48px → 32px → 16px

### Comportamento de Imagens
- Imagens responsivas com `max-width: 100%`
- Ilustrações de produto escalam proporcionalmente
- Imagens hero podem passar de lado a lado para empilhadas abaixo
- Visualizações de dados mantêm proporção com rolagem horizontal no mobile

## 9. Guia de Prompt para Agentes

### Referência Rápida de Cores
- CTA principal: IBM Blue 60 (`#0f62fe`)
- Fundo: Branco (`#ffffff`)
- Texto de título: Gray 100 (`#161616`)
- Texto do corpo: Gray 100 (`#161616`)
- Texto secundário: Gray 70 (`#525252`)
- Superfície/Cartão: Gray 10 (`#f4f4f4`)
- Borda: Gray 30 (`#c6c6c6`)
- Link: Blue 60 (`#0f62fe`)
- Hover de link: Blue 70 (`#0043ce`)
- Anel de foco: Blue 60 (`#0f62fe`)
- Erro: Red 60 (`#da1e28`)
- Sucesso: Green 50 (`#24a148`)

### Exemplos de Prompts de Componentes
- "Crie uma seção hero em fundo branco. Título em 60px IBM Plex Sans peso 300, line-height 1.17, cor #161616. Subtítulo em 16px peso 400, line-height 1.50, cor #525252, max-width 640px. Botão CTA azul (fundo #0f62fe, texto #ffffff, border-radius 0px, altura 48px, padding 14px 63px 14px 15px)."
- "Projete um tile de cartão: fundo #f4f4f4, border-radius 0px, padding 16px. Título em 20px IBM Plex Sans peso 600, line-height 1.40, cor #161616. Corpo em 14px peso 400, letter-spacing 0.16px, line-height 1.29, cor #525252. Hover: fundo muda para #e8e8e8."
- "Construa um campo de formulário: fundo #f4f4f4, border-radius 0px, altura 40px, padding horizontal 16px. Rótulo acima em 12px peso 400, letter-spacing 0.32px, cor #525252. Borda inferior: 2px solid transparent padrão, 2px solid #0f62fe no foco. Placeholder: #6f6f6f."
- "Crie uma barra de navegação escura: fundo #161616, altura 48px. Logo IBM branco alinhado à esquerda. Links em 14px IBM Plex Sans peso 400, cor #c6c6c6. Hover: texto #ffffff. Ativo: #ffffff com borda inferior de 2px."
- "Construa um componente de tag: fundo Blue 10 (#edf5ff), texto Blue 60 (#0f62fe), padding 4px 8px, border-radius 24px, 12px IBM Plex Sans peso 400."

### Guia de Iteração
1. Sempre use border-radius de 0px em botões, inputs e cartões — isso é inegociável no Carbon
2. Letter-spacing apenas em tamanhos pequenos: 0.16px em 14px, 0.32px em 12px — nunca em texto de exibição
3. Três pesos: 300 (exibição), 400 (corpo), 600 (ênfase) — sem negrito
4. Blue 60 é a única cor de destaque — não introduza matizes de destaque secundários
5. A profundidade vem de camadas de cor de fundo (branco → `#f4f4f4` → `#e0e0e0`), não de sombras
6. Inputs têm apenas borda inferior, nunca totalmente encaixotados
7. Use o prefixo `--cds-` na nomenclatura de tokens para manter compatibilidade com Carbon
8. 48px é a altura universal para elementos interativos
