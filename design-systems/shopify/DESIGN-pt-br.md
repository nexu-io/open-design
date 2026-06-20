# Sistema de Design Inspirado na Shopify

> Category: E-Commerce & Varejo
> Plataforma de e-commerce. Cinematográfica com fundo escuro, acento verde-neon, tipografia ultra-leve.

## 1. Tema Visual & Atmosfera

Shopify.com é um teatro digital de fundo escuro — um site que apresenta sua plataforma de comércio como uma estreia cinematográfica. Toda a experiência se desenrola sobre um abismo de superfícies quase-negras que carregam o mais suave sussurro de verde-floresta profundo (`#02090A`, `#061A1C`, `#102620`), criando uma atmosfera noturna que parece menos uma página de marketing SaaS e mais um lançamento exclusivo de produto em uma keynote de tecnologia. Essa escuridão não é fria nem corporativa — é o escuro aconchegante e envolvente de uma experiência de luxo, como sentar na primeira fila de um auditório às escuras.

A tipografia é a estrela inegável. NeueHaasGrotesk — uma refinada descendente da Helvetica — aparece em escala monumental (96px) com peso impossibilitado de leve (330-400), criando títulos que parecem gravados em luz em vez de impressos em tinta. O recurso OpenType `ss03` confere às letras um caráter distintivo que separa a tipografia da Shopify do uso genérico da Helvetica. Abaixo da camada de exibição, Inter Variable trata o corpo do texto com precisão cirúrgica, usando pesos variáveis igualmente incomuns (420, 450, 550) que habitam os espaços entre as paradas de peso tradicionais. Essa precisão sinaliza uma empresa que se preocupa com cada detalhe.

A cor é usada com extrema contenção. O acento primário é o Verde-Neon Shopify (`#36F4A4`) — uma menta elétrica que aparece exclusivamente em anéis de foco e destaques de acento, pulsando como um sinal bioluminescente contra a tela escura. Tonalidades de verde mais suaves (Aloe `#C1FBD4`, Pistache `#D4F9E0`) proporcionam lavagens atmosféricas. O branco é a única cor de texto que importa em superfícies escuras, enquanto uma escala neutra baseada em zinco (`#A1A1AA` a `#3F3F46`) gerencia a hierarquia de informações discretas. O resultado é um design que faz a tecnologia de comércio parecer que pertence a um futuro de ficção científica.

**Características Principais:**
- Design de fundo escuro com subtons verde-azulado profundo de floresta (não preto puro)
- Tipografia de exibição ultra-leve (peso 330) em escala monumental (96px) criando uma presença etérea
- Verde-Neon (`#36F4A4`) como o acento de alta energia singular contra a escuridão
- Botões em pílula completa (raio 9999px) como forma interativa primária
- Sombras de caixa em camadas e múltiplos estágios criando profundidade fotográfica
- Capturas de tela do produto incorporadas em contextos de UI escura, combinando com a escuridão circundante
- Escala neutra baseada em zinco para hierarquia de texto — equilibrada entre quente e frio

## 2. Paleta de Cores & Funções

### Primária

- **Shopify Branco** (`#FFFFFF`): Texto primário em superfícies escuras, preenchimentos de botão, elementos de alto contraste
- **Shopify Preto** (`#000000`): Plano de fundo do corpo, texto de botão em branco, base de contraste máximo (--color-shade-100)

### Secundária & Acento

- **Verde-Neon** (`#36F4A4`): O acento característico — anéis de foco, destaques interativos, indicadores de estado ativo. Elétrico e bioluminescente
- **Aloe** (`#C1FBD4`): Lavagem verde suave para fundos decorativos, cards atmosféricos (--color-aloe-10)
- **Pistache** (`#D4F9E0`): Tonalidade de verde mais clara para diferenciação sutil de superfície (--color-pistachio-10)

### Superfície & Fundo

- **Vazio** (`#000000`): Plano de fundo raiz da página — preto verdadeiro para profundidade máxima
- **Verde-Azulado Profundo** (`#02090A`): Superfícies de cards, contêineres de conteúdo — quase-preto com subtom verde
- **Floresta Escura** (`#061A1C`): Fundos de seção com caráter verde visível
- **Floresta** (`#102620`): Superfícies escuras elevadas, fundos de cabeçalho — a tonalidade escura mais quente
- **Borda de Card Escuro** (`#1E2C31`): Bordas de cards em superfícies escuras, definição sutil de limite

