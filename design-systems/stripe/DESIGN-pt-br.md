# Design System Inspirado no Stripe

> Category: Fintech & Cripto
> Infraestrutura de pagamentos. Gradientes roxos característicos, elegância com peso 300.

## 1. Tema Visual & Atmosfera

O site do Stripe é o padrão ouro do design fintech -- um sistema que consegue parecer simultaneamente técnico e luxuoso, preciso e acolhedor. A página abre em uma tela branca limpa (`#ffffff`) com títulos em azul-marinho profundo (`#061b31`) e um roxo característico (`#533afd`) que funciona tanto como âncora da marca quanto como destaque interativo. Esse não é o roxo frio e clínico do software corporativo; é um violeta rico e saturado que transmite confiança e sofisticação. A impressão geral é a de uma instituição financeira redesenhada por uma tipografia de classe mundial.

A fonte variável personalizada `sohne-var` é o elemento definidor da identidade visual do Stripe. Cada elemento de texto habilita o conjunto estilístico OpenType `"ss01"`, que modifica as formas dos caracteres para uma sensação distintamente geométrica e moderna. Em tamanhos de exibição (48px–56px), a sohne-var usa peso 300 -- um peso extraordinariamente leve para títulos que cria uma autoridade etérea, quase sussurrada. Isso é o oposto da convenção do "título em negrito no hero"; os títulos do Stripe parecem não precisar gritar. O espaçamento negativo entre letras (-1,4px em 56px, -0,96px em 48px) aperta o texto em blocos densos e engenheirados. Em tamanhos menores, o sistema também usa peso 300 com tracking proporcionalmente reduzido, e numerais tabulares via `"tnum"` para exibição de dados financeiros.

O que realmente distingue o Stripe é seu sistema de sombras. Em vez da abordagem plana ou de camada única da maioria dos sites, o Stripe usa sombras de múltiplas camadas com tons azulados: a característica `rgba(50,50,93,0.25)` combinada com `rgba(0,0,0,0.1)` cria sombras com uma profundidade fria, quase atmosférica -- como se os elementos estivessem flutuando em um céu ao entardecer. O subtom azul-acinzentado da cor primária de sombra (50,50,93) se conecta diretamente à paleta da marca em azul-marinho e roxo, fazendo com que até mesmo a elevação pareça parte da marca.

**Características Principais:**
- sohne-var com `"ss01"` OpenType em todos os textos -- um conjunto estilístico personalizado que define as formas das letras da marca
- Peso 300 como o peso característico dos títulos -- leve, confiante, anticonvencional
- Espaçamento negativo entre letras em tamanhos de exibição (-1,4px em 56px, relaxamento progressivo para baixo)
- Sombras de múltiplas camadas com tom azulado usando `rgba(50,50,93,0.25)` -- elevação que parece colorida pela marca
- Títulos em azul-marinho profundo (`#061b31`) em vez de preto -- acolhedor, sofisticado, de nível financeiro
- Border-radius conservador (4px–8px) -- nada em formato de pílula, nada agressivo
- Destaques rubi (`#ea2261`) e magenta (`#f96bee`) para gradientes e elementos decorativos
- `SourceCodePro` como fonte monoespaçada complementar para código e rótulos técnicos

## 2. Paleta de Cores & Papéis

### Primária
- **Roxo Stripe** (`#533afd`): Cor primária da marca, fundos de CTA, texto de link, destaques interativos. Um azul-violeta saturado que ancora todo o sistema.
- **Azul-Marinho Profundo** (`#061b31`): `--hds-color-heading-solid`. Cor primária de título. Não é preto, não é cinza -- um azul muito escuro que adiciona calor e profundidade ao texto.
- **Branco Puro** (`#ffffff`): Fundo da página, superfícies de cartão, texto de botão em fundos escuros.

### Marca & Escuro
- **Marca Escuro** (`#1c1e54`): `--hds-color-util-brand-900`. Índigo profundo para seções escuras, fundos de rodapé e momentos imersivos da marca.
- **Azul-Marinho Escuro** (`#0d253d`): `--hds-color-core-neutral-975`. O neutro mais escuro -- quase preto com subtom azul para profundidade máxima sem agressividade.

