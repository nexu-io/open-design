# Design System Inspirado na Starbucks

> Category: E-Commerce & Varejo
> Marca global de varejo de café. Sistema verde de quatro níveis, tela creme quente, botões em pílula completa.

## 1. Tema Visual & Atmosfera

O design system da Starbucks é uma **flagship de varejo calorosa e confiante** que carrega o verde do avental da loja em cada superfície. A tela alterna entre um creme neutro-quente (`#f2f0eb`) e um off-white cerâmico (`#edebe9`) — cores que remetem aos materiais reais das lojas: os guardanapos de papel, as paredes do café, os acabamentos em madeira — enquanto o **Starbucks Green** (`#006241`) ancora o momento de marca em faixas hero, CTAs e na experiência de Rewards. Os verdes vêm em quatro tonalidades calibradas (Starbucks, Accent, House, Uplift), cada uma mapeada a um papel de superfície específico, e o dourado (`#cba258`) aparece apenas em momentos de cerimônia de status no Rewards — não como um destaque geral.

A tipografia carrega a maior parte da voz da marca. A typeface proprietária **SoDoSans** (exclusiva da Starbucks) está em quase todas as superfícies com um espaçamento de letras de `-0.16px` — ela transmite confiança e simpatia, não a severidade de uma revista de moda. O que é incomum: a página de Rewards muda para uma serifa quente (`"Lander Tall", "Iowan Old Style", Georgia`) em momentos específicos de headline, evocando sutilmente o charme nostálgico de um quadro de café. Já as páginas de Carreiras usam uma fonte manuscrita (`"Kalam", "Comic Sans MS", cursive`) para os toques pessoais de nome no copo. Três typefaces, três contextos — o sistema é disciplinado sobre quando cada uma aparece.

As superfícies respiram por meio de geometria arredondada. Todo botão é uma pílula completa de 50px. Cards têm bordas arredondadas de 12px. O CTA flutuante "Frap" — um botão circular de pedido de 56px em Green Accent (`#00754A`) — é o movimento de profundidade mais característico do produto: ele flutua no canto inferior direito com uma pilha de sombras em camadas (`0 0 6px rgba(0,0,0,0.24)` base + `0 8px 12px rgba(0,0,0,0.14)` ambient) e comprime via `scale(0.95)` ao ser pressionado. As elevações são, de resto, contidas — sombras de card ficam em um alpha sussurrado de `0.14/0.24`, a navegação global recebe uma suave pilha de três camadas de sombra. O sistema inteiro parece uma sinalização limpa de café: legível, calorosa e sem gritar.

**Características Principais:**
- Sistema de marca verde de quatro níveis (Starbucks / Accent / House / Uplift), cada um mapeado a um papel de superfície distinto — não um único "verde de marca"
- Dourado reservado apenas para momentos de cerimônia de status no Rewards; nunca um destaque de uso geral
- Tela neutro-quente (`#f2f0eb` / `#edebe9`) em vez de branco frio — referencia os materiais do café
- Typeface proprietária personalizada (SoDoSans) com espaçamento de letras de `-0.16px` como voz universal
- Trocas de tipografia por contexto: serifa (Lander Tall) para Rewards, script (Kalam) para nomes em copos no Carreiras
- Botões em pílula completa (`50px` de raio) universal, `scale(0.95)` no pressionamento ativo como microinteração característica
- CTA circular flutuante "Frap" (`56px`, preenchimento em Green Accent, pilha de sombras em camadas) — o elemento de elevação característico do produto
- Superfícies de gift card projetadas como **produto físico fotografado** — cada card é uma fotografia ilustrada distinta, não um gráfico gerado
- Raio de card de 12px + sombras suaves como sussurro mantêm os cards de conteúdo planos com uma leve sugestão de elevação
- Escala de espaçamento baseada em rem ancorada em 1.6rem (~16px) = `--space-3`, chegando a 6.4rem (~64px)

**Ritmo de página por blocos de cor:** Hero creme → Seções de conteúdo branco → Faixa em verde-escuro (`#1E3932`) com texto branco → Zona utilitária creme → Rodapé em verde-escuro (`#1E3932`) com texto dourado/branco — um contraponto espresso-escuro ao redor do corpo brilhante.

## 2. Paleta de Cores & Papéis

**Páginas analisadas:** homepage, rewards, gift cards, detalhe de produto (Pink Energy Drink), nutrição do produto (Cold Brew).

### Primárias

- **Starbucks Green** (`#006241`): O verde histórico da marca. Usado em títulos h1, cabeçalhos de seção primários na página de Rewards e como principal sinal de marca onde uma única cor dominante é necessária.
- **Green Accent** (`#00754A`): Um verde ligeiramente mais brilhante e luminoso. A cor principal de CTA preenchida ("Explore our afternoon menu", "See the spring menu") e o preenchimento do botão circular flutuante Frap.
- **House Green** (`#1E3932`): O verde quase preto profundo da marca. Superfície do rodapé, fundos de faixas de destaque, superfícies escuras de status de reward e a faixa hero do título "Free coffee is just the beginning" na página de Rewards.
- **Green Uplift** (`#2b5148`): Um verde médio-escuro secundário usado com parcimônia em acentos decorativos e momentos de gradiente escuro.
- **Green Light** (`#d4e9e2`): Uma lavagem em verde-menta pálida usada para tints de estado de campo válido em formulários e superfícies utilitárias em verde claro.

### Secundárias & Destaque

- **Gold** (`#cba258`): Reservado quase exclusivamente para cerimônias de status no Rewards — chamadas de nível Gold, emblemas de parceria (SkyMiles, Bonvoy) e acentos de sensação premium. Nunca uma cor de marca de uso geral.
- **Gold Light** (`#dfc49d`): Dourado mais suave para lavagens de fundo em seções de nível gold.
- **Gold Lightest** (`#faf6ee`): Lavagem de superfície de página creme-dourada usada sob seções de parceria na página de Rewards — conecta o destaque dourado de volta ao sistema neutro-quente.

