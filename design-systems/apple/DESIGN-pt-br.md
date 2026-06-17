# Sistema de Design Inspirado na Apple

> Category: Mídia & Consumo
> Eletrônicos de consumo. Espaço em branco premium, SF Pro, imagens cinematográficas.

## 1. Tema Visual & Atmosfera

A linguagem web da Apple é um sistema editorial de precisão que alterna entre uma calma de galeria e blocos de informação com densidade de varejo. O tom visual permanece contido: amplas telas neutras, cromados discretos e imagens de produto recebendo quase todo o peso expressivo. A interface é projetada para desaparecer, de modo que hardware, materiais e opções de acabamento se tornem o primeiro plano narrativo.

Ao longo das cinco páginas analisadas, o ritmo é consistente, mas não monolítico. As superfícies de marketing (homepage e Environment) usam um encadeamento cinematográfico de preto e luz, enquanto as superfícies de comércio (fluxos da Store e Shop) introduzem espaçamento mais apertado, mais controles utilitários e pilhas de cards mais densas sem romper a gramática central da marca. O resultado é um único sistema com duas marchas: modo vitrine e modo transação.

A tipografia é o estabilizador. A SF Pro Display sustenta a hierarquia de hero e merchandising com alturas de linha compactas e tracking controlado, enquanto a SF Pro Text cuida dos metadados de produto, navegação, filtros e UI densa de seleção. A tipografia permanece discreta, mas a faixa de escala é ampla o suficiente para suportar tanto a mensagem de hero em estilo outdoor quanto micro rótulos utilitários.

**Características Principais:**
- Ritmo binário de seções: cenas em preto profundo (`#000000`) alternando com campos neutros pálidos (`#f5f5f7`)
- Família única de azul de destaque para semântica de ação e link (`#0071e3`, `#0066cc`, `#2997ff`)
- Dois modos de operação em um sistema: módulos de vitrine cinematográfica e configuradores de comércio densos
- Forte dependência de imagens e acabamentos de material; o cromado da UI permanece visualmente fino
- Métricas de manchete apertadas (SF Pro Display, semibold) combinadas com tipografia de corpo/link compacta (SF Pro Text)
- Geometria de pílula e cápsula como linguagem de ação característica (`18px` a `980px` e controles circulares)
- Profundidade usada com parcimônia; contraste e separação de superfície fazem a maior parte do trabalho de camadas
- Ritmo de blocos de cor em múltiplas páginas: capítulos de hero pretos -> campos de merchandising neutros pálidos -> superfícies de varejo brancas utilitárias -> micro superfícies escuras para controles

## 2. Paleta de Cores & Papéis

> **Source Pages:** `https://www.apple.com/`, `https://www.apple.com/environment/`, `https://www.apple.com/store`, `https://www.apple.com/shop/buy-iphone/iphone-17-pro`, `https://www.apple.com/shop/accessories/all`

### Primárias
- **Preto Absoluto** (`#000000`): Telas de hero imersivas, capítulos de produto de alto drama, âncoras profundas de UI.
- **Cinza Apple Pálido** (`#f5f5f7`): Principal superfície clara para faixas de recursos, blocos de comparação e transições editoriais.
- **Tinta Quase-Preta** (`#1d1d1f`): Cor de texto primário e de controle de preenchimento escuro em telas claras.

### Secundárias & Destaque
- **Azul de Ação Apple** (`#0071e3`): Preenchimento de ação primária e destaque da marca que sinaliza foco.
- **Azul de Link de Corpo** (`#0066cc`): Cor de link inline otimizada para legibilidade em textos longos.
- **Azul de Link de Alta Luminância** (`#2997ff`): Tratamento de link brilhante em cenas mais escuras onde se exige contraste mais forte.

### Superfície & Fundo
- **Tela Branco Puro** (`#ffffff`): Fundos de varejo/lista de produtos e seções transacionais densas.
- **Superfície Grafite A** (`#272729`): Camada de contexto para cards escuros e controles de mídia.
- **Superfície Grafite B** (`#262629`): Camada utilitária escura ligeiramente mais profunda para agrupamentos de controles.
- **Superfície Grafite C** (`#28282b`): Superfícies escuras de apoio elevadas.
- **Superfície Grafite D** (`#2a2a2c`): Degrau elevado mais escuro usado para separação em cenas escuras mais ricas.