### Neutros & Texto (Escala Zinco)

- **Shade-30** (`#D4D4D8`): Neutro mais claro, bordas quase imperceptíveis no escuro (--color-shade-30)
- **Texto Suave** (`#A1A1AA`): Texto secundário, metadados, descrições — a voz discreta
- **Shade-50** (`#71717A`): Texto terciário, marcadores de tempo, informação menos importante (--color-shade-50)
- **Shade-60** (`#52525B`): Texto desabilitado, neutros decorativos (--color-shade-60)
- **Shade-70** (`#3F3F46`): Divisores sutis, limites de UI quase invisíveis (--color-shade-70)
- **Borda Clara** (`#E4E4E7`): Bordas em superfícies claras (raro — apenas em modais de modo claro)

### Semântica & Acento

- **Link Suave** (`#9797A2`): Texto de link suave com decoração de sublinhado
- **Link Sálvia** (`#9DABAD`): Links suaves com tonalidade verde-azulada
- **Link Lavanda** (`#BDBDCA`): Variante de link mais clara
- **Link Menta** (`#99B3AD`): Variante de link com tonalidade verde para seções temáticas

### Sistema de Gradiente

- **Lavagem Verde-Azulado Escuro**: Gradiente radial de centro `#102620` para borda `#02090A` — usado atrás de apresentações de produto
- **Atmosférico Verde**: Gradientes ambientes sutis com tonalidade verde atrás das seções hero, criando profundidade sem cores sólidas
- **Holofote**: Área brilhante e focada desvanecendo para o preto — cria iluminação de apresentação estilo keynote

## 3. Regras Tipográficas

### Família de Fontes

**Display:** NeueHaasGrotesk (descendente refinada da Helvetica, fonte variável)
- Substituições: Helvetica, Arial, sans-serif
- Recursos OpenType: `ss03` (conjunto estilístico 3 — alternativas de letterform distintivas)
- Pesos disponíveis: 330, 360, 400, 500, 750 (variável)
- Usado para todos os títulos, texto hero e elementos de grande exibição

**Corpo:** Inter-Variable
- Substituições: Helvetica, Arial, sans-serif
- Recursos OpenType: `ss03`
- Pesos disponíveis: 400, 420, 450, 500, 550 (variável)
- Usado para texto de corpo, links, botões, elementos de UI

**Mono:** ui-monospace
- Substituições: SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New
- Usado para trechos de código, rótulos de dados, conteúdo técnico

### Hierarquia

| Função | Tamanho | Peso | Altura de Linha | Espaçamento de Letras | Notas |
|------|------|--------|-------------|----------------|-------|
| Display XL | 96px | 400 | 1.00 | — | NeueHaasGrotesk, títulos hero, "ss03" |
| Display XL Bold | 90.74px | 750 | 1.00 | 4.54px | NeueHaasGrotesk, display de ênfase |
| Display XL Tracked | 96px | 400 | 1.00 | 2.4px | NeueHaasGrotesk, display espaçado |
| Display Light | 96px | 330 | 0.96 | — | NeueHaasGrotesk, display etéreo |
| Heading 1 | 70px | 330 | 1.00 | — | NeueHaasGrotesk, títulos de seção |
| Heading 2 | 55px | 330 | 1.16 | — | NeueHaasGrotesk, subseções |
| Heading 3 | 48px | 330 | 1.14 | — | NeueHaasGrotesk, títulos de funcionalidade |
| Heading 4 | 32px | 360 | 1.14 | 0.32px | NeueHaasGrotesk, títulos de card |
| Heading 5 | 28px | 500 | 1.28 | 0.42px | NeueHaasGrotesk, títulos pequenos |
| Heading 6 | 24px | 400 | 1.14 | 0.36px | NeueHaasGrotesk, títulos menores |
| Body Large | 20px | 500 | 1.40 | 0.3px | NeueHaasGrotesk / Inter, parágrafos de abertura |
| Body | 18px | 400 | 1.56 | — | Inter-Variable, corpo padrão |
| Body Medium | 18px | 550 | 1.56 | — | Inter-Variable, corpo enfatizado |
| Body Small | 16px | 400 | 1.50 | — | Inter / NeueHaasGrotesk, corpo compacto |
| Body Small Medium | 16px | 420 | 1.50 | — | Inter-Variable, levemente enfatizado |
| Button | 16px | 400 | 1.50 | — | NeueHaasGrotesk, texto de CTA |
| Nav Link | 18px | 500 | 1.25 | 0.72px | NeueHaasGrotesk, itens de navegação |
| Caption | 14px | 500 | 1.49 | 0.28px | NeueHaasGrotesk / Inter, metadados |
| Caption Medium | 14px | 550 | 1.49 | 0.28px | Inter-Variable, legenda enfatizada |
| Overline | 15.36px | 400 | 1.50 | 1.54px | NeueHaasGrotesk, rótulos com rastreamento amplo |
| Micro | 13px | 500 | 1.50 | -0.13px | Inter, texto pequeno com rastreamento apertado |
| Label | 12px | 400 | 1.20 | 0.72px | Inter, rótulos em maiúsculas |
| Code | 16px | 400 | 1.50 | — | ui-monospace, maiúsculas, blocos de código |
| Code Small | 12px | 400 | 1.33 | — | ui-monospace, maiúsculas, código inline |