### Superfície & Fundo

- **White** (`#ffffff`): Superfície primária de card e modal. Também preenchimento de card em tiles de gift card.
- **Neutral Cool** (`#f9f9f9`): Superfície cinza-fria sutil usada em menus dropdown ("Account" dropdown), envoltórios de form-card e contêineres utilitários discretos.
- **Neutral Warm** (`#f2f0eb`): A **tela de página primária** em creme quente para zonas utilitárias do Rewards e faixas hero.
- **Ceramic** (`#edebe9`): Um creme ligeiramente mais quente/escuro para separadores de zona, lavagens suaves de seção de página e faixa de parceria do Rewards.
- **Black** (`#000000`): Tinta escura reservada para a faixa de CTA escura no topo da página ("Join now") e botões de sign-in no nav principal em alto contraste.

### Neutros & Texto

- **Text Black** (`rgba(0, 0, 0, 0.87)`): Cor primária de título e corpo em superfícies claras. Não é preto puro — um preto com 87% de opacidade que parece mais quente.
- **Text Black Soft** (`rgba(0, 0, 0, 0.58)`): Texto secundário/metadados em superfícies claras.
- **Text White** (`rgba(255, 255, 255, 1)`): Texto primário de título/corpo em superfícies verde-escuras.
- **Text White Soft** (`rgba(255, 255, 255, 0.70)`): Texto secundário em superfícies verde-escuras — descrições de links no rodapé, texto de legenda.
- **Rewards Green** (`#33433d`): Um verde-ardósia discreto dedicado usado apenas em blocos de texto na página de Rewards — uma cor de leitura ligeiramente mais "empoeirada" do que Text Black, que sinaliza "superfície de reward" sem usar o Starbucks Green completo.

### Semânticas & Destaque

- **Red** (`#c82014`): Estado de erro e destrutivo (formulário inválido, ações destrutivas).
- **Yellow** (`#fbbc05`): Estado de aviso, toque de marca legado.
- **Green Light** (`#d4e9e2` a 33% de opacidade = `hsl(160 32% 87% / 33%)`): Fundo de tint para campo válido em formulários.
- **Red Tint** (`hsl(4 82% 43% / 5%)`): Tint de campo inválido em formulários.

### Escadas Alpha Preto / Branco

Duas escalas translúcidas paralelas para uso em sobreposição e texto secundário:
- `rgba(0,0,0,0.06)` a `rgba(0,0,0,0.90)` em passos de 10% — para sobreposições escuras em superfícies claras
- `rgba(255,255,255,0.10)` a `rgba(255,255,255,0.90)` em passos de 10% — para sobreposições claras em superfícies escuras

### Sistema de Gradientes

Nenhum token de gradiente estrutural foi observado. A hierarquia de superfície é totalmente em bloco de cor sólida — o sistema se apoia em sua paleta de cinco níveis de superfícies creme/verde em vez de gradientes.

## 3. Regras Tipográficas

### Família de Fonte

- **Primária:** `SoDoSans, "Helvetica Neue", Helvetica, Arial, sans-serif` — a typeface corporativa proprietária da Starbucks, usada em quase todas as superfícies
- **Fallback de Carregamento:** `"Helvetica Neue", Helvetica, Arial, sans-serif` — o que os usuários veem antes da SoDoSans carregar
- **Serifa do Rewards:** `"Lander Tall", "Iowan Old Style", Georgia, serif` — usada em momentos específicos de headline na página de Rewards para uma sensação editorial calorosa
- **Script do Carreiras:** `"Kalam", "Comic Sans MS", cursive` — usada exclusivamente para toques decorativos de "nome no copo" nas páginas de Carreiras, referenciando os nomes escritos à mão nos copos da Starbucks

Nenhum conjunto estilístico OpenType ativado explicitamente em `:root`.

### Hierarquia

| Papel | Tamanho | Peso | Altura de Linha | Espaçamento de Letras | Notas |
|------|------|--------|-------------|----------------|-------|
| Display (text-10) | 5.0rem / 80px | 400–600 | 1.2 | -0.16px | Maior display hero/Rewards |
| Jumbo (text-9) | 3.6rem / 58px | 400–600 | 1.2 | -0.16px | Títulos hero secundários |
| Hero Large (text-8) | 2.8rem / 45px | 400–600 | 1.2–1.5 | -0.16px | Headlines de seção da landing |
| H1 | 24px | 600 | 36px | -0.16px | Título primário em Starbucks-Green |
| H2 | 24px | 400 | 36px | -0.16px | Título de seção em peso regular em Text Black |
| Body Large | 19px | 400–600 | 33.25px (~1.75) | -0.16px | Texto intro hero, corpo de faixa de destaque |
| Body (text-3) | 1.6rem / 16px | 400 | 1.5 (24px) | -0.01em | Corpo de texto padrão |
| Small (text-2) | 1.4rem / ~14px | 400–600 | 1.5 | -0.01em | Label de botão, metadados, labels de formulário |
| Micro (text-1) | 1.3rem / ~13px | 400 | 1.5 | -0.01em | Estado de float-label ativo, micro-texto de legenda |
| Label de Botão | 14–16px | 400–600 | 1.2 | -0.01em | Todos os labels de botões em pílula |

**Tokens de espaçamento de letras:**
- `letterSpacingNormal`: `-0.01em` (padrão — apertado, característico)
- `letterSpacingLoose`: `0.1em` (maiúsculas com ênfase)
- `letterSpacingLooser`: `0.15em` (labels em estilo maiúsculo, ênfase extrema)

**Tokens de altura de linha:**
- `lineHeightNormal`: `1.5` (corpo)
- `lineHeightCompact`: `1.2` (display/botões)

### Princípios