### Neutros & Texto
- **Cinza Neutro Secundário** (`#6e6e73`): Texto secundário de corpo, descrições auxiliares, metadados terciários.
- **Cinza de Borda Suave** (`#d2d2d7`): Divisórias, contornos sutis e contenção utilitária discreta.
- **Cinza de Borda Médio** (`#86868b`): Contornos de campo mais fortes em contextos de configuração de produto e filtros.
- **Cinza Escuro Utilitário** (`#424245`): Cruzamento de texto/superfície neutro-escuro em contextos de loja.

### Semântica & Destaque
- **Sinal de Seleção/Foco** (`#0071e3`): Sinal compartilhado de foco e estado selecionado entre os contextos de marketing e comércio.
- **Erro/Aviso/Sucesso**: Nenhuma paleta semântica distinta foi consistentemente visível no conjunto de superfícies extraídas.

### Sistema de Gradiente
- As páginas extraídas são esmagadoramente conduzidas por superfícies sólidas. A riqueza visual vem da fotografia e da renderização de acabamento, em vez de gradientes persistentes de UI.

## 3. Regras de Tipografia

### Família de Fontes
- **Família de Display:** `SF Pro Display`, fallbacks `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Família de Texto:** `SF Pro Text`, fallbacks `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Divisão de Uso:** A família de display cuida das manchetes de hero/produto e dos títulos de merchandising; a família de texto cuida da navegação, controles, rótulos e texto denso de comércio.

### Hierarquia
| Papel | Tamanho | Peso | Altura de Linha | Espaçamento de Letras | Notas |
|------|------|--------|-------------|----------------|-------|
| Hero Display XL | 80px | 600 | 1.00-1.05 | -1.2px | Escala de hero de Environment/store |
| Hero Display L | 56px | 600 | 1.07 | -0.28px | Momentos de hero da homepage |
| Section Display | 48px | 500-600 | 1.08 | -0.144px | Títulos principais de capítulo |
| Product Heading | 40px | 600 | 1.10 | normal | Títulos de seção de produto e campanha |
| Feature Display | 38px | 600 | 1.21 | 0.152px | Destaques de dispositivo e merchandising |
| Promo Display | 32px | 300-600 | 1.09-1.13 | 0.128px a 0.352px | Sub-heroes de nível de módulo |
| Card/Product Title | 28px | 600 | 1.14 | 0.196px | Nomeação de nível de tile e texto-chave |
| Utility Heading | 24px | 600 | 1.17 | 0.216px / -0.2px | Cabeçalhos de configurador e conteúdo agrupado |
| Link/Action Heading | 21px | 600 | 1.14-1.38 | 0.231px | Links promocionais maiores |
| Subhead | 19px | 600 | 1.21 | 0.228px | Introduções de seção compactas |
| Body Primary | 17px | 400 | 1.47 | -0.374px | Corpo padrão e descrições de varejo |
| Body Emphasis | 17px | 600 | 1.24 | -0.374px | Rótulos enfatizados e valores-chave |
| Control Label | 14px | 400-600 | 1.29-1.47 | -0.224px | Botões, rótulos auxiliares, texto de navegação compacto |
| Micro UI | 12px | 400-600 | 1.00-1.33 | -0.12px | Letras miúdas, micro rótulos |
| Legal/Meta | 10px | 400 | 1.30-1.47 | -0.08px | Metadados densos e texto de apoio legal |

### Princípios
- **Continuidade entre tipos de página:** O mesmo DNA tipográfico abrange lançamentos cinematográficos e fluxos de compra de produto, evitando uma divisão de marca entre marketing e comércio.
- **Compressão em escala:** Os níveis de display usam entrelinhamento apertado e tracking controlado para parecerem usinados e centrados no produto.
- **Densidade legível em profundidade de varejo:** A SF Pro Text equilibra compacidade com ritmo vertical suficiente para longas listas de produtos e matrizes de opções.
- **Escada de pesos medida:** 600 é o peso de ênfase dominante; 700 aparece seletivamente; 300 é usado com parcimônia para contraste em linhas maiores.

### Nota sobre Substitutos de Fonte
- Substitutos mais próximos disponíveis gratuitamente: `Inter` para implementação rica em texto e métricas `SF Pro Display-like` aproximadas com `Inter Tight` para títulos.
- Ao substituir, aumente ligeiramente a altura de linha (+0.02 a +0.06) nos tamanhos de corpo e reduza a intensidade do tracking negativo para preservar a legibilidade.

