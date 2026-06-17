# Design System Inspirado na Uber

> Categoria: Mídia & Consumidor
> Plataforma de mobilidade. Preto e branco marcante, tipografia precisa, energia urbana.

## 1. Tema Visual & Atmosfera

A linguagem de design da Uber é uma aula magistral de minimalismo confiante — um universo em preto e branco onde cada pixel tem um propósito e nada decora sem justificar sua presença. Toda a experiência é construída sobre uma dualidade marcante: preto absoluto (`#000000`) e branco puro (`#ffffff`), com praticamente nenhum cinza intermediário diluindo a mensagem. Não é o minimalismo estéril de uma startup que ainda não terminou de se desenvolver — é a contenção deliberada de uma marca tão consolidada que pode se dar ao luxo de sussurrar.

A tipografia exclusiva UberMove é uma sans-serif geométrica proprietária com uma qualidade visivelmente quadrada e técnica. Títulos em UberMove Bold a 52px carregam o peso de um outdoor — autoritários, diretos, sem desculpas. A família complementar UberMoveText cuida do corpo de texto e botões com um caráter ligeiramente mais suave e legível no peso médio (500). Juntas, criam um sistema tipográfico que parece um mapa de transporte: claro, eficiente, construído para leitura rápida.

O que torna o design da Uber verdadeiramente distintivo é o uso de fotografias e ilustrações em tela cheia, combinadas com elementos interativos em forma de pílula (border-radius de 999px). Chips de navegação, botões de CTA e seletores de categoria compartilham essa forma em cápsula, criando uma linguagem de interface tátil e amigável ao polegar que é inconfundivelmente Uber. As ilustrações — cenas levemente estilizadas de motoristas, passageiros e paisagens urbanas — injetam humanidade no que poderia ser um sistema frio e monocromático. O site alterna entre seções de conteúdo brancas e um rodapé totalmente preto, com layouts baseados em cartões que usam sombras da mais suave possível (rgba(0,0,0,0.12-0.16)) para criar uma elevação sutil sem romper a estética flat.

**Características Principais:**
- Base em preto e branco puro, com praticamente nenhum cinza intermediário no cromo da interface
- UberMove (títulos) + UberMoveText (corpo/UI) — família proprietária de sans-serif geométrica
- Tudo em forma de pílula: botões, chips e itens de navegação usam border-radius de 999px
- Ilustrações quentes e humanas contrastando com a interface monocromática marcante
- Layout baseado em cartões com sombras ultra-suaves (opacidade 0.12-0.16)
- Grade de espaçamento de 8px com layouts compactos e ricos em informação
- Fotografia marcante integrada como fundo de herói em tela cheia
- Rodapé preto ancorando a página em um ambiente escuro e de alto contraste

## 2. Paleta de Cores & Funções

### Primárias
- **Uber Black** (`#000000`): A cor de marca definidora — usada para botões primários, títulos, texto de navegação e o rodapé. Não é "quase preto" nem "preto suave", mas o preto verdadeiro e intransigente.
- **Pure White** (`#ffffff`): A cor de superfície primária e texto inverso. Usada para fundos de página, superfícies de cartão e texto em elementos pretos.

### Estados Interativos & de Botão
- **Hover Gray** (`#e2e2e2`): Estado de hover do botão branco — um cinza claro e limpo que fornece feedback claro sem calor visual.
- **Hover Light** (`#f3f3f3`): Hover sutil para botões brancos elevados — cinza quase imperceptível para feedback de interação delicado.
- **Chip Gray** (`#efefef`): Fundo para botões secundários/filtros e chips de navegação — cinza neutro e ultra-claro.

### Texto & Conteúdo
- **Body Gray** (`#4b4b4b`): Texto secundário e links de rodapé — cinza intermediário neutro, sem viés quente ou frio.
- **Muted Gray** (`#afafaf`): Texto terciário, links de rodapé de menor ênfase e conteúdo de placeholder.

### Bordas & Separação
- **Border Black** (`#000000`): Bordas finas de 1px para contenção estrutural — usadas com moderação em divisores e contêineres de formulário.

### Sombras & Profundidade
- **Shadow Light** (`rgba(0, 0, 0, 0.12)`): Elevação padrão de cartão — elevação levíssima para cartões de conteúdo.
- **Shadow Medium** (`rgba(0, 0, 0, 0.16)`): Elevação ligeiramente mais forte para botões de ação flutuantes e sobreposições.
- **Button Press** (`rgba(0, 0, 0, 0.08)`): Sombra interna para estados ativos/pressionados em botões secundários.