### Cores de Destaque
- **Rubi** (`#ea2261`): `--hds-color-accentColorMode-ruby-icon-solid`. Rosa-vermelho quente para ícones, alertas e elementos de destaque.
- **Magenta** (`#f96bee`): `--hds-color-accentColorMode-magenta-icon-gradientMiddle`. Rosa-roxo vibrante para gradientes e destaques decorativos.
- **Magenta Claro** (`#ffd7ef`): `--hds-color-util-accent-magenta-100`. Superfície tingida para cartões e emblemas com tema magenta.

### Interativo
- **Roxo Primário** (`#533afd`): Cor primária de link, estados ativos, elementos selecionados.
- **Roxo Hover** (`#4434d4`): Roxo mais escuro para estados de hover em elementos primários.
- **Roxo Profundo** (`#2e2b8c`): `--hds-color-button-ui-iconHover`. Roxo escuro para estados de hover em ícones.
- **Roxo Claro** (`#b9b9f9`): `--hds-color-action-bg-subduedHover`. Lavanda suave para fundos de hover discretos.
- **Roxo Médio** (`#665efd`): `--hds-color-input-selector-text-range`. Cor de seletor de intervalo e destaque de input.

### Escala Neutra
- **Título** (`#061b31`): Títulos primários, texto de navegação, rótulos em destaque.
- **Rótulo** (`#273951`): `--hds-color-input-text-label`. Rótulos de formulário, títulos secundários.
- **Corpo** (`#64748d`): Texto secundário, descrições, legendas.
- **Verde de Sucesso** (`#15be53`): Emblemas de status, indicadores de sucesso (com alfa 0,2–0,4 para fundos/bordas).
- **Texto de Sucesso** (`#108c3d`): Cor do texto do emblema de sucesso.
- **Limão** (`#9b6829`): `--hds-color-core-lemon-500`. Destaque de aviso e realce.

### Superfície & Bordas
- **Borda Padrão** (`#e5edf5`): Cor de borda padrão para cartões, divisórias e contêineres.
- **Borda Roxa** (`#b9b9f9`): Bordas de estado ativo/selecionado em botões e inputs.
- **Borda Roxa Suave** (`#d6d9fc`): Bordas sutis com tom roxo para elementos secundários.
- **Borda Magenta** (`#ffd7ef`): Bordas com tom rosado para elementos com tema magenta.
- **Borda Tracejada** (`#362baa`): Bordas tracejadas para zonas de soltar e elementos de espaço reservado.

### Cores de Sombra
- **Sombra Azul** (`rgba(50,50,93,0.25)`): A característica -- cor primária de sombra com tom azulado.
- **Sombra Azul Escuro** (`rgba(3,3,39,0.25)`): Sombra azul mais profunda para elementos elevados.
- **Sombra Preta** (`rgba(0,0,0,0.1)`): Camada secundária de sombra para reforço de profundidade.
- **Sombra Ambiente** (`rgba(23,23,23,0.08)`): Sombra ambiente suave para elevação sutil.
- **Sombra Leve** (`rgba(23,23,23,0.06)`): Sombra ambiente mínima para leve flutuação.

## 3. Regras Tipográficas

### Família de Fontes
- **Primária**: `sohne-var`, com fallback: `SF Pro Display`
- **Monoespaçada**: `SourceCodePro`, com fallback: `SFMono-Regular`
- **Recursos OpenType**: `"ss01"` habilitado globalmente em todo texto sohne-var; `"tnum"` para números tabulares em dados financeiros e legendas.

### Hierarquia