### Princípios

A tipografia da Shopify é uma aula magistral de precisão em fontes variáveis. A camada de exibição vive quase exclusivamente nos pesos 330-400 — texto de pena de ave que parece pairar acima do fundo escuro como luz projetada. Isso é o oposto da abordagem em negrito e pesada que a maioria dos sites SaaS adota: onde outros gritam, a Shopify sussurra em escala. Os títulos de 96px no peso 330 criam um paradoxo de tamanho enorme e traço delicado que parece ao mesmo tempo monumental e frágil. O recurso OpenType `ss03` ativa um conjunto estilístico que confere a caracteres específicos (provavelmente 'a', 'g' e certos numerais) uma aparência mais refinada, distinguindo a tipografia da Shopify do uso padrão de Helvetica Neue. Inter Variable trata a camada de corpo com precisão cirúrgica, usando pesos como 420 e 550 que existem entre as paradas tradicionais — cada parte do texto tem exatamente o peso visual de que precisa.

## 4. Estilizações de Componentes

### Botões

**Primário (Preenchimento Branco)**
- Plano de fundo: Branco (`#FFFFFF`)
- Texto: Preto (`#000000`)
- Borda: 2px sólida transparente
- Raio da borda: pílula completa (9999px)
- Preenchimento: 12px 26px 12px 16px (assimétrico — mais preenchimento à direita para equilíbrio visual)
- Hover: leve redução de opacidade ou mudança de plano de fundo
- Foco: anel de contorno `#36F4A4` (Verde-Neon) de 2px
- Transição: all 200ms ease

**Secundário (Ghost/Contornado)**
- Plano de fundo: transparente
- Texto: Branco (`#FFFFFF`)
- Borda: 2px sólida Branco (`#FFFFFF`)
- Raio da borda: pílula completa (9999px)
- Preenchimento: 12px 26px 12px 16px
- Hover: preenche com plano de fundo branco e texto preto
- Foco: contorno `#36F4A4` de 2px

**Badge/Tag (Neutro Preenchido)**
- Plano de fundo: `rgba(255, 255, 255, 0.2)` (vidro fosco)
- Texto: Branco (`#FFFFFF`)
- Borda: nenhuma
- Raio da borda: levemente arredondado (4px)
- Preenchimento: 12px 16px
- Fonte: 16px regular

### Cards & Contêineres

- Plano de fundo: Verde-Azulado Profundo (`#02090A`) em páginas escuras
- Borda: 1px sólida `#1E2C31` (Borda de Card Escuro) — limite quase invisível
- Raio da borda: 8px para cards padrão, 12px para cards em destaque, 20px 20px 0 0 para cards arredondados no topo
- Sombra: Sistema de múltiplas camadas:
  - Descanso: `rgba(0,0,0,0.1) 0px 0px 0px 1px, rgba(0,0,0,0.1) 0px 2px 2px, rgba(0,0,0,0.1) 0px 4px 4px, rgba(0,0,0,0.1) 0px 8px 8px` + `rgba(255,255,255,0.03) 0px 1px 0px inset`
  - O destaque branco inset cria um brilho sutil na borda superior
