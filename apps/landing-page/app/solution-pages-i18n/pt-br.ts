import type { SolutionLocaleCopy } from './types';

export const PT_BR: SolutionLocaleCopy = {
  prototype: {
    title: 'Crie protótipos interativos com Open Design + Claude Code',
    description:
      'Transforme um prompt em um protótipo clicável de várias telas sem sair do terminal. O Open Design dá ao seu agente de programação as habilidades de design, os modelos e o sistema de design para entregar protótipos reais que você abre no navegador.',
    breadcrumb: 'Protótipo',
    label: 'Caso de uso · Protótipo',
    heading: 'Prototipe na velocidade de um prompt',
    lead: 'Descreva o fluxo que você tem em mente e deixe seu agente montar um protótipo real e clicável — várias telas, estilos compartilhados e interações ao vivo — renderizado direto em HTML que você pode abrir, compartilhar e entregar à engenharia.',
    heroImageAlt:
      'Ilustração editorial de uma mão esboçando um wireframe que vira um protótipo de app clicável de várias telas',
    tldrTitle: 'Em uma linha',
    tldrBody:
      'O Open Design é a camada de design para o agente de programação que você já usa. Para prototipagem, isso significa ir de uma ideia de um parágrafo a um protótipo navegável e estilizado em uma única sessão — sem ferramenta de design, sem etapa de exportação, sem lacuna na entrega.',
    stepsTitle: 'Como funciona a prototipagem com o Open Design',
    steps: [
      {
        title: 'Descreva o fluxo',
        body: 'Diga ao seu agente o que você está construindo em linguagem simples — «um fluxo de onboarding com tela de boas-vindas, seletor de planos e confirmação». O Open Design carrega a habilidade de protótipo para que o agente saiba que deve produzir telas, não uma única página.',
        imageAlt:
          'Ilustração de uma pessoa digitando em um terminal uma descrição em linguagem simples do fluxo de um app',
      },
      {
        title: 'Gere telas estilizadas',
        body: 'O agente aplica um sistema de design e modelos de protótipo do Open Design, então cada tela compartilha tipografia, espaçamento e componentes em vez de parecer um rascunho. Você obtém um conjunto coerente de telas, não maquetes desconexas.',
        imageAlt:
          'Ilustração de várias telas de app surgindo em sequência, todas compartilhando um estilo visual consistente',
      },
      {
        title: 'Conecte as interações',
        body: 'Os botões navegam, as abas trocam, os modais abrem. O protótipo é renderizado em HTML autocontido, então se comporta como o produto real em qualquer navegador — não é preciso conta em uma ferramenta de prototipagem para visualizá-lo.',
        imageAlt:
          'Ilustração de um cursor clicando por telas conectadas com setas mostrando a navegação entre elas',
      },
      {
        title: 'Itere e entregue',
        body: 'Refine conversando com o agente — «coloque o seletor de planos em um layout de três colunas». Como o artefato vive no seu projeto, o design e o código final compartilham uma única fonte da verdade, fechando a habitual lacuna de entrega entre designer e engenheiro.',
        imageAlt:
          'Ilustração de um protótipo sendo revisado e depois passado a um engenheiro, com design e código se fundindo em um só arquivo',
      },
    ],
    tableTitle: 'Prototipagem com Open Design vs. o jeito antigo',
    tableColCapability: 'O que você precisa',
    tableColWithOd: 'Com o Open Design',
    tableColWithout: 'Ferramentas de prototipagem tradicionais',
    tableRows: [
      {
        capability: 'Ir da ideia à primeira tela',
        withOd: 'Um prompt no agente que você já tem aberto',
        without: 'Abrir uma ferramenta separada, iniciar um arquivo, arrastar caixas à mão',
      },
      {
        capability: 'Várias telas conectadas',
        withOd: 'Geradas como um conjunto com estilos compartilhados e navegação funcionando',
        without: 'Cada quadro desenhado e conectado manualmente',
      },
      {
        capability: 'Sistema visual consistente',
        withOd: 'Vindo de um sistema de design reutilizável que o agente aplica',
        without: 'Recriado por arquivo ou mantido à mão',
      },
      {
        capability: 'Resultado compartilhável',
        withOd: 'HTML autocontido — abre em qualquer navegador, sem conta',
        without: 'Quem visualiza precisa de uma licença ou de um link de compartilhamento na ferramenta do fornecedor',
      },
      {
        capability: 'Caminho até o código real',
        withOd: 'O artefato vive no seu repositório; design e código compartilham uma fonte',
        without: 'Refeito do zero após uma entrega separada',
      },
      {
        capability: 'Custo e dependência do fornecedor',
        withOd: 'Código aberto, use suas próprias chaves, roda localmente',
        without: 'Assinatura por licença, hospedado pelo fornecedor, exportação limitada',
      },
    ],
    featuresTitle: 'O que você pode prototipar',
    features: [
      {
        title: 'Apps web de várias telas',
        body: 'Fluxos completos com navegação compartilhada — onboarding, painéis, configurações — não páginas avulsas.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Fluxos de apps mobile',
        body: 'Jornadas mobile tela a tela com transições e estados de cara nativa.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Páginas de destino',
        body: 'Páginas de marketing e landings SaaS que você pode percorrer e publicar.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Qualquer gosto visual',
        body: 'Editorial, suave ou brutalista — o protótipo carrega um estilo coerente do começo ao fim.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Lista de espera e preços',
        body: 'Superfícies de conversão — listas de espera, tabelas de preços — conectadas e com a sua marca.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Gamificado e divertido',
        body: 'Conceitos com muita interação, onde movimento e estado fazem parte da proposta.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Protótipos que as pessoas criaram com o Open Design',
    galleryLead:
      'Cada um deles começou como um prompt e foi renderizado em um artefato clicável. Escolha um modelo próximo da sua ideia, descreva sua variação e o agente o adapta.',
    gallery: [
      { thumb: "example-dating-web", caption: "App web de namoro — fluxo de várias telas" },
      { thumb: "example-hr-onboarding", caption: "Fluxo de onboarding de RH" },
      { thumb: "example-kami-landing", caption: "Página de destino de produto" },
      { thumb: "example-web-prototype-taste-soft", caption: "Protótipo web de estilo suave" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar modelos de protótipo',
    faqTitle: 'Perguntas frequentes sobre prototipagem',
    faq: [
      {
        q: 'Preciso de uma ferramenta de design como o Figma para prototipar com o Open Design?',
        a: 'Não. O Open Design roda dentro do seu agente de programação e renderiza protótipos em HTML. Você descreve o fluxo em palavras; o agente produz as telas. Não há uma ferramenta de canvas separada para aprender ou pagar.',
      },
      {
        q: 'Os protótipos são interativos ou apenas maquetes estáticas?',
        a: 'Interativos. Navegação, abas e modais funcionam porque a saída é HTML e CSS reais. Você pode percorrê-los em qualquer navegador exatamente como um usuário faria.',
      },
      {
        q: 'Quais agentes posso usar?',
        a: 'O Open Design funciona com Claude Code, Codex, Cursor Agent, Gemini CLI e mais uma dúzia de adaptadores nativos. Você usa suas próprias chaves de provedor; nada é hospedado por você.',
      },
      {
        q: 'Um protótipo pode virar o produto real?',
        a: 'É essa a ideia. O artefato vive no seu projeto, então o mesmo sistema de design e os componentes seguem para o código de produção em vez de serem descartados após uma entrega.',
      },
    ],
    ctaTitle: 'Prototipe sua próxima ideia hoje à noite',
    ctaBody:
      'Dê uma estrela ao repositório, instale o Open Design e transforme seu próximo «e se...» em algo que você pode clicar — no agente que você já usa.',
  },
  dashboard: {
    title: 'Gere painéis de dados com Open Design + Claude Code',
    description:
      'Descreva as métricas que você acompanha e deixe seu agente de programação construir um painel estilizado e responsivo — gráficos, cartões de KPI e tabelas renderizados em HTML que você hospeda onde quiser. Sem licença de ferramenta de BI, sem construtor de arrastar e soltar.',
    breadcrumb: 'Painel',
    label: 'Caso de uso · Painel',
    heading: 'Painéis a partir de uma descrição, não de um construtor de arrastar e soltar',
    lead: 'Diga ao seu agente o que mostrar e como deve parecer. O Open Design fornece os padrões de gráfico, o sistema de layout e a linguagem visual para que você obtenha um painel coerente e apresentável — não uma parede de widgets com estilo padrão.',
    heroImageAlt:
      'Ilustração editorial de números brutos à esquerda fluindo para um painel limpo de gráficos e cartões de KPI à direita',
    tldrTitle: 'Em uma linha',
    tldrBody:
      'O Open Design transforma uma especificação em linguagem simples das suas métricas em um painel estilizado que seu agente renderiza em HTML — versionado no seu repositório, hospedável onde quiser, sem assinatura de BI por licença.',
    stepsTitle: 'Como funcionam os painéis com o Open Design',
    steps: [
      {
        title: 'Descreva as métricas',
        body: 'Liste o que importa — «usuários ativos semanais, receita por plano, churn e uma tendência de 30 dias». O agente carrega a habilidade de painel para saber que deve dispor cartões de KPI, gráficos e uma tabela em vez de um único bloco de texto.',
        imageAlt: 'Ilustração de uma pessoa listando as métricas que lhe importam',
      },
      {
        title: 'Escolha os padrões de gráfico',
        body: 'O Open Design traz modelos de gráfico e layout, então tendências viram gráficos de linha, divisões viram barras e proporções viram a visualização certa — tipografia e espaçamento consistentes em tudo, em vez de padrões desencontrados.',
        imageAlt: 'Ilustração de vários tipos de gráfico organizados em uma grade coerente',
      },
      {
        title: 'Conecte seus dados',
        body: 'Aponte o painel para um CSV, um endpoint JSON ou cole linhas de exemplo. Ele renderiza em HTML autocontido que se atualiza quando os dados mudam — abra em qualquer navegador, coloque em qualquer hospedagem estática.',
        imageAlt: 'Ilustração de um arquivo de dados conectando-se a um painel com atualização ao vivo',
      },
      {
        title: 'Refine e publique',
        body: 'Ajuste conversando com o agente — «agrupe a receita por região, mova a linha de KPI para o topo». O artefato vive no seu projeto, então o painel pode ser revisado e versionado como qualquer outro código.',
        imageAlt: 'Ilustração de um painel sendo refinado e depois implantado',
      },
    ],
    tableTitle: 'Painéis com Open Design vs. o jeito antigo',
    tableColCapability: 'O que você precisa',
    tableColWithOd: 'Com o Open Design',
    tableColWithout: 'Ferramentas de BI / codificado à mão',
    tableRows: [
      {
        capability: 'Ir da lista de métricas ao layout',
        withOd: 'Um prompt; o agente dispõe cartões, gráficos e tabelas',
        without: 'Arrastar widgets um a um, ou escrever o código dos gráficos do zero',
      },
      {
        capability: 'Sistema visual consistente',
        withOd: 'Padrões de gráfico e espaçamento de um sistema de design reutilizável',
        without: 'Estilos de widget padrão, ou estilizado à mão por gráfico',
      },
      {
        capability: 'Conectar dados',
        withOd: 'CSV / JSON / linhas coladas, renderizado em HTML ao vivo',
        without: 'Conectores do fornecedor ou encanamento de dados sob medida',
      },
      {
        capability: 'Hospedagem e compartilhamento',
        withOd: 'HTML autocontido em qualquer hospedagem estática, sem conta',
        without: 'Quem visualiza precisa de uma licença no fornecedor de BI',
      },
      {
        capability: 'Revisão e versionamento',
        withOd: 'Vive no seu repositório; comparável como código',
        without: 'Trancado dentro do fornecedor, sem diff real',
      },
      {
        capability: 'Custo e dependência do fornecedor',
        withOd: 'Código aberto, use suas próprias chaves, roda localmente',
        without: 'Assinatura por licença, hospedado pelo fornecedor',
      },
    ],
    featuresTitle: "O que você pode construir",
    features: [
      { title: "Analytics de produto", body: "Usuários ativos, funis, retenção — as métricas em que um time de produto vive.", thumb: "example-dashboard" },
      { title: "Métricas de repositório e dev", body: "Estrelas, PRs, saúde de CI — painéis de engenharia com os seus próprios dados.", thumb: "example-github-dashboard" },
      { title: "Relatórios financeiros", body: "Receita, queima de caixa e fôlego dispostos como um relatório para compartilhar.", thumb: "example-finance-report" },
      { title: "Operações ao vivo", body: "Métricas em tempo real que se atualizam conforme os dados de base se movem.", thumb: "example-live-dashboard" },
      { title: "Redes e marketing", body: "Desempenho de canais e acompanhamento de campanhas em uma só visão.", thumb: "example-social-media-dashboard" },
      { title: "Relatórios por área", body: "Relatórios estruturados para qualquer campo — do clínico ao trading.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Painéis que as pessoas criaram com o Open Design',
    galleryLead:
      'Painéis reais renderizados a partir de um prompt e de uma fonte de dados. Comece por um próximo do seu e descreva as métricas que você acompanha.',
    gallery: [
      { thumb: "example-data-report", caption: "Relatório de dados" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Painel de operações ao vivo" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Painel de análise de trading" },
      { thumb: "example-frame-data-chart-nyt", caption: "Gráfico de dados editorial" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar modelos de painel',
    faqTitle: 'Perguntas frequentes sobre painéis',
    faq: [
      {
        q: 'Preciso de uma ferramenta de BI como Tableau ou Looker?',
        a: 'Não. O Open Design renderiza painéis em HTML dentro do seu agente de programação. Você descreve as métricas e o aponta para os seus dados; não há uma plataforma de BI separada para licenciar ou aprender.',
      },
      {
        q: 'De onde vêm os dados?',
        a: 'De um CSV, um endpoint JSON ou linhas que você cola. O painel é HTML e JavaScript puros, então você controla exatamente de onde ele lê — nada passa por um serviço hospedado.',
      },
      {
        q: 'Colegas não técnicos conseguem visualizar?',
        a: 'Sim. A saída é uma página web autocontida. Qualquer pessoa com o link ou o arquivo pode abri-la em um navegador — sem conta, sem licença.',
      },
      {
        q: 'Quais agentes posso usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e mais uma dúzia de adaptadores nativos. Você usa suas próprias chaves de provedor.',
      },
    ],
    ctaTitle: 'Construa seu painel hoje à noite',
    ctaBody:
      'Dê uma estrela ao repositório, instale o Open Design e transforme suas métricas em um painel que você pode hospedar onde quiser — no agente que você já usa.',
  },
  slides: {
    title: 'Gere apresentações com Open Design + Claude Code',
    description:
      'Transforme um roteiro em uma apresentação projetada e fiel à marca sem abrir um app de apresentações. O Open Design dá ao seu agente de programação modelos de slides e um sistema visual, renderizando os slides em HTML que você apresenta, exporta ou compartilha.',
    breadcrumb: 'Slides',
    label: 'Caso de uso · Slides',
    heading: 'Apresentações com cara de projetadas, escritas por um prompt',
    lead: 'Entregue ao seu agente um roteiro e um tom. O Open Design aplica um modelo de apresentação e um sistema visual para que cada slide fique disposto, composto e fiel à marca — não uma lista de tópicos sobre um fundo em branco.',
    heroImageAlt:
      'Ilustração editorial de um roteiro à esquerda virando uma sequência de slides de apresentação projetados à direita',
    tldrTitle: 'Em uma linha',
    tldrBody:
      'O Open Design transforma um roteiro em uma apresentação HTML projetada que seu agente renderiza em uma única sessão — apresente no navegador, exporte para PDF ou PPTX e mantenha a fonte no seu repositório.',
    stepsTitle: 'Como funcionam as apresentações com o Open Design',
    steps: [
      {
        title: 'Dê o roteiro',
        body: 'Cole seus pontos de fala ou uma estrutura aproximada. O agente carrega a habilidade de apresentação para produzir uma sequência de slides dispostos, não um único documento longo.',
        imageAlt: 'Ilustração de um roteiro de texto sendo entregue a um agente',
      },
      {
        title: 'Escolha um estilo de apresentação',
        body: 'O Open Design traz modelos de apresentação — editorial, suíço-internacional, técnico escuro e mais. O agente aplica um para que tipografia, grade e acentos fiquem consistentes em cada slide.',
        imageAlt: 'Ilustração de várias opções de estilo de apresentação dispostas lado a lado',
      },
      {
        title: 'Gere os slides',
        body: 'Cada ponto vira um slide projetado com a hierarquia certa — títulos, apoios visuais, destaques de dados. Renderiza em HTML, então é apresentado em tela cheia em qualquer navegador.',
        imageAlt: 'Ilustração de uma sequência de slides finalizados com estilo consistente',
      },
      {
        title: 'Apresente, exporte, itere',
        body: 'Apresente pelo navegador, ou exporte para PDF / PPTX para compartilhar. Refine conversando com o agente — «aperte o slide de dados, adicione uma chamada para ação de encerramento». A fonte da apresentação fica no seu projeto.',
        imageAlt: 'Ilustração de uma apresentação sendo apresentada e exportada para vários formatos',
      },
    ],
    tableTitle: 'Apresentações com Open Design vs. o jeito antigo',
    tableColCapability: 'O que você precisa',
    tableColWithOd: 'Com o Open Design',
    tableColWithout: 'PowerPoint / Keynote / ferramentas de IA para slides',
    tableRows: [
      {
        capability: 'Ir do roteiro aos slides',
        withOd: 'Um prompt; o agente dispõe cada slide',
        without: 'Construir cada slide à mão, ou brigar com um modelo',
      },
      {
        capability: 'Design consistente',
        withOd: 'Modelos de apresentação com grade e sistema tipográfico reais',
        without: 'Desvio de tema, alinhamento manual, padrões fora da marca',
      },
      {
        capability: 'Dados e diagramas',
        withOd: 'Gráficos e destaques renderizados como parte do slide',
        without: 'Colar imagens estáticas ou refazer os gráficos toda vez',
      },
      {
        capability: 'Formatos de exportação',
        withOd: 'HTML para apresentar, além de exportação para PDF / PPTX',
        without: 'Preso ao formato de um único app',
      },
      {
        capability: 'Revisão e versionamento',
        withOd: 'A fonte vive no seu repositório, comparável',
        without: 'Arquivo binário, sem diff com sentido',
      },
      {
        capability: 'Custo e dependência do fornecedor',
        withOd: 'Código aberto, use suas próprias chaves, roda localmente',
        without: 'Licença do app ou complemento de IA por licença',
      },
    ],
    featuresTitle: "O que você pode apresentar",
    features: [
      { title: "Pitch decks", body: "Apresentações para investidores e vendas com narrativa forte e slides de dados limpos.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Suíço / editorial", body: "Apresentações tipográficas guiadas por grade com cara de direção de arte.", thumb: "example-deck-swiss-international" },
      { title: "Módulos de curso", body: "Apresentações de ensino com passos claros, destaques e ritmo.", thumb: "example-html-ppt-course-module" },
      { title: "Apresentações com gráficos de dados", body: "Apresentações escuras e voltadas a gráficos para analytics e revisões.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Modo apresentador", body: "Apresentações estilo Reveal feitas para apresentar ao vivo no navegador.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Plantas técnicas", body: "Apresentações de arquitetura e conhecimento que mapeiam sistemas complexos.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Apresentações que as pessoas criaram com o Open Design',
    galleryLead:
      'Apresentações reais renderizadas a partir de um roteiro. Escolha um estilo próximo da sua palestra e descreva o conteúdo.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Apresentação tipo revista editorial" },
      { thumb: "example-guizang-ppt", caption: "Keynote ilustrado" },
      { thumb: "example-deck-open-slide-canvas", caption: "Apresentação de canvas de slides aberto" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Apresentação com tema gradiente" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar modelos de apresentação',
    faqTitle: 'Perguntas frequentes sobre slides',
    faq: [
      {
        q: 'Preciso de PowerPoint ou Keynote?',
        a: 'Não. O Open Design renderiza apresentações em HTML dentro do seu agente de programação e pode exportar para PDF ou PPTX. Você apresenta pelo navegador ou entrega um arquivo — não é preciso um app de apresentações para criá-la.',
      },
      {
        q: 'Isso é só tópicos gerados por IA?',
        a: 'Não. O agente aplica um modelo de apresentação real com grade, escala tipográfica e hierarquia visual, então os slides parecem projetados em vez de preenchidos automaticamente.',
      },
      {
        q: 'Posso exportar para PowerPoint para um cliente?',
        a: 'Sim. As apresentações exportam para PPTX e PDF além do HTML pelo qual você apresenta, então se encaixam no que quer que a plateia espere.',
      },
      {
        q: 'Quais agentes posso usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e mais adaptadores nativos, com suas próprias chaves de provedor.',
      },
    ],
    ctaTitle: 'Construa sua próxima apresentação hoje à noite',
    ctaBody:
      'Dê uma estrela ao repositório, instale o Open Design e transforme seu roteiro em uma apresentação projetada — no agente que você já usa.',
  },
  image: {
    title: 'Gere gráficos fiéis à marca com Open Design + Claude Code',
    description:
      'Produza cartões para redes, capas de artigos e gráficos de marketing a partir de um prompt — dispostos com tipografia real e o seu sistema de marca, renderizados em HTML nítido que você exporta para PNG. Sem app de design, sem assinatura de modelos.',
    breadcrumb: 'Imagem',
    label: 'Caso de uso · Imagem',
    heading: 'Gráficos fiéis à marca, gerados e dispostos para você',
    lead: 'Descreva o cartão ou a capa que você precisa. O Open Design o compõe com tipografia, grade e as cores da sua marca reais — depois renderiza em HTML que você exporta como imagem, em vez de brigar com um app de design ou um modelo genérico.',
    heroImageAlt:
      'Ilustração editorial de um prompt virando um conjunto de cartões para redes e capas de artigos dispostos',
    tldrTitle: 'Em uma linha',
    tldrBody:
      'O Open Design transforma um prompt em um gráfico composto e fiel à marca que seu agente renderiza em HTML e exporta para PNG — repetível, versionado e livre de ferramentas de design por licença.',
    stepsTitle: 'Como funcionam os gráficos com o Open Design',
    steps: [
      {
        title: 'Descreva o gráfico',
        body: 'Diga o que é — «um cartão de Twitter para o nosso lançamento com a manchete e uma citação». O agente carrega a habilidade certa para compor um gráfico disposto, não um bloco de texto simples.',
        imageAlt: 'Ilustração de uma pessoa descrevendo um cartão para redes de que precisa',
      },
      {
        title: 'Aplique o sistema de marca',
        body: 'O Open Design puxa suas cores, tipografia e espaçamento de um sistema de design reutilizável, então cada cartão combina com o restante da sua marca em vez de parecer algo avulso.',
        imageAlt: 'Ilustração de cores e tipografia da marca sendo aplicadas ao layout de um cartão',
      },
      {
        title: 'Renderize e exporte',
        body: 'O gráfico renderiza em HTML nas dimensões exatas que você precisa — cartão para redes, capa, banner — e depois exporta para PNG. Texto nítido, layout real, sem ajustes manuais.',
        imageAlt: 'Ilustração de um gráfico renderizando e exportando para um arquivo de imagem',
      },
      {
        title: 'Reutilize a receita',
        body: 'Como é um modelo, o próximo gráfico está a um prompt de distância — troque a manchete, mantenha o layout. Séries de cartões ficam perfeitamente consistentes.',
        imageAlt: 'Ilustração de um modelo de cartão produzindo uma série consistente de gráficos',
      },
    ],
    tableTitle: 'Gráficos com Open Design vs. o jeito antigo',
    tableColCapability: 'O que você precisa',
    tableColWithOd: 'Com o Open Design',
    tableColWithout: 'Apps de design / modelos genéricos',
    tableRows: [
      {
        capability: 'Ir da ideia ao gráfico disposto',
        withOd: 'Um prompt; o agente compõe tipografia e layout',
        without: 'Abrir um app, posicionar cada elemento à mão',
      },
      {
        capability: 'Manter a marca',
        withOd: 'Cores e tipografia de um sistema de design reutilizável',
        without: 'Reescolher estilos de marca por arquivo, ou desviar da marca',
      },
      {
        capability: 'Série consistente',
        withOd: 'Mesmo modelo, novo texto — um conjunto perfeitamente alinhado',
        without: 'Realinhar cada variação manualmente',
      },
      {
        capability: 'Exportação',
        withOd: 'HTML em dimensões exatas, exportado para PNG',
        without: 'Dimensionamento de canvas e configurações de exportação manuais',
      },
      {
        capability: 'Repetível',
        withOd: 'Uma receita baseada em prompt no seu repositório',
        without: 'Um arquivo avulso que você recria toda vez',
      },
      {
        capability: 'Custo e dependência do fornecedor',
        withOd: 'Código aberto, use suas próprias chaves, roda localmente',
        without: 'Ferramenta de design por licença ou marketplace de modelos',
      },
    ],
    featuresTitle: "O que você pode criar",
    features: [
      { title: "Cartões para redes", body: "Cartões de X / Twitter compostos com a sua manchete e a sua marca.", thumb: "example-card-twitter" },
      { title: "Capas de artigos", body: "Capas editoriais, estilo revista, para posts e newsletters.", thumb: "example-article-magazine" },
      { title: "Cartões do Xiaohongshu", body: "Cartões estilo RedNote afinados para aquele feed.", thumb: "example-card-xiaohongshu" },
      { title: "Gráficos hero", body: "Visuais hero líquidos e com gradiente para sites e lançamentos.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Carrosséis", body: "Carrosséis para redes de vários slides que se mantêm consistentes entre quadros.", thumb: "example-social-carousel" },
      { title: "Molduras de mockup de UI", body: "Molduras de notificação e de dispositivo para narrar o produto.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Gráficos que as pessoas criaram com o Open Design',
    galleryLead:
      'Cartões e capas reais renderizados a partir de um prompt. Escolha um próximo do que você precisa e troque pelo seu texto.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Cartão para redes em tons pastel" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Pôster editorial em três tons" },
      { thumb: "example-magazine-poster", caption: "Pôster estilo revista" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Capa editorial ousada" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar modelos de gráfico',
    faqTitle: 'Perguntas frequentes sobre imagens',
    faq: [
      {
        q: 'Isso é um gerador de imagens por IA como o Midjourney?',
        a: 'Não. O Open Design compõe gráficos com layout e tipografia reais — sua manchete, sua marca, dimensões exatas — e renderiza em HTML que você exporta como PNG. É composição de design, não geração de pixels.',
      },
      {
        q: 'Posso criar uma série consistente de cartões?',
        a: 'Sim. Como cada gráfico é um modelo, você mantém o layout e muda o texto, então uma série inteira fica perfeitamente alinhada e fiel à marca.',
      },
      {
        q: 'Que tamanhos ele consegue produzir?',
        a: 'Qualquer um — o gráfico renderiza nas dimensões exatas que você especificar, de um cartão quadrado para redes a um banner largo, e depois exporta para PNG.',
      },
      {
        q: 'Quais agentes posso usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e mais adaptadores nativos, com suas próprias chaves de provedor.',
      },
    ],
    ctaTitle: 'Crie seu próximo gráfico hoje à noite',
    ctaBody:
      'Dê uma estrela ao repositório, instale o Open Design e transforme um prompt em um gráfico fiel à marca — no agente que você já usa.',
  },
  video: {
    title: 'Gere motion graphics e vídeo curto com Open Design + Claude Code',
    description:
      'Transforme um roteiro em quadros animados e vídeo de formato curto — cartões de título, fundos em movimento e encerramentos compostos com o seu sistema de marca e renderizados a partir de HTML. Sem suíte de motion graphics, sem arrastar por uma linha do tempo.',
    breadcrumb: 'Vídeo',
    label: 'Caso de uso · Vídeo',
    heading: 'Motion graphics a partir de um roteiro, não de uma linha do tempo',
    lead: 'Descreva o momento que você quer — uma revelação de título, uma animação de dados, um encerramento com logo. O Open Design compõe quadros animados com o seu sistema de marca e os renderiza em vídeo, sem suíte de motion graphics.',
    heroImageAlt:
      'Ilustração editorial de um roteiro virando uma sequência de quadros de vídeo animados',
    tldrTitle: 'Em uma linha',
    tldrBody:
      'O Open Design transforma um roteiro em quadros animados e fiéis à marca que seu agente renderiza em vídeo de formato curto — compostos a partir de HTML, versionados no seu repositório, sem editor de linha do tempo para aprender.',
    stepsTitle: 'Como funciona o movimento com o Open Design',
    steps: [
      {
        title: 'Descreva o momento',
        body: 'Diga o que deve acontecer — «um título com glitch que se resolve no nosso logo, depois um cartão de encerramento». O agente carrega a habilidade de movimento para produzir quadros animados, não uma imagem estática.',
        imageAlt: 'Ilustração de uma pessoa descrevendo uma sequência de movimento',
      },
      {
        title: 'Aplique a marca e o estilo de movimento',
        body: 'O Open Design fornece modelos de quadro — vazamentos de luz cinematográficos, títulos com glitch, encerramentos com logo — e aplica suas cores e tipografia, então o movimento parece intencional e fiel à marca.',
        imageAlt: 'Ilustração de estilo de marca aplicado a quadros animados',
      },
      {
        title: 'Renderize os quadros em vídeo',
        body: 'Os quadros são compostos em HTML e renderizados em vídeo, então o tempo e o layout são precisos e repetíveis — sem keyframing manual em uma linha do tempo.',
        imageAlt: 'Ilustração de quadros HTML renderizando em um clipe de vídeo',
      },
      {
        title: 'Itere e exporte',
        body: 'Refine conversando com o agente — «desacelere a revelação do título, adicione uma legenda». Exporte clipes de formato curto para redes ou produto. A fonte fica no seu projeto.',
        imageAlt: 'Ilustração de um clipe de vídeo sendo refinado e exportado para redes',
      },
    ],
    tableTitle: 'Movimento com Open Design vs. o jeito antigo',
    tableColCapability: 'O que você precisa',
    tableColWithOd: 'Com o Open Design',
    tableColWithout: 'After Effects / suítes de motion',
    tableRows: [
      {
        capability: 'Ir do roteiro a quadros animados',
        withOd: 'Um prompt; o agente compõe a sequência',
        without: 'Fazer keyframe de cada elemento em uma linha do tempo à mão',
      },
      {
        capability: 'Manter a marca',
        withOd: 'Modelos de quadro + suas cores e tipografia',
        without: 'Refazer o estilo de marca por projeto',
      },
      {
        capability: 'Tempo preciso e repetível',
        withOd: 'Composto em HTML, renderizado de forma determinística',
        without: 'Arraste manual, difícil de reproduzir',
      },
      {
        capability: 'Exportar para redes',
        withOd: 'Clipes de formato curto renderizados em vídeo',
        without: 'Predefinições de exportação e lida com codecs',
      },
      {
        capability: 'Revisão e versionamento',
        withOd: 'A fonte dos quadros vive no seu repositório, comparável',
        without: 'Arquivo de projeto binário, sem diff real',
      },
      {
        capability: 'Custo e dependência do fornecedor',
        withOd: 'Código aberto, use suas próprias chaves, roda localmente',
        without: 'Suíte cara, curva de aprendizado íngreme',
      },
    ],
    featuresTitle: "O que você pode animar",
    features: [
      { title: "Hyperframes", body: "Sequências de movimento quadro a quadro compostas a partir de HTML.", thumb: "example-video-hyperframes" },
      { title: "Formato curto para redes", body: "Clipes verticais feitos para os feeds de redes.", thumb: "example-video-shortform" },
      { title: "Conjuntos de quadros de movimento", body: "Quadros animados reutilizáveis que você compõe em um clipe.", thumb: "example-motion-frames" },
      { title: "Vazamentos de luz cinematográficos", body: "Transições fílmicas e fundos atmosféricos.", thumb: "example-frame-light-leak-cinema" },
      { title: "Títulos com glitch", body: "Revelações de título com movimento e textura.", thumb: "example-frame-glitch-title" },
      { title: "Encerramentos com logo", body: "Animações de encerramento com a sua marca para qualquer clipe.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Movimento que as pessoas criaram com o Open Design',
    galleryLead:
      'Quadros e clipes animados reais renderizados a partir de um prompt. Escolha um próximo da sua ideia e descreva o movimento.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Sequência de Hyperframes" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Fundo em movimento líquido" },
      { thumb: "example-frame-macos-notification", caption: "Quadro de UI animado" },
      { thumb: "example-frame-data-chart-nyt", caption: "Gráfico de dados animado" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar modelos de movimento',
    faqTitle: 'Perguntas frequentes sobre vídeo',
    faq: [
      {
        q: 'Preciso do After Effects ou de uma suíte de motion graphics?',
        a: 'Não. O Open Design compõe quadros animados em HTML e os renderiza em vídeo dentro do seu agente de programação. Não há editor de linha do tempo para aprender ou licenciar.',
      },
      {
        q: 'Para que tipo de vídeo isso é bom?',
        a: 'Movimento de formato curto — cartões de título, animações de dados, encerramentos com logo, clipes para redes. É feito para movimento de marca e produto, não para edição de longa-metragem.',
      },
      {
        q: 'O tempo é reproduzível?',
        a: 'Sim. Como os quadros são compostos em código e renderizados de forma determinística, você obtém o mesmo resultado toda vez e pode ajustá-lo com precisão por um prompt.',
      },
      {
        q: 'Quais agentes posso usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e mais adaptadores nativos, com suas próprias chaves de provedor.',
      },
    ],
    ctaTitle: 'Anime sua próxima ideia hoje à noite',
    ctaBody:
      'Dê uma estrela ao repositório, instale o Open Design e transforme um roteiro em movimento — no agente que você já usa.',
  },
  designSystem: {
    title: 'Crie e aplique um sistema de design com Open Design + Claude Code',
    description:
      'Capture sua marca como um sistema de design reutilizável que seu agente de programação aplica a cada artefato — cores, tipografia, componentes e tom em um único DESIGN.md. Defina uma vez; cada protótipo, apresentação e painel se mantém fiel à marca.',
    breadcrumb: 'Sistema de design',
    label: 'Caso de uso · Sistema de design',
    heading: 'Um sistema de design, aplicado a tudo o que seu agente cria',
    lead: 'Defina sua marca uma vez e o Open Design a leva para cada saída — protótipos, apresentações, painéis, gráficos. O sistema vive no seu repositório como um DESIGN.md que o agente lê, então a consistência é automática, não manual.',
    heroImageAlt:
      'Ilustração editorial de um único sistema de design irradiando para muitos artefatos fiéis à marca',
    tldrTitle: 'Em uma linha',
    tldrBody:
      'O Open Design captura sua marca como um sistema de design portátil que seu agente aplica a cada artefato — definido uma vez no seu repositório, aplicado em todo lugar, sem uma ferramenta de design central para controlar o acesso.',
    stepsTitle: 'Como funcionam os sistemas de design com o Open Design',
    steps: [
      {
        title: 'Capture o sistema',
        body: 'Descreva sua marca — cores, tipografia, espaçamento, voz — ou aponte o agente para um site existente para extraí-la. O Open Design a escreve em um DESIGN.md que vive no seu projeto.',
        imageAlt: 'Ilustração de uma marca sendo capturada em um único arquivo de sistema de design',
      },
      {
        title: 'Parta de uma base comprovada',
        body: 'O Open Design traz mais de 140 sistemas de design de referência — de Apple e Linear a editoriais e brutalistas. Faça um fork de um próximo da sua marca em vez de começar de uma página em branco.',
        imageAlt: 'Ilustração de uma galeria de sistemas de design de referência sendo explorada',
      },
      {
        title: 'Aplique em todo lugar',
        body: 'Cada outra habilidade lê o mesmo sistema, então um protótipo, uma apresentação e um painel compartilham uma única linguagem visual — sem você ter que especificá-la de novo toda vez.',
        imageAlt: 'Ilustração de um sistema aplicado de forma consistente a muitos tipos de artefato',
      },
      {
        title: 'Faça-o evoluir em um só lugar',
        body: 'Mude o sistema e o próximo render o reflete em todo lugar. Como é um arquivo no seu repositório, as decisões de design são revisadas e versionadas como código.',
        imageAlt: 'Ilustração de um sistema de design sendo atualizado e propagando-se para todas as saídas',
      },
    ],
    tableTitle: 'Sistemas de design com Open Design vs. o jeito antigo',
    tableColCapability: 'O que você precisa',
    tableColWithOd: 'Com o Open Design',
    tableColWithout: 'Bibliotecas de ferramentas de design / guias de estilo',
    tableRows: [
      {
        capability: 'Definir o sistema',
        withOd: 'Um DESIGN.md que o agente lê, forkeado de mais de 140 referências',
        without: 'Um guia de estilo estático ou uma biblioteca presa a uma ferramenta',
      },
      {
        capability: 'Aplicar a diferentes tipos de artefato',
        withOd: 'O mesmo sistema alimenta protótipos, apresentações, painéis, gráficos',
        without: 'Reimplementado por ferramenta e por arquivo',
      },
      {
        capability: 'Manter tudo consistente',
        withOd: 'Automático — cada habilidade lê uma única fonte',
        without: 'Disciplina manual; desvia com o tempo',
      },
      {
        capability: 'Fazer a marca evoluir',
        withOd: 'Edite uma vez; o próximo render se atualiza em todo lugar',
        without: 'Buscar e substituir entre arquivos e ferramentas',
      },
      {
        capability: 'Revisão e versionamento',
        withOd: 'Vive no seu repositório, comparável como código',
        without: 'Enterrado em uma ferramenta de design, difícil de auditar',
      },
      {
        capability: 'Custo e dependência do fornecedor',
        withOd: 'Código aberto, portátil, roda localmente',
        without: 'Preso a uma assinatura de ferramenta de design',
      },
    ],
    featuresTitle: "Sistemas dos quais você pode partir",
    features: [
      { title: "Apple", body: "Estética limpa, contida, de fonte do sistema.", thumb: "design-system-apple" },
      { title: "Linear", body: "Visual nítido de ferramenta de produto com espaçamento compacto.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Suave, centrado em documentos, acolhedor.", thumb: "design-system-notion" },
      { title: "Figma", body: "Energia lúdica, colorida, de ferramenta criativa.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimalista, neutra, de nível pesquisa.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Densa, técnica, nativa para desenvolvedores.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Sistemas de design no Open Design',
    galleryLead:
      'Alguns dos mais de 140 sistemas de referência que você pode forkear como ponto de partida. Escolha um próximo da sua marca e adapte-o.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Sistema estilo Airbnb" },
      { thumb: "design-system-vercel", caption: "Sistema estilo Vercel" },
      { thumb: "design-system-stripe", caption: "Sistema estilo Stripe" },
      { thumb: "design-system-spotify", caption: "Sistema estilo Spotify" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Explorar sistemas de design',
    faqTitle: 'Perguntas frequentes sobre sistema de design',
    faq: [
      {
        q: 'O que exatamente é o sistema de design aqui?',
        a: 'Um arquivo DESIGN.md no seu repositório que captura cores, tipografia, espaçamento, componentes e voz. Cada habilidade do Open Design o lê, então sua marca é aplicada automaticamente ao que o agente produzir.',
      },
      {
        q: 'Tenho que começar do zero?',
        a: 'Não. O Open Design traz mais de 140 sistemas de design de referência que você pode forkear — de Apple e Linear a editoriais e brutalistas — e depois adaptar à sua marca.',
      },
      {
        q: 'Como ele se mantém consistente entre apresentações, painéis e protótipos?',
        a: 'Porque todas essas habilidades leem o mesmo DESIGN.md. Defina o sistema uma vez e a consistência é automática em vez de algo que você fiscaliza à mão.',
      },
      {
        q: 'Quais agentes posso usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e mais adaptadores nativos, com suas próprias chaves de provedor.',
      },
    ],
    ctaTitle: 'Defina seu sistema de design hoje à noite',
    ctaBody:
      'Dê uma estrela ao repositório, instale o Open Design e dê ao seu agente uma única marca para aplicar em todo lugar — no agente que você já usa.',
  },
  roleSoloBuilder: {
    title: 'Open Design para criadores solo e indie hackers',
    description:
      'Entregue como um time de uma pessoa só. O Open Design transforma seu agente de código na metade de design da sua startup — protótipos, landing pages, dashboards e peças de marca, tudo a partir de um prompt, tudo dentro da marca, tudo no seu repositório.',
    breadcrumb: 'Criador solo',
    label: 'Para · Criadores solo',
    heading: 'Seu time de design é o agente que você já roda',
    lead: 'Sem designer, sem orçamento, sem repasse. Descreva o que precisa e seu agente renderiza — uma landing page de manhã, um dashboard à tarde, cards para redes antes de lançar — tudo compartilhando um design system que você definiu uma única vez.',
    heroImageAlt:
      'Ilustração editorial de uma pessoa em uma mesa cercada por uma landing page, um app, um dashboard e cards para redes, tudo em um estilo consistente',
    tldrTitle: 'Em uma linha',
    tldrBody:
      'O Open Design é o departamento de design que um fundador solo nunca teve: do prompt ao artefato em cada superfície que seu produto precisa, dentro de uma só marca, com zero repasse e sem ferramentas extras.',
    stepsTitle: 'Como um criador solo usa o Open Design',
    steps: [
      {
        title: 'Defina sua marca uma única vez',
        body: 'Registre cores, tipografia e voz em um DESIGN.md (ou faça um fork de um dos mais de 140 sistemas de referência). Todo artefato que você gerar depois estará automaticamente dentro da marca.',
        imageAlt: 'Ilustração de um único arquivo de definição de marca',
      },
      {
        title: 'Gere o que precisar a seguir',
        body: 'Protótipo, landing page, dashboard, pitch deck, card para redes — o mesmo agente, a mesma marca, um prompt para cada. Sem trocar de ferramenta nem comprar novos assentos.',
        imageAlt: 'Ilustração de muitos tipos de artefato saindo de um único prompt',
      },
      {
        title: 'Lance — já é de verdade',
        body: 'Tudo renderiza para HTML / código no seu repositório, então o protótipo vira o produto e a landing page vai ao ar. Sem mockups descartáveis.',
        imageAlt: 'Ilustração de um artefato indo direto do prompt ao ar',
      },
    ],
    tableTitle: 'Construir solo com o Open Design vs. fazer do jeito difícil',
    tableColCapability: 'O que você precisa',
    tableColWithOd: 'Com o Open Design',
    tableColWithout: 'Indo sozinho hoje',
    tableRows: [
      { capability: 'Cobrir todas as superfícies de design', withOd: 'Um agente faz protótipo, landing, dashboard e marca', without: 'Costurar cinco ferramentas SaaS e tutoriais' },
      { capability: 'Manter a marca', withOd: 'Um DESIGN.md aplicado em tudo automaticamente', without: 'Recriar o visual em cada ferramenta; ele se desvia com o tempo' },
      { capability: 'Andar na velocidade solo', withOd: 'Da ideia ao artefato em um prompt', without: 'Aprender uma ferramenta de design para a qual você não tem tempo' },
      { capability: 'Lançar, não mockar', withOd: 'HTML / código no seu repositório, pronto para deploy', without: 'Um mockup que alguém ainda precisa construir' },
      { capability: 'Custo', withOd: 'Open source, use suas próprias chaves, roda localmente', without: 'Uma pilha de assinaturas por assento' },
    ],
    featuresTitle: 'O que um criador solo pode entregar',
    features: [
      { title: 'Landing pages', body: 'Landings de marketing e SaaS, navegáveis e no ar.', thumb: 'example-saas-landing' },
      { title: 'Protótipos de produto', body: 'Apps web multitela para validar a ideia.', thumb: 'example-web-prototype' },
      { title: 'Dashboards', body: 'Métricas e visões de administração para seu produto.', thumb: 'example-dashboard' },
      { title: 'Peças de marca', body: 'Capas e pôsteres que combinam com sua marca.', thumb: 'example-magazine-poster' },
      { title: 'Fluxos mobile', body: 'Telas de app quando você vai além da web.', thumb: 'example-mobile-app' },
      { title: 'Cards para redes', body: 'Cards de lançamento e atualização para cada canal.', thumb: 'example-card-twitter' },
    ],
    galleryTitle: 'Feito solo com o Open Design',
    galleryLead:
      'Cada superfície que uma startup de uma pessoa só precisa, a partir de um prompt. Escolha uma perto do seu próximo passo e descreva-a.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'Landing page SaaS' },
      { thumb: 'example-web-prototype', caption: 'Protótipo de produto' },
      { thumb: 'example-dashboard', caption: 'Dashboard de produto' },
      { thumb: 'example-card-twitter', caption: 'Card de lançamento para redes' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar modelos',
    faqTitle: 'Perguntas frequentes do criador solo',
    faq: [
      { q: 'Não sou designer — dá mesmo para usar isto?', a: 'Sim. Você descreve o que quer em linguagem natural; o agente aplica um design system e renderiza. A habilidade é escrever o prompt, não empurrar pixels.' },
      { q: 'Cobre tudo ou só uma coisa?', a: 'Tudo o que um produto pequeno precisa — protótipos, landing pages, dashboards, decks e peças gráficas — a partir do mesmo agente e da mesma marca.' },
      { q: 'No que os resultados se transformam?', a: 'HTML / código de verdade no seu repositório, então um protótipo pode virar o produto e uma landing page pode ir ao ar, em vez de um mockup que você joga fora.' },
      { q: 'Quais agentes posso usar?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e mais adaptadores nativos, com suas próprias chaves de provedor.' },
    ],
    ctaTitle: 'Construa seu projeto inteiro hoje à noite',
    ctaBody:
      'Dê uma estrela ao repositório, instale o Open Design e deixe um agente ser seu time de design — dentro do agente que você já usa.',
  },
  roleDesigner: {
    title: 'Open Design para designers',
    description:
      'Gaste seu tempo com bom gosto, não com trabalho braçal. O Open Design deixa seu agente cuidar do trabalho de produção repetitivo — variações, estados, design systems inteiros — enquanto você dirige o visual e mantém a palavra final.',
    breadcrumb: 'Designer',
    label: 'Para · Designers',
    heading: 'Dirija o design — deixe o agente fazer a produção',
    lead: 'Você define o sistema e o padrão; o agente renderiza as telas, os estados, as variações, os comps de alta fidelidade. Menos empurrar retângulos, mais decidir como é o que é bom.',
    heroImageAlt:
      'Ilustração editorial de um designer dirigindo enquanto um agente preenche telas, variações e um design system',
    tldrTitle: 'Em uma linha',
    tldrBody:
      'O Open Design é o assistente de produção que nunca se cansa: você define o design system e aplica o bom gosto; o agente gera o resto, dentro do sistema, no seu repositório.',
    stepsTitle: 'Como um designer usa o Open Design',
    steps: [
      {
        title: 'Codifique seu sistema',
        body: 'Transforme sua marca em um DESIGN.md — escala tipográfica, cor, espaçamento, componentes, voz. Esta é a fonte da verdade que o agente obedece.',
        imageAlt: 'Ilustração de um design system registrado como um arquivo',
      },
      {
        title: 'Gere a cauda longa',
        body: 'Cada tela, estado e variação que você de outra forma construiria à mão — o agente os renderiza dentro do sistema, então os chatos 80% ficam prontos em minutos.',
        imageAlt: 'Ilustração de muitas telas dentro do sistema geradas de uma vez',
      },
      {
        title: 'Dirija e refine',
        body: 'Critique em linguagem — “aperte o espaçamento, deixe o estado vazio mais aconchegante”. A palavra final é sua; o agente faz as iterações.',
        imageAlt: 'Ilustração de um designer dando direção e o design atualizando',
      },
    ],
    tableTitle: 'Desenhar com o Open Design vs. o jeito manual',
    tableColCapability: 'O que você precisa',
    tableColWithOd: 'Com o Open Design',
    tableColWithout: 'Ferramentas de design manuais',
    tableRows: [
      { capability: 'Construir um design system', withOd: 'Um DESIGN.md que o agente aplica em tudo', without: 'Uma biblioteca que você mantém à mão em cada ferramenta' },
      { capability: 'Produzir variações e estados', withOd: 'Gerados dentro do sistema a partir de um prompt', without: 'Duplicar frames e ajustar cada um' },
      { capability: 'Comps de alta fidelidade', withOd: 'Renderizados em HTML de verdade, não um mockup chapado', without: 'Trabalho de pixel que a engenharia reconstrói de qualquer jeito' },
      { capability: 'Manter a consistência', withOd: 'Um sistema, aplicado automaticamente', without: 'Disciplina manual; desvia com o tempo' },
      { capability: 'Repasse', withOd: 'O artefato é código — sem lacuna de tradução', without: 'Documentos de especificação e redlines' },
    ],
    featuresTitle: 'O que um designer pode dirigir',
    features: [
      { title: 'Layouts editoriais', body: 'Composições com direção de arte, guiadas por grid.', thumb: 'example-web-prototype-taste-editorial' },
      { title: 'Capas de artigo', body: 'Capas e matérias estilo revista.', thumb: 'example-article-magazine' },
      { title: 'Pôsteres', body: 'Pôsteres tipográficos marcantes dentro da marca.', thumb: 'example-magazine-poster' },
      { title: 'Sets para redes', body: 'Carrosséis multiquadro consistentes.', thumb: 'example-social-carousel' },
      { title: 'Telas de app', body: 'Telas mobile e web de alta fidelidade.', thumb: 'example-mobile-app' },
      { title: 'Dashboards', body: 'Interfaces de dados que respeitam seu sistema.', thumb: 'example-dashboard' },
    ],
    galleryTitle: 'Dirigido com o Open Design',
    galleryLead:
      'Trabalho de alta fidelidade e dentro do sistema que o agente produziu a partir da sua direção. Escolha um perto do seu estilo e refine-o.',
    gallery: [
      { thumb: 'example-web-prototype-taste-editorial', caption: 'Layout editorial' },
      { thumb: 'example-article-magazine', caption: 'Capa de revista' },
      { thumb: 'example-social-carousel', caption: 'Carrossel para redes' },
      { thumb: 'example-magazine-poster', caption: 'Pôster tipográfico' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar modelos',
    faqTitle: 'Perguntas frequentes do designer',
    faq: [
      { q: 'Isto me substitui?', a: 'Não — substitui o trabalho braçal. Você define o sistema e o bom gosto; o agente faz a produção repetitiva para você gastar tempo nas decisões que só você pode tomar.' },
      { q: 'Como mantenho o controle do visual?', a: 'Seu DESIGN.md é o contrato. O agente renderiza dentro dele, e você critica em linguagem até ficar certo.' },
      { q: 'A saída é editável / de verdade?', a: 'É HTML/CSS de verdade, não uma exportação chapada — então segue direto para produção em vez de ser reconstruída.' },
      { q: 'Quais agentes posso usar?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e mais adaptadores nativos, com suas próprias chaves de provedor.' },
    ],
    ctaTitle: 'Dirija seu próximo design hoje à noite',
    ctaBody:
      'Dê uma estrela ao repositório, instale o Open Design e deixe o agente cuidar da produção enquanto você aplica o bom gosto — dentro do agente que você já usa.',
  },
  roleEngineering: {
    title: 'Open Design para engenheiros',
    description:
      'Pule o repasse de design. O Open Design transforma um DESIGN.md em front-end de verdade que seu agente de código escreve direto — UI dentro do sistema, protótipos e dashboards, no repositório, sem idas e vindas ao Figma.',
    breadcrumb: 'Engenharia',
    label: 'Para · Engenharia',
    heading: 'Da especificação ao front-end, sem repasse no meio',
    lead: 'Aponte seu agente para um DESIGN.md e uma descrição; ele escreve código front-end de verdade e dentro do sistema — componentes, telas, dashboards — direto no seu projeto. Sem redlines, sem “esperando o design”.',
    heroImageAlt:
      'Ilustração editorial de um DESIGN.md fluindo direto para código front-end e UI renderizada, pulando uma etapa de repasse',
    tldrTitle: 'Em uma linha',
    tldrBody:
      'O Open Design fecha a lacuna de designer para engenheiro tornando o design system legível por máquina: o mesmo agente que escreve seu código aplica o sistema e renderiza UI de verdade.',
    stepsTitle: 'Como um engenheiro usa o Open Design',
    steps: [
      {
        title: 'Leia o sistema, não um redline',
        body: 'O DESIGN.md vive no repositório. Seu agente o lê do mesmo jeito que lê o resto da base de código — sem especificações exportadas para interpretar.',
        imageAlt: 'Ilustração de um agente lendo um DESIGN.md ao lado do código',
      },
      {
        title: 'Gere UI dentro do sistema',
        body: 'Descreva a tela ou o componente; o agente escreve front-end que já combina com o sistema. Protótipos, dashboards de administração, ferramentas internas — em minutos.',
        imageAlt: 'Ilustração de código de UI gerado para combinar com um design system',
      },
      {
        title: 'Já é o seu código',
        body: 'A saída é HTML / código de framework no seu repositório, revisável em um PR. Sem etapa de tradução entre “o design” e “a construção”.',
        imageAlt: 'Ilustração de UI gerada chegando como um PR revisável',
      },
    ],
    tableTitle: 'Front-end com o Open Design vs. o jeito do repasse',
    tableColCapability: 'O que você precisa',
    tableColWithOd: 'Com o Open Design',
    tableColWithout: 'Repasse de design para dev',
    tableRows: [
      { capability: 'Ter um design para construir a partir dele', withOd: 'Um DESIGN.md que seu agente lê direto', without: 'Um arquivo do Figma que você reinterpreta à mão' },
      { capability: 'Combinar com o sistema', withOd: 'Aplicado automaticamente no momento da geração', without: 'Conferir no olho contra uma especificação; o desvio aparece' },
      { capability: 'Construir ferramentas internas / dashboards', withOd: 'Prompt → front-end dentro do sistema no repositório', without: 'Esperar um designer e depois construir duas vezes' },
      { capability: 'Revisão', withOd: 'É código — faça o diff em um PR', without: 'Comparar pixel a pixel contra um mockup' },
      { capability: 'Custo e dependência', withOd: 'Open source, no seu repositório, roda localmente', without: 'Uma ferramenta de design que o time inteiro precisa licenciar' },
    ],
    featuresTitle: 'O que um engenheiro pode gerar',
    features: [
      { title: 'UI de app web', body: 'Front-ends multitela a partir de uma descrição.', thumb: 'example-web-prototype' },
      { title: 'Dashboards de dev', body: 'Dashboards de repositório, CI e métricas.', thumb: 'example-github-dashboard' },
      { title: 'Relatórios de dados', body: 'Relatórios estruturados a partir dos seus dados.', thumb: 'example-data-report' },
      { title: 'Dashboards de administração', body: 'Ferramentas internas e visões de administração.', thumb: 'example-dashboard' },
      { title: 'Landing pages', body: 'Páginas de marketing sem esperar pelo design.', thumb: 'example-saas-landing' },
      { title: 'Kanban / quadros', body: 'Interfaces de fluxo de trabalho internas.', thumb: 'example-kanban-board' },
    ],
    galleryTitle: 'Construído por engenheiros com o Open Design',
    galleryLead:
      'Front-end de verdade e dentro do sistema, gerado direto no repositório. Escolha um perto do que você está construindo e descreva-o.',
    gallery: [
      { thumb: 'example-web-prototype', caption: 'UI de app web' },
      { thumb: 'example-github-dashboard', caption: 'Dashboard de dev' },
      { thumb: 'example-data-report', caption: 'Relatório de dados' },
      { thumb: 'example-kanban-board', caption: 'UI de quadro interno' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar modelos',
    faqTitle: 'Perguntas frequentes de engenharia',
    faq: [
      { q: 'Ainda preciso de um designer?', a: 'Para marca e direção, sim. Mas para construir UI dentro do sistema e ferramentas internas, o agente lê o DESIGN.md e escreve o front-end — sem ida e volta de repasse.' },
      { q: 'O que ele produz?', a: 'HTML / código de framework de verdade no seu repositório, revisável em um PR — não um mockup que você reimplementa.' },
      { q: 'Como ele se mantém dentro do sistema?', a: 'O DESIGN.md é a fonte da verdade; o agente o aplica no momento da geração, então a saída combina sem conferência manual de pixels.' },
      { q: 'Quais agentes posso usar?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e mais adaptadores nativos, com suas próprias chaves de provedor.' },
    ],
    ctaTitle: 'Gere sua próxima UI hoje à noite',
    ctaBody:
      'Dê uma estrela ao repositório, instale o Open Design e transforme um DESIGN.md em front-end — dentro do agente que você já usa.',
  },
  roleProductManagers: {
    title: 'Open Design para product managers',
    description:
      'Pare de esperar pela banda de design para comunicar uma ideia. O Open Design deixa um PM transformar um prompt em um protótipo clicável ou wireframe — para alinhar stakeholders e orientar o time, sem um ticket de design.',
    breadcrumb: 'Product Managers',
    label: 'Para · Product Managers',
    heading: 'Torne a ideia clicável antes do kickoff',
    lead: 'Descreva o fluxo e seu agente renderiza um protótipo clicável de verdade que você pode colocar na frente dos stakeholders hoje — para que as revisões discutam a coisa de fato, não um parágrafo em um documento.',
    heroImageAlt:
      'Ilustração editorial de um PM transformando uma ideia escrita em um protótipo clicável mostrado aos stakeholders',
    tldrTitle: 'Em uma linha',
    tldrBody:
      'O Open Design dá ao PM um jeito sem design de tornar ideias tangíveis: do prompt ao protótipo para alinhamento e orientação, sem gastar o orçamento de design do time.',
    stepsTitle: 'Como um PM usa o Open Design',
    steps: [
      {
        title: 'Descreva o fluxo',
        body: 'Escreva a jornada do usuário em linguagem natural — as telas, os estados, o caminho feliz. Sem precisar de ferramenta de wireframe.',
        imageAlt: 'Ilustração de um PM descrevendo um fluxo de usuário',
      },
      {
        title: 'Receba um protótipo clicável',
        body: 'O agente renderiza telas navegáveis em que você pode realmente clicar — muito mais claro que um slide ou um documento para uma revisão com stakeholders.',
        imageAlt: 'Ilustração de um protótipo clicável produzido a partir de uma descrição',
      },
      {
        title: 'Alinhe e repasse',
        body: 'Compartilhe o link, colete feedback sobre a coisa de fato e então passe o protótipo para design/eng como um ponto de partida preciso e compartilhado.',
        imageAlt: 'Ilustração de um protótipo compartilhado para alinhamento e depois repassado ao time',
      },
    ],
    tableTitle: 'Trabalho de PM com o Open Design vs. esperar pelo design',
    tableColCapability: 'O que você precisa',
    tableColWithOd: 'Com o Open Design',
    tableColWithout: 'Sem ele hoje',
    tableRows: [
      { capability: 'Tornar uma ideia tangível', withOd: 'Prompt → protótipo clicável você mesmo', without: 'Abrir um ticket de design e esperar pela banda' },
      { capability: 'Alinhar stakeholders', withOd: 'Eles clicam no fluxo de fato', without: 'Eles leem um documento e imaginam de forma diferente' },
      { capability: 'Orientar o time', withOd: 'Um protótipo concreto como especificação', without: 'Uma parede de texto e idas e vindas' },
      { capability: 'Iterar antes de construir', withOd: 'Mude em um prompt, compartilhe de novo', without: 'Mais uma rodada na fila de design' },
      { capability: 'Custo', withOd: 'Open source, dentro do agente que você já usa', without: 'Horas de design gastas em conceitos descartáveis' },
    ],
    featuresTitle: 'O que um PM pode colocar na frente das pessoas',
    features: [
      { title: 'Fluxos mobile', body: 'Jornadas de app de ponta a ponta, clicáveis.', thumb: 'example-mobile-app' },
      { title: 'Fluxos de onboarding', body: 'Boas-vindas → configuração → primeiro uso.', thumb: 'example-mobile-onboarding' },
      { title: 'Quadros e fluxos de trabalho', body: 'Kanban e interfaces de processo para especificações.', thumb: 'example-kanban-board' },
      { title: 'Dashboards', body: 'Visões de métricas para enquadrar o problema.', thumb: 'example-dashboard' },
      { title: 'Protótipos web', body: 'Fluxos web multitela para revisar.', thumb: 'example-web-prototype' },
      { title: 'Visões de tendência', body: 'Recortes de 30 dias e de tendências para dar contexto.', thumb: 'example-last30days' },
    ],
    galleryTitle: 'Prototipado por PMs com o Open Design',
    galleryLead:
      'Fluxos clicáveis renderizados a partir de uma descrição, prontos para uma revisão com stakeholders. Escolha um perto da sua ideia e descreva-o.',
    gallery: [
      { thumb: 'example-mobile-app', caption: 'Fluxo mobile' },
      { thumb: 'example-mobile-onboarding', caption: 'Fluxo de onboarding' },
      { thumb: 'example-kanban-board', caption: 'Quadro de fluxo de trabalho' },
      { thumb: 'example-web-prototype', caption: 'Protótipo web' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar modelos',
    faqTitle: 'Perguntas frequentes do product manager',
    faq: [
      { q: 'Não sei desenhar — isto é para mim?', a: 'Sim. Você descreve o fluxo em palavras; o agente o torna clicável. É para comunicar e alinhar, sem precisar de ferramenta de design.' },
      { q: 'É um protótipo de verdade ou um mockup?', a: 'De verdade e clicável — navegação e estados funcionam, então os stakeholders reagem à experiência de fato.' },
      { q: 'Substitui o design?', a: 'Não — dá ao design e à engenharia um ponto de partida preciso e compartilhado em vez de uma especificação de texto, e reserva a banda de design para o trabalho que precisa dela.' },
      { q: 'Quais agentes posso usar?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e mais adaptadores nativos, com suas próprias chaves de provedor.' },
    ],
    ctaTitle: 'Torne sua ideia clicável hoje à noite',
    ctaBody:
      'Dê uma estrela ao repositório, instale o Open Design e transforme sua próxima especificação em algo em que as pessoas possam clicar — dentro do agente que você já usa.',
  },
  roleMarketing: {
    title: 'Open Design para times de marketing',
    description:
      'Entregue campanhas na velocidade do conteúdo. O Open Design deixa seu agente produzir landing pages, cards para redes e visuais de campanha a partir de um prompt — dentro da marca, sob demanda, sem entrar na fila do design.',
    breadcrumb: 'Marketing',
    label: 'Para · Marketing',
    heading: 'Visuais de campanha na velocidade de um prompt',
    lead: 'Landing pages, cards para redes, capas, peças de anúncio — descritos em linguagem, renderizados dentro da marca, entregues no mesmo dia. Sem ticket de design, sem brigar com modelos.',
    heroImageAlt:
      'Ilustração editorial de um profissional de marketing transformando um briefing em uma landing page e um conjunto de cards de marca para redes',
    tldrTitle: 'Em uma linha',
    tldrBody:
      'O Open Design é o recurso de design sempre disponível para o marketing: do prompt ao ativo para landing pages e redes, dentro da marca, para que as campanhas saiam na velocidade em que você escreve o texto.',
    stepsTitle: 'Como um time de marketing usa o Open Design',
    steps: [
      {
        title: 'Trave a marca',
        body: 'Seu DESIGN.md guarda as cores, a tipografia e a voz. Todo ativo que o agente faz está automaticamente dentro da marca — sem reestilizar ativo por ativo.',
        imageAlt: 'Ilustração de um sistema de marca aplicado a ativos de marketing',
      },
      {
        title: 'Gere a campanha',
        body: 'Landing page, cards para redes, capas, peças de anúncio — um prompt para cada, um conjunto consistente em todos os canais.',
        imageAlt: 'Ilustração de um conjunto completo de campanha gerado a partir de prompts',
      },
      {
        title: 'Entregue e itere',
        body: 'Landing pages renderizam para HTML que você pode dar deploy; peças gráficas exportam para PNG. Mude o título, renderize o conjunto de novo — sem esperar em uma fila.',
        imageAlt: 'Ilustração de ativos de campanha sendo entregues e iterados rapidamente',
      },
    ],
    tableTitle: 'Marketing com o Open Design vs. a correria de sempre',
    tableColCapability: 'O que você precisa',
    tableColWithOd: 'Com o Open Design',
    tableColWithout: 'Sem ele hoje',
    tableRows: [
      { capability: 'Lançar uma landing page', withOd: 'Prompt → página dentro da marca, com deploy', without: 'Pedir ao design ou brigar com um construtor de sites' },
      { capability: 'Um conjunto de redes consistente', withOd: 'O mesmo modelo, texto novo, perfeitamente alinhado', without: 'Realinhar cada card à mão' },
      { capability: 'Manter a marca', withOd: 'Um DESIGN.md aplicado a cada ativo', without: 'Torcer para que cada ativo combine com as diretrizes' },
      { capability: 'Andar na velocidade da campanha', withOd: 'Ativo em um prompt, no mesmo dia', without: 'Entrar na fila atrás do backlog de design' },
      { capability: 'Custo', withOd: 'Open source, sem ferramenta de design por assento', without: 'Assinaturas mais horas de design' },
    ],
    featuresTitle: 'O que um time de marketing pode entregar',
    features: [
      { title: 'Landing pages', body: 'Landings de campanha e produto, com deploy.', thumb: 'example-saas-landing' },
      { title: 'Cards para redes', body: 'Cards de X / Twitter dentro da marca.', thumb: 'example-card-twitter' },
      { title: 'Carrosséis', body: 'Conjuntos multislide para redes, consistentes.', thumb: 'example-social-carousel' },
      { title: 'Pôsteres', body: 'Pôsteres de anúncio e de evento.', thumb: 'example-magazine-poster' },
      { title: 'Capas de artigo', body: 'Capas para blog e newsletter.', thumb: 'example-article-magazine' },
      { title: 'Páginas web', body: 'Microsites e páginas de campanha.', thumb: 'example-web-prototype' },
    ],
    galleryTitle: 'Entregue pelo marketing com o Open Design',
    galleryLead:
      'Ativos de campanha dentro da marca renderizados a partir de um prompt. Escolha um perto da sua campanha e troque pelo seu texto.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'Landing page de campanha' },
      { thumb: 'example-card-twitter', caption: 'Card para redes' },
      { thumb: 'example-social-carousel', caption: 'Carrossel para redes' },
      { thumb: 'example-magazine-poster', caption: 'Pôster de anúncio' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar modelos',
    faqTitle: 'Perguntas frequentes de marketing',
    faq: [
      { q: 'Precisamos de um designer para cada ativo?', a: 'Não. O agente renderiza landing pages e ativos para redes dentro da marca a partir de um prompt, então o time entrega o trabalho rotineiro de campanha sem entrar na fila do design.' },
      { q: 'Como os ativos se mantêm dentro da marca?', a: 'Seu DESIGN.md é aplicado a tudo automaticamente — cores, tipografia e voz se propagam para cada ativo.' },
      { q: 'As landing pages podem mesmo ir ao ar?', a: 'Sim — elas renderizam para HTML que você pode dar deploy, e as peças gráficas exportam para PNG. São ativos prontos para entrega, não mockups.' },
      { q: 'Quais agentes posso usar?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e mais adaptadores nativos, com suas próprias chaves de provedor.' },
    ],
    ctaTitle: 'Entregue sua próxima campanha hoje à noite',
    ctaBody:
      'Dê uma estrela ao repositório, instale o Open Design e transforme briefings em ativos dentro da marca — dentro do agente que você já usa.',
  },
};