## 4. Estilizações de Componentes

### Botões
- **Ação de Preenchimento Primária:** fundo `#0071e3`, texto `#ffffff`, raio de 8px, padding horizontal compacto (comumente 8px 15px). Usada para ações decisivas de compra/progressão.
- **Ação de Preenchimento Escuro:** fundo `#1d1d1f`, texto `#ffffff`, raio de 8px. Usada quando superfícies claras precisam de uma primária de alto contraste contida.
- **Família de Ação Pílula/Cápsula:** grandes ações de cápsula em raios de `18px`-`56px` e links de pílula extrema em `980px`. Estabelece a silhueta de call-to-action suave, mas precisa, da Apple.
- **Cascas de Filtro/Botão Utilitário:** cascas claras (`#fafafc` ou branco translúcido) com bordas cinza sutis (`#d2d2d7` / `#86868b`) para contextos de configuração densos.
- **Comportamento ao Pressionar:** controles ativos comumente reduzem a escala ou deslocam ligeiramente o preenchimento para indicar a confirmação física do toque.

### Cards & Contêineres
- **Cards Editoriais/de Produto:** cards claros em campos `#f5f5f7` ou brancos com enquadramento mínimo e composição centrada na imagem.
- **Cards Utilitários Escuros:** degraus de grafite (`#272729` a `#2a2a2c`) usados para overlays, controles de mídia e módulos de contexto escuro.
- **Painéis de Configurador:** contêineres arredondados (frequentemente 12px-18px) com definição de borda clara, porém contida.
- **Módulos de Carrossel/Destaque:** cascas arredondadas maiores (`28px`-`36px`) para faixas de conteúdo em destaque.

### Inputs & Formulários
- **Campos de Input de Varejo:** fundos translúcidos ou brancos, texto escuro (`#1d1d1f`), contenção orientada por borda (`#86868b`).
- **Controles de Seleção:** geometria de controle circular/em estilo de alternância aparece com frequência em interfaces de seleção de produto.
- **Estratégia de Densidade:** os campos de formulário permanecem visualmente discretos para manter dominantes a imagem do dispositivo e a hierarquia de preço.

### Navegação
- **Nav Global de Marketing:** barra escura translúcida compacta com links de tipo pequeno e iconografia contida.
- **Camadas de Nav da Store/Sub-shop:** barras utilitárias adicionais, chips e controles segmentados para o estreitamento de categoria e produto.
- **Hierarquia de Links:** os azuis de link permanecem o sinal interativo primário, enquanto o texto neutro dá suporte a conjuntos de navegação densos.

### Tratamento de Imagem
- **Fotografia Centrada no Objeto:** hardware e acessórios são colocados em primeiro plano sobre superfícies sólidas controladas.
- **Renderização de acabamento de alta fidelidade:** detalhes reflexivos/de material são centrais para a persuasão visual.
- **Enquadramento misto:** cenas de hero full-bleed coexistem com cards de varejo arredondados e miniaturas de merchandising recortadas com precisão.

### Outros Componentes Distintivos
- **Matriz de Configurador de Produto:** pilhas de opções e seletores combinando chips, controles em estilo radio e blocos contextuais de preço/resumo.
- **Pontos/Setas de Controle de Carrossel:** vocabulário de controle circular em overlays discretos para a progressão da galeria.
- **Painéis de História do Environment:** capítulos narrativos que mesclam tipografia editorial com visuais cinematográficos de produto/ambiente.

## 5. Princípios de Layout

### Sistema de Espaçamento
- A unidade base é efetivamente `8px`, mas o sistema suporta micro degraus densos para alinhamento de precisão.
- Valores de espaçamento reutilizados com frequência entre páginas: `2`, `4`, `6`, `7`, `8`, `9`, `10`, `12`, `14`, `17`, `20` px.
- Constantes de ritmo universais visíveis tanto nos fluxos de marketing quanto nos de varejo: andaime de unidade de `8px` com intervalos utilitários de `14-20px` para padding de componentes e espaçamento de listas.

### Grid & Contêiner
- **Páginas de vitrine:** grandes colunas centrais com amplo espaço horizontal de respiro e capítulos de cor de largura total.
- **Páginas de comércio:** grids mais apertados de produto e controle em múltiplas colunas com empilhamento modular frequente.
- **Comportamento de contêiner:** núcleo legível restrito com margens externas generosas em larguras de desktop.