- Hover: sombra se expande, card pode clarear levemente
- Transição: box-shadow 300ms ease, transform 200ms ease

### Inputs & Formulários

- Plano de fundo: transparente ou Floresta Escura (`#061A1C`)
- Texto: Branco (`#FFFFFF`)
- Borda: 1px sólida `#3F3F46` (Shade-70)
- Raio da borda: 8px
- Preenchimento: 12px 16px
- Foco: 2px sólida `#36F4A4` (anel de foco Verde-Neon)
- Placeholder: Shade-50 (`#71717A`)
- Transição: border-color 200ms ease

### Navegação

- Plano de fundo: transparente (sobreposto ao hero escuro), torna-se Floresta (`#102620`) ao rolar
- Altura: ~64px
- Esquerda: logotipo wordmark Shopify (SVG, branco sobre escuro)
- Centro/Direita: links de navegação em 18px/500 NeueHaasGrotesk, branco, letter-spacing 0.72px
- CTA: Botão pílula branco "Start for free" (direita)
- CTA Secundário: Botão ghost com borda branca
- Hover: links mudam para Texto Suave (`#A1A1AA`) ou ganham sublinhado
- Mobile: menu hambúrguer, sobreposição escura em tela cheia
- Transição: background 300ms ease ao rolar

### Tratamento de Imagem

- Capturas de tela do produto: incorporadas em contextos de UI escura, combinando com a escuridão circundante
- Prévias de interface de administração: exibidas em fundos escuros com bordas de card sutis
- Proporções: variadas — imagens hero são largas (aproximadamente 16:9), imagens de funcionalidade são flexíveis
- Todas as imagens ficam niveladas dentro de contêineres escuros — sem bordas ou molduras brilhantes
- Carregamento lento com superfícies de placeholder escuros

### Indicadores de Confiança

- Estatísticas exibidas com destaque: "15+" (anos), "150M+" (compradores)
- Números em escala de display em NeueHaasGrotesk
- Seções de destaque do ecossistema de parceiros/desenvolvedores
- Depoimentos com tema escuro integrados ao fluxo da página

## 5. Princípios de Layout

### Sistema de Espaçamento

Unidade base: 8px

| Token | Valor | Uso |
|-------|-------|-----|
| space-1 | 4px | Espaços inline apertados |
| space-2 | 8px | Unidade base, espaços de ícone |
| space-3 | 12px | Preenchimento de card, margens apertadas |
| space-4 | 16px | Preenchimento padrão de elemento |
| space-5 | 24px | Espaços de card, preenchimento de seção |
| space-6 | 28px | Espaçamento médio de seção |
| space-7 | 32px | Quebras de seção |
| space-8 | 36px | Preenchimento grande |
| space-9 | 40px | Preenchimento de seção principal |
| space-10 | 64px | Preenchimento de seção hero, grandes espaços |

### Grade & Contêiner

- Largura máxima do contêiner: ~1280px (centralizado)
- Hero: largura total, fundo escuro de borda a borda com texto centralizado
- Seções de funcionalidade: layouts de 2 colunas com texto e capturas de tela do produto
- Seções de estatísticas: layout horizontal com números grandes
- Preenchimento horizontal: 64px desktop, 32px tablet, 16px mobile
- Espaço de grade: 24-32px entre blocos de conteúdo principais

### Filosofia de Espaço em Branco

A estratégia de espaço em branco da Shopify é teatral. As seções são separadas por vastas extensões de espaço escuro — 80px a 120px de espaço de respiração de preto puro — que criam o ritmo de uma apresentação, não de uma página da web. Cada bloco de conteúdo é seu próprio "slide" em uma rolagem estilo keynote. Dentro das seções, o espaçamento é mais apertado e deliberado, criando densidade focal contra o vazio expansivo. O contraste entre o vazio no nível macro e a precisão no nível micro é o que dá ao site sua cadência cinematográfica.

### Escala de Raio de Borda

| Valor | Contexto |
|-------|---------|
| 4px | Tags, badges, microelementos |
| 8px | Cards padrão, inputs, contêineres de vídeo |
| 12px | Cards em destaque, contêineres de imagem, botões (não-pílula) |
| 20px | Cards arredondados no topo (20px 20px 0 0), cabeçalhos de modal |
| 340px | Grandes elementos decorativos arredondados |
| 9999px | Botões pílula, badges pílula, elementos de navegação |

