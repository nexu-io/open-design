// Brazilian Portuguese (pt-BR) overrides for the Codex Slides landing copy.
import type { DeepPartial, CodexSlidesCopy } from '../codex-slides-i18n';

const ptBr: DeepPartial<CodexSlidesCopy> = {
  title: "Codex Slides — o estúdio de slides com IA dentro do Codex",
  description:
    "Codex Slides é um estúdio de slides com IA de código aberto que vive dentro do Codex. Descreva uma apresentação — ou aponte para um repositório, um PDF ou uma planilha — e o seu Codex local pesquisa, monta o roteiro, define o estilo, renderiza e exporta um PPTX de verdade e um PDF pronto para impressão. Cada slide é uma tela visual inteira. 45 templates de apresentação, 73 estilos da comunidade, 24 cenários guiados; o Fast mode renderiza mais de 10 slides em cerca de 4 a 5 minutos. Browser-first, licença MIT, roda no seu codex login atual, sem nenhuma chave de API extra.",
  label: "Projeto irmão",
  heading: "O estúdio de slides com IA dentro do seu agente de código",
  lead:
    "A maioria dos geradores de slides com IA esconde o trabalho por trás de um único pedido e devolve um arquivo. O Codex Slides mantém a cadeia inteira viva dentro do Codex — pesquisa, roteiro, direção visual, render, edição, apresentação, exportação — e cada apresentação continua sendo um projeto duradouro no seu próprio disco. Image-native: cada slide é uma tela visual inteira, não um template com o texto trocado.",
  downloadCta: "Baixar o Open Design",
  heroAlt:
    "Codex Slides — o Codex à esquerda conduzindo o estúdio de slides no navegador e, à direita, um slide renderizado de relatório de mercado",

  glanceAria: "Em resumo",
  glance: {
    stars: "Estrelas no GitHub",
    templates: "Templates de apresentação",
    styles: "Estilos da comunidade",
    scenarios: "Cenários guiados",
    license: "Licença",
  },

  whyTitle: "Por que isto existe",
  whyLead:
    "Uma apresentação não é um problema de geração em uma tacada só. É uma sequência de decisões — o que dizer, em que ordem, em que linguagem visual — e cada uma delas sai mais barata se for corrigida antes do render do que depois.",
  ideas: [
    {
      headline: "Você acompanha acontecendo em vez de esperar por um arquivo.",
      body: "O Codex abre o estúdio no seu Browser e o mantém à vista. Você confirma o briefing, revisa o roteiro e aprova a direção visual antes de uma única página ser renderizada — assim os erros caros são pegos enquanto ainda são baratos.",
    },
    {
      headline: "Cada apresentação é um projeto duradouro, não um download.",
      body: "Conversa, fontes, roteiro, regras de marca, checkpoints e páginas renderizadas ficam todos no disco. Volte amanhã e continue editando o mesmo projeto; cada comando de IA e cada edição manual deixa um checkpoint imutável que você pode inspecionar, restaurar ou exportar.",
    },
    {
      headline: "Image-native — o slide é a tela.",
      body: "Cada página é composta como uma tela visual inteira, e não como uma caixa de texto jogada sobre um tema, e é por isso que o resultado se sustenta ao lado de apresentações feitas à mão. Marque um slide diretamente e regenere só aquela página a partir das suas anotações.",
    },
  ],

  flowTitle: "Como funciona",
  flowLead:
    "Um prompt entra, uma apresentação pronta para o palco sai — com um ponto de controle em cada etapa em que o seu julgamento vale mais do que outra chamada ao modelo.",
  flow: [
    { step: '01', headline: "Esclareça o briefing", body: "Um formulário de perguntas sob medida confirma público, número de páginas, proporção, idioma, resolução e intenção visual antes de qualquer texto começar a ser escrito." },
    { step: '02', headline: "Pesquise os fatos", body: "Uma pesquisa web opcional em várias rodadas produz um briefing em Markdown embasado em fontes, que continua inspecionável e editável nos Design Files." },
    { step: '03', headline: "Modele o roteiro", body: "Edite cada título e cada ponto de fala, acrescente ou remova slides, reordene a narrativa ou peça ao agente para reestruturá-la — tudo antes de os visuais existirem." },
    { step: '04', headline: "Trave a direção visual", body: "O Codex Slides ranqueia a biblioteca de estilos em relação ao seu tema e ao seu roteiro. Escolha um, busque no catálogo inteiro ou fique com o padrão." },
    { step: '05', headline: "Renderize em paralelo", body: "O Fast mode dispara todas as páginas de uma vez, em vez de uma a uma, então uma apresentação com mais de 10 slides fica pronta em cerca de quatro a cinco minutos, com a direção travada." },
    { step: '06', headline: "Edite no lugar", body: "Peça uma reescrita, marque uma região com setas e comentários, troque uma imagem, reordene páginas, defina transições e escreva as notas do apresentador." },
    { step: '07', headline: "Apresente e exporte", body: "Use o Presenter Mode com janela de plateia sincronizada e cronômetro e, depois, baixe um PPTX de verdade e um PDF pronto para impressão com as notas preservadas." },
  ],

  showcaseTitle: "Como ficam as apresentações",
  showcaseLead:
    "Cada card é um sistema visual que já vem com o Codex Slides — uma direção acabada para você partir dela e depois inserir o seu próprio tema, público ou arquivos.",
  showcase: [
    { alt: "Apresentação de relatório de negócios e de mercado com gráficos e destaques de KPI", tag: "Relatório de mercado · gráficos e KPIs" },
    { alt: "Apresentação de dashboard de dados com mapa-múndi, gráfico de rosca e blocos de métricas", tag: "História de dados · dashboard" },
    { alt: "Slide de keynote de produto cinematográfico com um momento de título de alto contraste", tag: "Keynote · cinematográfico" },
    { alt: "Apresentação em estilo revista editorial com títulos em serifa e grid de impressão", tag: "Editorial · grid de impressão" },
    { alt: "Slide de keynote de produto claro e arejado, com nós de diagrama 3D suaves e um único acento índigo", tag: "Keynote · luz do dia limpa" },
    { alt: "Slide técnico de vista em corte com rótulos que reconstrói um sistema como seção transversal", tag: "Técnico · corte rotulado" },
  ],

  insideTitle: "O produto de verdade",
  insideLead:
    "Estas são as telas reais que o Codex conduz no seu Browser, as mesmas que você usaria na mão, então dá para entrar e assumir o comando a qualquer momento.",
  inside: [
    { alt: "Tela inicial do Codex Slides com o compositor de prompt, atalhos de cenários e estilos da comunidade", tag: "Início · descreva sua apresentação" },
    { alt: "Biblioteca de cenários com fluxos de apresentação pré-configurados", tag: "Cenários · escolha um fluxo" },
    { alt: "Roteiro de apresentação editável com títulos e pontos de fala", tag: "Roteiro · dê forma à história" },
    { alt: "Editor de slides com a tela inteira à vista, barra de ferramentas, notas do apresentador e miniaturas", tag: "Editor · tela inteira" },
  ],

  scenariosTitle: "Seis grupos de fluxos",
  scenariosLead:
    "Vinte e quatro cenários guiados, reunidos em seis grupos de fluxos. Cada grupo traz suas próprias perguntas, seus campos de fonte e sua gramática visual. Comece por um deles ou simplesmente descreva o que você precisa.",
  scenarios: [
    { name: "Criar do zero", blurb: "Relatórios de negócio, pitch decks e propostas de projeto a partir de um único briefing." },
    { name: "Transformar uma fonte", blurb: "Embeleze um PPTX, HTML ou PDF existente; transforme documentos, anotações ou a foto de um quadro branco em slides." },
    { name: "Dados e insights", blurb: "Dashboards, relatórios de performance recorrentes, resultados financeiros e leituras de pesquisas." },
    { name: "Pesquisa e decisões", blurb: "Apresentações de deep research, estudos de mercado, análises competitivas e revisões de literatura." },
    { name: "Otimizar uma apresentação", blurb: "Aplique um sistema de marca, recrie um estilo de referência, traduza e localize, comprima ou expanda." },
    { name: "Entregas especializadas", blurb: "Material de treinamento, keynotes de lançamento, portfólios e estudos de caso, lotes guiados por template." },
  ],

  formatsTitle: "Arquivos de verdade que você pode entregar",
  formatsLead:
    "Quando a apresentação estiver do jeito certo, exporte um PowerPoint (.pptx) de verdade e um PDF pronto para impressão, ambos com as suas notas do apresentador. Escolha a qualidade de render e o formato que combina com o palco ou o feed:",
  formatsRows: [
    { label: "Formatos de exportação", values: "PowerPoint (.pptx) · PDF · notas do apresentador preservadas" },
    { label: "Qualidade de render", values: "1K · 2K · 4K" },
    { label: "Proporções", values: "16:9 · 4:3 · 1:1 · 9:16 · 3:4" },
  ],

  duoTitle: "Rápido e sem fricção",
  fastTitle: "Fast mode",
  fastLead:
    "As páginas são renderizadas em paralelo — até quatro simultâneas, com o restante na fila — em vez de uma após a outra, enquanto o roteiro aprovado e a direção visual permanecem travados. Uma apresentação de dez slides normalmente fica pronta em cerca de quatro a cinco minutos, e uma execução interrompida retoma a partir do estado salvo do projeto em vez de começar do zero.",
  installTitle: "Instalar no Codex",
  installLead:
    "Adicione o repositório como marketplace de plugins, instale o plugin, reinicie o Codex e comece uma nova tarefa. Você precisa do Codex com suporte a plugins, do Node.js 20 ou mais recente e de um `codex login` — nenhuma chave separada da OpenAI e nenhum arquivo `.env` no fluxo padrão.",

  finalEyebrow: "Próximo passo",
  tiebackTitle: "Da família Open Design",
  tiebackBody:
    "O Open Design é o espaço de design aberto e local-first que fica do lado de fora do agente de código que você já usa. O Codex Slides é a mesma ideia apontada para apresentações: seu agente faz o trabalho às claras, o projeto continua na sua máquina e nada fica trancado atrás de uma assinatura. Para o kit de design completo além dos slides, baixe o app do Open Design.",

  schemaAlternateName: "O estúdio de slides com IA de código aberto dentro do Codex",
  schemaWhatQuestion: "O que é o Codex Slides?",
  schemaWhatAnswer:
    "O Codex Slides é um estúdio de slides com IA de código aberto, licenciado sob MIT, que roda como plugin dentro do Codex. Ele transforma um prompt, um repositório ou um conjunto de arquivos em uma apresentação pronta para o palco por meio de um fluxo visível — esclarecimento, pesquisa opcional, roteiro, direção visual, render em paralelo, edição, apresentação e exportação em PPTX/PDF — e mantém cada apresentação como um projeto duradouro no seu próprio disco.",
  schemaKeyQuestion: "O Codex Slides precisa de uma chave de API separada?",
  schemaKeyAnswer:
    "Não. Ele roda na conta ChatGPT com a qual você já se autenticou via `codex login`. O fluxo padrão não precisa de uma chave de API da OpenAI separada nem de um arquivo `.env`; ele exige o Codex com suporte a plugins, o Node.js 20 ou mais recente e o Git.",
  schemaExportQuestion: "O Codex Slides consegue exportar arquivos reais do PowerPoint?",
  schemaExportAnswer:
    "Sim. O Codex Slides exporta um PPTX de verdade e um PDF pronto para impressão, ambos preservando as notas do apresentador do projeto, com qualidade de render 1K/2K/4K em cinco proporções (16:9, 4:3, 1:1, 9:16, 3:4). Por ser image-native, os slides do PPTX exportado contêm imagens de página inteira em vez de formas do PowerPoint editáveis individualmente; a exportação com formas editáveis está no roadmap.",
  schemaRelationQuestion: "O Codex Slides tem relação com o Open Design?",
  schemaRelationAnswer:
    "Sim. O Codex Slides é um projeto irmão feito pelo time por trás do Open Design — a mesma abordagem aberta, local-first e agent-native aplicada a apresentações em vez de arquivos de design.",
};

export default ptBr;