### Filosofia de Espaço em Branco
- **Cadência de cena:** os principais capítulos visuais usam amplo espaço de respiro superior/inferior.
- **Compactação de informação onde necessário:** as páginas de varejo comprimem deliberadamente o espaçamento para expor mais informação acionável por viewport.
- **Separação orientada por contraste:** as transições de seção dependem mais de mudanças de superfície do que de separadores decorativos.

### Escala de Raio de Borda
- **5px:** pequenos links/tags utilitários e cascas pequenas menores.
- **8px-12px:** controles padrão e campos compactos.
- **16px-18px:** cards, molduras de módulo e painéis de comércio.
- **28px-36px:** contêineres maiores de módulo e destaque.
- **56px / 100px / 980px:** cápsulas, grandes pílulas e formas características de CTA alongadas.
- **50%:** controles circulares de mídia e seleção.

## 6. Profundidade & Elevação

| Nível | Tratamento | Uso |
|------|-----------|-----|
| Nível 0 | Superfícies neutras planas (`#ffffff`, `#f5f5f7`, `#000000`) | Palcos principais de narrativa e produto |
| Nível 1 | Contenção sutil por borda (`#d2d2d7`, `#86868b`) | Filtros, campos de input, cards utilitários |
| Nível 2 | Sombra suave (`rgba(0,0,0,0.08)` a `rgba(0,0,0,0.22)` onde presente) | Cards destacados e módulos de mercadoria elevados |
| Nível 3 | Escalonamento de superfície escura (`#272729` -> `#2a2a2c`) | Overlays, controles de mídia, clusters utilitários escuros |
| Acessibilidade | Sinal de foco azul (`#0071e3`) | Ênfase de teclado e seleção |

A profundidade é intencionalmente contida. A Apple favorece contraste tonal, escalonamento de superfície e hierarquia composicional em vez de pilhas pesadas de sombra.

### Profundidade Decorativa
- A profundidade decorativa é criada principalmente pelo realismo fotográfico e pela renderização de material, e não por efeitos sintéticos de UI.
- Overlays translúcidos e barras utilitárias em estilo de vidro fornecem uma leve camada atmosférica na navegação e nos controles.

## 7. O que Fazer e o que Não Fazer

### O que Fazer
- Use a tríade neutra (`#000000`, `#f5f5f7`, `#ffffff`) como a fundação estrutural.
- Reserve os destaques de azul para a semântica genuína de ação e navegação.
- Mantenha a tipografia apertada e deliberada, especialmente em escalas de display.
- Mantenha a linguagem de geometria de cápsula/círculo para controles e ações-chave.
- Deixe a imagem do produto carregar o drama visual; mantenha o cromado discreto.
- Use contenção orientada por borda em contextos densos de varejo, em vez de ornamentação pesada de card.
- Preserve a separação clara entre módulos de vitrine e módulos transacionais, mantendo os tokens centrais compartilhados.

### O que Não Fazer
- Não introduza paletas amplas de destaque secundário que compitam com o azul da Apple.
- Não use em excesso sombras, efeitos de brilho ou gradientes decorativos no cromado central da UI.
- Não misture famílias de fontes não relacionadas nem afrouxe o tracking indiscriminadamente.
- Não achate todos os cantos em um único raio; a Apple usa níveis de raio propositais.
- Não sobrecarregue os módulos de comércio com bordas grossas ou efeitos visuais chamativos.
- Não remova a cadência de contraste neutro entre capítulos escuros e claros.
- Não trate os fluxos de marketing e de compra como sistemas de design separados.

## 8. Comportamento Responsivo

### Breakpoints
| Nome | Largura | Mudanças Principais |
|------|-------|-------------|
| Small Mobile | 374px e abaixo | Controles de varejo apertados, pilhas de produto em coluna única |
| Mobile | 375px-640px | Módulos em uma coluna, linhas de ação compactas, seletores condensados |
| Tablet | 641px-833px | Cards expandidos e transições mistas de 1-2 colunas |
| Tablet Wide | 834px-1023px | Merchandising em múltiplas colunas mais estável, blocos de texto maiores |
| Desktop | 1024px-1240px | Layouts de varejo completos e estruturas de comparação de produtos |
| Desktop Wide | 1241px-1440px | Expansão de hero de marketing e espaçamento de seção mais amplo |
| Large Desktop | 1441px+ | Espaço de respiro máximo de capítulo e composição editorial ampla |