## 6. Profundidade & Elevação

| Nível | Tratamento | Uso |
|-------|-----------|-----|
| Base | Sem sombra, superfície escura | Plano de fundo padrão da página |
| Sutil | `rgba(0,0,0,0.1) 0px 0px 0px 1px` + brilho branco inset | Cards em descanso |
| Médio | Multicamada: anel 1px + sombra 2px + 4px + 8px | Cards elevados, seções em destaque |
| Alto | `rgba(0,0,0,0.25) 0px 25px 50px -12px` | Modais, dropdowns, sobreposições |
| Foco | `0px 0px 0px 2px #36F4A4` | Anel de foco por teclado (Verde-Neon) |

O sistema de sombras da Shopify é inusitadamente sofisticado. Em vez de sombras de valor único, os cards usam uma abordagem em camadas e múltiplas camadas: um anel de 1px para definição de limite, desfocagens progressivas de 2px/4px/8px para queda de luz natural e um delicado brilho branco inset (`rgba(255,255,255,0.03)`) que simula uma superfície de vidro iluminada pelo topo. Em fundos escuros, as sombras escurecem a partir de superfícies já escuras, então as sombras funcionam mais como "oclusão ambiente" do que elevação tradicional — o card parece afundar levemente na superfície em vez de flutuar acima dela.

### Profundidade Decorativa

- **Gradientes verde-azulado escuro**: Lavagens radiais ambientes atrás das seções hero e apresentações de produto
- **Efeitos de holofote**: Áreas brilhantes centralizadas desvanecendo para o preto, criando iluminação teatral estilo keynote
- **Brilho de borda**: Bordas de cor clara sutis em cards escuros via box-shadow inset
- **Halos atmosféricos verdes**: Tonalidades verdes tênues em gradientes de fundo, ecoando o acento da marca

## 7. O Que Fazer e O Que Não Fazer

### Fazer

- Usar a hierarquia de superfície verde-azulado-preto escuro (Vazio → Verde-Azulado Profundo → Floresta Escura → Floresta) para profundidade
- Manter a tipografia de display no peso 330-400 — a leveza etérea é a assinatura do design
- Usar Verde-Neon (`#36F4A4`) exclusivamente para estados de foco e destaques de acento críticos
- Aplicar raio 9999px a todos os botões CTA primários — a pílula completa é inegociável
- Usar o sistema de sombras em múltiplas camadas para elevação de card — sombras simples parecem planas
- Manter o recurso OpenType `ss03` em todo o texto — faz parte da identidade tipográfica
- Usar Inter Variable para texto de corpo e NeueHaasGrotesk para títulos — nunca misturar seus papéis
- Criar espaçamento teatral entre seções (80px+) para ritmo cinematográfico

### Não Fazer