| Papel | Fonte | Tamanho | Peso | Altura de Linha | Espaçamento de Letra | Recursos | Notas |
|-------|-------|---------|------|-----------------|----------------------|----------|-------|
| Display Hero | sohne-var | 56px (3.50rem) | 300 | 1.03 (estreito) | -1.4px | ss01 | Tamanho máximo, autoridade sussurrada |
| Display Grande | sohne-var | 48px (3.00rem) | 300 | 1.15 (estreito) | -0.96px | ss01 | Títulos hero secundários |
| Título de Seção | sohne-var | 32px (2.00rem) | 300 | 1.10 (estreito) | -0.64px | ss01 | Títulos de seção de funcionalidades |
| Subtítulo Grande | sohne-var | 26px (1.63rem) | 300 | 1.12 (estreito) | -0.26px | ss01 | Títulos de cartão, subseções |
| Subtítulo | sohne-var | 22px (1.38rem) | 300 | 1.10 (estreito) | -0.22px | ss01 | Títulos de seção menores |
| Corpo Grande | sohne-var | 18px (1.13rem) | 300 | 1.40 | normal | ss01 | Descrições de funcionalidades, texto de introdução |
| Corpo | sohne-var | 16px (1.00rem) | 300-400 | 1.40 | normal | ss01 | Texto de leitura padrão |
| Botão | sohne-var | 16px (1.00rem) | 400 | 1.00 (estreito) | normal | ss01 | Texto de botão primário |
| Botão Pequeno | sohne-var | 14px (0.88rem) | 400 | 1.00 (estreito) | normal | ss01 | Botões secundários/compactos |
| Link | sohne-var | 14px (0.88rem) | 400 | 1.00 (estreito) | normal | ss01 | Links de navegação |
| Legenda | sohne-var | 13px (0.81rem) | 400 | normal | normal | ss01 | Rótulos pequenos, metadados |
| Legenda Pequena | sohne-var | 12px (0.75rem) | 300-400 | 1.33-1.45 | normal | ss01 | Letras miúdas, timestamps |
| Legenda Tabular | sohne-var | 12px (0.75rem) | 300-400 | 1.33 | -0.36px | tnum | Dados financeiros, números |
| Micro | sohne-var | 10px (0.63rem) | 300 | 1.15 (estreito) | 0.1px | ss01 | Rótulos minúsculos, marcadores de eixo |
| Micro Tabular | sohne-var | 10px (0.63rem) | 300 | 1.15 (estreito) | -0.3px | tnum | Dados de gráficos, números pequenos |
| Nano | sohne-var | 8px (0.50rem) | 300 | 1.07 (estreito) | normal | ss01 | Rótulos menores possíveis |
| Código Corpo | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (espaçado) | normal | -- | Blocos de código, sintaxe |
| Código Negrito | SourceCodePro | 12px (0.75rem) | 700 | 2.00 (espaçado) | normal | -- | Código em negrito, palavras-chave |
| Rótulo de Código | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (espaçado) | normal | maiúsculas | Rótulos técnicos |
| Micro de Código | SourceCodePro | 9px (0.56rem) | 500 | 1.00 (estreito) | normal | ss01 | Anotações de código minúsculas |

### Princípios
- **Peso leve como assinatura**: O peso 300 em tamanhos de exibição é a escolha tipográfica mais distintiva do Stripe. Onde outros usam 600–700 para chamar atenção, o Stripe usa a leveza como luxo -- o texto é tão confiante que não precisa de peso para ser autoritativo.
- **ss01 em todo lugar**: O conjunto estilístico `"ss01"` é inegociável. Ele modifica glifos específicos (provavelmente formas alternativas de `a`, `g`, `l`) para criar uma sensação mais geométrica e contemporânea em todo texto sohne-var.
- **Dois modos OpenType**: `"ss01"` para texto de exibição/corpo, `"tnum"` para numerais tabulares em dados financeiros. Esses nunca se sobrepõem -- um número em um parágrafo usa ss01, um número em uma tabela de dados usa tnum.
- **Tracking progressivo**: O espaçamento entre letras se aperta proporcionalmente ao tamanho: -1,4px em 56px, -0,96px em 48px, -0,64px em 32px, -0,26px em 26px, normal em 16px e abaixo.
- **Simplicidade de dois pesos**: Principalmente 300 (corpo e títulos) e 400 (UI/botões). Sem negrito (700) na fonte primária -- o SourceCodePro usa 500/700 para contraste de código.

## 4. Estilizações de Componentes

### Botões

**Roxo Primário**
- Fundo: `#533afd`
- Texto: `#ffffff`
- Padding: 8px 16px
- Radius: 4px
- Fonte: 16px sohne-var peso 400, `"ss01"`
- Hover: fundo `#4434d4`
- Uso: CTA primário ("Start now", "Contact sales")

**Ghost / Delineado**
- Fundo: transparente
- Texto: `#533afd`
- Padding: 8px 16px
- Radius: 4px
- Borda: `1px solid #b9b9f9`
- Fonte: 16px sohne-var peso 400, `"ss01"`
- Hover: fundo muda para `rgba(83,58,253,0.05)`
- Uso: Ações secundárias

**Info Transparente**
- Fundo: transparente
- Texto: `#2874ad`
- Padding: 8px 16px
- Radius: 4px
- Borda: `1px solid rgba(43,145,223,0.2)`
- Uso: Ações terciárias/de nível informativo