### Estados de Link
- **Default Link Blue** (`#0000ee`): Azul padrão do navegador para links de texto com sublinhado — usado em conteúdo do corpo.
- **Link White** (`#ffffff`): Links em superfícies escuras — usado no rodapé e seções escuras.
- **Link Black** (`#000000`): Links em superfícies claras com decoração de sublinhado.

### Sistema de Gradiente
- O design da Uber é **completamente livre de gradientes**. A dualidade preto/branco e os blocos de cor sólida criam toda a hierarquia visual. Nenhum gradiente aparece em qualquer parte do sistema — toda superfície é uma cor sólida, toda transição é uma aresta dura ou uma sombra.

## 3. Regras Tipográficas

### Família Tipográfica
- **Título / Display**: `UberMove`, com fallbacks: `UberMoveText, system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Corpo / UI**: `UberMoveText`, com fallbacks: `system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`

*Nota: UberMove e UberMoveText são tipografias proprietárias. Para implementações externas, use `system-ui` ou Inter como o substituto mais próximo disponível. O caráter geométrico e de proporções quadradas do UberMove pode ser aproximado com Inter ou DM Sans.*

### Hierarquia

| Função | Fonte | Tamanho | Peso | Altura de Linha | Notas |
|--------|-------|---------|------|-----------------|-------|
| Display / Herói | UberMove | 52px (3.25rem) | 700 | 1.23 (compacto) | Impacto máximo, presença de outdoor |
| Título de Seção | UberMove | 36px (2.25rem) | 700 | 1.22 (compacto) | Âncoras de seções principais |
| Título de Cartão | UberMove | 32px (2rem) | 700 | 1.25 (compacto) | Títulos de cartão e recurso |
| Subtítulo | UberMove | 24px (1.5rem) | 700 | 1.33 | Cabeçalhos de seção secundária |
| Título Pequeno | UberMove | 20px (1.25rem) | 700 | 1.40 | Títulos compactos, títulos de lista |
| Nav / UI Grande | UberMoveText | 18px (1.13rem) | 500 | 1.33 | Links de navegação, texto de UI em destaque |
| Corpo / Botão | UberMoveText | 16px (1rem) | 400-500 | 1.25-1.50 | Texto de corpo padrão, rótulos de botão |
| Legenda | UberMoveText | 14px (0.88rem) | 400-500 | 1.14-1.43 | Metadados, descrições, links pequenos |
| Micro | UberMoveText | 12px (0.75rem) | 400 | 1.67 (relaxado) | Letras pequenas, texto legal |

### Princípios
- **Títulos em negrito, corpo médio**: Os títulos em UberMove são exclusivamente peso 700 (bold) — cada título impacta com força de outdoor. O corpo e o texto de UI em UberMoveText usam 400-500, criando uma hierarquia visual clara por contraste de peso.
- **Altura de linha compacta nos títulos**: Todos os títulos usam alturas de linha entre 1.22-1.40 — compactos e incisivos, projetados para leitura rápida em vez de leitura corrida.
- **Tipografia funcional**: Não existe nenhum tratamento tipográfico decorativo. Sem espaçamento entre letras, sem text-transform, sem dimensionamento ornamental. Cada elemento de texto serve a um propósito de comunicação direto.
- **Duas fontes, funções rígidas**: UberMove é exclusivamente para títulos. UberMoveText é exclusivamente para corpo, botões, links e UI. A fronteira nunca é cruzada.

## 4. Estilos de Componentes

### Botões

**Primário Preto (CTA)**
- Fundo: Uber Black (`#000000`)
- Texto: Pure White (`#ffffff`)
- Padding: 10px 12px
- Radius: 999px (pílula completa)
- Outline: nenhum
- Foco: anel interno `rgb(255,255,255) 0px 0px 0px 2px`
- O botão de ação primária — marcante, alto contraste, inconfundível

**Secundário Branco**
- Fundo: Pure White (`#ffffff`)
- Texto: Uber Black (`#000000`)
- Padding: 10px 12px
- Radius: 999px (pílula completa)
- Hover: fundo muda para Hover Gray (`#e2e2e2`)
- Foco: fundo muda para Hover Gray, anel interno aparece
- Usado em superfícies escuras ou como ação secundária ao lado do Primário Preto

**Chip / Filtro**
- Fundo: Chip Gray (`#efefef`)
- Texto: Uber Black (`#000000`)
- Padding: 14px 16px
- Radius: 999px (pílula completa)
- Ativo: sombra interna `rgba(0,0,0,0.08)`
- Chips de navegação, seletores de categoria, alternadores de filtro

