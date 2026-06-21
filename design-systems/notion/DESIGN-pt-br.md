# Sistema de Design Inspirado no Notion

> Category: Produtividade e SaaS
> Espaço de trabalho tudo-em-um. Minimalismo acolhedor, títulos com serifa, superfícies suaves.

## 1. Tema Visual e Atmosfera

O site do Notion encarna a filosofia da própria ferramenta: uma tela em branco que não atrapalha o seu trabalho. O sistema de design é construído sobre neutros quentes em vez de cinzas frios, criando um minimalismo distintivamente acessível que evoca a sensação de papel de qualidade em vez de vidro estéril. A tela da página é branco puro (`#ffffff`), mas o texto não é preto puro — é um preto quente quase absoluto (`rgba(0,0,0,0.95)`) que suaviza imperceptivelmente a experiência de leitura. A escala de cinzas quentes (`#f6f5f4`, `#31302e`, `#615d59`, `#a39e98`) tem sutis subtons amarelo-marrons, conferindo à interface uma sensação tátil, quase analógica.

A fonte personalizada NotionInter (uma Inter modificada) é a espinha dorsal do sistema. Em tamanhos de exibição (64px), ela usa espaçamento entre letras negativo agressivo (-2.125px), criando títulos que parecem comprimidos e precisos. O intervalo de pesos é mais amplo do que em sistemas típicos: 400 para o corpo, 500 para elementos de interface, 600 para rótulos seminegrito e 700 para títulos de exibição. Os recursos OpenType `"lnum"` (numerais alinhados) e `"locl"` (formas localizadas) são habilitados em textos maiores, adicionando sofisticação tipográfica que recompensa a leitura atenta.

O que torna a linguagem visual do Notion distinta é sua filosofia de bordas. Em vez de bordas pesadas ou sombras, o Notion usa bordas ultra-finas `1px solid rgba(0,0,0,0.1)` — bordas que existem como sussurros, linhas divisórias quase imperceptíveis que criam estrutura sem peso. O sistema de sombras é igualmente contido: pilhas de múltiplas camadas com opacidade cumulativa que nunca ultrapassa 0.05, criando profundidade que é sentida em vez de vista.

**Key Characteristics:**
- NotionInter (Inter modificada) com espaçamento entre letras negativo em tamanhos de exibição (-2.125px a 64px)
- Paleta de neutros quentes: os cinzas têm subtons amarelo-marrons (`#f6f5f4` branco quente, `#31302e` escuro quente)
- Texto quase preto via `rgba(0,0,0,0.95)` — não preto puro, criando micro-calor
- Bordas ultra-finas: `1px solid rgba(0,0,0,0.1)` em todo o sistema — divisão com peso de sussurro
- Pilhas de sombras com múltiplas camadas com opacidade abaixo de 0.05 para profundidade quase imperceptível
- Azul Notion (`#0075de`) como a única cor de destaque para CTAs e elementos interativos
- Badges em formato de pílula (raio 9999px) com fundos azuis matizados para indicadores de status
- Unidade base de espaçamento de 8px com escala orgânica não rígida

## 2. Paleta de Cores e Papéis

### Primário
- **Preto Notion** (`rgba(0,0,0,0.95)` / `#000000f2`): Texto principal, títulos, corpo do texto. A opacidade de 95% suaviza o preto puro sem sacrificar a legibilidade.
- **Branco puro** (`#ffffff`): Fundo da página, superfícies de cards, texto de botão sobre azul.
- **Azul Notion** (`#0075de`): CTA principal, cor de link, destaque interativo — a única cor saturada na interface principal.

### Secundário de Marca
- **Azul-marinho profundo** (`#213183`): Cor secundária de marca, usada com parcimônia para ênfase e seções escuras de recursos.
- **Azul ativo** (`#005bab`): Estado ativo/pressionado do botão — variante mais escura do Azul Notion.