**Ghost Neutro**
- Fundo: transparente (`rgba(255,255,255,0)`)
- Texto: `rgba(16,16,16,0.3)`
- Padding: 8px 16px
- Radius: 4px
- Contorno: `1px solid rgb(212,222,233)`
- Uso: Ações desativadas ou silenciadas

### Cartões & Contêineres
- Fundo: `#ffffff`
- Borda: `1px solid #e5edf5` (padrão) ou `1px solid #061b31` (destaque escuro)
- Radius: 4px (estreito), 5px (padrão), 6px (confortável), 8px (destaque)
- Sombra (padrão): `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px`
- Sombra (ambiente): `rgba(23,23,23,0.08) 0px 15px 35px 0px`
- Hover: sombra se intensifica, geralmente adicionando a camada com tom azulado

### Emblemas / Tags / Pílulas
**Pílula Neutra**
- Fundo: `#ffffff`
- Texto: `#000000`
- Padding: 0px 6px
- Radius: 4px
- Borda: `1px solid #f6f9fc`
- Fonte: 11px peso 400

**Emblema de Sucesso**
- Fundo: `rgba(21,190,83,0.2)`
- Texto: `#108c3d`
- Padding: 1px 6px
- Radius: 4px
- Borda: `1px solid rgba(21,190,83,0.4)`
- Fonte: 10px peso 300

### Inputs & Formulários
- Borda: `1px solid #e5edf5`
- Radius: 4px
- Foco: `1px solid #533afd` ou anel roxo
- Rótulo: `#273951`, 14px sohne-var
- Texto: `#061b31`
- Placeholder: `#64748d`

### Navegação
- Navegação horizontal limpa sobre fundo branco, fixa com desfoque de fundo
- Logotipo da marca alinhado à esquerda
- Links: sohne-var 14px peso 400, texto `#061b31` com `"ss01"`
- Radius: 6px no contêiner de navegação
- CTA: botão roxo alinhado à direita ("Sign in", "Start now")
- Mobile: alternância com hambúrguer com radius de 6px

### Elementos Decorativos
**Bordas Tracejadas**
- `1px dashed #362baa` (roxo) para zonas de espaço reservado/soltar
- `1px dashed #ffd7ef` (magenta) para bordas decorativas com tema magenta

**Destaques de Gradiente**
- Gradientes de rubi a magenta (`#ea2261` a `#f96bee`) para decorações de hero
- Seções escuras da marca usam fundos `#1c1e54` com texto branco

## 5. Princípios de Layout

### Sistema de Espaçamento
- Unidade base: 8px
- Escala: 1px, 2px, 4px, 6px, 8px, 10px, 11px, 12px, 14px, 16px, 18px, 20px
- Notável: A escala é densa na parte pequena (a cada 2px de 4–12), refletindo a UI orientada à precisão do Stripe para dados financeiros

### Grade & Contêiner
- Largura máxima do conteúdo: aproximadamente 1080px
- Hero: coluna única centralizada com padding generoso, títulos leves
- Seções de funcionalidades: grades de 2–3 colunas para cartões de funcionalidades
- Seções escuras de largura total com fundo `#1c1e54` para imersão na marca
- Pré-visualizações de código/painel como cartões contidos com sombras com tom azulado

### Filosofia de Espaço em Branco
- **Espaçamento de precisão**: Ao contrário do vasto vazio dos sistemas minimalistas, o Stripe usa espaço em branco medido e proposital. Cada espaço é uma escolha tipográfica deliberada.
- **Dados densos, cromo generoso**: As exibições de dados financeiros (tabelas, gráficos) são compactamente organizadas, mas o cromo da UI ao redor delas é generosamente espaçado. Isso cria uma sensação de densidade controlada -- como uma planilha bem organizada em uma moldura bonita.
- **Ritmo de seção**: Seções brancas se alternam com seções escuras da marca (`#1c1e54`), criando uma cadência dramática de claro/escuro que evita a monotonia sem introduzir cores arbitrárias.

### Escala de Border-Radius
- Micro (1px): Elementos de granulação fina, arredondamento sutil
- Padrão (4px): Botões, inputs, emblemas, cartões -- o que mais se usa
- Confortável (5px): Contêineres de cartão padrão
- Relaxado (6px): Navegação, elementos interativos maiores
- Grande (8px): Cartões em destaque, elementos de hero
- Composto: `0px 0px 6px 6px` para contêineres com arredondamento inferior (painéis de abas, rodapés de dropdown)

## 6. Profundidade & Elevação