**Ação Flutuante**
- Fundo: Pure White (`#ffffff`)
- Texto: Uber Black (`#000000`)
- Padding: 14px
- Radius: 999px (pílula completa)
- Sombra: `rgba(0,0,0,0.16) 0px 2px 8px 0px`
- Transform: `translateY(2px)` leve deslocamento
- Hover: fundo muda para `#f3f3f3`
- Controles de mapa, voltar ao topo, CTAs flutuantes

### Cartões & Contêineres
- Fundo: Pure White (`#ffffff`) em páginas brancas; sem diferenciação distinta de fundo de cartão
- Borda: nenhuma por padrão — os cartões são definidos por sombra, não por contorno
- Radius: 8px para cartões de conteúdo padrão; 12px para cartões em destaque/promovidos
- Sombra: `rgba(0,0,0,0.12) 0px 4px 16px 0px` para elevação padrão
- Os cartões são ricos em conteúdo com padding interno mínimo
- Cartões com imagem em destaque usam imagens em tela cheia com sobreposição ou texto abaixo

### Inputs & Formulários
- Texto: Uber Black (`#000000`)
- Fundo: Pure White (`#ffffff`)
- Borda: 1px solid Black (`#000000`) — o único lugar onde bordas visíveis aparecem com destaque
- Radius: 8px
- Padding: espaçamento confortável padrão
- Foco: sem estado de foco personalizado extraído — depende do anel de foco padrão do navegador

### Navegação
- Navegação superior fixa com fundo branco
- Logo: wordmark/ícone Uber a 24x24px em preto
- Links: UberMoveText a 14-18px, peso 500, em Uber Black
- Chips de navegação em forma de pílula com fundo Chip Gray (`#efefef`) para navegação por categoria ("Ride", "Drive", "Business", "Uber Eats")
- Alternador de menu: botão circular com border-radius de 50%
- Mobile: padrão de menu hambúrguer

### Tratamento de Imagens
- Cenas ilustradas à mão, quentes (não fotografias para seções de recurso)
- Estilo de ilustração: pessoas levemente estilizadas, paleta de cores quente nas ilustrações, vibe contemporânea
- Seções de herói usam fotografia ou ilustração marcante como fundos de largura total
- QR codes para CTAs de download do app
- Todas as imagens usam border-radius padrão de 8px ou 12px quando contidas em cartões

### Componentes Distintivos

**Navegação por Pílulas de Categoria**
- Linha horizontal de botões em forma de pílula para navegação de nível superior ("Ride", "Drive", "Business", "Uber Eats", "About")
- Cada pílula: fundo Chip Gray, texto preto, radius de 999px
- Estado ativo indicado por fundo preto com texto branco (inversão)

**Herói com Ação Dupla**
- Herói dividido: texto/CTA à esquerda, mapa/ilustração à direita
- Dois campos de input lado a lado para origem/destino
- Botão CTA "See prices" em pílula preta

**Cartões de Planejamento Antecipado**
- Cartões que promovem recursos como "Uber Reserve" e planejamento de viagem
- Rico em ilustrações com imagens quentes e centradas no humano
- Botões CTA pretos com texto branco na parte inferior

## 5. Princípios de Layout

### Sistema de Espaçamento
- Unidade base: 8px
- Escala: 4px, 6px, 8px, 10px, 12px, 14px, 16px, 18px, 20px, 24px, 32px
- Padding de botão: 10px 12px (compacto) ou 14px 16px (confortável)
- Padding interno de cartão: aproximadamente 24-32px
- Espaçamento vertical entre seções: generoso mas eficiente — aproximadamente 64-96px entre seções principais

### Grade & Contêiner
- Largura máxima do contêiner: aproximadamente 1136px, centralizado
- Herói: layout dividido com texto à esquerda, visual à direita
- Seções de recurso: grades de cartão de 2 colunas ou coluna única em largura total
- Rodapé: grade de links em múltiplas colunas sobre fundo preto
- Seções de largura total se estendendo até as bordas da viewport

### Filosofia de Espaço em Branco
- **Eficiente, não arejado**: O espaço em branco da Uber é funcional — o suficiente para separar, nunca o suficiente para parecer vazio. É o espaçamento de um sistema de transporte: compacto, claro, orientado por propósito.
- **Cartões ricos em conteúdo**: Os cartões empacotam informações de forma densa com espaçamento interno mínimo, dependendo de sombra e radius para definir limites.
- **Respiro entre seções**: As seções principais recebem espaçamento vertical generoso, mas dentro das seções os elementos são agrupados de perto.