### Escala de Neutros Quentes
- **Branco quente** (`#f6f5f4`): Tonalidade de superfície de fundo, alternância de seções, preenchimento sutil de cards. O subtom amarelo é fundamental.
- **Escuro quente** (`#31302e`): Fundo de superfície escura, texto em seções escuras. Mais quente do que cinzas padrão.
- **Cinza quente 500** (`#615d59`): Texto secundário, descrições, rótulos discretos.
- **Cinza quente 300** (`#a39e98`): Texto de placeholder, estados desabilitados, texto de legenda.

### Cores de Destaque Semânticas
- **Verde-azulado** (`#2a9d99`): Estados de sucesso, indicadores positivos.
- **Verde** (`#1aae39`): Confirmação, badges de conclusão.
- **Laranja** (`#dd5b00`): Estados de aviso, indicadores de atenção.
- **Rosa** (`#ff64c8`): Destaque decorativo, realces de recursos.
- **Roxo** (`#391c57`): Recursos premium, destaques profundos.
- **Marrom** (`#523410`): Destaque terroso, seções de recursos quentes.

### Interativos
- **Azul link** (`#0075de`): Cor principal de link com sublinhado ao passar o cursor.
- **Azul link claro** (`#62aef0`): Variante de link mais claro para fundos escuros.
- **Azul foco** (`#097fe8`): Anel de foco em elementos interativos.
- **Fundo de badge azul** (`#f2f9ff`): Fundo de badge em pílula, superfície azul matizada.
- **Texto de badge azul** (`#097fe8`): Texto de badge em pílula, azul mais escuro para legibilidade.

### Sombras e Profundidade
- **Sombra de card** (`rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`): Elevação de card com múltiplas camadas.
- **Sombra profunda** (`rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px`): Elevação profunda de cinco camadas para modais e conteúdo em destaque.
- **Borda sussurro** (`1px solid rgba(0,0,0,0.1)`): Borda de divisão padrão — cards, divisores, seções.

## 3. Regras Tipográficas

### Família de Fontes
- **Principal**: `NotionInter`, com fallbacks: `Inter, -apple-system, system-ui, Segoe UI, Helvetica, Apple Color Emoji, Arial, Segoe UI Emoji, Segoe UI Symbol`
- **Recursos OpenType**: `"lnum"` (numerais alinhados) e `"locl"` (formas localizadas) habilitados em texto de exibição e títulos.

### Hierarquia

| Papel | Fonte | Tamanho | Peso | Altura de Linha | Espaçamento entre Letras | Notas |
|------|------|------|--------|-------------|----------------|-------|
| Exibição Principal | NotionInter | 64px (4.00rem) | 700 | 1.00 (compacto) | -2.125px | Compressão máxima, títulos de outdoor |
| Exibição Secundária | NotionInter | 54px (3.38rem) | 700 | 1.04 (compacto) | -1.875px | Hero secundário, títulos de recursos |
| Título de Seção | NotionInter | 48px (3.00rem) | 700 | 1.00 (compacto) | -1.5px | Títulos de seções de recursos, com `"lnum"` |
| Subtítulo Grande | NotionInter | 40px (2.50rem) | 700 | 1.50 | normal | Títulos de cards, subseções de recursos |
| Subtítulo | NotionInter | 26px (1.63rem) | 700 | 1.23 (compacto) | -0.625px | Subtítulos de seção, cabeçalhos de conteúdo |
| Título de Card | NotionInter | 22px (1.38rem) | 700 | 1.27 (compacto) | -0.25px | Cards de recursos, títulos de lista |
| Corpo Grande | NotionInter | 20px (1.25rem) | 600 | 1.40 | -0.125px | Introduções, descrições de recursos |
| Corpo | NotionInter | 16px (1.00rem) | 400 | 1.50 | normal | Texto de leitura padrão |
| Corpo Médio | NotionInter | 16px (1.00rem) | 500 | 1.50 | normal | Navegação, texto de interface enfatizado |
| Corpo Seminegrito | NotionInter | 16px (1.00rem) | 600 | 1.50 | normal | Rótulos em destaque, estados ativos |
| Corpo Negrito | NotionInter | 16px (1.00rem) | 700 | 1.50 | normal | Títulos em tamanho de corpo |
| Nav / Botão | NotionInter | 15px (0.94rem) | 600 | 1.33 | normal | Links de navegação, texto de botão |
| Legenda | NotionInter | 14px (0.88rem) | 500 | 1.43 | normal | Metadados, rótulos secundários |
| Legenda Leve | NotionInter | 14px (0.88rem) | 400 | 1.43 | normal | Legendas de corpo, descrições |
| Badge | NotionInter | 12px (0.75rem) | 600 | 1.33 | 0.125px | Badges em pílula, tags, rótulos de status |
| Micro Rótulo | NotionInter | 12px (0.75rem) | 400 | 1.33 | 0.125px | Metadados pequenos, timestamps |