| Nível | Tratamento | Uso |
|-------|------------|-----|
| Plano (Nível 0) | Sem sombra | Fundo da página, texto inline |
| Ambiente (Nível 1) | `rgba(23,23,23,0.06) 0px 3px 6px` | Leve elevação de cartão, dicas de hover |
| Padrão (Nível 2) | `rgba(23,23,23,0.08) 0px 15px 35px` | Cartões padrão, painéis de conteúdo |
| Elevado (Nível 3) | `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px` | Cartões em destaque, dropdowns, popovers |
| Profundo (Nível 4) | `rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px` | Modais, painéis flutuantes |
| Anel (Acessibilidade) | contorno `2px solid #533afd` | Anel de foco por teclado |

**Filosofia de Sombra**: O sistema de sombras do Stripe é construído sobre o princípio da profundidade cromática. Onde a maioria dos sistemas de design usa sombras cinza neutro ou preto, a cor primária de sombra do Stripe (`rgba(50,50,93,0.25)`) é um azul-acinzentado profundo que ecoa a paleta azul-marinho da marca. Isso cria sombras que não apenas adicionam profundidade -- elas adicionam atmosfera da marca. A abordagem de múltiplas camadas combina essa sombra com tom azulado com uma camada secundária em preto puro (`rgba(0,0,0,0.1)`) em um deslocamento diferente, criando uma profundidade semelhante a um paralaxe, onde a sombra da marca fica mais longe do elemento e a sombra neutra fica mais próxima. Os valores negativos de espalhamento (-30px, -18px) garantem que as sombras não se estendam além do contorno horizontal do elemento, mantendo a elevação vertical e controlada.

### Profundidade Decorativa
- Seções escuras da marca (`#1c1e54`) criam profundidade imersiva através do contraste de cor de fundo
- Sobreposições de gradiente com transições de rubi a magenta para decorações de hero
- Cor de sombra `rgba(0,55,112,0.08)` (`--hds-color-shadow-sm-top`) para sombras na borda superior de elementos fixos

## 7. O Que Fazer e O Que Evitar

### O Que Fazer
- Usar sohne-var com `"ss01"` em cada elemento de texto -- o conjunto estilístico É a marca
- Usar peso 300 para todos os títulos e texto de corpo -- a leveza é a assinatura
- Aplicar sombras com tom azulado (`rgba(50,50,93,0.25)`) para todos os elementos elevados
- Usar `#061b31` (azul-marinho profundo) para títulos em vez de `#000000` -- o calor importa
- Manter o border-radius entre 4px–8px -- o arredondamento conservador é intencional
- Usar `"tnum"` para qualquer exibição de número tabular/financeiro
- Camadas de sombra: azulado distante + neutro próximo para paralaxe de profundidade
- Usar o roxo `#533afd` como a cor interativa/CTA primária

### O Que Evitar
- Não usar peso 600–700 para títulos sohne-var -- o peso 300 é a voz da marca
- Não usar border-radius grande (12px+, formatos de pílula) em cartões ou botões -- o Stripe é conservador
- Não usar sombras cinza neutro -- sempre tingir com azul (`rgba(50,50,93,...)`)
- Não omitir `"ss01"` em nenhum texto sohne-var -- os glifos alternativos definem a personalidade
- Não usar preto puro (`#000000`) para títulos -- sempre usar `#061b31` azul-marinho profundo
- Não usar cores de destaque quentes (laranja, amarelo) para elementos interativos -- o roxo é o primário
- Não aplicar espaçamento positivo entre letras em tamanhos de exibição -- o Stripe usa tracking estreito
- Não usar os destaques magenta/rubi em botões ou links -- eles são apenas decorativos/gradientes

## 8. Comportamento Responsivo

### Breakpoints
| Nome | Largura | Mudanças Principais |
|------|---------|---------------------|
| Mobile | <640px | Coluna única, tamanhos de título reduzidos, cartões empilhados |
| Tablet | 640-1024px | Grades de 2 colunas, padding moderado |
| Desktop | 1024-1280px | Layout completo, grades de 3 colunas para funcionalidades |
| Desktop Grande | >1280px | Conteúdo centralizado com margens generosas |

### Alvos de Toque
- Botões usam padding confortável (8px–16px vertical)
- Links de navegação em 14px com espaçamento adequado
- Emblemas têm padding horizontal mínimo de 6px para alvos de toque
- Alternância de navegação mobile com botão de radius 6px