### Escala de Border Radius
- Reto (0px): Nenhum canto quadrado usado em elementos interativos
- Padrão (8px): Cartões de conteúdo, campos de input, caixas de listagem
- Confortável (12px): Cartões em destaque, contêineres maiores, cartões de link
- Pílula Completa (999px): Todos os botões, chips, itens de navegação, pílulas
- Círculo (50%): Imagens de avatar, contêineres de ícone, controles circulares

## 6. Profundidade & Elevação

| Nível | Tratamento | Uso |
|-------|------------|-----|
| Plano (Nível 0) | Sem sombra, fundo sólido | Fundo da página, conteúdo inline, seções de texto |
| Sutil (Nível 1) | `rgba(0,0,0,0.12) 0px 4px 16px` | Cartões de conteúdo padrão, blocos de recurso |
| Médio (Nível 2) | `rgba(0,0,0,0.16) 0px 4px 16px` | Cartões elevados, elementos de sobreposição |
| Flutuante (Nível 3) | `rgba(0,0,0,0.16) 0px 2px 8px` + translateY(2px) | Botões de ação flutuantes, controles de mapa |
| Pressionado (Nível 4) | `rgba(0,0,0,0.08) inset` (spread de 999px) | Estados de botão ativos/pressionados |
| Anel de Foco | `rgb(255,255,255) 0px 0px 0px 2px inset` | Indicadores de foco do teclado |

**Filosofia de Sombra**: A Uber usa sombra puramente como ferramenta estrutural, nunca de forma decorativa. As sombras são sempre pretas em opacidade muito baixa (0.08-0.16), criando a elevação mínima necessária para separar camadas de conteúdo. Os raios de desfoque são moderados (8-16px) — suficientes para parecer natural, mas nunca dramáticos. Não há sombras coloridas, pilhas de sombras em camadas nem efeitos de brilho ambiente. A profundidade é comunicada mais pelo contraste de seções preto/branco do que pela elevação de sombra.

## 7. O Que Fazer e O Que Não Fazer

### Fazer
- Usar preto verdadeiro (`#000000`) e branco puro (`#ffffff`) como paleta primária — o contraste marcante É a Uber
- Usar border-radius de 999px para todos os botões, chips e elementos de navegação em forma de pílula
- Manter todos os títulos em UberMove Bold (700) para impacto de nível outdoor
- Usar sombras ultra-suaves (opacidade 0.12-0.16) para elevação de cartão — quase imperceptíveis
- Manter o estilo de layout compacto e rico em informação — a Uber prioriza eficiência em vez de leveza
- Usar ilustrações quentes e centradas no humano para suavizar a interface monocromática
- Aplicar radius de 8px para cartões de conteúdo e 12px para contêineres em destaque
- Usar UberMoveText no peso 500 para navegação e texto de UI em destaque
- Combinar botões primários pretos com botões secundários brancos para layouts de ação dupla

### Não Fazer
- Não introduzir cor no cromo da interface — a interface da Uber é estritamente preto, branco e cinza
- Não usar cantos arredondados com menos de 999px nos botões — a forma em pílula completa é um elemento central de identidade
- Não aplicar sombras pesadas ou drop shadows com alta opacidade — a profundidade é sussurrada de forma sutil
- Não usar fontes serifadas em nenhum lugar — a tipografia da Uber é exclusivamente sans-serif geométrica
- Não criar layouts arejados e espaçosos com espaço em branco excessivo — a densidade da Uber é intencional
- Não usar gradientes ou sobreposições de cor — toda superfície é uma cor sólida e plana
- Não misturar UberMove em texto de corpo nem UberMoveText em títulos — a hierarquia é rígida
- Não usar bordas decorativas — bordas são funcionais (inputs, divisores) ou ausentes
- Não suavizar o contraste preto/branco com brancos-sujos ou pretos-quase-pretos — a dualidade é deliberada

## 8. Comportamento Responsivo

### Breakpoints
| Nome | Largura | Principais Mudanças |
|------|---------|---------------------|
| Mobile Pequeno | 320px | Layout mínimo, coluna única, inputs empilhados, tipografia compacta |
| Mobile | 600px | Mobile padrão, layout empilhado, nav hambúrguer |
| Tablet Pequeno | 768px | Grades de duas colunas começam, layouts de cartão expandidos |
| Tablet | 1119px | Layout de tablet completo, conteúdo de herói lado a lado |
| Desktop Pequeno | 1120px | Grade desktop ativada, pílulas de nav horizontais |
| Desktop | 1136px | Layout de desktop completo, largura máxima do contêiner, herói dividido |