### Princípios
- **Compressão em escala**: NotionInter em tamanhos de exibição usa -2.125px de espaçamento entre letras a 64px, relaxando progressivamente para -0.625px a 26px e normal a 16px. A compressão cria densidade nos títulos enquanto mantém a legibilidade em tamanhos de corpo.
- **Sistema de quatro pesos**: 400 (corpo/leitura), 500 (interface/interativo), 600 (ênfase/navegação), 700 (títulos/exibição). O intervalo de pesos mais amplo em comparação com a maioria dos sistemas permite hierarquia matizada.
- **Escala quente**: A altura de linha diminui à medida que o tamanho aumenta — 1.50 no corpo (16px), 1.23-1.27 nos subtítulos, 1.00-1.04 na exibição. Isso cria títulos mais densos e impactantes.
- **Micro-rastreamento de badge**: O texto de badge de 12px usa espaçamento positivo entre letras (0.125px) — o único rastreamento positivo no sistema, criando texto pequeno mais amplo e legível.

## 4. Estilos de Componentes

### Botões

**Azul Primário**
- Fundo: `#0075de` (Azul Notion)
- Texto: `#ffffff`
- Padding: 8px 16px
- Raio: 4px (sutil)
- Borda: `1px solid transparent`
- Hover: fundo escurece para `#005bab`
- Ativo: transformação scale(0.9)
- Foco: contorno `2px solid`, sombra `var(--shadow-level-200)`
- Uso: CTA principal ("Experimente o Notion grátis", "Começar")

**Secundário / Terciário**
- Fundo: `rgba(0,0,0,0.05)` (cinza quente translúcido)
- Texto: `#000000` (quase preto)
- Padding: 8px 16px
- Raio: 4px
- Hover: cor do texto muda, scale(1.05)
- Ativo: transformação scale(0.9)
- Uso: Ações secundárias, envios de formulários

**Fantasma / Botão Link**
- Fundo: transparente
- Texto: `rgba(0,0,0,0.95)`
- Decoração: sublinhado ao passar o cursor
- Uso: Ações terciárias, links em linha

**Botão Badge em Pílula**
- Fundo: `#f2f9ff` (azul matizado)
- Texto: `#097fe8`
- Padding: 4px 8px
- Raio: 9999px (pílula completa)
- Fonte: 12px peso 600
- Uso: Badges de status, rótulos de recursos, tags "Novo"

### Cards e Contêineres
- Fundo: `#ffffff`
- Borda: `1px solid rgba(0,0,0,0.1)` (borda sussurro)
- Raio: 12px (cards padrão), 16px (cards em destaque/hero)
- Sombra: `rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`
- Hover: intensificação sutil da sombra
- Cards com imagem: raio superior de 12px, imagem preenche a metade superior