- Não usar preto puro (#000000) para texto em fundos escuros — usar apenas branco (#FFFFFF)
- Não introduzir cores quentes (laranja, vermelho, amarelo) — a paleta é estritamente fria (verdes, azulados, neutros)
- Não usar pesos de fonte acima de 500 para texto de corpo NeueHaasGrotesk — pesos pesados quebram a sensação etérea
- Não aplicar acentos verdes a grandes superfícies — Verde-Neon é para destaques pequenos e precisos apenas
- Não usar cantos afiados (raio 0px) em elementos interativos — tudo arredonda
- Não adicionar fundos claros — o tema escuro é fundamental, não opcional
- Não usar box-shadows de camada única — a abordagem em pilha é o sistema
- Não definir line-height acima de 1.56 para texto de corpo — o texto da Shopify é relativamente compacto
- Não misturar NeueHaasGrotesk e Inter no mesmo tamanho/função — suas escalas de peso diferem
- Não usar letter-spacing abaixo de 0 para títulos — os títulos da Shopify têm rastreamento neutro ou positivo

## 8. Comportamento Responsivo

### Breakpoints

| Nome | Largura | Mudanças Principais |
|------|-------|-------------|
| Mobile | <640px | Coluna única, navegação hambúrguer, texto de display escala para 48px, preenchimento 16px |
| Tablet | 640-1024px | Grades de 2 colunas começam, texto de display em 70px, preenchimento 32px |
| Desktop | 1024-1440px | Layout completo, navegação expandida, display 96px, preenchimento 64px |
| Desktop Grande | >1440px | Contêiner de largura máxima centralizado, espaçamento de seção aumentado |

### Alvos de Toque

- Alvo de toque mínimo: 44x44px (WCAG AAA)
- Botões pílula: altura mínima de 48px com preenchimento horizontal generoso
- Links de navegação: área de toque 44px
- Superfícies de card: card inteiro é tocável onde vinculado

### Estratégia de Colapso

- **Navegação**: Links horizontais completos → menu hambúrguer abaixo de 1024px; logotipo e botão CTA permanecem visíveis
- **Seção hero**: display 96px → 70px no tablet → 48px no mobile; mantém alinhamento central de coluna única
- **Seções de funcionalidade**: texto+imagem em 2 colunas → coluna única empilhada abaixo de 768px
- **Estatísticas**: Fileira horizontal → vertical empilhada no mobile
- **Preenchimento de seção**: 64px → 40px → 24px → 16px conforme o viewport diminui
- **Cards**: Grade → pilha, mantendo largura total no mobile

### Comportamento de Imagem

- Capturas de tela do produto: responsivas dentro de contêineres escuros, mantêm proporção
- Imagens hero: largura total em todos os breakpoints, carregadas preguiçosamente com placeholders escuros
- Prévias de UI de administração: escalam proporcionalmente, podem ser cortadas no mobile
- Todas as imagens usam CDN (`cdn.shopify.com`) com srcset responsivo

## 9. Guia de Prompt para Agente

### Referência Rápida de Cores

- CTA primário: Shopify Branco (`#FFFFFF`)
- Plano de fundo da página: Preto Vazio (`#000000`)
- Superfície de card: Verde-Azulado Profundo (`#02090A`)
- Fundo de seção: Floresta Escura (`#061A1C`)
- Fundo elevado: Floresta (`#102620`)
- Acento: Verde-Neon (`#36F4A4`)
- Texto de corpo: Branco (`#FFFFFF`)
- Texto suave: Suave (`#A1A1AA`)
- Borda escura: Borda de Card Escuro (`#1E2C31`)

### Exemplos de Prompts de Componente

- "Crie uma seção hero em fundo preto verdadeiro (#000000) com um título NeueHaasGrotesk de 96px/330 em branco, subtítulo 20px/500 em #A1A1AA e dois botões pílula: preenchimento branco (raio 9999px) e ghost com borda branca de 2px"
- "Projete um card de funcionalidade em Verde-Azulado Profundo (#02090A) com borda 1px #1E2C31, raio 12px, sombra multicamada (anel 1px + desfoque 2px/4px/8px a 10% preto), contendo um título branco 32px/360 e texto de corpo #A1A1AA 18px/400"
- "Construa uma seção de estatísticas em Floresta Escura (#061A1C) com números brancos 96px/750 (NeueHaasGrotesk), rótulos descritivos #A1A1AA 16px/400 e espaçamento generoso de 64px entre blocos de estatísticas"
- "Crie uma navegação fixa com fundo transparente (torna-se #102620 ao rolar), logotipo Shopify branco à esquerda, links de navegação brancos 18px/500 com letter-spacing 0.72px e um botão pílula branco 'Start for free' à direita"
- "Projete uma tag/badge com fundo de vidro fosco rgba(255,255,255,0.2), raio 4px, preenchimento 12px 16px, texto branco 16px — flutuando sobre uma superfície de card escuro"

### Guia de Iteração

Ao refinar telas existentes geradas com este sistema de design:
1. Foque em UM componente por vez
2. Referencie nomes de cores específicos e códigos hex deste documento
3. Lembre-se: este é um design DE FUNDO ESCURO — superfícies claras são a exceção, não a regra
4. O texto de display deve sempre parecer leve como pena (peso 330-400) — se parecer pesado, reduza o peso
5. Verde-Neon (#36F4A4) é precioso — use com moderação apenas para foco e acento
6. A hierarquia de superfície escura (preto → verde-azulado profundo → floresta escura → floresta) cria profundidade sutil
7. As sombras são em múltiplas camadas — um único valor `box-shadow` não capturará a sensação de card Shopify
8. O recurso OpenType `ss03` deve estar ativo em todo o texto para consistência tipográfica
