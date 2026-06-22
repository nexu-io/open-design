# Design System Inspirado pela Nike

> Category: E-Commerce & Varejo
> Varejo esportivo. UI monocromática, tipografia maiúscula massiva, fotografia full-bleed.

## 1. Tema Visual & Atmosfera

O Nike.com é uma catedral cinética do varejo — um site que canaliza a energia explosiva do esporte para uma experiência de compra digital. O design opera sobre um princípio de simplicidade radical: reduzir tudo ao preto, branco e cinza para que a fotografia esportiva e a cor dos produtos possam dominar sem concorrência. O resultado parece menos um site e mais um editorial esportivo diagramado com a precisão de uma revista de luxo. Cada pixel de espaço está vendendo produto ou conduzindo em direção a ele.

O "Podium CDS" (Core Design System interno da Nike) estabelece uma base agressivamente monocromática. A UI desaparece em texto preto (`#111111`) e superfícies brancas, permitindo que a fotografia de herói — atletas suados, tênis no ar, energia de estádio — carregue o peso emocional. Quando a cor aparece na UI, é quase exclusivamente funcional: vermelho para erros, azul para links, verde para sucesso. O produto em si é a história de cor. Essa contenção cria um paradoxo visual: as páginas mais coloridas da internet parecem as mais minimalistas, porque toda a vibração vem das mercadorias, não da interface.

O sistema tipográfico é a outra metade da identidade visual da Nike. Títulos maiúsculos massivos em Nike Futura ND — uma variante condensada personalizada de Futura com line-height incrivelmente apertado (0.90) — atravessam as imagens de herói como uma onda de choque tipográfica. Abaixo dos títulos, a família Helvetica Now cuida de tudo, da navegação às descrições de produtos, com clareza de precisão suíça. Essa divisão entre tipografia display expressiva e tipografia de corpo funcional espelha a dualidade da marca Nike: inspiração encontra execução.

**Características Principais:**
- UI monocromática (preto/branco/cinza) que deixa a fotografia de produtos ser a única fonte de cor
- Tipografia display maiúscula massiva (96px, line-height 0.90) que atravessa imagens de herói
- Fotografia full-bleed sem border radius — as imagens preenchem cada borda disponível
- Botões em forma de pílula (30px de raio) como elemento interativo principal
- Grid de espaçamento de 8px com disciplina atlética — cada medida se encaixa no sistema
- Arquitetura de compras orientada por categorias com grandes cartões de imagem de navegação
- Modelo de elevação sem sombra e com bordas mínimas — diferenciação de superfície apenas por variações de cinza

## 2. Paleta de Cores & Papéis

### Primária