### Inputs e Formulários
- Fundo: `#ffffff`
- Texto: `rgba(0,0,0,0.9)`
- Borda: `1px solid #dddddd`
- Padding: 6px
- Raio: 4px
- Foco: anel de contorno azul
- Placeholder: cinza quente `#a39e98`

### Navegação
- Nav horizontal limpa sobre fundo branco, não fixo
- Logo da marca alinhado à esquerda (ícone 33x34px + wordmark)
- Links: NotionInter 15px peso 500-600, texto quase preto
- Hover: mudança de cor para `var(--color-link-primary-text-hover)`
- CTA: botão pílula azul ("Experimente o Notion grátis") alinhado à direita
- Mobile: menu recolhível com ícone hambúrguer
- Dropdowns de produto com menus categorizados em múltiplos níveis

### Tratamento de Imagens
- Capturas de tela do produto com borda `1px solid rgba(0,0,0,0.1)`
- Imagens com cantos superiores arredondados: raio `12px 12px 0px 0px`
- Capturas de tela do painel/espaço de trabalho dominam as seções de recursos
- Fundos com gradientes quentes atrás das ilustrações hero (ilustrações de personagens decorativos)

### Componentes Distintos

**Cards de Recursos com Ilustrações**
- Cabeçalhos ilustrativos grandes (A Grande Onda, capturas de tela da interface do produto)
- Card de 12px de raio com borda sussurro
- Título a 22px peso 700, descrição a 16px peso 400
- Variante de fundo branco quente (`#f6f5f4`) para seções alternadas

**Barra de Confiança / Grade de Logos**
- Logos de empresas (seção de equipes de confiança) em suas cores de marca
- Layout de rolagem horizontal ou grade com contagens de equipes
- Exibição de métricas: número grande + padrão de descrição

**Cards de Métricas**
- Exibição de número grande (ex.: "$4.200 de ROI")
- NotionInter 40px+ peso 700 para a métrica
- Descrição abaixo em texto de corpo cinza quente
- Contêiner de card com borda sussurro

## 5. Princípios de Layout

### Sistema de Espaçamento
- Unidade base: 8px
- Escala: 2px, 3px, 4px, 5px, 6px, 7px, 8px, 11px, 12px, 14px, 16px, 24px, 32px
- Escala orgânica não rígida com valores fracionários (5.6px, 6.4px) para microajustes

### Grade e Contêiner
- Largura máxima do conteúdo: aproximadamente 1200px
- Hero: coluna única centralizada com padding superior generoso (80-120px)
- Seções de recursos: grades de 2-3 colunas para cards
- Fundos de seção de largura total em branco quente (`#f6f5f4`) para alternância
- Capturas de tela de código/painel contidas com borda sussurro

### Filosofia do Espaço em Branco
- **Ritmo vertical generoso**: 64-120px entre seções principais. O Notion deixa o conteúdo respirar com padding vertical amplo.
- **Alternância quente**: Seções brancas alternam com seções em branco quente (`#f6f5f4`), criando um ritmo visual suave sem rupturas de cor abruptas.
- **Densidade orientada ao conteúdo**: Blocos de texto do corpo são compactos (altura de linha 1.50), mas rodeados de margens amplas, criando ilhas de conteúdo legível em um mar de espaço em branco.

### Escala de Raio de Borda
- Micro (4px): Botões, inputs, elementos interativos funcionais
- Sutil (5px): Links, itens de lista, itens de menu
- Padrão (8px): Cards pequenos, contêineres, elementos em linha
- Confortável (12px): Cards padrão, contêineres de recursos, topos de imagens
- Grande (16px): Cards hero, conteúdo em destaque, blocos promocionais
- Pílula completa (9999px): Badges, pílulas, indicadores de status
- Círculo (100%): Indicadores de aba, avatares

## 6. Profundidade e Elevação