### Alvos de Toque
- Todos os botões em pílula: altura mínima de 44px (padding vertical de 10-14px + altura de linha)
- Chips de navegação: padding generoso de 14px 16px para toque confortável com o polegar
- Controles circulares (menu, fechar): radius de 50% garante alvos grandes e fáceis de acertar
- As superfícies dos cartões servem como alvos de toque de área total no mobile

### Estratégia de Colapso
- **Navegação**: Nav em pílulas horizontal colapsa para menu hambúrguer com alternador circular
- **Herói**: Layout dividido (texto + mapa/visual) empilha em coluna única — texto acima, visual abaixo
- **Campos de input**: Inputs de origem/destino lado a lado empilham verticalmente
- **Cartões de recurso**: Grade de 2 colunas colapsa para cartões empilhados em largura total
- **Títulos**: Display de 52px reduz através de 36px, 32px, 24px, 20px
- **Rodapé**: Grade de links em múltiplas colunas colapsa para acordeão ou coluna única empilhada
- **Pílulas de categoria**: Rolagem horizontal com overflow em telas menores

### Comportamento de Imagens
- As ilustrações escalam proporcionalmente dentro de seus contêineres
- A imagem do herói mantém a proporção, podendo ser cortada em telas menores
- Seções de QR code ficam ocultas no mobile (download do app muda para links diretos da loja)
- As imagens dos cartões mantêm border-radius de 8-12px em todos os tamanhos

## 9. Guia de Prompt para Agentes

### Referência Rápida de Cores
- Botão Primário: "Uber Black (#000000)"
- Fundo da Página: "Pure White (#ffffff)"
- Texto do Botão (sobre preto): "Pure White (#ffffff)"
- Texto do Botão (sobre branco): "Uber Black (#000000)"
- Texto Secundário: "Body Gray (#4b4b4b)"
- Texto Terciário: "Muted Gray (#afafaf)"
- Fundo do Chip: "Chip Gray (#efefef)"
- Estado de Hover: "Hover Gray (#e2e2e2)"
- Sombra do Cartão: "rgba(0,0,0,0.12) 0px 4px 16px"
- Fundo do Rodapé: "Uber Black (#000000)"

### Exemplos de Prompts de Componente
- "Crie uma seção de herói sobre Pure White (#ffffff) com um título a 52px UberMove Bold (700), line-height 1.23. Use texto Uber Black (#000000). Adicione um subtítulo em Body Gray (#4b4b4b) a 16px UberMoveText peso 400 com line-height 1.50. Posicione um botão CTA em pílula Uber Black (#000000) com texto Pure White, radius de 999px, padding 10px 12px."
- "Crie uma barra de navegação por categorias com botões horizontais em forma de pílula. Cada pílula: fundo Chip Gray (#efefef), texto Uber Black (#000000), padding 14px 16px, border-radius 999px. A pílula ativa inverte para fundo Uber Black com texto Pure White. Use UberMoveText a 14px peso 500."
- "Construa um cartão de recurso sobre Pure White (#ffffff) com border-radius de 8px e sombra rgba(0,0,0,0.12) 0px 4px 16px. Título em UberMove a 24px peso 700, descrição em Body Gray (#4b4b4b) a 16px UberMoveText. Adicione um botão CTA em pílula preta na parte inferior."
- "Crie um rodapé escuro sobre Uber Black (#000000) com texto de título Pure White (#ffffff) em UberMove a 20px peso 700. Links do rodapé em Muted Gray (#afafaf) a 14px UberMoveText. Links mudam para Pure White no hover. Layout em grade de múltiplas colunas."
- "Crie um botão de ação flutuante com fundo Pure White (#ffffff), radius de 999px, padding de 14px e sombra rgba(0,0,0,0.16) 0px 2px 8px. Hover muda o fundo para #f3f3f3. Use para voltar ao topo ou controles de mapa."

### Guia de Iteração
1. Concentre-se em UM componente por vez
2. Referencie a paleta estrita de preto/branco — "use Uber Black (#000000)" e não "deixe escuro"
3. Sempre especifique radius de 999px para botões e pílulas — isso é inegociável para a identidade Uber
4. Descreva a família tipográfica explicitamente — "UberMove Bold para o título, UberMoveText Medium para o rótulo"
5. Para sombras, use "sombra suave (rgba(0,0,0,0.12) 0px 4px 16px)" — nunca drop shadows pesadas
6. Mantenha os layouts compactos e ricos em informação — a Uber é eficiente, não arejada
7. As ilustrações devem ser quentes e humanas — descreva "pessoas estilizadas em tons quentes" e não formas abstratas
8. Combine CTAs pretos com secundários brancos para layouts de ação dupla equilibrados