### Estratégia de Colapso
- Hero: display de 56px -> 32px no mobile, peso 300 mantido
- Navegação: links horizontais + CTAs -> alternância com hambúrguer
- Cartões de funcionalidades: 3 colunas -> 2 colunas -> coluna única empilhada
- Seções escuras da marca: manter tratamento de largura total, reduzir padding interno
- Tabelas de dados financeiros: rolagem horizontal no mobile
- Espaçamento de seção: 64px+ -> 40px no mobile
- A escala tipográfica se comprime: tamanhos de hero de 56px -> 48px -> 32px entre os breakpoints

### Comportamento de Imagens
- Capturas de tela de painel/produto mantêm sombra com tom azulado em todos os tamanhos
- Decorações de gradiente do hero se simplificam no mobile
- Blocos de código mantêm o tratamento `SourceCodePro`, podem rolar horizontalmente
- Imagens de cartão mantêm border-radius consistente de 4px–6px

## 9. Guia de Prompts para Agente

### Referência Rápida de Cores
- CTA primário: Roxo Stripe (`#533afd`)
- Hover do CTA: Roxo Escuro (`#4434d4`)
- Fundo: Branco Puro (`#ffffff`)
- Texto de título: Azul-Marinho Profundo (`#061b31`)
- Texto de corpo: Ardósia (`#64748d`)
- Texto de rótulo: Ardósia Escura (`#273951`)
- Borda: Azul Suave (`#e5edf5`)
- Link: Roxo Stripe (`#533afd`)
- Seção escura: Marca Escuro (`#1c1e54`)
- Sucesso: Verde (`#15be53`)
- Decorativo de destaque: Rubi (`#ea2261`), Magenta (`#f96bee`)

### Exemplos de Prompts de Componentes
- "Crie uma seção hero em fundo branco. Título em 48px sohne-var peso 300, line-height 1.15, letter-spacing -0.96px, cor #061b31, font-feature-settings 'ss01'. Subtítulo em 18px peso 300, line-height 1.40, cor #64748d. Botão CTA roxo (#533afd, radius 4px, padding 8px 16px, texto branco) e botão ghost (transparente, 1px solid #b9b9f9, texto #533afd, radius 4px)."
- "Projete um cartão: fundo branco, borda 1px solid #e5edf5, radius 6px. Sombra: rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px. Título em 22px sohne-var peso 300, letter-spacing -0.22px, cor #061b31, 'ss01'. Corpo em 16px peso 300, #64748d."
- "Construa um emblema de sucesso: fundo rgba(21,190,83,0.2), texto #108c3d, radius 4px, padding 1px 6px, 10px sohne-var peso 300, borda 1px solid rgba(21,190,83,0.4)."
- "Crie navegação: cabeçalho fixo branco com backdrop-filter blur(12px). sohne-var 14px peso 400 para links, texto #061b31, 'ss01'. CTA roxo 'Start now' alinhado à direita (fundo #533afd, texto branco, radius 4px). Contêiner de nav com radius 6px."
- "Projete uma seção escura da marca: fundo #1c1e54, texto branco. Título 32px sohne-var peso 300, letter-spacing -0.64px, 'ss01'. Corpo 16px peso 300, rgba(255,255,255,0.7). Cartões internos usam borda rgba(255,255,255,0.1) com radius 6px."

### Guia de Iteração
1. Sempre habilitar `font-feature-settings: "ss01"` em texto sohne-var -- este é o DNA tipográfico da marca
2. Peso 300 é o padrão; usar 400 apenas para botões/links/navegação
3. Fórmula de sombra: `rgba(50,50,93,0.25) 0px Y1 B1 -S1, rgba(0,0,0,0.1) 0px Y2 B2 -S2` onde Y1/B1 são maiores (sombra distante) e Y2/B2 são menores (sombra próxima)
4. Cor de título é `#061b31` (azul-marinho profundo), corpo é `#64748d` (ardósia), rótulos são `#273951` (ardósia escura)
5. O border-radius permanece na faixa de 4px–8px -- nunca usar formatos de pílula ou arredondamento grande
6. Usar `"tnum"` para quaisquer números em tabelas, gráficos ou exibições financeiras
7. Seções escuras usam `#1c1e54` -- não preto, não cinza, mas um índigo profundo da marca
8. SourceCodePro para código em 12px/500 com line-height 2.00 (muito generoso para legibilidade)