| Nível | Tratamento | Uso |
|-------|-----------|-----|
| Plano (Nível 0) | Sem sombra, sem borda | Fundo da página, blocos de texto |
| Sussurro (Nível 1) | `1px solid rgba(0,0,0,0.1)` | Bordas padrão, contornos de card, divisores |
| Card Suave (Nível 2) | Pilha de sombras de 4 camadas (opacidade máx. 0.04) | Cards de conteúdo, blocos de recursos |
| Card Profundo (Nível 3) | Pilha de sombras de 5 camadas (opacidade máx. 0.05, desfoque 52px) | Modais, painéis em destaque, elementos hero |
| Foco (Acessibilidade) | Contorno `2px solid var(--focus-color)` | Foco de teclado em todos os elementos interativos |

**Filosofia de Sombras**: O sistema de sombras do Notion usa múltiplas camadas com opacidade individual extremamente baixa (0.01 a 0.05) que se acumulam em uma elevação suave e de aparência natural. A sombra de card de 4 camadas abrange de 1.04px a 18px de desfoque, criando um gradiente de profundidade em vez de uma única sombra dura. A sombra profunda de 5 camadas se estende a 52px de desfoque com opacidade 0.05, produzindo oclusão ambiente que parece luz natural em vez de profundidade gerada por computador. Essa abordagem em camadas faz com que os elementos pareçam integrados na página em vez de flutuando sobre ela.

### Profundidade Decorativa
- Seção hero: ilustrações de personagens decorativos (estilo lúdico, desenhado à mão)
- Alternância de seções: mudanças de fundo de branco para branco quente (`#f6f5f4`)
- Sem bordas duras de seção — a separação vem de mudanças de cor de fundo e espaçamento

## 7. Comportamento Responsivo

### Breakpoints
| Nome | Largura | Mudanças Principais |
|------|-------|-------------|
| Mobile Pequeno | <400px | Coluna única compacta, padding mínimo |
| Mobile | 400-600px | Mobile padrão, layout empilhado |
| Tablet Pequeno | 600-768px | Grades de 2 colunas começam |
| Tablet | 768-1080px | Grades de cards completas, padding expandido |
| Desktop Pequeno | 1080-1200px | Layout de desktop padrão |
| Desktop | 1200-1440px | Layout completo, largura máxima de conteúdo |
| Desktop Grande | >1440px | Centralizado, margens generosas |

### Alvos de Toque
- Botões usam padding confortável (8px-16px vertical)
- Links de navegação a 15px com espaçamento adequado
- Badges em pílula têm 8px de padding horizontal para áreas de toque
- Botão de menu mobile usa o botão hambúrguer padrão

### Estratégia de Colapso
- Hero: exibição de 64px -> reduz para 40px -> 26px no mobile, mantém espaçamento entre letras proporcional
- Navegação: links horizontais + CTA azul -> menu hambúrguer
- Cards de recursos: 3 colunas -> 2 colunas -> coluna única empilhada
- Capturas de tela do produto: mantêm proporção com imagens responsivas
- Logos da barra de confiança: grade -> rolagem horizontal no mobile
- Rodapé: múltiplas colunas -> coluna única empilhada
- Espaçamento de seção: 80px+ -> 48px no mobile

### Comportamento de Imagens
- Capturas de tela do espaço de trabalho mantêm a borda sussurro em todos os tamanhos
- Ilustrações hero escalam proporcionalmente
- Capturas de tela do produto usam imagens responsivas com raio de borda consistente
- Seções de branco quente de largura total mantêm o tratamento de borda a borda

## 8. Acessibilidade e Estados

### Sistema de Foco
- Todos os elementos interativos recebem indicadores de foco visíveis
- Contorno de foco: `2px solid` com cor de foco + nível de sombra 200
- Navegação por teclado suportada em todos os componentes interativos
- Texto de alto contraste: quase preto sobre branco ultrapassa WCAG AAA (relação >14:1)

