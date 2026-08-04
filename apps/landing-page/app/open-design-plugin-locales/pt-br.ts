import type { OpenDesignPluginCopy } from '../open-design-plugin-i18n';

const copy: OpenDesignPluginCopy = {
  metadata: {
    title: 'Open Design para Codex/ChatGPT | Instale o plugin Open Design Cloud',
    description:
      'Instale o Open Design Cloud no Codex/ChatGPT e crie sites, apresentações, protótipos e sistemas de design na mesma tarefa.',
    keywords:
      'plugin Open Design para Codex, plugin para ChatGPT desktop, instalar plugin no Codex, Open Design Cloud, plugin de design para Codex, Codex MCP',
  },
  hero: {
    title: 'Plugin Open Design para Codex/ChatGPT',
    leadBefore: 'Insira a instrução abaixo em qualquer tarefa no seu',
    chatgptLabel: 'aplicativo ChatGPT para desktop',
    installAria: 'Instalar o Open Design Cloud no Codex/ChatGPT',
    copy: 'Copiar',
    github: 'Ver código-fonte no GitHub ↗',
  },
  agentInstall: {
    howToName: 'Instalar o plugin Open Design no Codex',
    howToDescription:
      'Etapas que o agente pode executar para instalar o plugin Open Design no Codex e registrar o MCP local.',
    eyebrow: 'Protocolo de instalação para agentes',
    title: 'Instale o plugin do Codex por completo.',
    intro:
      'Se o usuário pediu que você instale o Open Design, execute este protocolo na ordem indicada. O pedido autoriza alterações somente nas configurações de plugin e MCP do Codex do usuário. Preserve marketplaces, plugins, servidores MCP e estados de autenticação não relacionados.',
    downloadLabel: 'Página oficial de download do Open Design ↗',
    steps: [
      {
        title: 'Verifique previamente o ambiente compatível',
        body:
          'Exija o Codex CLI 0.144.6 ou mais recente, o Open Design 0.17.0 ou mais recente e acesso ao repositório canônico do marketplace. Não baixe silenciosamente um instalador nem execute um script de instalação não verificado. Se o Open Design não estiver instalado ou for antigo demais, pare e encaminhe o usuário à página oficial de download.',
      },
      {
        title: 'Inspecione antes de alterar a configuração',
        body:
          'Leia o seletor e a versão exigidos em release-manifest.json e compare-os com o estado inspecionado do Codex. A ausência do MCP open-design é esperada na primeira instalação. Se o nome open-design do marketplace apontar para outra origem, pare e informe o conflito. Preserve open-design@open-design somente quando a versão instalada corresponder à versão declarada em release-manifest.json.',
      },
      {
        title: 'Instale somente os componentes ausentes',
        body:
          'Execute o comando do marketplace somente se o marketplace canônico estiver ausente. Execute o comando do plugin quando open-design@open-design estiver ausente. Se houver uma versão diferente instalada, peça a confirmação do usuário antes de atualizá-la ou reinstalá-la; pule a instalação somente quando estiver presente exatamente a versão exigida. Um resultado alreadyAdded: true indica sucesso. Não edite manualmente a configuração do Codex nem copie arquivos do plugin para o diretório inicial do Codex.',
      },
      {
        title: 'Garanta o MCP local do Open Design',
        body:
          'Preserve um MCP open-design existente e habilitado. Caso contrário, execute o instalador do MCP fornecido pelo aplicativo Open Design instalado. Em sistemas POSIX, execute o caminho resolvido de od somente depois que a verificação retornar open-design-cli:mcp-install:v1; diante de qualquer outro resultado, inclusive /usr/bin/od, use Open Design Settings → MCP server ou a operação assinada incluída no pacote --headless --mcp-install codex. Nunca tente adivinhar uma porta localhost nem execute codex mcp login; o login da Vela pertence ao Open Design.',
      },
      {
        title: 'Verifique, informe e inicie uma nova tarefa',
        body:
          'Verifique o id de plugin open-design@open-design, confirme que a versão instalada corresponde exatamente a plugin.version em release-manifest.json e verifique um stdio MCP habilitado chamado open-design. Seu comando deve ser um caminho absoluto de inicialização do Open Design e não deve incorporar um bearer token, uma API key nem uma credencial da Vela. Informe o que foi instalado e qualquer pré-requisito restante do Open Design ou de login da Vela. Inicie uma nova tarefa do Codex para que ela carregue o snapshot do plugin instalado e, depois, invoque @open-design.',
      },
    ],
  },
  demo: {
    title: 'Instale uma vez. Crie no Codex/ChatGPT.',
    lead:
      'Veja primeiro o espaço de trabalho completo do Codex e do Open Design e, depois, acompanhe a sequência real da instalação ao resultado.',
    overviewAlt:
      'Uma tarefa real no Codex usando o plugin Open Design ao lado do site finalizado do café Goodfield',
    overviewLabel: 'Tarefa real no Codex',
    overviewCaption:
      'O prompt, a transferência para o Open Design, os arquivos gerados e o site finalizado permanecem visíveis no mesmo espaço de trabalho.',
    stepListAria: 'As cinco etapas de uma execução real do plugin no Codex',
    installPhase: 'Instalar',
    installTitle: 'Peça ao Codex para instalar',
    installBody:
      'Cole esta instrução em uma tarefa do Codex. O Codex adiciona a origem Git canônica do marketplace, instala o plugin somente se ele ainda não estiver presente e conclui a configuração do MCP local sem exigir uma listagem em catálogo público.',
    installNote:
      'Cole no Codex uma única vez — os detalhes da instalação ficam por conta dele.',
    steps: [
      {
        phase: 'Usar',
        title: 'Inicie uma nova tarefa no Codex',
        body:
          'Quando o Codex concluir a instalação, abra o plugin Open Design instalado na nova tarefa e selecione “Try now” para começar.',
        alt:
          'Tela real de detalhes do plugin Open Design no Codex com o botão Try now',
      },
      {
        phase: 'Criar',
        title: 'Escreva o briefing de design',
        body:
          'Mencione o Open Design e descreva o artefato, o conteúdo, a direção visual e os requisitos de responsividade.',
        alt:
          'Um prompt real no Codex pedindo ao Open Design para criar o site acolhedor de um café de bairro',
      },
      {
        phase: 'Criar',
        title: 'Acompanhe a transferência em tempo real',
        body:
          'O Codex confirma a direção, cria o projeto e transfere o trabalho para o Open Design enquanto os arquivos aparecem em tempo real.',
        alt:
          'Um espaço de trabalho real do Codex e do Open Design durante a criação do site do café de bairro',
      },
      {
        phase: 'Criar',
        title: 'Revise o resultado',
        body:
          'A mesma tarefa entrega a landing page responsiva do café Goodfield, as imagens geradas e os arquivos editáveis.',
        alt:
          'Landing page finalizada do café de bairro Goodfield, gerada pelo plugin Open Design no Codex',
      },
    ],
  },
  use: {
    title: 'Comece com o prompt exato.',
    lead:
      'Selecione Open Design no menu de plugins do Codex, descreva o artefato e continue refinando tudo na mesma tarefa. O Codex exibe a menção ao plugin como um chip do Open Design.',
    promptLabel: 'Prompt usado na tarefa gravada no Codex',
    copyPrompt: 'Copiar prompt do Codex',
    galleryAria: 'Exemplos criados com o Open Design',
    templates: [
      {
        alt:
          'Landing page do produto Oryzo com uma base de corte tátil e um objeto de cortiça',
        label: 'Lançamento de produto',
      },
      {
        alt:
          'Landing page do evento Open Design Osaka com um mapa tipográfico',
        label: 'Página de evento',
      },
      {
        alt: 'Site editorial escuro do produto Fable 5',
        label: 'Site editorial',
      },
      {
        alt:
          'Interface de linha do tempo dos modelos do Open Design em uma tela clara',
        label: 'História interativa',
      },
    ],
    promptListAria: 'Exemplos de prompts do Open Design Cloud',
    prompts: [
      { title: 'Site' },
      { title: 'Apresentações' },
      { title: 'Protótipo' },
      { title: 'Sistema de design' },
    ],
  },
  faq: {
    title: 'O que saber antes de instalar',
    lead:
      'O Codex mantém o controle da tarefa. O Open Design cuida do fluxo de trabalho visual.',
    items: [
      {
        q: 'O que o plugin adiciona ao Codex?',
        a:
          'Ele oferece ao Codex um fluxo de trabalho do Open Design para sites, apresentações, protótipos e sistemas de design. O plugin se conecta ao Open Design MCP local para criar briefings, projetos e artefatos.',
      },
      {
        q: 'Quais produtos do Codex são compatíveis?',
        a:
          'O pacote atual é compatível com Codex Desktop e Codex CLI. O Codex é o primeiro ambiente com suporte.',
      },
      {
        q: 'O que é necessário antes da instalação?',
        a:
          'Use o Codex CLI 0.144.6 ou mais recente e o Open Design 0.17.0 ou mais recente. Instale o Open Design antes de registrar o MCP local.',
      },
      {
        q: 'Por que preciso iniciar uma nova tarefa no Codex?',
        a:
          'O Codex carrega os recursos do plugin e do MCP quando uma tarefa é iniciada. Uma nova tarefa reconhece o plugin Open Design Cloud recém-instalado.',
      },
      {
        q: 'A janela do Open Design precisa permanecer aberta?',
        a:
          'Não. O MCP local registrado pode iniciar o runtime assinado do Open Design em segundo plano quando necessário.',
      },
    ],
  },
  final: {
    aria: 'Instalar o Open Design Cloud no Codex/ChatGPT',
    title: 'Leve o Open Design para sua próxima tarefa no Codex/ChatGPT.',
    bodyBeforeMention: 'Instale o plugin, conecte o MCP local e invoque',
    bodyAfterMention: '.',
    copy: 'Copiar',
    download: 'Baixar o Open Design',
    source: 'Ver código-fonte',
  },
  clipboard: {
    copying: 'Copiando…',
    copied: 'Copiado',
    failed: 'Selecione e copie',
  },
  schema: {
    pageName: 'Plugin Open Design Cloud para Codex/ChatGPT',
    applicationName: 'Plugin Open Design Cloud para Codex/ChatGPT',
  },
};

export default copy;