- **Tracking negativo apertado (`-0.01em`)** é aplicado de forma quase universal — o produto inteiro é lido de forma ligeiramente comprimida, o que confere à SoDoSans sua presença confiante sem parecer espremida.
- **Mudanças de peso carregam a hierarquia, não mudanças de tamanho.** H1 e H2 compartilham o mesmo tamanho de 24px/36px; apenas o peso (600 vs 400) e a cor (Starbucks-Green vs Text Black) os separam.
- **Tokens de tamanho usam rem, ancorados em `1rem = 10px`** neste site (via um truque de `font-size: 62.5%` no root). Então `1.6rem` = 16px, `2.4rem` = 24px, etc. A escala é semântica (textSize-1 a textSize-10), não valores arbitrários em pixels.
- **Trocas de typeface por contexto** — serifa no Rewards, script no Carreiras — são deliberadas e localizadas. Nunca as misture com a sans primária na mesma superfície.
- **O corpo de texto nunca vai para preto puro** — ele fica em `rgba(0,0,0,0.87)` para corresponder à temperatura da tela neutro-quente.

### Nota sobre Substitutos de Fonte

A SoDoSans é proprietária da Starbucks (licenciada pela House Industries, não disponível publicamente). Substitutos razoáveis de código aberto:
- **Inter** (Google Fonts) — proporções humanistas geométricas similares, ampla gama de pesos
- **Manrope** — ligeiramente mais arredondada, sensação confiante similar
- **Nunito Sans** — mais quente, boa substituta para uma marca "café"

Ao substituir, verifique se o tracking de `-0.01em` / `-0.16px` ainda funciona bem; algumas fontes de código aberto precisam de `-0.005em` em vez disso.

Lander Tall (a serifa do Rewards) é personalizada — substitutos de código aberto: **Iowan Old Style** (já no fallback), **Lora** ou **Source Serif Pro**. Kalam (script do Carreiras) está disponível diretamente no Google Fonts.

## 4. Estilos de Componentes

### Botões

**1. Preenchido Primário — "Explore our afternoon menu / Sign up for free"**
- Fundo: `#00754A` (Green Accent)
- Texto: `#ffffff`
- Borda: `1px solid #00754A`
- Raio: `50px` (pílula completa)
- Padding: `7px 16px`
- Fonte: SoDoSans, 16px, peso 600, letter-spacing `-0.01em`
- Estado ativo: `transform: scale(0.95)` via `--buttonActiveScale`
- Transição: `all 0.2s ease`

**2. Contornado Primário — "Give them a try / Start an order"**
- Fundo: transparente
- Texto: `#00754A` (Green Accent)
- Borda: `1px solid #00754A`
- Mesmo raio/padding/ativo/transição do Preenchido Primário

**3. Preenchido Preto — "Join now"**
- Fundo: `#000000`
- Texto: `#ffffff`
- Borda: `1px solid #000000`
- Raio: `50px`, Padding: `7px 16px`
- Fonte: 14px, peso 600
- Usado na faixa de adesão no topo da página e em momentos similares de conversão

**4. Contornado Escuro — "Sign in"**
- Fundo: transparente
- Texto: `rgba(0, 0, 0, 0.87)` (Text Black)
- Borda: `1px solid rgba(0, 0, 0, 0.87)`
- Raio: `50px`, Padding: `7px 16px`
- Fonte: 14px, peso 600

**5. Verde-sobre-Verde Invertido — "See the spring menu"**
- Fundo: `#ffffff`
- Texto: `#00754A`
- Borda: `1px solid #ffffff`
- Usado quando a superfície atrás do botão é a faixa verde-escura House Green — botão branco com texto verde em vez de uma pílula verde preenchida sobre fundo verde

**6. Contornado sobre Escuro — "Learn more / Order now"**
- Fundo: transparente
- Texto: `#ffffff`
- Borda: `1px solid #ffffff`
- Usado em faixas de destaque verde-escuras para ação secundária pareada com um CTA branco preenchido

**7. Concordar no Consentimento (variante verde-escuro)**
- Fundo: `rgb(0, 130, 72)` (uma variante específica de verde usada no módulo de consentimento de cookies)
- Texto: `#ffffff`
- Sem borda, raio `50px`, padding `7px 16px`, 14px / peso 400
- Ligeiramente mais brilhante que Green Accent — reservado para a ação Concordar no banner de consentimento

**8. Frap — Botão Circular Flutuante de Pedido**
- Fundo: `#00754A` (Green Accent)
- Ícone: `#ffffff`
- Tamanho: `5.6rem / 56px` (padrão), `4rem / 40px` (variante mini)
- Raio: `50%` (círculo completo)
- Posição fixa no canto inferior direito, offset de toque `-0.8rem` para maior conforto ao toque
- Pilha de sombras: base `0 0 6px rgba(0,0,0,0.24)` + ambient `0 8px 12px rgba(0,0,0,0.14)`
- Estado ativo: a sombra ambient desvanece para `0 8px 12px rgba(0,0,0,0)`
- Este é o elemento de elevação característico do produto — flutua sobre todas as superfícies roladas

**9. Aba de Feedback em Largura Total — "Provide feedback"**
- Fundo: `#00754A`
- Texto: `#ffffff`
- Raio: `12px 12px 0px 0px` (apenas parte superior arredondada)
- Padding: `8px 16px`
- Fonte: 14px, peso 400
- Posicionado fixo no canto inferior direito interno, encostado na borda do viewport

### Cards & Contêineres

**Card de Conteúdo (padrão)**
- Fundo: `#ffffff` (`--cardBackgroundColor`)
- Raio: `12px` (`--cardBorderRadius`)
- Sombra: `0px 0px .5px 0px rgba(0,0,0,0.14), 0px 1px 1px 0px rgba(0,0,0,0.24)` (`--cardBoxShadow`)
- Usado em: cards de destaque, tiles de itens de menu, painéis de status de reward