### Estados Interativos
- **Padrão**: Aparência padrão com bordas sussurro
- **Hover**: Mudança de cor no texto, scale(1.05) nos botões, sublinhado nos links
- **Ativo/Pressionado**: Transformação scale(0.9), variante de fundo mais escuro
- **Foco**: Anel de contorno azul com reforço de sombra
- **Desabilitado**: Texto em cinza quente (`#a39e98`), opacidade reduzida

### Contraste de Cores
- Texto principal (rgba(0,0,0,0.95)) sobre branco: relação ~18:1
- Texto secundário (#615d59) sobre branco: relação ~5.5:1 (WCAG AA)
- CTA azul (#0075de) sobre branco: relação ~4.6:1 (WCAG AA para texto grande)
- Texto de badge (#097fe8) sobre fundo de badge (#f2f9ff): relação ~4.5:1 (WCAG AA para texto grande)

## 9. Guia de Prompts para Agentes

### Referência Rápida de Cores
- CTA principal: Azul Notion (`#0075de`)
- Fundo: Branco puro (`#ffffff`)
- Fundo alternativo: Branco quente (`#f6f5f4`)
- Texto de título: Quase preto (`rgba(0,0,0,0.95)`)
- Texto de corpo: Quase preto (`rgba(0,0,0,0.95)`)
- Texto secundário: Cinza quente 500 (`#615d59`)
- Texto discreto: Cinza quente 300 (`#a39e98`)
- Borda: `1px solid rgba(0,0,0,0.1)`
- Link: Azul Notion (`#0075de`)
- Anel de foco: Azul foco (`#097fe8`)

### Exemplos de Prompts para Componentes
- "Crie uma seção hero sobre fundo branco. Título a 64px NotionInter peso 700, line-height 1.00, letter-spacing -2.125px, color rgba(0,0,0,0.95). Subtítulo a 20px peso 600, line-height 1.40, color #615d59. Botão CTA azul (#0075de, raio 4px, padding 8px 16px, texto branco) e botão fantasma (fundo transparente, texto quase preto, sublinhado no hover)."
- "Crie um card: fundo branco, borda 1px solid rgba(0,0,0,0.1), raio 12px. Use pilha de sombras: rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px. Título a 22px NotionInter peso 700, letter-spacing -0.25px. Corpo a 16px peso 400, color #615d59."
- "Construa um badge em pílula: fundo #f2f9ff, texto #097fe8, raio 9999px, padding 4px 8px, 12px NotionInter peso 600, letter-spacing 0.125px."
- "Crie navegação: cabeçalho branco. NotionInter 15px peso 600 para links, texto quase preto. CTA pílula azul 'Experimente o Notion grátis' alinhado à direita (fundo #0075de, texto branco, raio 4px)."
- "Crie um layout de seções alternadas: seções brancas alternam com seções em branco quente (#f6f5f4). Cada seção tem 64-80px de padding vertical, max-width 1200px centralizado. Título de seção a 48px peso 700, line-height 1.00, letter-spacing -1.5px."

### Guia de Iteração
1. Use sempre neutros quentes — os cinzas do Notion têm subtons amarelo-marrons (#f6f5f4, #31302e, #615d59, #a39e98), nunca cinza-azulado
2. O espaçamento entre letras escala com o tamanho da fonte: -2.125px a 64px, -1.875px a 54px, -0.625px a 26px, normal a 16px
3. Quatro pesos: 400 (leitura), 500 (interação), 600 (ênfase), 700 (destaque)
4. Bordas são sussurros: 1px solid rgba(0,0,0,0.1) — nunca mais pesadas
5. Sombras usam 4-5 camadas com opacidade individual que nunca ultrapassa 0.05
6. O fundo de seção em branco quente (#f6f5f4) é essencial para o ritmo visual
7. Badges em pílula (9999px) para status/tags, raio 4px para botões e inputs
8. Azul Notion (#0075de) é a única cor saturada na interface principal — use com parcimônia para CTAs e links
