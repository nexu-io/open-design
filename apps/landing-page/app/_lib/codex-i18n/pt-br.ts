/*
 * Textos em português do Brasil para a coleção curada de design do Codex.
 * Traduzido a partir da base em inglês em `../codex-i18n.ts`.
 */
import type { CodexCopyOverride } from './index';

export const ptBr: CodexCopyOverride = {
  collectionEyebrow: 'Coleção curada',
  collectionHeading: 'Os plugins de design que fazem o Codex entregar UI de verdade',
  collectionLede:
    'O OpenAI Codex escreve código que funciona. Sozinho, ele cai nas fontes de sempre, no espaçamento mediano e no Helvetica centralizado. Estes são os plugins que dão bom gosto a ele: skills de estética e regras de design system. Instale um ou rode todos dentro do Open Design.',
  collectionStats: [
    { value: '50', label: 'plugins selecionados' },
    { value: '13', label: 'repositórios de origem' },
    { value: 'Aberto', label: 'e verificado' },
  ],
  collectionIntro:
    'Todo plugin abaixo é real e leva até a sua fonte. Eles cumprem duas funções: definir o gosto estético antes do código e transformar seu design system em regras que o agente obedece.',
  collectionCategoryBlurbs: [
    'Substitua as decisões estéticas padrão do Codex antes que uma única linha seja escrita.',
    'Transforme seus tokens e componentes em regras que o Codex segue em vez de inventar.',
  ],
  collectionCloserHeading: 'Pule a configuração. Projete com o Codex dentro do Open Design',
  filterAll: 'Tudo',
  collectionCloserBody:
    'O Open Design é o workspace de design open source e agent-native que roda em volta do Codex. Ele mantém seus sistemas, skills e templates consistentes, então o agente entrega um trabalho que é seu.',
  categoryFrontend: 'Frontend & UI',
  categoryDesignSystems: 'Design Systems',
  ctaDownload: 'Baixar o Open Design',
  ctaStarList: 'Dar estrela na lista',
  ctaBrowseAll: 'Ver todos os plugins',
  ctaViewSource: 'Ver o código-fonte',
  ctaOurRepo: 'codex-design no GitHub',
  cardKind: 'Plugin',
  cardWhatItDoes: 'O que ele faz',
  cardCta: 'Ver o plugin',
  detailWhatIsIt: 'O que é',
  detailWhyForDesign: 'Por que isso importa para design',
  detailHowWithCodex: 'Como rodar com o Codex',
  detailExampleTag: 'Quando usar',
  detailSource: 'Fonte',
  detailCategory: 'Categoria',
  detailMaintainer: 'Autor',
  detailTags: 'Tags',
  detailLicense: 'Licença',
  detailCovers: 'O que cobre',
  detailUpstream: 'Do SKILL.md original',
  detailCodexNote: 'Funciona com Codex',
  detailTraction: 'Tração',
  detailRepo: 'Repositório de origem',
  detailStars: 'Estrelas',
  installHeading: 'Como instalar',
  installRunInCodex: 'Rode isto dentro do Codex.',
  installRestart: 'Reinicie o Codex para ele carregar a nova skill.',
  installClone: 'Clone o repositório.',
  installPoint: 'Aponte o Codex para o arquivo da skill.',
  installThenUse: 'Depois descreva a UI que você quer. O Codex segue a skill.',
  installNote:
    'Todo plugin aqui é gratuito, open source e leva até a sua fonte original.',
  installNoteCta: 'Ver a coleção inteira',
  detailMoreOnList: 'Mais na lista codex-design',
  detailRelated: 'Mais plugins de design para o Codex',
  finalEyebrow: 'Próximo passo',
  detailCloserHeading: 'Projete com o Open Design, sem a configuração',
  detailCloserBody:
    'Instale este plugin por conta própria ou rode uma camada de design curada em volta do Codex com o Open Design. Use sua própria chave e seja dono do resultado.',
  skills: {
    'gpt-taste': {
      tagline:
        'Cria landing pages estilo premiado com movimento de scroll em GSAP e grids bento sem falhas.',
      whatIsIt:
        'Uma diretriz de frontend que força variação de layout por seleção aleatória simulada de hero, tipografia, componentes e paradigmas de GSAP. Também impõe a estrutura de página AIDA e espaçamento generoso entre seções.',
      whyForDesign: [
        'Os títulos do hero ficam em duas ou três linhas porque o container se alarga em vez de virar parede de texto.',
        'Os grids bento usam grid-flow-dense, então nenhuma célula fica vazia ou quebrada.',
        'Rótulos genéricos são proibidos e o contraste do texto dos botões é verificado antes de entregar.',
      ],
      howWithCodex: [
        'Peça uma página; a skill emite um bloco design_plan antes de qualquer código de UI.',
        'Revise as escolhas aleatórias: layout do hero, conjunto de fontes, componentes, paradigmas de GSAP.',
        'Confira os itens de pré-voo: matemática da largura do hero, densidade do grid, varredura de rótulos, contraste.',
      ],
    },
    'stitch-design-taste': {
      tagline: 'Escreve um DESIGN.md que guia o Google Stitch para telas que fogem do genérico.',
      whatIsIt:
        'Gera um arquivo DESIGN.md otimizado para a geração de telas do Google Stitch. Ele codifica atmosfera, cor, tipografia, componentes, layout, movimento e uma lista explícita de padrões proibidos.',
      whyForDesign: [
        'As telas do Stitch herdam um único destaque com saturação abaixo de 80%, em vez de gradientes roxo neon.',
        'Heros centralizados e três fileiras iguais de cards são proibidos acima de um limite de variação definido.',
        'Estados de carregamento e vazios ganham forma esquelética e composta, em vez de spinners genéricos.',
      ],
      howWithCodex: [
        'Descreva o clima do projeto; a skill define os índices de densidade, variação e movimento.',
        'Ela gera um DESIGN.md de sete seções com códigos hex e papéis funcionais para cada cor.',
        'Alimente esse arquivo direto no Stitch, ou pelo servidor MCP do Stitch.',
      ],
    },
    'image-to-code': {
      tagline:
        'Gera imagens de design primeiro, analisa cada uma e só depois constrói o código de frontend correspondente.',
      whatIsIt:
        'Um fluxo que começa pela imagem para tarefas visuais na web. O agente gera imagens de referência por seção, extrai delas tipografia, espaçamento, cor e componentes, e então implementa o site para bater com a referência.',
      whyForDesign: [
        'O código segue uma referência visual real, então a implementação não escorrega para layouts genéricos.',
        'Cada seção ganha sua própria imagem em tamanho grande, o que mantém texto e espaçamento analisáveis.',
        'Os heros ficam com até três linhas de título e sem pilhas de containers aninhados.',
      ],
      howWithCodex: [
        'Informe o número de seções; no Codex a skill gera uma imagem por seção.',
        'Peça uma renderização mais próxima quando o detalhe de botão ou tipografia ficar ilegível.',
        'Deixe que ela rode a checagem de clareza antes de escrever qualquer arquivo de implementação.',
      ],
    },
    'imagegen-frontend-mobile': {
      tagline: 'Gera fluxos de telas de app mobile em nível premium, como imagens, não como código.',
      whatIsIt:
        'Uma skill só de imagem para conceitos e fluxos de telas mobile em produtos iOS, Android e multiplataforma. Ela apresenta as telas dentro de mockups de celular limpos e nunca escreve código.',
      whyForDesign: [
        'As telas respeitam as áreas seguras e regiões de sistema, em vez de parecerem sites dentro de um celular.',
        'Uma bíblia de design fixa mantém paleta, tipografia e ícones consistentes em todas as telas.',
        'Conjuntos com várias telas formam um fluxo crível, não mockups avulsos sem relação entre si.',
      ],
      howWithCodex: [
        'Informe a categoria do app e o número de telas; cada tela vira sua própria imagem.',
        'A skill escolhe primeiro um modo de plataforma: iOS, Android ou neutro multiplataforma.',
        'Peça para regenerar qualquer tela em que o texto fique pequeno ou o enquadramento irregular.',
      ],
    },
    'imagegen-frontend-web': {
      tagline: 'Gera uma imagem de referência horizontal para cada seção da landing page.',
      whatIsIt:
        'Uma skill de direção de imagem para referências de design de sites. Ela gera uma imagem horizontal separada por seção, com uma única paleta fixa e composição de hero variada ao longo do conjunto.',
      whyForDesign: [
        'Uma landing page de oito seções resulta em oito comps legíveis, não um quadro único e espremido.',
        'A composição do hero varia além do padrão batido de texto à esquerda e imagem à direita.',
        'Uma só paleta, escala tipográfica e família de CTA se mantém em todos os quadros gerados.',
      ],
      howWithCodex: [
        'Diga quantas seções você quer; se não for informado, a landing page assume seis por padrão.',
        'A skill anuncia a contagem e depois rotula cada saída pelo número da seção.',
        'Dê palavras de clima como editorial ou cinematográfico para guiar a escala do hero e o fundo.',
      ],
    },
    'minimalist-ui': {
      tagline: 'Cria interfaces editoriais monocromáticas e quentes, com grids bento planos.',
      whatIsIt:
        'Um protocolo de frontend para interfaces minimalistas com cara de documento. Ele fixa uma paleta monocromática quente, hierarquia tipográfica em serifa e mono, cards bento com borda de 1px e destaques em pastel suave.',
      whyForDesign: [
        'Todo card e divisor usa uma única borda cinza-claro de 1px com raio nítido.',
        'Os destaques vêm só de quatro pastéis lavados, reservados para tags e código inline.',
        'As seções ganham profundidade com imagens de baixa opacidade, não com fundos vazios e planos.',
      ],
      howWithCodex: [
        'Peça uma página; a skill estabelece primeiro o macro-espaço em branco, py-24 ou py-32.',
        'Ela limita a largura do texto a max-w-4xl e aplica as variáveis monocromáticas de imediato.',
        'As entradas com fade no scroll rodam via IntersectionObserver, só em transform e opacity.',
      ],
    },
    'design-taste-frontend': {
      tagline: 'Lê o briefing, escolhe uma direção e entrega interfaces que fogem do template.',
      whatIsIt:
        'Uma skill de frontend anti-genérico para landing pages, portfólios e redesigns. Ela declara uma leitura de design, ajusta os índices de variação, movimento e densidade, e depois roda uma checagem de pré-voo longa.',
      whyForDesign: [
        'Briefings corporativos recebem o pacote oficial de design system, em vez de um CSS artesanal parecido.',
        'A checagem de pré-voo proíbe travessões, eyebrows numerando seções, indicações de scroll e CTAs repetidos.',
        'A repetição de layout tem limite, então oito seções usam ao menos quatro famílias diferentes.',
      ],
      howWithCodex: [
        'O agente declara uma leitura de design em uma linha antes de escrever qualquer código.',
        'Ele ajusta três índices: variação de design, intensidade de movimento e densidade visual.',
        'Todo item da checagem de pré-voo precisa passar, ou a página não está pronta.',
      ],
    },
    'industrial-brutalist-ui': {
      tagline: 'Cria interfaces rígidas de impressão suíça ou terminal CRT, com granulação analógica.',
      whatIsIt:
        'Um design system para interfaces que fundem a impressão tipográfica suíça com a estética de terminal militar. Especifica grids rígidos, contraste extremo na escala tipográfica, um único destaque vermelho de alerta e degradação analógica simulada.',
      whyForDesign: [
        'Um só substrato é escolhido por projeto, então claro e escuro nunca se misturam.',
        'border-radius é rejeitado por completo, então todo canto fica em noventa graus.',
        'Filtros de meio-tom, scanline e ruído impedem que as superfícies pareçam vetor plano.',
      ],
      howWithCodex: [
        'Escolha um arquétipo: impressão industrial suíça ou terminal CRT de telemetria tática.',
        'Títulos macro usam clamp com tracking negativo; metadados usam monospace pequeno em caixa alta.',
        'Espaços de grid de 1px com fundos contrastantes produzem as linhas divisórias finas como lâmina.',
      ],
    },
    'redesign-existing-projects': {
      tagline: 'Audita um site existente e o atualiza sem quebrar funcionalidade.',
      whatIsIt:
        'Um fluxo de varredura, diagnóstico e correção para projetos existentes. Audita tipografia, cor, layout, estados, conteúdo, ícones e qualidade de código, e depois aplica melhorias pontuais dentro da stack atual.',
      whyForDesign: [
        'Gradientes roxo-azul de IA e três fileiras iguais de cards são trocados por alternativas mais pensadas.',
        'Botões em grupos de cards se alinham numa única linha inferior, mesmo com conteúdo variado.',
        'Estados ausentes de hover, foco, carregamento, vazio e erro são preenchidos.',
      ],
      howWithCodex: [
        'Primeiro ela varre o código para identificar o framework e o método de estilização.',
        'Lista todo padrão genérico e ponto fraco antes de mudar qualquer coisa.',
        'As correções entram em ordem de prioridade: fontes, cor, estados, layout, componentes, acabamento tipográfico.',
      ],
    },
    'brandkit': {
      tagline: 'Gera painéis de guideline de marca, sistemas de logo e decks de identidade como imagens.',
      whatIsIt:
        'Uma skill de geração de imagem para painéis de brand-kit. Produz sistemas de logo, painéis de cor e tipografia, mockups e imagens de atmosfera organizados num quadro de apresentação em grid.',
      whyForDesign: [
        'Um sistema padrão de painéis 3x3 cobre logo, construção, cor, tipografia e aplicações.',
        'Os conceitos de logo seguem um método declarado, como monograma, fusão de metáforas ou espaço negativo.',
        'Os quadros têm ritmo: painéis silenciosos, funcionais, emocionais e técnicos, em vez de uma força uniforme.',
      ],
      howWithCodex: [
        'Informe a marca e a categoria; a skill escolhe primeiro um modo visual.',
        'Por padrão ela usa um quadro 3x3, ou um mini deck de referência 2x3.',
        'Mantenha o texto enxuto: nome da marca, um tagline, um comando, algumas legendas.',
      ],
    },
    'cinematic-scroll-storytelling': {
      tagline: 'Receitas de Lenis com GSAP ScrollTrigger para landing pages guiadas pelo scroll.',
      whatIsIt:
        'Código funcional para preloader, revelações de texto mascarado, revelações de seção, cenas fixadas atreladas ao scroll, pilhas sticky de cards e parallax, usando Lenis e GSAP ScrollTrigger.',
      whyForDesign: [
        'Tokens de movimento fixam durações, escalonamentos, deslocamentos e blur para as revelações ficarem consistentes.',
        'Todo efeito tem um ramo de reduced-motion que mantém layout e contraste intactos.',
        'Uma ordem de construção monta a página estática primeiro e o movimento depois, evitando cenas de scroll embaralhadas.',
      ],
      howWithCodex: [
        'Instale gsap e lenis e depois ligue o Lenis ao ticker do GSAP.',
        'Marque as seções com os data attributes para revelações, pilhas e parallax.',
        'Adicione por último as cenas fixadas atreladas ao scroll e depois rode a checklist de QA.',
      ],
    },
    'webgl-3d-object': {
      tagline: 'Um mesh de hero iluminado em Three.js com material PBR e sombras reais.',
      whatIsIt:
        'Uma receita em Three.js para um objeto de hero facetado: geometria de icosaedro, MeshStandardMaterial, câmera em perspectiva, luzes key e rim, plano de sombra, rotação flutuante lenta.',
      whyForDesign: [
        'Geometria e iluminação reais produzem arestas, brilhos e sombras que os transforms de CSS não conseguem falsear.',
        'Os presets de material cobrem metal premium, cerâmica suave e visuais tech com brilho colorido.',
        'O movimento se limita a rotação lenta e uma leve flutuação, então o texto segue em primeiro plano.',
      ],
      howWithCodex: [
        'Adicione a casca de canvas quadrada e depois rode o inicializador do Three.js sobre ela.',
        'Ajuste color, metalness, roughness e emissive para casar com o clima da marca.',
        'Confirme o tratamento de resize e o descarte de geometria, material e renderer.',
      ],
    },
    'css-border-gradient': {
      tagline: 'Adiciona uma borda em gradiente refinada a cards, modais e superfícies de hero.',
      whatIsIt:
        'Uma receita de CSS para bordas em gradiente sutis usando camadas de padding-box e border-box, mais uma variante de pseudo-elemento mascarado para superfícies com fundos complexos.',
      whyForDesign: [
        'Dá uma definição de borda premium sem o brilho gritante das bordas neon.',
        'A variante mascarada preserva um fundo existente em vez de sobrescrevê-lo.',
        'Os padrões mantêm os stops abaixo de 0.4 de opacidade, então as bordas emolduram em vez de competir.',
      ],
      howWithCodex: [
        'Aponte o Codex para um card ou painel de preço que precisa de uma borda melhor.',
        'Escolha o padrão simples para preenchimentos sólidos, o mascarado para fundos complexos.',
        'Confira os temas claro e escuro separadamente, já que o alfa raramente se transfere.',
      ],
    },
    'high-end-visual-design': {
      tagline: 'Bloqueia os padrões genéricos de IA e impõe layout e movimento de agência.',
      whatIsIt:
        'Uma skill diretiva que proíbe os padrões de design de IA mais comuns e obriga o agente a escolher um arquétipo de clima e um arquétipo de layout antes de escrever qualquer código de UI.',
      whyForDesign: [
        'Inter, Roboto e ícones grossos do Lucide são proibidos, então a saída deixa de parecer template.',
        'Os cards ganham casca externa e núcleo interno aninhados, dando profundidade usinada de verdade aos containers.',
        'O padding de seção começa em py-24, então os layouts respiram em vez de se amontoar.',
      ],
      howWithCodex: [
        'Peça uma página ao Codex; primeiro ele roda o motor de variação em silêncio.',
        'Ele estrutura a textura de fundo e a escala tipográfica, depois monta containers de moldura dupla.',
        'Ele injeta movimento com cubic-bezier customizado e depois roda a checklist de pré-entrega.',
      ],
    },
    'pick-ui-library': {
      tagline: 'Associa uma tarefa de frontend a uma única escolha de biblioteca, curada e com opinião.',
      whatIsIt:
        'Uma skill de consulta chamada explicitamente. Ela mapeia uma tarefa declarada para uma única biblioteca recomendada, a partir de uma tabela curada que cobre primitivos, movimento, gráficos, virtualização, estado e estilização.',
      whyForDesign: [
        'Uma recomendação por tarefa, então não sobra um cardápio de opções para discutir.',
        'Confere o package.json primeiro, então reaproveita o que o projeto já tem.',
        'Pega dropdowns e toasts feitos na mão e os troca por primitivos acessíveis.',
      ],
      howWithCodex: [
        'Chame-a explicitamente; ela nunca dispara sozinha.',
        'Descreva a tarefa, não o nome da biblioteca, algo como ‘preciso de toasts’.',
        'Ela indica uma biblioteca, explica o uso e faz a integração.',
      ],
    },
    'apple-design': {
      tagline: 'Os princípios de interface fluida da Apple traduzidos em springs e gestos na web.',
      whatIsIt:
        'Conhecimento destilado das palestras de design da Apple na WWDC, sobretudo Designing Fluid Interfaces, mapeado para CSS, Pointer Events e bibliotecas de spring. Cobre resposta, interruptibilidade, inércia, materiais, tipografia e acessibilidade.',
      whyForDesign: [
        'O feedback dispara no pointer-down, então os elementos pressionados deixam de parecer mortos.',
        'As animações partem do valor ao vivo na tela, eliminando saltos visíveis quando são interrompidas.',
        'Os flicks projetam um ponto de chegada, então os arremessos param onde o gesto mirou.',
      ],
      howWithCodex: [
        'Peça ao Codex uma sheet, um drawer ou uma interação de arrastar.',
        'Ele acompanha 1:1 com pointer capture e registra o histórico de velocidade.',
        'Ao soltar, ele entrega a velocidade a um spring usando os valores de amortecimento já definidos.',
      ],
    },
    'animation-vocabulary': {
      tagline: 'Transforma uma descrição vaga de movimento no seu termo técnico exato.',
      whatIsIt:
        'Um glossário de busca reversa. O usuário descreve um efeito de movimento de forma solta e a skill devolve o termo preciso, citado ao pé da letra, com alternativas próximas quando várias servem.',
      whyForDesign: [
        'Dá ao designer a palavra certa para orientar um agente.',
        'Desfaz a confusão entre pares próximos como clip-path versus mask, pop in versus bounce.',
        'Recusa-se a inventar termos, então a nomenclatura continua confiável.',
      ],
      howWithCodex: [
        'Descreva o que você viu, algo como ‘o scroll rubber-band do iOS’.',
        'Ela devolve o termo em negrito e uma definição de glossário em uma linha.',
        'Peça alternativas quando dois termos poderiam encaixar.',
      ],
    },
    'emil-design-eng': {
      tagline: 'As regras de Emil Kowalski para timing de animação, easing e acabamento de componentes.',
      whatIsIt:
        'Codifica uma filosofia de design engineering: um framework de decisão de animação, orientação sobre springs, princípios de componente, técnicas de clip-path, tratamento de gestos, regras de performance e uma checklist de revisão.',
      whyForDesign: [
        'Ações frequentes perdem a animação por completo, então command palettes seguem instantâneas.',
        'As entradas começam em scale(0.95), nunca em scale(0), então nada surge do nada.',
        'Os popovers escalam a partir do gatilho, não do centro, mantendo a ligação espacial.',
      ],
      howWithCodex: [
        'Peça ao Codex uma revisão de código de UI; ele devolve uma tabela de Antes, Depois e Porquê.',
        'Para um movimento novo, ele responde se deve animar, por quê, qual easing e a que velocidade.',
        'Ele aplica a checklist, sinalizando transition: all e durações acima de 300ms.',
      ],
    },
    'ui-ux-pro-max-design': {
      tagline: 'Um único ponto de entrada que roteia trabalho de logo, identidade, slides, banner e ícone.',
      whatIsIt:
        'Uma skill de design unificada que roteia tarefas para sub-skills ou módulos internos. Os módulos internos cobrem geração de logo, mockups de identidade corporativa, slides em HTML, banners, fotos sociais e ícones em SVG via scripts do Gemini.',
      whyForDesign: [
        'Logo, mockups de identidade e deck saem todos de uma única entrada de marca.',
        'Os ícones são gerados como texto SVG, então continuam editáveis, não raster.',
        'As regras de banner impõem zonas seguras, no máximo duas fontes e um único CTA.',
      ],
      howWithCodex: [
        'Exporte a GEMINI_API_KEY e instale google-genai e pillow primeiro.',
        'Rode scripts/logo/search.py para um briefing de design e depois generate.py para as imagens.',
        'Alimente o logo em scripts/cip/generate.py para produzir os mockups entregáveis.',
      ],
    },
    'ui-ux-pro-max-banner-design': {
      tagline: 'Projeta banners no tamanho certo em HTML e depois os exporta como PNGs.',
      whatIsIt:
        'Um fluxo de banner em cinco passos: levantar requisitos, pesquisar direção de arte, montar o banner em HTML e CSS com visuais gerados, capturar na medida exata em pixels da plataforma e então apresentar opções para iteração.',
      whyForDesign: [
        'Todo banner é exportado nos pixels exatos da plataforma, então nada é cortado ou redimensionado.',
        'Os visuais gerados são renderizados sem texto, então os títulos ficam nítidos em HTML.',
        'Três direções de arte por pedido, então a comparação vem antes da decisão.',
      ],
      howWithCodex: [
        'Responda às perguntas de propósito, plataforma, conteúdo, marca, estilo e quantidade.',
        'Ela monta um banner HTML por direção de arte, com as zonas seguras aplicadas.',
        'Ela captura cada um na largura e altura definidas, comprimindo os arquivos acima do limite.',
      ],
    },
    'ui-ux-pro-max-ui-styling': {
      tagline: 'Constrói interfaces acessíveis com componentes shadcn e utilitários Tailwind.',
      whatIsIt:
        'Combina uma camada de componentes shadcn sobre primitivos Radix, uma camada de estilização com utilitários Tailwind e uma camada de design visual em canvas. Inclui arquivos de referência para tematização, acessibilidade, regras responsivas e customização.',
      whyForDesign: [
        'Diálogos e menus herdam o gerenciamento de foco do Radix, então a acessibilidade não é remendada depois.',
        'As cores do tema ficam em variáveis CSS, então o dark mode se mantém consistente.',
        'Breakpoints mobile-first fazem os layouts começarem pequenos e crescerem em camadas.',
      ],
      howWithCodex: [
        'Rode npx shadcn@latest init para configurar o framework e o tema.',
        'Adicione componentes com npx shadcn@latest add button card dialog form.',
        'Rode scripts/tailwind_config_gen.py para gerar um config com tokens customizados.',
      ],
    },
    'ui-ux-pro-max-brand': {
      tagline: 'Mantém guidelines de marca, design tokens e assets em sincronia.',
      whatIsIt:
        'Uma skill de identidade de marca construída em torno de scripts que injetam contexto de marca nos prompts, validam assets, extraem cores e sincronizam o brand-guidelines.md com o JSON de design tokens e as variáveis CSS.',
      whyForDesign: [
        'Um único arquivo markdown é a fonte de verdade para os tokens e o CSS.',
        'As cores extraídas são comparadas com a paleta, pegando o desvio cedo.',
        'Os assets são checados quanto a nome, tamanho e formato antes da aprovação.',
      ],
      howWithCodex: [
        'Edite docs/brand-guidelines.md e depois rode scripts/sync-brand-to-tokens.cjs.',
        'Verifique com scripts/inject-brand-context.cjs --json.',
        'Confira qualquer arquivo novo com scripts/validate-asset.cjs antes de entregá-lo.',
      ],
    },
    'ui-ux-pro-max-slides': {
      tagline: 'Constrói decks de apresentação em HTML com Chart.js e padrões de layout.',
      whatIsIt:
        'Uma pequena skill de roteamento para apresentações estratégicas em HTML. Ela interpreta um subcomando e depois carrega arquivos de referência que cobrem padrões de layout, um template HTML, fórmulas de copywriting e estratégias de slide.',
      whyForDesign: [
        'Os slides são HTML, então tipografia e espaçamento seguem design tokens de verdade.',
        'O Chart.js cuida dos slides de dados, então os números ficam vivos em vez de imagens coladas.',
        'Os padrões de layout são escolhidos de um conjunto, mantendo o deck visualmente consistente.',
      ],
      howWithCodex: [
        'Chame-a com o subcomando create mais um tema e a quantidade de slides.',
        'Ela carrega references/create.md e segue esse fluxo de criação.',
        'Ela puxa padrões de layout e fórmulas de copywriting dos arquivos de referência.',
      ],
    },
    'design-system-tokens': {
      tagline: 'Design tokens em três camadas, specs de componente e geração de slides fiel aos tokens.',
      whatIsIt:
        'Uma skill de design system que cobre as camadas de token primitivo, semântico e de componente como variáveis CSS, além de specs de estado de componente e um gerador de slides que monta decks a partir desses mesmos tokens.',
      whyForDesign: [
        'A camada de token semântico faz a troca entre tema claro e escuro virar uma mudança de config, não uma reescrita.',
        'As specs de componente tabelam os estados default, hover, active e disabled, então o handoff não deixa nada ambíguo.',
        'Um validador sinaliza valores hex fixos no código, mantendo componentes e slides dentro do sistema de tokens.',
      ],
      howWithCodex: [
        'Rode generate-tokens.cjs sobre um config de tokens em JSON para emitir seu arquivo de variáveis CSS.',
        'Peça specs de componente ao Codex e depois rode validate-tokens.cjs sobre src/ para pegar valores crus.',
        'Use search-slides.py com as flags de posição e contexto para escolher os layouts de um deck.',
      ],
    },
    'editorial-ui-style': {
      tagline: 'Layout de revista em serifa Gelasio sobre um grid rígido de 8pt.',
      whatIsIt:
        'Uma skill de guideline de design system para um visual editorial moderno: serifa Gelasio no corpo e no display, Ubuntu Mono, quase preto #111111 sobre superfícies brancas e um grid base de 8pt.',
      whyForDesign: [
        'Display e corpo em serifa da mesma família mantêm os trechos longos de leitura consistentes na tipografia.',
        'Um grid base de 8pt impõe ritmo vertical entre títulos, corpo de texto e espaçamento.',
        'O piso de acessibilidade inclui suporte a reduced-motion, alvos de toque de 44px e tratamento de alto contraste.',
      ],
      howWithCodex: [
        'Peça ao Codex para reafirmar a intenção de design e definir os tokens antes de mexer nos componentes.',
        'Solicite regras de componente que cubram anatomia, variantes, estados e comportamento responsivo.',
        'Feche com a checklist de QA para que um revisor de código consiga verificar a saída.',
      ],
    },
    'terracotta-ui-style': {
      tagline: 'Destaque terracota sobre creme, títulos em DM Serif Display, leitura longa.',
      whatIsIt:
        'Uma skill de guideline para uma interface editorial de tom terroso: superfícies creme #F3E9D8, um único destaque terracota #C56A3C, títulos em DM Serif Display, JetBrains Mono. Afinada para blogs e narrativas.',
      whyForDesign: [
        'Uma só cor de destaque, então a ênfase fica escassa e os títulos carregam a hierarquia.',
        'As superfícies creme quentes reduzem o ofuscamento em artigos longos, em comparação com páginas de branco puro.',
        'Títulos em serifa de display sobre corpo em marrom-tinta definem um ritmo editorial claro.',
      ],
      howWithCodex: [
        'Aponte o Codex para os tokens terracota e creme antes de ele escrever qualquer componente.',
        'Peça anatomia, variantes e estados por componente, com os tokens de espaçamento nomeados de forma explícita.',
        'Solicite anti-padrões e notas de migração ao adaptar uma UI existente e inconsistente.',
      ],
    },
    'dithered-ui-style': {
      tagline: 'Sombreamento em padrão de pontos e paleta limitada para telas retrô de alto contraste.',
      whatIsIt:
        'Uma skill de guideline para interfaces com dithering que usam padrões de pontos para simular tons a partir de uma paleta limitada. Corpo em Open Sans, display em Space Grotesk, IBM Plex Mono, destaques em azul e violeta.',
      whyForDesign: [
        'Padrões de pontos substituem os gradientes, então o sombreamento sobrevive a um conjunto de cores propositalmente restrito.',
        'A renderização de alto contraste mantém o texto legível mesmo quando as superfícies carregam textura pesada de padrão.',
        'As regras proíbem movimento decorativo, evitando que o tratamento retrô vire ruído visual.',
      ],
      howWithCodex: [
        'Diga ao Codex o limite de paleta primeiro e deixe-o derivar as regras de sombreamento por padrão.',
        'Peça estados vazio, de carregamento e de erro para que as superfícies com padrão sigam legíveis.',
        'Verifique as áreas de clique e os estados de foco, que esta skill aponta de forma explícita.',
      ],
    },
    'neumorphism-ui-style': {
      tagline: 'Superfícies extrudadas suaves em cinza-pedra com tipografia Space Mono.',
      whatIsIt:
        'Uma skill de guideline para UI neumórfica: sombras internas e externas sobre uma superfície monocromática cinza-pedra #E7E5E4, um destaque teal #006666, Space Mono no display e no corpo, espaçamento de densidade compacta.',
      whyForDesign: [
        'Superfícies monocromáticas fazem a profundidade vir da sombra, não do contraste de cor.',
        'O espaçamento de densidade compacta serve a painéis cheios de controles, como dashboards e telas de configuração.',
        'As regras proíbem misturar metáforas visuais, então a extrusão suave segue como a única linguagem de profundidade.',
      ],
      howWithCodex: [
        'Faça o Codex definir os tokens de superfície e sombra antes de estilizar qualquer controle.',
        'Peça estados de foco visíveis, já que sombras suaves sozinhas falham com quem usa teclado.',
        'Exija HTML semântico antes de ARIA, como esta skill especifica.',
      ],
    },
    'bento-ui-style': {
      tagline: 'Grid de blocos variados sobre creme, tipografia Inter, escala compacta.',
      whatIsIt:
        'Uma skill de guideline para layouts bento box que apresentam o conteúdo como blocos de grid de tamanhos variados. Inter em tudo, uma escala tipográfica compacta de 12 a 32, destaques pêssego e azul sobre creme.',
      whyForDesign: [
        'Tamanhos de bloco variados carregam a hierarquia, então o próprio grid faz a ordenação.',
        'Uma escala tipográfica compacta de 12 a 32 acomoda texto denso dentro de blocos pequenos.',
        'A superfície creme #FFF5E6 mantém as bordas dos blocos legíveis sem bordas pesadas.',
      ],
      howWithCodex: [
        'Peça ao Codex para atribuir a cada bloco um tamanho conforme a prioridade do conteúdo.',
        'Defina os tokens de espaçamento na escala de 4 a 32 antes de dispor os blocos.',
        'Solicite o tratamento de overflow e rótulos longos, que esta skill lista como casos-limite.',
      ],
    },
    'claymorphism-ui-style': {
      tagline: 'Formas 3D roliças e arredondadas, títulos em Poppins, azul sobre branco.',
      whatIsIt:
        'Uma skill de guideline para UI claymórfica: formas suaves, arredondadas e roliças que imitam argila maleável. Display em Poppins, corpo em Montserrat, um destaque azul #3B82F6 e texto azul-escuro sobre branco.',
      whyForDesign: [
        'Formas roliças e arredondadas dão aos botões uma clara sensação de que dá para apertar, sem rótulos extras.',
        'O texto azul-escuro #1C398E sobre branco garante contraste enquanto a paleta segue lúdica.',
        'As regras proíbem misturar metáforas, então a profundidade de argila nunca se junta a vidro ou flat.',
      ],
      howWithCodex: [
        'Peça primeiro ao Codex os tokens de raio e sombra, já que são eles que definem o visual de argila.',
        'Combine o display Poppins com o corpo Montserrat como especificado, não duas fontes sans parecidas.',
        'Confira que os estados focus-visible e disabled sobrevivem ao tratamento de formas suaves.',
      ],
    },
    'brutalism-ui-style': {
      tagline: 'Layouts inspirados em concreto bruto, display Darker Grotesque, vermelho e ocre.',
      whatIsIt:
        'Uma skill de guideline para UI brutalista, inspirada na arquitetura de concreto bruto dos anos 1950: sem adornos, funcional, propositalmente áspera. Display em Darker Grotesque, vermelho #DD614C e ocre #DAA144 sobre branco.',
      whyForDesign: [
        'Elementos marcantes e sem adorno abrem mão da decoração, então estrutura e texto carregam o peso.',
        'Dois destaques fortes, vermelho e ocre, substituem por completo gradientes e sombras.',
        'O piso de acessibilidade continua valendo, então os layouts ásperos mantêm contraste e foco visível.',
      ],
      howWithCodex: [
        'Diga ao Codex que o tom é marcante e sem adorno antes de ele escolher os componentes.',
        'Ancore cada regra a um token ou limiar, como exigem os portões de qualidade.',
        'Combine cada regra do que fazer com um exemplo concreto do que não fazer ao revisar a saída.',
      ],
    },
    'hallmark-design-skill': {
      tagline: 'Fluxo de design anti-genérico com 58 portões e variedade estrutural obrigatória.',
      whatIsIt:
        'Uma skill de design para assistentes de código de IA, com um fluxo de construção padrão e três verbos: audit, redesign e study. Ela força a variedade estrutural para que duas construções não compartilhem o mesmo ritmo de página.',
      whyForDesign: [
        'As regras de diversificação forçam macroestruturas, navs e rodapés diferentes entre construções consecutivas.',
        'Os tokens travados proíbem valores hex ou font-family inline que driblem o bloco de tokens.',
        'Toda saída é verificada nas larguras de 320, 375, 414 e 768 pixels.',
      ],
      howWithCodex: [
        'Deixe a varredura de pré-voo ler primeiro as fontes, a paleta e as bibliotecas de movimento existentes.',
        'Responda ao portão de público, caso de uso e tom, ou diga para seguir em frente.',
        'Rode o hallmark audit numa página para uma lista priorizada de ajustes, sem edições.',
      ],
    },
    'impeccable': {
      tagline: 'Duas dúzias de comandos para construir, criticar e refinar interfaces de frontend.',
      whatIsIt:
        'Uma skill de design de frontend com comandos agrupados em build, evaluate, refine, enhance, fix e iterate. Ela lê o contexto do projeto e uma referência de registro, e então escreve código em nível de produção.',
      whyForDesign: [
        'A separação de registro leva páginas de marketing e UI de produto por regras de design diferentes.',
        'Proibições absolutas rejeitam texto em gradiente, bordas com faixa lateral e rótulos eyebrow acima de cada seção.',
        'Os pisos de contraste são explícitos: 4.5:1 para o corpo de texto, 3:1 para texto grande.',
      ],
      howWithCodex: [
        'Rode context.mjs uma vez por sessão para a skill carregar PRODUCT.md e DESIGN.md.',
        'Chame um comando como critique, polish ou animate com um arquivo alvo.',
        'Use o modo live com um dev server rodando para gerar variantes no navegador.',
      ],
    },
    'design-dna': {
      tagline: 'Extrai um design de referência para JSON estruturado e depois gera a partir dele.',
      whatIsIt:
        'Um fluxo em três fases que captura a identidade de design em tokens mensuráveis, estilo qualitativo e efeitos visuais. Ele gera um JSON de Design DNA completo e depois aplica esse JSON a novo conteúdo.',
      whyForDesign: [
        'Transforma um screenshot ou uma URL em valores nomeados de cor, tipografia e espaçamento.',
        'Registra clima, composição e voz de marca, não só tokens mensuráveis.',
        'Captura efeitos de Canvas, WebGL, shader e scroll que o CSS puro não consegue expressar.',
      ],
      howWithCodex: [
        'Peça o schema para ver as três dimensões antes de analisar qualquer coisa.',
        'Entregue ao Codex imagens ou URLs de referência e peça um DNA JSON preenchido.',
        'Passe o JSON junto com seu conteúdo para gerar uma página HTML autocontida.',
      ],
    },
    'material-3': {
      tagline: 'Implementa o Material Design 3 do Google em Compose, Flutter e web.',
      whatIsIt:
        'Um guia do Material Design 3 que cobre o namespace de tokens md.sys, mais de 30 componentes, layout adaptativo, tematização e M3 Expressive. O Jetpack Compose é o alvo principal; Flutter e @material/web são secundários.',
      whyForDesign: [
        'Tokens de cor, tipografia, forma e elevação substituem valores de hex e raio fixos no código.',
        'Superfícies tonais carregam a profundidade no lugar das sombras, seguindo a spec atual do MD3.',
        'Uma auditoria pontuada avalia dez categorias e lista as correções por ordem de prioridade.',
      ],
      howWithCodex: [
        'Informe a plataforma para o Codex escolher Compose, Flutter ou custom properties de CSS.',
        'Peça um componente e receba a variante correta com a ligação de tokens.',
        'Rode a auditoria sobre uma URL ou arquivos-fonte para um relatório de conformidade.',
      ],
    },
    'make-interfaces-feel-better': {
      tagline: 'Dezesseis regras concretas de acabamento de UI com uma checklist de revisão.',
      whatIsIt:
        'Um conjunto de princípios de design engineering para acabamento de interface: raios concêntricos, alinhamento óptico, sombras em camadas, animações de entrada escalonadas, números tabulares, áreas de clique e especificidade de transição.',
      whyForDesign: [
        'Nomeia valores exatos, então a escala ao pressionar é sempre 0.96, nunca no chute.',
        'Corrige o descompasso de raios aninhados que faz a maioria dos componentes parecer errada.',
        'Pega o deslocamento de layout causado por números que mudam antes de chegar aos usuários.',
      ],
      howWithCodex: [
        'Aponte o Codex para um componente e peça que ele aplique os princípios.',
        'Solicite uma revisão; os achados voltam como tabelas de Antes e Depois.',
        'Rode a checklist de quatorze itens antes de fazer merge de qualquer mudança de frontend.',
      ],
    },
    'visual-plan': {
      tagline: 'Transforma planos em texto em documentos revisáveis, com wireframes e protótipos.',
      whatIsIt:
        'Um modo de planejamento estruturado para agentes de código. Os planos viram documentos fáceis de escanear, com diagramas inline, código, modelos de dados, questões em aberto e um canvas superior opcional ou um protótipo ao vivo.',
      whyForDesign: [
        'Os planos de UI abrem com artboards de wireframe, um por estado visível ao usuário.',
        'Os revisores comentam em elementos ancorados em vez de discutir no chat.',
        'Fluxos de vários passos ganham um protótipo operável ao lado dos mockups estáticos.',
      ],
      howWithCodex: [
        'Instale com a CLI Agent-Native e depois rode o comando /visual-plan.',
        'Cole um plano existente em Codex ou Markdown para usar como fonte.',
        'Leia o feedback, ajuste o plano e verifique o resultado persistido.',
      ],
    },
    'kami': {
      tagline: 'Compõe currículos, white papers, decks e landing pages sobre uma única linguagem de design.',
      whatIsIt:
        'Um sistema de templates para documentos profissionais e landing pages de produto. Fundo de pergaminho quente, destaque azul-tinta, hierarquia liderada por serifa, com templates para nove tipos de documento e quinze primitivos de diagrama.',
      whyForDesign: [
        'Uma cor de destaque e uma família serifada mantêm todo entregável visualmente consistente.',
        'Um contrato de densidade sinaliza páginas de corpo que renderizam com menos da metade preenchida.',
        'Os primitivos de diagrama cobrem arquitetura, fluxogramas, quadrantes, linhas do tempo e gráficos.',
      ],
      howWithCodex: [
        'Diga o que você precisa; a árvore de decisão escolhe o template correspondente.',
        'Deixe o Codex destilar seu conteúdo bruto num content.json validado primeiro.',
        'Rode o script de build para produzir HTML, PDF e relatórios de verificação.',
      ],
    },
    'masked-reveal': {
      tagline: 'Revela títulos palavra por palavra através de uma máscara de overflow no scroll.',
      whatIsIt:
        'Um padrão de GSAP ScrollTrigger que divide um título em spans de palavras mascaradas e as escalona para cima conforme o texto entra na viewport. Inclui um padrão de limpeza para React.',
      whyForDesign: [
        'O escalonamento por palavra soa mais calmo e editorial do que a animação por letra.',
        'Os leitores de tela ainda recebem o texto completo por um aria-label.',
        'Quem usa reduced-motion vê texto estático, sem nenhum transform aplicado.',
      ],
      howWithCodex: [
        'Marque um título com data-masked-reveal e adicione as regras de mask em CSS.',
        'Chame o helper de split, que dispensa o plugin pago SplitText.',
        'Envolva num contexto do GSAP no React para o ScrollTrigger se limpar na troca de rota.',
      ],
    },
    'framed-grid-layout': {
      tagline: 'Constrói layouts editoriais precisos com molduras finas e cantoneiras.',
      whatIsIt:
        'Um padrão de grid de doze colunas em que cada seção se alinha a colunas compartilhadas dentro de caixas emolduradas de 1px. As cantoneiras em L são desenhadas como camadas de fundo sobre uma textura diagonal de baixa opacidade.',
      whyForDesign: [
        'Toda seção compartilha uma cor de borda, um tamanho de cantoneira e uma escala de espaçamento.',
        'As cantoneiras não precisam de markup extra, então a estrutura fica no CSS.',
        'O layout ainda se lê com clareza se a camada de textura for removida.',
      ],
      howWithCodex: [
        'Peça uma página técnica ou editorial e receba primeiro o grid pai.',
        'Atribua classes de span explícitas em vez de larguras de seção improvisadas.',
        'Verifique se as arestas das molduras se alinham na vertical e na horizontal nos dois breakpoints.',
      ],
    },
    'container-lines': {
      tagline: 'Desenha linhas-guia verticais discretas nas bordas do seu container de conteúdo.',
      whatIsIt:
        'Um padrão de CSS que adiciona linhas verticais de 1px nas duas bordas do container de conteúdo, mais quadradinhos de canto opcionais. As guias ficam atrás do conteúdo e ignoram eventos de ponteiro.',
      whyForDesign: [
        'Revela a largura do container, então seções de hero soltas ganham tensão estrutural.',
        'As guias compartilham o max-width e o padding do container, então nunca saem do lugar.',
        'Os eventos de ponteiro ficam desativados, então as linhas nunca bloqueiam cliques ou seleção.',
      ],
      howWithCodex: [
        'Adicione a classe container-lines à casca de layout.',
        'Coloque os quadradinhos de canto só em cantos reais de container ou seção.',
        'Confira que as linhas seguem sutis em fundos claros e escuros.',
      ],
    },
    'skeuomorphic-ui': {
      tagline: 'Dá profundidade tátil a botões e painéis com gradientes e sombras em camadas.',
      whatIsIt:
        'Uma receita de superfície para UI web tátil: preenchimentos em gradiente vertical, uma borda em gradiente reflexivo de 1px, sombras externas e internas empilhadas. Texto em relevo, ícones e microtextura são opcionais.',
      whyForDesign: [
        'Os estados elevado e pressionado invertem a profundidade, então os controles parecem físicos.',
        'A profundidade se mantém direcional, com luz vindo de cima e sombra embaixo.',
        'Alerta contra misturar glassmorphism, neumorphism e skeuomorphism num só componente.',
      ],
      howWithCodex: [
        'Defina os tokens base uma vez e depois ajuste-os por marca e tema.',
        'Aplique a superfície elevada a cards, botões, abas e carcaças de controle.',
        'Adicione a variante pressionada só para toggles ativos e abas selecionadas.',
      ],
    },
    'beautiful-shadows': {
      tagline: 'Três utilitários de sombra prontos em Tailwind para elevação neutra em camadas.',
      whatIsIt:
        'Um conjunto de classes de sombra arbitrárias e exatas em Tailwind, em três intensidades. Cada uma empilha várias camadas neutras de baixa opacidade em vez da escala de sombra padrão do Tailwind.',
      whyForDesign: [
        'A elevação se mantém neutra, sem brilho colorido tingindo a superfície de baixo.',
        'Três intensidades fixas correspondem a controles, cards e mídia de hero, respectivamente.',
        'Camadas empilhadas de baixa opacidade parecem profundidade real em vez de um drop shadow bruto.',
      ],
      howWithCodex: [
        'Peça ao Codex para aplicar o utilitário md a cards, painéis e popovers.',
        'Reserve o utilitário lg para mídia de hero e containers tipo modal.',
        'Combine cada sombra com um preenchimento de superfície limpo e raio consistente.',
      ],
    },
    'dither-background': {
      tagline: 'Fundo em canvas com dithering Bayer 4x4 visível e pixels quadrados.',
      whatIsIt:
        'Uma receita de canvas que renderiza um campo procedural quase preto a partir de value noise, FBM e um limiar Bayer 4x4, desenhado como células quadradas ampliadas.',
      whyForDesign: [
        'As células ampliadas mantêm a matriz de dither legível em vez de colapsar em granulação de filme.',
        'Uma paleta monocromática de seis passos mantém o texto em primeiro plano legível sem um overlay pesado.',
        'A vinheta e a massa fora do eixo dão uma única área focal iluminada, não um brilho uniforme.',
      ],
      howWithCodex: [
        'Coloque o canvas fixo atrás do conteúdo e defina pointer-events como none.',
        'Ajuste o cellSize entre 5px e 10px para a legibilidade da matriz.',
        'Ajuste os valores de wave, cloud, ridge e vignette para moldar a massa.',
      ],
    },
    'webgl-laser': {
      tagline: 'Feixe em shader de tela cheia, com núcleo incandescente e névoa na cor da marca.',
      whatIsIt:
        'Um fragment shader WebGL puro que desenha um laser vertical fino sobre um quad de tela cheia. O núcleo fica quase branco; o halo e a fumaça FBM seguem o seu destaque.',
      whyForDesign: [
        'O halo e a fumaça saem do destaque da sua marca em vez de um azul fixo no código.',
        'Larguras separadas de núcleo e brilho mantêm o feixe como uma lâmina, não uma barra.',
        'A fumaça se concentra perto do feixe e se dissipa para fora, protegendo o contraste do texto.',
      ],
      howWithCodex: [
        'Defina uma custom property --brand-accent, que o shader converte para RGB.',
        'Coloque o canvas fixo atrás do conteúdo com pointer-events none.',
        'Ajuste coreWidth, glowWidth, smokeDensity e xOffset para posicionar o feixe.',
      ],
    },
    'mesh-gradient-dark-blue-clean': {
      tagline: 'Sistema navy quase preto com um campo mesh dentro de uma casca de hero.',
      whatIsIt:
        'Uma direção em azul-escuro com tokens de cor em CSS, uma casca de hero com borda em gradiente, campo mesh em canvas, pílula de nav em vidro, nós flutuantes, trilhos e CTAs em par.',
      whyForDesign: [
        'O mesh fica dentro da casca de hero, então ele conduz a composição em vez de só decorá-la.',
        'Tokens nomeados fixam os valores de fundo, casca, linha, texto e destaque em toda a página.',
        'Trilhos, quadradinhos de canto e pílulas de nó dão estrutura técnica à casca minimalista.',
      ],
      howWithCodex: [
        'Cole o bloco de tokens e depois monte a base da página e a casca de hero.',
        'Adicione o canvas do mesh dentro da casca, atrás do conteúdo dela.',
        'Posicione alguns nós, trilhos e marcadores e mantenha os loops de deriva lentos.',
      ],
    },
    'agency-grid-layout-minimal': {
      tagline: 'Grid editorial de várias colunas com títulos enormes e rótulos minúsculos em caixa alta.',
      whatIsIt:
        'Uma direção de layout para sites de agência: cascas de grid largas, títulos de display enormes, metadados pequenos em caixa alta nas colunas ao lado e blocos de imagem arquitetônicos.',
      whyForDesign: [
        'O posicionamento rígido em colunas faz cada elemento parecer estar ali de propósito.',
        'O contraste de escala entre os títulos de display e os metadados minúsculos carrega a hierarquia.',
        'O espaço negativo é preservado em vez de preenchido, mantendo a página editorial.',
      ],
      howWithCodex: [
        'Defina primeiro uma casca de max-width larga com divisões de coluna visíveis.',
        'Ancore um título de hero ao longo da maioria das colunas e o texto de apoio numa coluna lateral.',
        'Monte as linhas de serviço como listagens de várias colunas com rótulos de metadados minúsculos.',
      ],
    },
    'glass-dark-mode-clock': {
      tagline: 'Superfícies escuras foscas construídas em torno de um mostrador circular de calibração.',
      whatIsIt:
        'Uma direção em vidro escuro centrada num mostrador tipo relógio: base quase preta com grids de feixe, cápsulas de nav foscas e um centro em anéis e marcações em camadas.',
      whyForDesign: [
        'Um mostrador dominante ancora o layout em vez de ficar como um widget decorativo.',
        'Linhas de feixe e miras se alinham ao mostrador, reforçando a lógica de calibração.',
        'A paleta monocromática faz o brilho vir dos reflexos do vidro, não de destaques saturados.',
      ],
      howWithCodex: [
        'Comece com uma base quase preta mais guias tênues de grid e feixe.',
        'Monte nav, pílulas e botões como cápsulas de vidro escuro com wrappers de reflexo de 1px.',
        'Monte o mostrador em camadas: anel externo, marcações, rótulos girando, emblema central.',
      ],
    },
    'gsap-skills': {
      tagline: 'Conjunto oficial de animação GSAP, dos tweens do core ao ScrollTrigger e React.',
      whatIsIt:
        'O conjunto oficial de skills da GreenSock para construir animação web com GSAP. Oito módulos cobrem a API do core, timelines, ScrollTrigger, plugins, React, outros frameworks, performance e utilitários.',
      whyForDesign: [
        'O movimento segue a API real do GSAP em vez de o agente adivinhar a sintaxe.',
        'O ScrollTrigger e as timelines são sequenciados como deve ser, não empilhados de qualquer jeito.',
        'As regras de performance mantêm a animação suave em vez de travada no scroll.',
      ],
      howWithCodex: [
        'Instale o conjunto de skills GSAP para o Codex conseguir carregar o módulo certo.',
        'Peça o movimento que você quer; o módulo certo cuida da API.',
        'Recorra ao módulo de React ou de frameworks dentro de uma árvore de componentes.',
      ],
    },
    'animation-review': {
      tagline: 'Encontra, melhora e revisa movimento com um padrão de ofício sênior.',
      whatIsIt:
        'Três das skills de movimento de Emil Kowalski atuando como um único loop: encontrar lugares que deveriam animar, melhorar o movimento existente e revisar o código de animação contra um alto padrão de ofício.',
      whyForDesign: [
        'Revela a UI que deveria se mover e não se move, e rejeita o movimento que não deveria existir.',
        'Transforma o vago ‘deixa mais agradável’ numa auditoria de movimento priorizada.',
        'Mede a animação por um padrão de ofício nomeado, não pelo gosto pessoal.',
      ],
      howWithCodex: [
        'Rode o passo de find para localizar oportunidades de movimento na sua UI.',
        'Aplique o passo de improve para retrabalhar o código de animação existente.',
        'Rode o passo de review antes de entregar para pegar movimento de baixo ofício.',
      ],
    },
  },
};