### Alvos de Toque
- As ações primárias e secundárias são geralmente apresentadas em geometrias de pílula/botão amigáveis ao toque.
- Os controles circulares de mídia e seleção alinham-se com a intenção mínima de toque em contextos móveis.
- A UI densa de comércio usa rótulos compactos, mas mantém regiões de acerto claras por meio do padding de forma ao redor.

### Estratégia de Colapso
- A tipografia de hero de marketing reduz de escala em níveis discretos enquanto preserva o contraste de hierarquia.
- Os grids de produto e comércio colapsam de múltiplas colunas para cards empilhados com visibilidade persistente do seletor.
- A navegação utilitária comprime-se em agrupamentos de link/controle mais simples enquanto preserva as ações-chave.
- Os clusters de opção/configuração tornam-se sequenciados verticalmente para manter o fluxo de compra linear em telas pequenas.

### Comportamento de Imagem
- A imagem do produto preserva a proporção e a centralidade ao longo dos breakpoints.
- Os visuais de hero permanecem dominantes no mobile, com o texto reposicionado em torno da prioridade da mídia.
- As miniaturas de varejo permanecem legíveis por meio de uma lógica de recorte mais apertada e do empilhamento mais denso de cards.
- Os módulos liderados por imagem continuam a ancorar o ritmo conforme a densidade do layout aumenta.

## 9. Guia de Prompt para o Agente

### Referência Rápida de Cores
- Azul de ação primária: **Azul de Ação Apple** (`#0071e3`)
- Azul de link inline: **Azul de Link de Corpo** (`#0066cc`)
- Tela de capítulo escuro: **Preto Absoluto** (`#000000`)
- Tela de capítulo claro: **Cinza Apple Pálido** (`#f5f5f7`)
- Texto primário em claro: **Tinta Quase-Preta** (`#1d1d1f`)
- Texto secundário: **Cinza Neutro Secundário** (`#6e6e73`)
- Borda de varejo suave: **Cinza de Borda Suave** (`#d2d2d7`)
- Borda de varejo forte: **Cinza de Borda Médio** (`#86868b`)

### Exemplos de Prompts de Componente
- "Projete um hero de produto em estilo Apple sobre uma tela preta (`#000000`) com manchete em SF Pro Display semibold (48-56px), texto de apoio conciso e dois CTAs em cápsula usando `#0071e3` e `#1d1d1f`."
- "Crie um painel de configuração de comércio em branco (`#ffffff`) com cards arredondados de 18px, campos com borda `#86868b`, texto de corpo em SF Pro Text 17px e seletores de opção compactos."
- "Construa um grid de cards de merchandising alternando superfícies `#f5f5f7` e brancas, com cards centrados na imagem, sombras contidas e metadados em SF Pro Text de 14-17px."
- "Gere um cluster de controle de carrossel usando botões circulares (raio de 50%), overlays cinza discretos e feedback ativo claro para a navegação da galeria."
- "Componha um ritmo de página misto de marketing + varejo: capítulo de vitrine escuro -> capítulo de recurso claro -> módulo de lista de produtos denso, mantendo os destaques de azul apenas para ações e links."

### Guia de Iteração
1. Fixe primeiro a fundação neutra (`#000000`, `#f5f5f7`, `#ffffff`) antes de ajustar os destaques.
2. Mantenha os destaques de azul escassos e propositais; se tudo é azul, a hierarquia colapsa.
3. Ajuste a tipografia nesta ordem: escala de display, legibilidade do corpo e, então, micro rótulos.
4. Combine o raio por classe de componente (campo, card, cápsula, círculo) em vez de um arredondamento único para tudo.
5. Aumente a densidade gradualmente ao passar das seções de vitrine para as seções de comércio.
6. Valide que a imagem do produto permaneça a camada visual mais forte após cada revisão.

### Lacunas Conhecidas
- Cores de status semântico distintas (erro/aviso/sucesso) não foram consistentemente visíveis no conjunto de páginas extraídas.
- Alguns micro estados de interação variam por módulo e não são representados como tokens universais de sistema.
- Alguns módulos de varejo expõem substituições de tipografia específicas de contexto que não aparecem em todas as cinco páginas.