**Tile de Gift Card**
- Fundo: fotografia ilustrada preenche o card inteiro (sem fundo sólido)
- Raio: similar aos cards (`~12px`, cantos ligeiramente mais fechados)
- Sombra: mais leve que o card padrão — são tratados como cards físicos posicionados sobre a tela
- Rotulados por categoria acima da grade de cards (Spring, Thank You, Birthday, Celebration, Mother's Day, Appreciation, Encouragement, Milestones, Anytime)

**Cards de Status do Rewards (assinatura da página de Rewards)**
- Grade de três colunas: Bronze / Gold / Silver-ish — cada um um painel verde-escuro (`#1E3932`) com:
  - Anel de cabeçalho colorido com gradiente/cor
  - Emblema "Level" numerado
  - Título de status em SoDoSans grande peso 600
  - Lista de estrelas/benefícios em texto branco/branco-translúcido
  - Legenda de progressão "As you earn more stars…" na parte inferior

**Card de Parceria (Rewards)**
- Fundo: `#faf6ee` (Gold Lightest) superfície creme-quente
- Conteúdo: logos de parceiros ("SkyMiles", "Bonvoy") centralizados, com texto descritivo abaixo
- Raio e sombra seguem a especificação padrão de card

**Menu Dropdown (dropdown Account, nav superior)**
- Fundo: `#f9f9f9` (Neutral Cool)
- Itens de menu em `24px / peso 400` em Text Black
- Sem borda — apenas mudança de superfície de fundo contra o nav branco

**Modal**
- Padding: `2.4rem` (`--modalPadding`)
- Padding superior: `8.8rem` (`--modalTopPadding`) — deixa espaço para o botão de fechar / cabeçalho
- Padding vertical combinado: `11.2rem`
- Raio herda da especificação de card (`12px`)

### Inputs & Formulários

**Input com Label Flutuante**
- O label flutua acima da borda do input quando focado/preenchido
- Tamanho de fonte do label no desktop: `1.9rem` padrão, anima para `1.4rem` quando ativo
- Tamanho de fonte do label no mobile: `1.6rem` padrão, anima para `1.3rem` ativo
- Offset horizontal do label: `12px` da esquerda
- Translação do label ativo: para cima a `-12px` com translação Y de `-50%`
- Padding do campo: `12px`
- Padding horizontal do formulário: `1.6rem`
- Validação: campo válido recebe tint `rgba(green-light, 0.33)`; campo inválido recebe tint `rgba(red, 0.05)`
- Transição: `0.3s option-label-marker-expansion cubic-bezier(0.32, 2.32, 0.61, 0.27)` no input marcado

**Ícone de Opção (checkbox/radio)**
- Padding: `3px` interno
- Usa a animação cubic-bezier de input marcado acima (uma curva de overshoot ligeiramente "elástica" de 2.32)

### Navegação

**Nav Global (barra superior)**
- Posição fixa com alturas progressivas: `64px` xs → `72px` mobile → `83px` tablet → `99px` desktop
- Pilha de sombras: `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` — elevação suave de três camadas
- Esquerda: logotipo wordmark da Starbucks, com deslocamento de `99px` (md) / `131px` (lg) da borda esquerda
- Links primários inline em SoDoSans peso 400–600: Menu · Rewards · Gift Cards
- Direita: link Encontrar uma loja + Sign in (contornado) + Join now (preenchido preto)

**Sub-nav (segunda barra, ex.: Rewards interno)**
- Altura: `53px` (subnav global) / `48px` (subnav interno)
- Tipicamente grupo de abas horizontal abaixo do nav global

**Nav Mobile**
- Colapsa para um drawer de hamburguer abaixo do breakpoint tablet
- O botão flutuante Frap persiste no canto inferior direito independentemente do estado do nav

### Tratamento de Imagens

- **Fotografia hero**: Fotos de produtos (bebidas em copo transparente com fundos coloridos — coral, sálvia, âmbar quente) ocupam ~40vw de um layout hero dividido; o texto ocupa os outros 60vw (`--headerCrateProportion: 40vw` / `--contentCrateProportion: 60vw`)
- **Ilustrações de gift card**: Cada card é uma fotografia ilustrada distinta (sensação de pintura, aspecto desenhado à mão, paleta de cores quente). Nunca gráficos genéricos gerados.
- **Imagens de cerimônia do Rewards**: Fotografias de telas do Starbucks Rewards App seguradas à mão, composições anguladas — fotografia de produto em contexto.
- **Miniaturas de menu**: Fotografia de produto quadrada ou 4:3 com fundos brancos/creme limpos, leve sombra suave ao redor do copo.
- **Fade-in de imagem**: Transição `opacity 0.3s ease-in` no carregamento da imagem (`--imageFadeTransition`).

### Faixa de Destaque (faixa hero em verde-escuro)

Faixa `#1E3932` (House Green) de largura total com:
- Esquerda: título branco + subtítulo + linha de CTA
- Direita: fotografia de produto ou ilustração
- Proporção de divisão ~40/60 ou 50/50 dependendo da seção
- Texto branco em toda a extensão com `rgba(255,255,255,0.70)` para texto secundário
- CTAs seguem o pareamento Verde-sobre-Verde Invertido (branco preenchido) + Contornado sobre Escuro (contorno branco)

### Expansor / Acordeão

- Duração: `300ms` (`--expanderDuration`)
- Curva de temporização: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` — um ease-out equilibrado
- Usado em seções de FAQ no Rewards e na página de gift card

### Módulo de Consentimento de Cookies

Card modal verde-escuro no topo da página com botões "Agree" (verde preenchido) e "Manage preferences" (contornado). Aparece na primeira visita; dispensável.

### Componentes de Detalhe de Produto (cluster característico do PDP)

Um cluster de componentes recorrente usado nas páginas de produtos do menu (ex.: `/menu/product/40498/iced` para detalhes de bebida, `/menu/product/.../nutrition` para informações nutricionais). Eles ampliam o inventário de componentes sem alterar os tokens.

**Seletor de Opções de Tamanho**
- Linha horizontal de 4 botões de ícone de copo (Tall / Grande / Venti / Trenta)
- Cada item: ícone de silhueta de copo no topo, nome do tamanho abaixo (16/700 em Starbucks-Green), legenda em onças fluidas (13/400 em Text Black Soft)
- Estado ativo: um anel de contorno circular verde (`2px solid #00754A`) ao redor do ícone de copo selecionado
- Inativo: sem anel, mesma tipografia
- Linha de largura total, espaçamento igual
- Raio do contêiner: `12px` ou plano; ícones individuais são circulares `50%`
- Padding: `16px 24px` interno

**Seleção de Add-in / Leite (retângulo contornado)**
- Fundo: `#ffffff`
- Borda: `1px solid #d6dbde` (Input Border)
- Raio: `4px`
- Largura total em sua coluna
- Label flutuante acima da borda superior: "Add-ins" / "Milk" / "Add-ins" — 13/700 em Text Black, maiúsculo, espaçamento de letras `0.325px`
- Valor exibido centralizado (ex.: "Ice", "Coconut", "Strawberry Fruit Inclusions scoop"): 16/400 Text Black
- Ícone chevron-down no lado direito em Text Black Soft
- Foco: borda muda para Green Accent (`#00754A`)

**Stepper Numérico**
- Incorporado dentro de uma linha de Add-in quando uma quantidade é necessária (ex.: colher de Strawberry Fruit Inclusions)
- Botão `−` menos + número de contagem + botão `+` mais, todos inline à direita do label
- Botões: circulares `32×32px` com borda `1px solid #d6dbde`, ícone cinza neutro
- Número de contagem: 16/700 Text Black centralizado

**Botão Personalizar**
- Fundo: `#ffffff`
- Texto: `#00754A` (Green Accent)
- Borda: `1.5px solid #00754A`
- Raio: `50px` (pílula completa)
- Padding: `14px 40px` (generosamente maior que as pílulas padrão — esta é uma ação primária secundária)
- Label: "Customize" com um ícone de brilho dourado ✨ embutido à esquerda
- Usado para: entrar no fluxo de personalização da bebida após a seleção de tamanho/leite

**Botão Adicionar ao Pedido (PDP)**
- Fundo: `#00754A` (Green Accent)
- Texto: `#ffffff`
- Raio: `50px`
- Padding: `14px 32px`
- Fixado no canto superior direito do card de produto e/ou alinhado à direita na faixa de disponibilidade na loja
- Mesmo comportamento ativo scale(0.95) dos demais CTAs primários

**Pílula de Custo no Rewards — "200★ item"**
- Fundo: transparente
- Borda: `1px solid #cba258` (Gold)
- Texto: `#cba258` (Gold)
- Raio: `50px` (pílula completa)
- Padding: `4px 12px`
- Conteúdo: "200★ item" onde `★` é um pequeno glifo de estrela preenchida — indica as Rewards Stars necessárias para resgatar este item
- Fonte: Proxima Nova 13/700 com espaçamento de letras `0.5px`
- Usado apenas em produtos resgatáveis com Rewards

**Faixa de Descrição do Produto**
- Faixa verde-escura de largura total (`#1E3932` House Green)
- Contém de cima para baixo:
  1. Pílula de Custo no Rewards (dourada) se aplicável
  2. Corpo de texto da descrição do produto em branco (16/400/1.5)
  3. Resumo nutricional inline ("140 calories, 25g sugar, 2.5g fat") com tooltip de ícone de informação — 14/700 branco
  4. Botão pílula contornado-branco-sobre-verde "Full nutrition &amp; ingredients list"
- Padding: `32px` vertical
- Aparece abaixo da faixa principal do cabeçalho do produto

**Tabela de Ingredientes / Nutrição**
- Layout de duas colunas na página de Nutrição
- Coluna esquerda: cabeçalho "Ingredients" + lista ou bloco de texto com espaço reservado "Not available for this item" com parágrafo explicativo em Text Black Soft 14/400
- Coluna direita: cabeçalho "Nutrition" + linhas de label/valor
- Cada linha: label de nutriente (Proxima Nova 14/400) à esquerda, valor (ex.: "140 calories", "25g", "205 mg**") à direita, separados por uma linha fina `1px solid #e7e7e7` abaixo
- Nota de rodapé para marcadores de cafeína/asterisco em 13/400 Text Black Soft na parte inferior
- Padrão reutilizável para tabelas de informação nutricional em conformidade com regulamentações

**Seletor de Disponibilidade na Loja**
- Aparece na faixa de destaque verde-escura acima da linha do seletor de tamanho
- Retângulo arredondado de largura total com interior branco-transparente
- Texto: "For item availability, choose a store" em branco, 14/400
- Lado direito: affordance de chevron-down + ícone SVG de sacola de compras em contorno branco
- Raio: `4px`
- Altura: ~48px

**Breadcrumb do PDP**
- Trilha "Menu / Refreshers / Pink Energy Drink" acima do título do produto
- Separador: caractere `/` barra em Text Black Soft
- A página atual não tem link, as páginas anteriores são links sublinhados em green-accent
- Fonte: 14/400 Proxima Nova
- Aparece em todas as páginas PDP

**Link de Chevron Voltar (sub-páginas de nutrição/detalhe do PDP)**
- Link de texto "← Back" acima dos cabeçalhos de seção na página de nutrição
- Texto em Green Accent (`#00754A`) 14/700 Proxima Nova
- Chevron esquerdo `<` no mesmo verde
- Alternativa ao breadcrumb completo em sub-páginas profundas

## 5. Princípios de Layout

### Sistema de Espaçamento

Escala semântica baseada em rem (ancorada `1rem = 10px`):

| Token | Rem | Pixels | Uso Típico |
|-------|-----|--------|-------------|
| `--space-1` | `0.4rem` | 4px | Padding inline mais comprimido |
| `--space-2` | `0.8rem` | 8px | Espaço pequeno, padding vertical de botão |
| `--space-3` | `1.6rem` | 16px | Padrão — padding de card, gutter externo xs |
| `--space-4` | `2.4rem` | 24px | Espaçamento interno de seção, gutter externo md |
| `--space-5` | `3.2rem` | 32px | Espaçamento principal entre seções |
| `--space-6` | `4rem` | 40px | Espaços grandes, gutter externo lg, crate de cabeçalho |
| `--space-7` | `4.8rem` | 48px | Espaçamento seção a seção |
| `--space-8` | `5.6rem` | 56px | Respiração muito ampla — altura do Frap |
| `--space-9` | `6.4rem` | 64px | Padding de seção mais amplo |

**Tokens de gutter:**
- `--outerGutter: 1.6rem` (16px, padrão / mobile)
- `--outerGutterMedium: 2.4rem` (24px, tablet)
- `--outerGutterLarge: 4.0rem` (40px, desktop)

**Constante de ritmo universal:** `1.6rem` (16px) aparece em todas as páginas como o gutter externo padrão, baseline de padding de card e tamanho de texto 3 do corpo — a unidade de espaçamento mais frequente do sistema.

### Grade & Contêiner

- Escala de largura de coluna: `--columnWidthSmall: 343px` / `Medium: 500px` / `Large: 720px` / `XLarge: 1440px`
- Grade de gift card usa uma grade responsiva de 3 a 5 colunas de tiles de `~343px`
- Seção de status do Rewards: 3 painéis verde-escuros em `lg+` breakpoints
- Hero: divisão assimétrica 40% (imagem) / 60% (conteúdo) via `--headerCrateProportion` / `--contentCrateProportion`

### Filosofia de Espaço em Branco

O espaço em branco carrega a sensação de "bastante espaço no café." O padding de seção é generoso (40–64px). Os blocos de conteúdo são separados por espaço em branco em vez de divisores. A tela creme (`#f2f0eb`) é em si um respiro visual entre cards brancos e faixas de destaque verdes.

### Escala de Raio de Borda

| Valor | Uso |
|-------|-----|
| `12px` | Cards, modais, tiles de itens de menu (`--cardBorderRadius`) |
| `12px 12px 0 0` | Aba de feedback de largura total (apenas parte superior arredondada) |
| `50px` | Todos os botões — raio de pílula completa (`--buttonBorderRadius`) |
| `50%` | Ícones circulares, botão flutuante Frap, avatares em miniatura |
| Especial | `3.3333%/5.298%` elíptico para mockups do Starbucks-Visa-Card (`--svcRoundedCorners`) |

## 6. Profundidade & Elevação

| Nível | Tratamento | Uso |
|-------|-----------|-----|
| Card | `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)` | Cards de conteúdo padrão — sombra dupla suave como um sussurro |
| Nav Global | `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` | Elevação suave de três camadas na barra superior fixa |
| Frap Base | `0 0 6px rgba(0,0,0,0.24)` | Halo base ao redor do CTA circular flutuante |
| Frap Ambient | `0 8px 12px rgba(0,0,0,0.14)` | Ambient direcional empilhado — faz o Frap flutuar para frente |
| Gift Card | Leve sombra ao redor da fotografia ilustrada | Sensação de card físico para tiles de gift |
| Starbucks Card (SVC) | `drop-shadow(0 4px 1px rgba(0,0,0,0.11)) drop-shadow(0 0 2px rgba(0,0,0,0.24))` | Sombras SVG empilhadas para visuais do Starbucks Card |

**Filosofia de sombras:** Suaves como um sussurro e em camadas sobre cor sólida — o sistema nunca recorre a uma única sombra pesada. Em vez disso, empilha 2–3 sombras de baixo alpha com diferentes offsets para simular iluminação ambiente + direta do mundo real. O botão Frap é o elemento mais elevado em qualquer página.

### Profundidade Decorativa

- **Sem sistema de gradientes** — superfícies são blocos de cor sólida
- **Faixas de blocos de cor** carregam a profundidade percebida (faixas verde-escuras são lidas como "zonas de destaque recuadas" entre seções corpo creme/branco)
- **Sombras de filtro SVG** nos visuais do Starbucks-Card adicionam uma leve fisicalidade 3D sem box-shadow

## 7. O Que Fazer e O Que Evitar

### Fazer
- Usar Neutral Warm (`#f2f0eb`) ou Ceramic (`#edebe9`) como tela de página em vez de branco puro — o creme quente é a assinatura
- Mapear os níveis de verde aos seus papéis de superfície pretendidos — Starbucks Green para títulos, Green Accent para CTAs, House Green para faixas profundas, Uplift para decorativo
- Manter o tracking apertado em `-0.01em` / `-0.16px` na SoDoSans em todo o sistema
- Usar raio de pílula completa de 50px em todos os botões sem exceção
- Aplicar `transform: scale(0.95)` como estado ativo universal de botão
- Reservar o Dourado apenas para momentos de cerimônia de status no Rewards
- Usar SoDoSans para quase tudo; mudar para serifa Lander Tall apenas para headlines editoriais do Rewards; reservar o script Kalam para momentos de "nome no copo" do Carreiras
- Empilhar 2–3 sombras de baixo alpha em vez de uma sombra mais pesada para elevação
- Usar o CTA circular Frap como entrada flutuante e persistente de pedido em toda superfície de compra
- Deixar a tela creme respirar entre os cards de conteúdo — use espaço em branco, não divisores

### Evitar
- Não usar branco puro como tela de página — a temperatura do creme quente é essencial
- Não escolher "um verde de marca" — o sistema de quatro verdes é intencional; usar apenas `#006241` em tudo achata a marca
- Não usar Dourado como destaque de uso geral — é um sinal exclusivo do Rewards
- Não quadrar os cantos dos botões — a pílula de 50px é universal
- Não introduzir preenchimentos em gradiente — o sistema é totalmente em blocos de cor
- Não diferenciar h1 e h2 por tamanho por meio de contraste de peso — a hierarquia vem do peso + cor (600 Starbucks-Green vs 400 Text Black)
- Não usar preto puro para o corpo do texto — `rgba(0,0,0,0.87)` combina com a tela quente
- Não pular o feedback ativo `scale(0.95)` nos botões — é uma microinteração característica
- Não empilhar sombras únicas e pesadas; sempre usar camadas de 2–3 sombras de baixo alpha
- Não introduzir serifas ou scripts no fluxo principal de compras — elas pertencem aos contextos de Rewards e Carreiras, respectivamente

## 8. Comportamento Responsivo

### Breakpoints

Inferidos a partir de tokens de largura de componente e alturas progressivas do nav:

| Nome | Largura | Principais Mudanças |
|------|-------|-------------|
| xs | < 480px | Nav global 64px; menu hamburguer; layouts de coluna única; botões pílula de largura total |
| Mobile | 480–767px | Nav global 72px; grade de gift card 2 colunas; padding de card comprime |
| Tablet | 768–1023px | Nav global 83px; grade de gift card 3 colunas; divisão hero começa a aparecer |
| Desktop | 1024–1439px | Nav global 99px; grade de gift card 4 colunas; hero assimétrico completo 40/60 |
| XLarge | 1440px+ | Conteúdo limitado em `--columnWidthXLarge`; grade de gift card 5 colunas; margem creme extra |

### Alvos de Toque

- Botões pílula com padding `7px 16px` medem ~32px de altura — abaixo do mínimo WCAG AAA de 44px para superfícies exclusivamente de toque. No mobile, o padding do botão pode ser visualmente expandido para atingir o mínimo.
- Botão circular flutuante Frap de `56px` está bem acima do mínimo.
- O Frap usa `--frapTouchOffset: calc(-1 * .8rem)` para estender a área de toque 8px além da borda visual.
- Os inputs de float-label em formulários aumentam o tamanho de fonte do label no mobile (base 1.6rem vs 1.9rem no desktop) — mais fácil de tocar e ler à distância do braço.

### Estratégia de Colapso

- **Altura do nav global escala progressivamente**: 64 → 72 → 83 → 99px entre os breakpoints, não um valor único
- **Divisão do hero colapsa**: divisão assimétrica 40/60 → empilhado (imagem em cima, conteúdo abaixo) no mobile
- **Grade de gift card**: 5 colunas → 4 → 3 → 2 → 1 entre os breakpoints com larguras de card ajustadas
- **Faixas de destaque**: Permanecem em largura total, mas texto + imagens são empilhados verticalmente no mobile
- **Gutter externo escala**: 16px → 24px → 40px conforme o viewport cresce
- **Painéis de status de 3 colunas do Rewards**: Colapsa para coluna única no mobile

### Comportamento de Imagens

- A fotografia hero do produto recorta mais apertado verticalmente no mobile; o conteúdo torna-se a âncora visual
- As ilustrações de gift card preservam a proporção de aspecto; a grade de cards reflui
- Transição de fade-in `opacity 0.3s ease-in` no carregamento de imagem (previne aparecimento brusco)
- A fotografia do Rewards app na mão escala proporcionalmente; nunca estica

## 9. Guia de Prompts para Agente

### Referência Rápida de Cores

- CTA primário: "Green Accent (`#00754A`)"
- Texto de CTA primário: "White (`#ffffff`)"
- Título de marca: "Starbucks Green (`#006241`)"
- Faixa de destaque / rodapé: "House Green (`#1E3932`)"
- Tela de página: "Neutral Warm (`#f2f0eb`)"
- Tela de card: "White (`#ffffff`)"
- Texto de título em superfície clara: "Text Black (`rgba(0,0,0,0.87)`)"
- Texto de corpo em superfície clara: "Text Black Soft (`rgba(0,0,0,0.58)`)"
- Texto de corpo em superfície verde-escura: "Text White Soft (`rgba(255,255,255,0.70)`)"
- Destaque do Rewards: "Gold (`#cba258`)"
- Texto do Rewards: "Rewards Green (`#33433d`)"
- Destrutivo: "Red (`#c82014`)"

### Exemplos de Prompts de Componentes

1. "Crie um botão CTA pílula primário da Starbucks com fundo Green Accent (`#00754A`), texto branco 'Explore our afternoon menu', fonte SoDoSans a 16px peso 600 com letter-spacing `-0.01em`, `50px` border-radius (pílula completa), padding `7px 16px`. Aplique `transform: scale(0.95)` como estado ativo com uma transição `0.2s ease`."

2. "Projete um card de conteúdo com fundo White (`#ffffff`) em `12px` de border-radius, sombra em camadas `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)`. Preencha os conteúdos com `16–24px` (`--space-3` a `--space-4`). Posicione sobre uma tela de página Neutral Warm (`#f2f0eb`) com espaço de `16px` para os elementos irmãos."

3. "Construa o botão circular flutuante Frap de pedido — diâmetro de `56px`, preenchimento Green Accent (`#00754A`), ícone de sacola de compras branco centralizado. Sombra em camadas: `0 0 6px rgba(0,0,0,0.24)` + `0 8px 12px rgba(0,0,0,0.14)`. Posição fixa no canto inferior direito com offset de toque `-0.8rem`. O estado ativo colapsa a sombra ambient para `0 8px 12px rgba(0,0,0,0)` com `scale(0.95)`."

4. "Construa uma faixa de destaque verde-escura — seção de largura total com fundo House Green (`#1E3932`). Coluna esquerda: h2 SoDoSans branco a 24px peso 600, seguido de um parágrafo de corpo Text White Soft (`rgba(255,255,255,0.70)`) e uma linha de CTA com dois botões (preenchido Branco com texto Green Accent para primário, Contornado sobre Escuro com borda branca para secundário). Coluna direita: fotografia de produto. Proporção de divisão 40/60, empilhado verticalmente abaixo de `768px`."

5. "Crie um card de status do Rewards — painel House Green (`#1E3932`) com `12px` de border-radius, faixa superior colorida com gradiente (nível Bronze/Silver/Gold). Título em SoDoSans 24px peso 600 em branco. Lista de benefícios como marcadores brancos com legendas secundárias `rgba(255,255,255,0.70)`. Texto de progressão na parte inferior em Text White Soft. Empilhe 3 painéis em uma grade em `lg+`, coluna única no mobile."

6. "Projete um tile de gift card — raio de card igual a `12px`, preenchido com uma fotografia ilustrada (sensação de aquarela pintada à mão) como toda a superfície. Leve sombra torna o card como físico sobre a tela creme. Agrupe sob um label de categoria ('Spring', 'Thank You', 'Birthday') em SoDoSans 24px peso 400 acima da grade."

7. "Crie um cabeçalho de detalhe de produto Starbucks — faixa House Green (`#1E3932`) com breadcrumb 'Menu / Refreshers / Pink Energy Drink' em 14/400 branco acima do título do produto em SoDoSans 32/700 maiúsculo branco. Fotografia do produto centralizada abaixo do título. Abaixo da foto: uma linha de seletor de tamanho de 4 colunas — cada botão de ícone de copo mostra uma silhueta vertical de copo, nome do tamanho ('Tall' / 'Grande' / 'Venti' / 'Trenta') em 16/700 branco e onças fluidas em 13/400 Text White Soft. O tamanho selecionado envolve o ícone do copo em um anel circular `2px solid #00754A`."

8. "Construa um fluxo de personalização Starbucks — abaixo do seletor de tamanho, 3 linhas de input em retângulo contornado empilhadas (fundo branco, borda `1px solid #d6dbde`, raio `4px`). Cada uma tem um label flutuante ('Add-ins', 'Milk', 'Add-ins') acima da borda superior em 13/700 Text Black maiúsculo. Valor centralizado (ex.: 'Ice', 'Coconut'). Lado direito: chevron-down em Text Black Soft. Para a linha de colher, incorpore um stepper numérico (`−` `1` `+` com botões circulares contornados de `32px`). Abaixo dos três campos: pílula verde contornada 'Customize' com ícone de brilho dourado, raio `50px`, padding `14px 40px`. Pareie com uma pílula Green Accent preenchida 'Add to Order' na mesma linha."

9. "Projete uma faixa de descrição de produto Starbucks — House Green (`#1E3932`) de largura total abaixo do cabeçalho do produto. Topo: uma Pílula de Custo no Rewards com contorno dourado '200★ item' (raio `50px`, padding `4px 12px`, borda e texto dourado `#cba258`). Abaixo: descrição do produto em branco 16/400/1.5. Resumo nutricional inline em branco 14/700 ('140 calories, 25g sugar, 2.5g fat') com tooltip de ícone de informação. Botão pílula contornado-branco-sobre-verde 'Full nutrition &amp; ingredients list'. Padding vertical de 32px."

10. "Crie uma tabela de informação nutricional Starbucks — layout de duas colunas dentro de um card Branco. Coluna esquerda: cabeçalho 'Ingredients' (24/400 Text Black), seguido de lista de ingredientes ou parágrafo espaço reservado 'Not available for this item' em 14/400 Text Black Soft. Coluna direita: cabeçalho 'Nutrition', depois linhas de label/valor (nome do nutriente à esquerda, valor à direita) separadas por linhas finas `1px solid #e7e7e7`. Tipografia: labels em 14/400 Text Black, valores em 14/700 Text Black alinhados à direita. Marcadores de nota de rodapé com asterisco em 13/400 Text Black Soft na parte inferior."

### Guia de Iteração

Ao refinar telas existentes geradas com este design system:
1. Concentre-se em UM componente por vez
2. Referencie nomes de cores específicos e códigos hex deste documento
3. Use descrições em linguagem natural ("tela creme quente", "sistema verde de quatro níveis") junto com valores exatos
4. Preserve a pílula de 50px + estado ativo `scale(0.95)` universalmente
5. Verifique se os verdes estão mapeados ao papel correto (Green Accent para CTA, Starbucks Green para título, House Green para faixa)
6. Não introduza gradientes — o sistema é em blocos de cor
7. Mantenha o tracking da SoDoSans em `-0.01em` / `-0.16px` em todo o sistema

### Lacunas Conhecidas

- SoDoSans é uma typeface proprietária não disponível no Google Fonts — ao implementar publicamente, use Inter ou Manrope como substituta e documente a troca
- Lander Tall (serifa do Rewards) também é personalizada — substitua por Iowan Old Style, Lora ou Source Serif Pro
- Temporizações de animação específicas por componente além das poucas documentadas (`--duration: 0.4s`, `--iconTransition: all ease-out 0.2s`, `--expanderDuration: 300ms`) não foram capturadas para cada superfície interativa
- O estilo completo de estado de erro em formulários (peso da borda vermelha, posicionamento de ícone) é visível no token de tint mas não foi extraído de forma exaustiva
- Componentes específicos da página de Carreiras (card de nome no copo, grade de radio de busca) são referenciados em nomes de tokens mas não são cobertos por esta extração
- As especificações detalhadas de mockup do Starbucks Visa Card / Starbucks-Card (SVC) são sugeridas pelos tokens `--svcRoundedCorners` e `--svcShadowFilter` mas não estão totalmente documentadas