- **Nike Black** (`#111111`): A fundação — texto primário, fundos de botões, texto de nav, sobreposições de herói. Deliberadamente não é o preto puro (#000000), criando uma experiência de leitura ligeiramente mais suave
- **Nike White** (`#FFFFFF`): Canvas principal da página, texto de botão em fundos escuros, superfícies de cartões, fundo da barra de navegação

### Superfície & Fundo

- **Snow** (`#FAFAFA`): Superfície mais clara, diferenciação sutil quase branca (--podium-cds-color-grey-50)
- **Light Gray** (`#F5F5F5`): Fundo secundário, preenchimento de input de busca, placeholder de imagem, esqueleto de carregamento (--podium-cds-color-grey-100)
- **Hover Gray** (`#E5E5E5`): Fundo de estado hover, preenchimento de botão desabilitado (--podium-cds-color-grey-200)
- **Dark Surface** (`#28282A`): Fundo primário em seções escuras/invertidas (--podium-cds-color-grey-800)
- **Deep Charcoal** (`#1F1F21`): Fundo primário inverso, superfície mais escura que não é preta (--podium-cds-color-grey-900)
- **Dark Hover** (`#39393B`): Estado hover em fundos escuros (--podium-cds-color-grey-700)

### Neutros & Texto

- **Primary Text** (`#111111`): Texto de corpo principal, títulos, links de nav (--podium-cds-color-text-primary)
- **Secondary Text** (`#707072`): Texto descritivo, metadados, timestamps, rótulos de preço (--podium-cds-color-text-secondary)
- **Disabled Text** (`#9E9EA0`): Elementos inativos, opções indisponíveis (--podium-cds-color-text-disabled)
- **Disabled Inverse** (`#4B4B4D`): Texto desabilitado em fundos escuros (--podium-cds-color-text-disabled-inverse)
- **Border Primary** (`#707072`): Cor de borda padrão, correspondendo ao texto secundário
- **Border Secondary** (`#CACACB`): Bordas sutis, bordas de input, linhas divisórias (--podium-cds-color-grey-300)
- **Border Disabled** (`#CACACB`): Estado de borda inativa
- **Border Active** (`#111111`): Borda ativa/focada, correspondendo ao texto primário

### Semântica & Destaque

- **Nike Red** (`#D30005`): Erros críticos, badges de promoção, notificações urgentes (--podium-cds-color-red-600)
- **Bright Red** (`#EE0005`): Red-500, vermelho ligeiramente mais claro para ênfase
- **Nike Orange Badge** (`#D33918`): Texto de badge, chamadas promocionais (--podium-cds-color-text-badge)
- **Orange Flash** (`#FF5000`): Destaque laranja expressivo (--podium-cds-color-orange-400)
- **Success Green** (`#007D48`): Confirmação, disponibilidade, estados positivos (--podium-cds-color-green-600)
- **Success Inverse** (`#1EAA52`): Sucesso em fundos escuros (--podium-cds-color-green-500)
- **Link Blue** (`#1151FF`): Links de texto, destaques informativos (--podium-cds-color-blue-500)
- **Info Inverse** (`#1190FF`): Links em fundos escuros (--podium-cds-color-blue-400)
- **Warning Yellow** (`#FEDF35`): Fundos de aviso, banners de atenção (--podium-cds-color-yellow-200)
- **Focus Ring** (`rgba(39, 93, 197, 1)`): Anel indicador de foco por teclado

### Espectro de Cores Estendido (Podium CDS)

Cada rampa de cores vai de 50 a 900 para uso expressivo em campanhas e páginas de produto:

- **Red**: `#FFE5E5` → `#EE0005` → `#530300`
- **Orange**: `#FFE2D6` → `#FF5000` → `#3E1009`
- **Yellow**: `#FEF087` → `#FCA600` → `#99470A`
- **Green**: `#DFFFB9` → `#1EAA52` → `#003C2A`
- **Teal**: `#D4FFFB` → `#008E98` → `#043441`
- **Blue**: `#D6EEFF` → `#1151FF` → `#020664`
- **Purple**: `#E4E1FC` → `#6E0FF6` → `#1C0060`
- **Pink**: `#FFE1F3` → `#ED1AA0` → `#4C012D`

### Sistema de Gradientes

A Nike evita gradientes na UI. Quando gradientes aparecem, são fotográficos — aplicados a fundos de herói de produtos (por exemplo, um tênis vermelho sobre um gradiente de vermelho para vermelho mais escuro). O design system em si usa apenas cores planas.

## 3. Regras Tipográficas

### Família de Fontes

**Display:** Nike Futura ND (variante condensada personalizada de Futura exclusiva da Nike)
- Fallbacks: Helvetica Now Text Medium, Helvetica, Arial
- Usada exclusivamente para títulos display maiúsculos de grande porte
- Line-height caracteristicamente apertado (0.90) e transformação uppercase

**Heading:** Helvetica Now Display Medium
- Fallbacks: Helvetica, Arial
- Usada para títulos de seção e títulos de produtos de 24–32px

**Body Medium:** Helvetica Now Text Medium (weight 500)
- Fallbacks: Helvetica, Arial
- Usada para links, botões, legendas, texto de corpo com ênfase

**Body:** Helvetica Now Text (weight 400)
- Fallbacks: Helvetica, Arial
- Usada para texto de corpo padrão, descrições, metadados

**Arabic:** Neue Frutiger Arabic — alternativa específica de localidade

### Hierarquia

| Papel | Tamanho | Weight | Line Height | Espaçamento | Notas |
|------|------|--------|-------------|----------------|-------|
| Display | 96px | 500 | 0.90 | — | Nike Futura ND, uppercase, títulos de herói |
| Heading 1 | 32px | 500 | 1.20 | — | Helvetica Now Display Medium, títulos de seção |
| Heading 2 | 24px | 500 | 1.20 | — | Helvetica Now Display Medium, subseções |
| Heading 3 | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, títulos de cartão |
| Body | 16px | 400 | 1.75 | — | Helvetica Now Text, descrições de produtos |
| Body Medium | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, texto com ênfase |
| Link | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, links de navegação |
| Link Small | 14px | 500 | 1.86 | — | Helvetica Now Text Medium, links de rodapé/utilitários |
| Button | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, texto de CTA |
| Button Small | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, botões secundários |
| Caption | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, rótulos de preço |
| Small | 12px | 500 | 1.50 | — | Helvetica Now Text Medium, timestamps |
| Tiny | 12px | 400 | 1.50 | — | Helvetica Now Text, texto jurídico |

### Princípios

A tipografia da Nike é um estudo em tensão. A camada display — Nike Futura ND em 96px com um devastador line-height de 0.90 — é projetada para parecer um placar de estádio: massiva, condensada, maiúscula, impossível de ignorar. Ela transforma títulos em gritos de batalha. Abaixo da camada display, a Helvetica Now oferece um contraponto clínico: legibilidade com precisão suíça e generoso line-height de 1.75 para uma navegação de produtos confortável. O weight 500 (Medium) domina todo o texto de corpo, dando à prosa da Nike uma leve assertividade sem o peso do negrito — cada frase é lida como uma recomendação confiante, não como um grito.

## 4. Estilização de Componentes

### Botões

**Primário**
- Background: Nike Black (`#111111`)
- Texto: White (`#FFFFFF`), 16px/500, Helvetica Now Text Medium
- Border: nenhuma
- Border radius: pílula totalmente arredondada (30px)
- Padding: ~12px 24px
- Hover: background muda para Grey-500 (`#707072`), cor de hover do texto
- Active: efeito de ripple scale(0) com opacidade 0.5
- Focus: anel de 2px box-shadow em `rgba(39, 93, 197, 1)`
- Transition: background 200ms ease

**Primário em Fundo Escuro**
- Background: White (`#FFFFFF`)
- Texto: Black (`#111111`)
- Hover: background muda para Grey-300 (`#CACACB`)

**Secundário (Delineado)**
- Background: transparent
- Texto: Nike Black (`#111111`)
- Border: 1.5px solid `#CACACB` (grey-300)
- Border radius: 30px
- Hover: borda escurece para `#707072`, background para grey-200

**Desabilitado**
- Background: Grey-200 (`#E5E5E5`)
- Texto: Grey-400 (`#9E9EA0`)
- Cursor: not-allowed

**Botão de Ícone**
- Background: Grey-100 (`#F5F5F5`)
- Forma: raio de 30px (ou 50% para circular)
- Padding: 6px
- Hover: background Grey-500

### Cartões & Contêineres

- Background: White (`#FFFFFF`) — sem limite de cartão visível na maioria dos casos
- Border radius: 0px para cartões de imagem de produto (imagem borda a borda), 20px para contêineres interativos
- Sombra: nenhuma — a Nike não usa sombras de cartão
- Hover: sem efeito de elevação em cartões de produto; sublinhado em links de texto dentro dos cartões
- Cartões de produto: imagem no topo (sem raio), metadados de texto abaixo com gap de 12px
- Cartões de categoria: fotografia full-bleed com sobreposição de texto em gradiente escuro
- Transition: opacity 200ms ease para troca de imagem no hover

### Inputs & Formulários

- Background: Grey-100 (`#F5F5F5`)
- Border: 1px solid `#CACACB` quando visível, ou sem borda em busca
- Border radius: 24px (inputs de busca), 8px (inputs de formulário)
- Fonte: Helvetica Now Text, 16px
- Focus: borda muda para `#111111` (border-active), anel de foco de 2px em `rgba(39, 93, 197, 1)`
- Erro: borda `#D30005` (crítico)
- Placeholder: Grey-500 (`#707072`)
- Transition: border-color 200ms ease

### Navegação

- Background: White (`#FFFFFF`), sticky
- Altura: ~60px desktop
- Esquerda: logo Nike Swoosh (24x24px SVG)
- Centro: links de Categoria (New & Featured, Men, Women, Kids, Sale) em 16px/500 Helvetica Now Text Medium
- Direita: Busca (input com raio de 24px), ícones de Favoritos e Carrinho
- Hover: cor do texto muda para Grey-500 (`#707072`)
- Mobile: menu hamburguer, sobreposição em tela cheia
- Banner superior: barra de mensagem promocional com fundo escuro (#111111) e texto branco

### Tratamento de Imagens

- Imagens de herói: full-bleed, sem border radius, borda a borda
- Grade de produto: proporção quadrada (1:1) ou 4:3, sem border radius
- Cartões de categoria: 16:9 ou 4:3, full-bleed com sobreposição de texto
- Placeholder de imagem: fundo sólido Grey-100 (`#F5F5F5`)
- Carregamento lazy: loading="lazy" nativo, esqueleto usa fundo #F5F5F5
- Hover de produto: troca de imagem secundária (vista frontal → lateral)

### Banners Promocionais

- Fundo escuro (`#111111`) de largura total com texto branco
- Padding reduzido (8-12px vertical)
- Texto centralizado, 12px/500 Helvetica Now Text Medium
- Usado para promoções de frete, benefícios de membros, anúncios de promoção

## 5. Princípios de Layout

### Sistema de Espaçamento

Unidade base: 4px (a grade primária é múltiplos de 8px)

| Token | Valor | Uso |
|-------|-------|-----|
| space-1 | 4px | Gaps de ícone ajustados, espaçamento inline |
| space-2 | 8px | Unidade base, gaps de ícone em botões |
| space-3 | 12px | Padding interno de cartão, margens reduzidas |
| space-4 | 16px | Padding padrão, espaçamento de nav |
| space-5 | 20px | Gaps de cartão de produto |
| space-6 | 24px | Padding interno de seção, gaps de grade |
| space-7 | 32px | Quebras de seção |
| space-8 | 48px | Padding de seção principal |
| space-9 | 64px | Padding de seção de herói |
| space-10 | 80px | Espaçamento de seção ampla |

### Grade & Contêiner

- Largura máxima do contêiner: 1920px
- Largura de conteúdo padrão: ~1440px com padding horizontal
- Grade de produto: 3 colunas no desktop, 2 colunas no tablet, 1 coluna no mobile
- Grade de categoria: 3 colunas com imagens full-bleed
- Gap da grade: 4-12px entre cartões de produto (intencionalmente reduzido)
- Padding horizontal: 48px desktop, 24px tablet, 16px mobile

### Filosofia de Espaço em Branco

A estratégia de espaço em branco da Nike é deliberadamente agressiva — não de forma luxuosa e respeitosa como numa marca de moda, mas de uma forma comprimida e de alta densidade que preenche cada pixel com conteúdo ou ausência intencional. As grades de produtos usam gaps mínimos (4-12px) para criar uma sensação de abundância e variedade. As quebras de seção são generosas (48-80px) para separar contextos de compra. O efeito geral é de uma loja que parece repleta de produtos, mas ainda assim navegável — como uma superstore esportiva bem organizada.

### Escala de Border Radius

| Valor | Contexto |
|-------|---------|
| 0px | Imagens de produto, fotografia de herói (bordas retas) |
| 8px | Inputs de formulário (não de busca) |
| 18px | Elementos interativos pequenos |
| 20px | Contêineres, cartões com conteúdo de UI |
| 24px | Inputs de busca, pílulas médias |
| 30px | Botões, tags, filtros (pílula completa) |
| 50% | Botões de ícone circulares, placeholders de avatar |

## 6. Profundidade & Elevação

| Nível | Tratamento | Uso |
|-------|-----------|-----|
| Flat | Sem sombra, sem borda | Estado padrão de tudo |
| Divider | `0px -1px 0px 0px #E5E5E5 inset` | Linha inset sutil entre seções |
| Focus | `0 0 0 2px rgba(39, 93, 197, 1)` | Anel de foco por teclado |
| Overlay | Scrim escuro sobre fotografia | Legibilidade de texto sobre imagem |

A filosofia de elevação da Nike é radicalmente plana. Não há sombras de cartão, sem elevações no hover, sem elementos flutuantes. A profundidade é comunicada exclusivamente pela cor — seções escuras recuam, seções claras avançam, variações de cinza indicam mudanças de estado. Essa planura reforça a personalidade da marca atlética e direta: sem adornos visuais, apenas comunicação direta. A única "sombra" em todo o sistema é uma linha divisória inset de 1px e o anel de foco exigido para acessibilidade.

### Profundidade Decorativa

- **Sobreposições de fotografia de herói**: Scrims de gradiente escuro sobre fotografia full-bleed para legibilidade do texto
- **Gradientes de fundo de produto**: Fundos coloridos atrás de fotos de produto de herói (por exemplo, tênis vermelho em gradiente vermelho)
- **Barras de banner**: Tiras promocionais sólidas e escuras (#111111) no topo da página

## 7. O Que Fazer e Não Fazer

### Fazer

- Usar Nike Black (#111111) para todo o texto primário — nunca o #000000 puro
- Manter os botões em forma de pílula (raio de 30px) e limitados às variantes primária/secundária
- Usar fotografia full-bleed, borda a borda para seções de herói — sem border radius nas imagens
- Deixar a fotografia de produto fornecer toda a vibração de cor; manter a UI monocromática
- Usar Nike Futura ND maiúsculo SOMENTE para títulos display (96px+)
- Manter gaps reduzidos na grade de produto (4-12px) para uma sensação densa e abundante
- Usar Grey-100 (#F5F5F5) para todos os fundos de input e placeholder
- Reservar cor exclusivamente para significado semântico (vermelho=erro, verde=sucesso, azul=link)
- Usar weight 500 (Medium) para todos os elementos de texto interativos

### Não Fazer

- Não adicionar sombras em cartões — o modelo de elevação da Nike é completamente plano
- Não usar border radius em imagens de produto — somente elementos de UI recebem cantos arredondados
- Não introduzir cores de marca além da escala de cinza para elementos de UI
- Não usar Nike Futura ND abaixo de 24px — ela é exclusivamente uma fonte display
- Não adicionar efeitos de elevação no hover — os cartões da Nike não animam no hover
- Não usar weight regular (400) para botões ou links — sempre usar 500
- Não colocar fundos coloridos atrás de elementos de UI — cor é reservada para contextos de produto
- Não usar mais de dois níveis de hierarquia de texto por cartão (título + corpo)
- Não adicionar divisórias decorativas — o inset de 1px é o único padrão de divisória
- Não suavizar o contraste — o design da Nike deliberadamente leva o preto sobre branco ao máximo

## 8. Comportamento Responsivo

### Breakpoints

| Nome | Largura | Principais Mudanças |
|------|-------|-------------|
| Mobile | <640px | Coluna única, nav hamburguer, texto display reduz, padding reduzido de 16px |
| Small Tablet | 640-768px | Grade de produto de 2 colunas começa, nav ainda recolhida |
| Tablet | 768-960px | Grades de 2 colunas, cartões de categoria escalam, padding horizontal de 24px |
| Small Desktop | 960-1024px | Nav se expande para horizontal completo, grade de produto de 3 colunas |
| Desktop | 1024-1440px | Layout completo, nav expandida, grades de 3 colunas, padding de 48px |
| Large Desktop | >1440px | Contêiner de largura máxima centralizado, margens aumentadas, imagens de herói full-bleed |

### Alvos de Toque

- Alvo de toque mínimo: 44x44px (WCAG AAA)
- Ícones de nav mobile: área de toque de 48x48px
- Cartões de produto: toda a superfície é tocável
- Pílulas de filtro: altura mínima de 36px com padding de 12px

### Estratégia de Colapso

- **Navegação**: Links de categoria completos → menu hamburguer abaixo de 960px; ícones de busca, favoritos e carrinho permanecem visíveis
- **Grades de produto**: 3 colunas → 2 colunas em 960px → 1 coluna em 640px
- **Seções de herói**: Texto display reduz de 96px → 64px → 48px; imagens de herói permanecem full-bleed em todos os tamanhos
- **Cartões de categoria**: 3 colunas → 2 colunas → 1 coluna com imagens full-bleed mantidas
- **Padding de seção**: 80px → 48px → 32px → 24px conforme a viewport reduz
- **Banner promocional**: texto quebra ou trunca, mantém fundo escuro

### Comportamento de Imagem

- Imagens responsivas via Nike CDN (`c.static-nike.com`) com parâmetros de largura
- Imagens de produto: srcset com múltiplas resoluções (w_320, w_640, w_960, w_1920)
- Imagens de herói: full-bleed em todos os breakpoints, a proporção muda (16:9 desktop → 4:3 mobile)
- Carregamento lazy: loading="lazy" nativo, placeholder grey-100 durante o carregamento
- Direção de arte: os cortes de herói mudam entre composições desktop e mobile

## 9. Guia de Prompt para Agentes

### Referência Rápida de Cores

- CTA primário: Nike Black (`#111111`)
- Fundo: White (`#FFFFFF`)
- Superfície secundária: Light Gray (`#F5F5F5`)
- Texto de título: Nike Black (`#111111`)
- Texto de corpo / hover: Secondary Text (`#707072`)
- Borda: Border Secondary (`#CACACB`)
- Erro: Nike Red (`#D30005`)
- Link: Link Blue (`#1151FF`)

### Exemplos de Prompts de Componente

- "Crie uma seção de herói de produto com fotografia full-bleed borda a borda, sem border radius, uma sobreposição de gradiente escuro para o texto e um título maiúsculo massivo de 96px/500 no estilo Nike Futura com line-height de 0.90 e um botão pílula Nike Black (#111111) (raio de 30px)"
- "Projete uma grade de cartão de produto de 3 colunas com imagens quadradas (sem border radius), gap de 4px entre os cartões, nome do produto em 16px/500 Nike Black (#111111), preço em 14px/500 e texto secundário em Grey-500 (#707072)"
- "Construa uma barra de navegação branca sticky com logotipo alinhado à esquerda, links de categoria centralizados em 16px/500 (#111111) com cor hover #707072, e ícones de busca (raio de 24px, fundo #F5F5F5), favoritos e carrinho alinhados à direita"
- "Crie uma faixa de banner promocional com fundo #111111, texto branco centralizado em 12px/500 e padding vertical de 8px — largura total, sem border radius"
- "Projete um botão secundário delineado com fundo transparent, borda de 1.5px #CACACB, raio de pílula de 30px, texto de 16px/500 #111111, borda no hover escurecendo para #707072"

### Guia de Iteração

Ao refinar telas existentes geradas com este design system:
1. Foque em UM componente por vez
2. Referencie nomes de cores específicos e códigos hex deste documento
3. Lembre-se: a fotografia de produto é a cor — a UI permanece monocromática
4. Use a escala de cinza para mudanças de estado: #F5F5F5 → #E5E5E5 → #CACACB → #707072
5. Se algo parecer colorido demais na UI, provavelmente está — a Nike mantém a UI em escala de cinza
6. O tipo display (Nike Futura) deve SEMPRE estar em maiúsculas e nunca abaixo de 24px
7. O tipo de corpo (Helvetica Now) deve quase sempre ter weight 500 para elementos interativos
