/*
 * Textos em português do Brasil para a coleção de design do DeepSeek Harness.
 * Traduzido a partir da base em inglês.
 */
import type { DeepseekCopyOverride } from './index';

export const ptBr: DeepseekCopyOverride = {
  collectionEyebrow: 'Coleção curada',
  collectionHeading: 'Plugins do DeepSeek Harness para design',
  collectionLede:
    'Uma coleção curada de plugins dsh para design: pontes de visão que leem screenshots, telas e UI generativa onde o agente pode desenhar, ferramentas de revisão de design e bancadas que mostram o preview de tudo. O DeepSeek Harness lê o mesmo formato SKILL.md do Claude Code e do Codex, então sua biblioteca de skills de design vem junto.',
  collectionStats: [
    { value: '13', label: 'plugins dsh selecionados' },
    { value: '13', label: 'repositórios de origem' },
    { value: 'SKILL.md', label: 'compartilhado com Claude Code e Codex' },
  ],
  collectionIntro:
    'Todo plugin dsh abaixo é real, nativo do DeepSeek Harness, encontrável pelo topic dsh-plugin no GitHub e leva até a sua fonte. Eles cumprem quatro funções: dar visão ao harness só de texto, dar a ele superfícies de design para desenhar, ligar a revisão de design ao ciclo de trabalho e transformar sua interface web num workspace de design.',
  collectionCategoryBlurbs: [
    'Transforme screenshots, mockups e gráficos em evidência estruturada sobre a qual um modelo só de texto consegue agir.',
    'Dê ao agente superfícies para desenhar: canvases vetoriais editáveis, cards de UI ao vivo, slides.',
    'Feche o ciclo: anote páginas reais, compile assets de movimento e traga sua biblioteca de skills junto.',
    'Faça do próprio harness um workspace de design: painéis de preview, bancadas de trabalho e quadros ao lado do chat.',
  ],
  collectionCloserHeading: 'Pule a configuração. Projete com o DeepSeek Harness dentro do Open Design',
  filterAll: 'Tudo',
  collectionCloserBody:
    'O Open Design é o workspace de design open source e agent-native que roda em volta do DeepSeek Harness. Ele mantém seus sistemas, skills e templates consistentes, então o agente entrega um trabalho que é seu.',

  categoryVision: 'Visão & Entrada',
  categoryCanvas: 'Canvas & UI Generativa',
  categoryWorkflow: 'Fluxo de Design',
  categoryWorkspace: 'Workspace & Preview',

  ctaDownload: 'Baixar o Open Design',
  ctaStarList: 'Dar estrela no DeepSeek Harness',
  ctaGuide: 'Como fazer design com o DeepSeek Harness',
  ctaBrowseAll: 'Ver todos os plugins',
  ctaViewSource: 'Ver o código-fonte',
  ctaOurRepo: 'deepseek-harness no GitHub',
  cardKind: 'Plugin',
  cardWhatItDoes: 'O que ele faz',
  cardCta: 'Ver o plugin',

  detailWhatIsIt: 'O que é',
  detailWhyForDesign: 'Por que isso importa para design',
  detailHowWithAgent: 'Como rodar com o DeepSeek Harness',
  detailExampleTag: 'Quando usar',
  detailSource: 'Fonte',
  detailCategory: 'Categoria',
  detailMaintainer: 'Autor',
  detailTags: 'Tags',
  detailLicense: 'Licença',
  detailCovers: 'O que cobre',
  detailUpstream: 'Do README original',
  detailAgentNote: 'Funciona com DeepSeek Harness',
  detailTraction: 'Tração',
  detailRepo: 'Repositório de origem',
  detailStars: 'Estrelas',

  installHeading: 'Como instalar',
  installRunInAgent: 'Rode isto em um terminal.',
  installRestart: 'Reinicie o dsh web para ele carregar o plugin.',
  installClone: 'Clone o repositório.',
  installPoint: 'Aponte o DeepSeek Harness para o arquivo da skill.',
  installThenUse: 'Depois descreva o design que você quer. O harness carrega as ferramentas do plugin.',

  installNote:
    'Todo plugin aqui é gratuito para instalar e leva até a sua fonte original.',
  installNoteCta: 'Ver a coleção inteira',
  detailMoreOnList: 'Mais no repositório do DeepSeek Harness',
  detailRelated: 'Mais plugins de design para o DeepSeek Harness',
  finalEyebrow: 'Próximo passo',
  detailCloserHeading: 'Projete com o Open Design, sem a configuração',
  detailCloserBody:
    'Instale este plugin por conta própria ou rode uma camada de design curada em volta do DeepSeek Harness com o Open Design. Use sua própria chave e seja dono do resultado.',

  skills: {
    modlens: {
      tagline:
        'Dá visão plugável aos modelos DeepSeek só de texto: cole um screenshot, receba evidência estruturada.',
      whatIsIt:
        'Uma ponte de visão para agentes de código só de texto. Cole uma imagem no chat e o modlens a converte em evidência JSON estruturada — transcrição completa, regiões de layout em ordem de leitura, entidades e relações — em vez do palpite de um modelo.',
      whyForDesign: [
        'Screenshots de UI viram passo a passo elemento por elemento sobre o qual o agente consegue agir.',
        'Gráficos densos e visualizações de dados são lidos por completo: eixos, escalas, paletas, regiões destacadas.',
        'Cole várias referências de uma vez e ele identifica a família visual em comum antes de descrever cada uma.',
      ],
      howWithAgent: [
        'Instale o plugin; o seletor de modelos ganha variantes DeepSeek-V4 com visão do modlens.',
        'Cole um screenshot, mockup ou gráfico direto na conversa.',
        'Faça perguntas de design sobre a evidência estruturada em vez de re-descrever a imagem.',
      ],
    },
    'dsh-vision-toolkit': {
      tagline: 'Dez ferramentas de visão para restauração de UI, grounding e verificação por pixel diff.',
      whatIsIt:
        'Um pacote nativo do DeepSeek Harness com dez ferramentas de visão: perguntas e respostas sobre imagens, grounding e detecção com coordenadas de pixel, OCR de screenshots longos, recorte, extração de cor, screenshots de HTML e pixel diff. As ferramentas são montadas progressivamente por uma skill de vision-tools.',
      whyForDesign: [
        'A restauração de UI fecha o ciclo com números: um fluxo versionado itera uma reconstrução de 6,04% de diferença de pixels até 0%.',
        'Grounding e detecção devolvem caixas em pixels da imagem original, então o agente age sobre coordenadas em vez de interpretar prosa.',
        'Infográficos e rascunhos feitos à mão viram interfaces HTML/CSS editáveis.',
      ],
      howWithAgent: [
        'Adicione o plugin ao seu perfil web ou headless e defina uma credencial de visão para as ferramentas remotas.',
        'Ative o toolkit; a skill de vision-tools monta os schemas das dez ferramentas.',
        'Reconstrua uma referência e depois verifique com vision_html_screenshot e vision_pixel_diff.',
      ],
    },
    'dsh-ui-spec': {
      tagline: 'Transforma screenshots de UI em specs prontas para implementação: tokens, escala de espaçamento, grid de layout.',
      whatIsIt:
        'Uma única ferramenta analyze_ui_image que converte um screenshot ou mockup em uma spec de frontend estruturada. Uma camada de geometria determinística mede dimensões exatas, paleta, design tokens sugeridos, grid de layout e escala de espaçamento; um modelo de visão opcional adiciona semântica por cima.',
      whyForDesign: [
        'Coordenadas de pixel, escalas de espaçamento e paletas de tokens são calculadas deterministicamente, não chutadas por um modelo de visão.',
        'Os campos da spec mapeiam direto para a implementação: tokens sugeridos para design tokens, a escala de espaçamento para CSS.',
        'Os papéis semânticos fornecem a intenção enquanto a geometria fornece o posicionamento, fundidos numa única spec em JSON + Markdown.',
      ],
      howWithAgent: [
        'Adicione o plugin; a camada de geometria funciona offline sem nenhuma configuração.',
        'Opcionalmente aponte a camada semântica para qualquer endpoint de visão compatível com OpenAI.',
        'Entregue um screenshot ao agente e construa a partir da spec retornada em vez da imagem.',
      ],
    },
    'dsh-media-skills': {
      tagline: 'Olhos de graça e um pincel de graça: leitura de imagens coladas mais geração de imagens sem marca d\'água.',
      whatIsIt:
        'Duas skills SKILL.md e uma rota de modelo de visão gratuita para o harness: a vision-review lê screenshots e pega bugs visuais, a media-tools gera ilustrações, avatares, fundos e banners — ambas rodando em modelos de camada gratuita.',
      whyForDesign: [
        'Pega bugs visuais de UI que um agente de texto não consegue ver: sobreposição, overflow, desalinhamento.',
        'Gera assets de design sem marca d\'água numa camada gratuita, então explorar não custa nada.',
        'Adiciona um botão "Add image" a sessões só de texto; imagens coladas são descritas para o modelo atual.',
      ],
      howWithAgent: [
        'Adicione o plugin e coloque as chaves de API gratuitas no repositório de credenciais do harness.',
        'Reinicie o dsh web; o seletor de modelos ganha uma rota de visão gratuita.',
        'Peça a revisão de um screenshot, ou um novo asset, em linguagem natural.',
      ],
    },
    'dsh-openpencil': {
      tagline: 'O agente projeta num canvas vetorial real e editável em vez de devolver imagens estáticas.',
      whatIsIt:
        'Conecta o harness ao OpenPencil, uma ferramenta open source de design vetorial nativa de IA. Cinco ferramentas permitem ao agente criar, editar, renderizar e inspecionar documentos .op de design-as-code por lotes transacionais, com previews de múltiplos frames e um editor gerenciado para a pessoa assumir o controle.',
      whyForDesign: [
        'Um ciclo único do requisito ao canvas: o agente edita o documento real e os previews renderizam frames fiéis ao design.',
        'Os lotes transacionais só publicam em caso de sucesso e nunca sobrescrevem edições externas — conflitos vêm à tona.',
        'Um editor gerenciado com seleção, camadas, propriedades e undo permite que uma pessoa assuma o trabalho do agente a qualquer momento.',
      ],
      howWithAgent: [
        'Instale o OpenPencil e depois adicione o plugin ao seu perfil web.',
        'Descreva o design; o agente aciona openpencil_create e openpencil_edit em lotes.',
        'Abra o preview renderizado ou o editor gerenciado e continue iterando ali mesmo.',
      ],
    },
    'dsh-visualize': {
      tagline: 'O modelo desenha cards HTML interativos direto no fluxo da conversa.',
      whatIsIt:
        'Uma ferramenta visualize mais uma skill companheira: o modelo escreve um fragmento de HTML e o monta como um card interativo em sandbox dentro do chat — simuladores, gráficos, painéis de comparação e mockups de UI, com preview em streaming e estilo casado com o tema.',
      whyForDesign: [
        'Os mockups de UI vivem na conversa e podem ser clicados, não só descritos.',
        'Os cards seguem o tema claro/escuro e a paleta do host, então os previews parecem nativos.',
        'Todo card roda num iframe em sandbox com uma CSP estrita — um fragmento quebrado não derruba a sessão.',
      ],
      howWithAgent: [
        'Adicione o plugin e reinicie o dsh web.',
        'Peça um mockup ou uma comparação; o modelo chama visualize com seu próprio HTML.',
        'Reproduza a sessão depois — os cards são restaurados a partir do resultado persistido da ferramenta.',
      ],
    },
    'dsh-genui': {
      tagline: 'Mais de trinta componentes interativos renderizados inline nas respostas, com um loop de ações de volta ao modelo.',
      whatIsIt:
        'O modelo descreve uma interface como JSON num fence dsh-ui; um renderizador no navegador a transforma em componentes vivos dentro da resposta — cards, tabelas, gráficos, formulários, abas, linhas do tempo, diffs, mermaid, cenas 3D — aparecendo enquanto a resposta chega em streaming.',
      whyForDesign: [
        'As respostas viram interfaces: painéis de dados, gráficos e formulários renderizam onde a explicação acontece.',
        'Componentes interativos enviam ações de volta ao modelo, que atualiza a UI em resposta.',
        'Uma whitelist de componentes e um guarda de spec garantem que um gráfico quebrado nunca chegue à tela.',
      ],
      howWithAgent: [
        'Adicione o plugin a partir do GitHub e reinicie o dsh web.',
        'Peça um dashboard, um quiz ou um formulário; o modelo escreve o fence dsh-ui sozinho.',
        'Interaja com o resultado — ações locais respondem na hora, ações do modelo voltam pelo loop.',
      ],
    },
    'dsh-openmaic': {
      tagline: 'Slides, widgets interativos e aulas completas jogáveis, renderizados a partir de JSON escrito pelo agente.',
      whatIsIt:
        'Quatro ferramentas e uma skill de ensino socrático do grupo THU-MAIC: o agente escreve JSON de slides no estilo PPTist renderizado pelo renderizador oficial do OpenMAIC, transmite widgets interativos como cards em sandbox e pode enviar um pedido de uma linha que volta como uma sala de aula jogável.',
      whyForDesign: [
        'Decks de slides com texto, formas, imagens, tabelas, gráficos, fórmulas e código — escritos como JSON na conversa.',
        'Simulações interativas e jogos renderizam ali mesmo como cards em sandbox.',
        'Uma aula completa com conteúdo visual está a um pedido de distância, devolvida como um link jogável.',
      ],
      howWithAgent: [
        'Adicione o plugin a partir do GitHub; ele já vem compilado, então não há etapa de build.',
        'Reinicie o dsh web e peça um deck ou um widget.',
        'Para aulas inteiras, openmaic_generate consulta o serviço do OpenMAIC e devolve o link da sala de aula.',
      ],
    },
    'dsh-web-review': {
      tagline: 'Aponte para elementos numa página ao vivo, anote visualmente, e o agente edita o código-fonte.',
      whatIsIt:
        'Um navegador embutido na interface web do harness: destaque no hover e selecione elementos como numa ferramenta de design, anexe notas e experimente ajustes visuais ao vivo — texto, cor, tipografia, tamanho, espaçamento, bordas, efeitos. As anotações carregam seletores e pistas do código-fonte para o agente encontrar e corrigir o código.',
      whyForDesign: [
        'Apontar e anotar visualmente substitui descrever problemas de UI em palavras.',
        'Os ajustes ao vivo mostram o preview de uma mudança na página antes de qualquer código ser tocado.',
        'Traz oito skills de design embutidas, de better-typography a interface-review, usáveis a partir do editor de anotações.',
      ],
      howWithAgent: [
        'Adicione o plugin e inicie o dsh web.',
        'Abra seu app em execução na aba Web Preview e anote o que deve mudar.',
        'Envie — o agente recebe seletores, notas e valores testados, e edita o código-fonte do workspace.',
      ],
    },
    'dsh-figma-to-lottie': {
      tagline: 'Compila paths SVG e keyframes em animações Lottie autocontidas a partir da conversa.',
      whatIsIt:
        'Duas ferramentas que transformam dados de design em assets de movimento: lottie_compile_shape converte um path SVG em valores de forma Lottie, e lottie_compile monta um Lottie JSON completo a partir de uma spec compacta de camadas — retângulos, gradientes, paths, imagens embutidas e texto, com animação por keyframe em cada camada.',
      whyForDesign: [
        'Descreva uma animação de carregamento em linguagem natural e receba um .lottie.json que roda em iOS, Android e na web.',
        'Tangentes bezier de entrada e saída e o easing dos keyframes são compilados, não escritos à mão.',
        'Zero etapa de build e ESM puro: o que é publicado é exatamente o que roda.',
      ],
      howWithAgent: [
        'Adicione o plugin pelo npm, ou trave um commit do GitHub.',
        'Descreva o movimento: camadas, timing, easing, escalonamento.',
        'Coloque o .lottie.json compilado no LottieWeb, lottie-ios ou lottie-android.',
      ],
    },
    'dsh-plugin-claude-bridge': {
      tagline: 'Suas skills, memória e instruções globais do Claude Code, disponíveis no harness sem nenhuma migração.',
      whatIsIt:
        'Lê os locais de arquivo padrão do Claude Code diretamente — sem scripts de migração, sem cópias, sem symlinks. As skills de ~/.claude/skills entram no catálogo de skills do harness, a memória do projeto é injetada como contexto a cada requisição, e as instruções globais do CLAUDE.md vêm junto.',
      whyForDesign: [
        'Skills de design que você já roda no Claude Code funcionam aqui sem mover um arquivo.',
        'A memória do projeto é relida a cada requisição, então notas novas entram em vigor imediatamente.',
        'Instruções globais e preferências de colaboração são preservadas entre agentes.',
      ],
      howWithAgent: [
        'Adicione o plugin ao seu perfil; ele funciona sem nenhuma configuração.',
        'Opcionalmente aponte-o para diretórios extras de skills, como ~/.agents/skills.',
        'Invoque suas skills existentes pelo nome, como faria no Claude Code.',
      ],
    },
    'dsh-web-ui': {
      tagline:
        'O maior kit de UI do ecossistema: quadro de tarefas, painel de preview, grafo do Git e uma central de skins.',
      whatIsIt:
        'Uma coleção de plugins e skins para a interface web do harness: um quadro de tarefas de cinco colunas cujos cards rodam sessões reais de agente, um painel lateral direito com árvore de arquivos e previews em múltiplas abas, um grafo do Git, controle remoto pelo celular e uma central de skins para experimentar antes de aplicar.',
      whyForDesign: [
        'O painel lateral direito mostra o preview de Markdown, HTML, diffs, CSV, PDF, arquivos Office e imagens ao lado da conversa.',
        'O quadro de tarefas transforma pendências de design em cards que uma sessão real de agente dsh executa e sobre os quais reporta de volta.',
        'A largura do painel é arrastável e persiste por projeto, então o workspace fica do jeito que você o arrumou.',
      ],
      howWithAgent: [
        'Adicione o pacote agregado ao seu perfil web para instalar tudo de uma vez.',
        'Abra o painel lateral direito e fixe os arquivos e previews com que você está trabalhando.',
        'Coloque tarefas de design no quadro e deixe os cards executarem em sessões reais de agente.',
      ],
    },
    'dsh-better-sidebar': {
      tagline:
        'Uma bancada de trabalho completa na barra lateral: explorador de arquivos, previews ricos, terminal, Git e um navegador.',
      whatIsIt:
        'Uma bancada de trabalho de painel duplo para a interface web do harness: um explorador de arquivos com carregamento sob demanda e edição via CodeMirror, previews inline de imagens, Markdown, HTML, PDF e arquivos Office, um terminal de verdade, um painel de Git com diffs no estilo do VS Code, um navegador embutido em sandbox e abas com divisão de painéis arrastável.',
      whyForDesign: [
        'Veja o preview do HTML, das imagens e dos documentos que o agente produz sem sair da conversa.',
        'Um navegador embutido em sandbox abre seu protótipo em execução numa aba ao lado do chat.',
        'Plugins de terceiros podem registrar suas próprias abas e visualizadores de arquivo pela sua API de serviços.',
      ],
      howWithAgent: [
        'Instale com o script de uma linha, ou adicione o pacote npm ao seu perfil web.',
        'Abra a bancada de trabalho e organize as abas entre a barra lateral direita e o painel inferior.',
        'Revise o que o agente construiu ali mesmo: previews, diffs, terminal e abas de navegador.',
      ],
    },
  },
};
