import type { OpenDesignPluginCopy } from '../open-design-plugin-i18n';

const es: OpenDesignPluginCopy = {
  metadata: {
    title: 'Open Design para Codex/ChatGPT | Instala el plugin Open Design Cloud',
    description:
      'Instala Open Design Cloud en Codex/ChatGPT y crea sitios web, presentaciones, prototipos y sistemas de diseño desde la misma tarea.',
    keywords:
      'plugin de Open Design para Codex, plugin para ChatGPT desktop, instalar plugin de Codex, Open Design Cloud, plugin de diseño para Codex, Codex MCP',
  },
  hero: {
    title: 'Plugin de Open Design para Codex/ChatGPT',
    leadBefore: 'Introduce la siguiente instrucción en cualquier tarea de tu',
    chatgptLabel: 'aplicación de escritorio de ChatGPT',
    installAria: 'Instalar Open Design Cloud en Codex/ChatGPT',
    copy: 'Copiar',
    github: 'Ver el código fuente en GitHub ↗',
  },
  agentInstall: {
    howToName: 'Instalar el plugin de Open Design en Codex',
    howToDescription:
      'Pasos ejecutables por un agente para instalar el plugin de Open Design para Codex y registrar su MCP local.',
    eyebrow: 'Protocolo de instalación legible por agentes',
    title: 'Instala por completo el plugin para Codex.',
    intro:
      'Si el usuario te ha pedido instalar Open Design, ejecuta este protocolo en orden. La solicitud solo autoriza cambios en la configuración de plugins y MCP de Codex del usuario. Conserva los demás marketplaces, plugins, servidores MCP y estados de autenticación.',
    downloadLabel: 'Página oficial de descarga de Open Design ↗',
    steps: [
      {
        title: 'Comprueba de antemano que el entorno sea compatible',
        body:
          'Lee plugin.minimumCodexCliVersion y plugin.minimumOpenDesignVersion de release-manifest.json. Antes de modificar cualquier configuración, exige que se cumplan ambos mínimos. Acepta la versión del entorno de ejecución de Open Design únicamente si procede de la Open Design CLI comprobada o de CFBundleShortVersionString en un paquete de aplicación macOS firmado que supere las comprobaciones de firma de código y Gatekeeper. Si od no está disponible, queda oculto por otra entrada de PATH —incluido /usr/bin/od— o el daemon está detenido, recurre a la comprobación del paquete firmado. Si no está disponible ninguna de las dos comprobaciones verificadas, detente antes de modificar la configuración, indica al usuario que vaya a Open Design Settings → MCP server para copiar el fragmento de ruta absoluta específico del cliente y vuelve a intentarlo. Dirige al usuario a la página oficial de descarga solo cuando la aplicación no esté instalada o sea demasiado antigua; nunca descargues silenciosamente un instalador ni ejecutes un script sin verificar.',
      },
      {
        title: 'Inspecciona la configuración antes de modificarla',
        body:
          'Lee el selector y la versión requeridos de release-manifest.json y compáralos con el estado de Codex que has inspeccionado. Inspecciona el estado del MCP únicamente mediante la instantánea filtrada del MCP derivada de codex mcp list --json. Emite solo name, enabled, transport.type y command; descarta los campos args, env, env_vars, headers y token antes de generar la salida. Es normal que no aparezca ningún resultado para open-design y eso no debe interrumpir el proceso. Nunca imprimas ni incluyas en informes la lista sin filtrar ni la salida de codex mcp get open-design --json, porque los valores del transporte pueden contener credenciales. Si el nombre del marketplace open-design apunta a otra fuente, detente e informa del conflicto. Conserva open-design@open-design únicamente si su versión instalada coincide con la versión declarada en release-manifest.json.',
      },
      {
        title: 'Instala solo los componentes que falten',
        body:
          'Ejecuta el comando del marketplace solo si falta el marketplace canónico y, si no se puede agregar el marketplace, detente sin ejecutar el comando del plugin. Ejecuta el comando del plugin cuando falte open-design@open-design. Si está instalado con una versión distinta, pide confirmación al usuario antes de actualizarlo o reinstalarlo; solo después de recibir una confirmación explícita, vuelve a ejecutar este paso con OPEN_DESIGN_PLUGIN_UPDATE_CONFIRMED=1. Omite la instalación solo cuando esté presente la versión exacta requerida. Un resultado alreadyAdded: true indica que la operación se realizó correctamente. No edites manualmente la configuración de Codex ni copies archivos del plugin en el directorio principal de Codex.',
      },
      {
        title: 'Asegura el MCP local de Open Design',
        body:
          'Conserva un MCP open-design existente solo si está habilitado, utiliza stdio y su command absoluto coincide con un iniciador verificado de Open Design. De lo contrario, ejecuta el instalador de MCP incluido con la aplicación Open Design instalada. En sistemas POSIX, ejecuta la ruta de od resuelta solo después de que su comprobación devuelva open-design-cli:mcp-install:v1. Si esa ruta no existe, queda oculta por /usr/bin/od o no puede completar la operación, usa /usr/bin/open con el paquete de aplicación macOS firmado y verificado y --headless --mcp-install codex; después, consulta repetidamente solo la instantánea filtrada del MCP aplicando las mismas comprobaciones estructurales. Si no hay disponible ningún iniciador verificado, detente, indica al usuario que vaya a Open Design Settings → MCP server para copiar el fragmento de ruta absoluta específico del cliente y vuelve a intentar este paso. Nunca adivines un puerto localhost ni ejecutes codex mcp login; el inicio de sesión en Vela se realiza en Open Design.',
      },
      {
        title: 'Verifica, informa e inicia una nueva tarea',
        body:
          'Verifica el id del plugin open-design@open-design, su fuente canónica del marketplace y que la versión instalada coincida exactamente con plugin.version en release-manifest.json. Usa la instantánea filtrada del MCP para confirmar que haya un stdio MCP habilitado llamado open-design cuyo command absoluto coincida con el mismo iniciador verificado de Open Design utilizado durante la instalación. Inspecciona únicamente name, enabled, transport.type y command; los valores sin procesar de args, env, env_vars, headers, token, bearer token, API key y credenciales de Vela nunca deben aparecer en la salida ni en los informes. Informa de lo que se ha instalado y de cualquier requisito pendiente de Open Design o del inicio de sesión en Vela. Inicia una nueva tarea de Codex para que cargue la instantánea del plugin instalado y, después, invoca @open-design.',
      },
    ],
  },
  demo: {
    title: 'Instálalo una vez. Crea desde Codex/ChatGPT.',
    lead:
      'Conoce primero el espacio de trabajo completo de Codex y Open Design y, después, sigue la secuencia real desde la instalación hasta el resultado.',
    overviewAlt:
      'Una tarea real de Codex que usa el plugin de Open Design junto al sitio web terminado de la cafetería Goodfield',
    overviewLabel: 'Tarea real de Codex',
    overviewCaption:
      'El prompt, la transferencia a Open Design, los archivos generados y el sitio web terminado permanecen visibles en un único espacio de trabajo.',
    stepListAria: 'Las cinco etapas de una ejecución real del plugin en Codex',
    installPhase: 'Instalar',
    installTitle: 'Pide a Codex que lo instale',
    installBody:
      'Pega esta instrucción en una tarea de Codex. Codex añade la fuente canónica del marketplace de Git, instala el plugin solo si falta y completa la configuración del MCP local sin exigir que esté publicado en un catálogo público.',
    installNote:
      'Pégala una vez en Codex: los detalles de la instalación se gestionan por ti.',
    steps: [
      {
        phase: 'Usar',
        title: 'Inicia una nueva tarea de Codex',
        body:
          'Cuando Codex termine la instalación, abre el plugin de Open Design instalado en la nueva tarea y elige «Try now» para empezar.',
        alt:
          'Pantalla real del plugin de Open Design en Codex con el botón Try now',
      },
      {
        phase: 'Crear',
        title: 'Escribe el brief de diseño',
        body:
          'Menciona Open Design y describe el entregable, el contenido, la dirección visual y los requisitos de adaptación a distintas pantallas.',
        alt:
          'Prompt real de Codex que pide a Open Design crear el sitio web acogedor de una cafetería de barrio',
      },
      {
        phase: 'Crear',
        title: 'Sigue la transferencia en tiempo real',
        body:
          'Codex confirma la dirección, crea el proyecto y transfiere el trabajo a Open Design mientras los archivos aparecen en tiempo real.',
        alt:
          'Espacio de trabajo real de Codex y Open Design mientras se genera el sitio web de la cafetería de barrio',
      },
      {
        phase: 'Crear',
        title: 'Revisa el resultado',
        body:
          'La misma tarea devuelve la landing page adaptable de la cafetería Goodfield, las imágenes generadas y los archivos editables.',
        alt:
          'Landing page terminada de la cafetería de barrio Goodfield, generada mediante el plugin de Open Design en Codex',
      },
    ],
  },
  use: {
    title: 'Empieza con el prompt exacto.',
    lead:
      'Selecciona Open Design en el menú de plugins de Codex, describe lo que quieres crear y sigue refinándolo desde la misma tarea. Codex muestra la mención del plugin como una etiqueta de Open Design.',
    promptLabel: 'Prompt utilizado en la tarea de Codex registrada',
    copyPrompt: 'Copiar el prompt de Codex',
    galleryAria: 'Ejemplos creados con Open Design',
    templates: [
      {
        alt:
          'Landing page de producto de Oryzo con una base de corte táctil y un objeto de corcho',
        label: 'Lanzamiento de producto',
      },
      {
        alt:
          'Landing page del evento Open Design Osaka con un mapa tipográfico',
        label: 'Página de evento',
      },
      {
        alt: 'Sitio web de producto editorial y oscuro de Fable 5',
        label: 'Sitio editorial',
      },
      {
        alt:
          'Interfaz de cronología de modelos de Open Design sobre un lienzo luminoso',
        label: 'Historia interactiva',
      },
    ],
    promptListAria: 'Ejemplos de prompts para Open Design Cloud',
    prompts: [
      { title: 'Sitio web' },
      { title: 'Presentaciones' },
      { title: 'Prototipo' },
      { title: 'Sistema de diseño' },
    ],
  },
  faq: {
    title: 'Preguntas antes de instalar',
    lead:
      'Codex mantiene el control de la tarea. Open Design se encarga del flujo de trabajo visual.',
    items: [
      {
        q: '¿Qué añade el plugin a Codex?',
        a:
          'Proporciona a Codex un flujo de trabajo de Open Design para crear sitios web, presentaciones, prototipos y sistemas de diseño. El plugin se conecta al Open Design MCP local para gestionar briefs, proyectos y la generación de entregables.',
      },
      {
        q: '¿Qué productos de Codex son compatibles?',
        a:
          'El paquete actual es compatible con Codex Desktop y Codex CLI. Codex es el primer entorno compatible.',
      },
      {
        q: '¿Qué necesito antes de instalarlo?',
        a:
          'Usa Codex CLI 0.144.6 o una versión posterior y Open Design 0.17.0 o una versión posterior. Instala Open Design antes de registrar su MCP local.',
      },
      {
        q: '¿Por qué necesito una nueva tarea de Codex?',
        a:
          'Codex carga las capacidades del plugin y del MCP al iniciar una tarea. Una nueva tarea detectará el plugin Open Design Cloud recién instalado.',
      },
      {
        q: '¿La ventana de Open Design debe permanecer abierta?',
        a:
          'No. El MCP local registrado puede iniciar el entorno firmado de Open Design en segundo plano cuando sea necesario.',
      },
    ],
  },
  final: {
    aria: 'Instalar Open Design Cloud en Codex/ChatGPT',
    title: 'Lleva Open Design a tu próxima tarea de Codex/ChatGPT.',
    bodyBeforeMention: 'Instala el plugin, conecta el MCP local e invoca',
    bodyAfterMention: '.',
    copy: 'Copiar',
    download: 'Descargar Open Design',
    source: 'Ver el código fuente',
  },
  clipboard: {
    copying: 'Copiando…',
    copied: 'Copiado',
    failed: 'Selecciona y copia',
  },
  schema: {
    pageName: 'Plugin de Open Design Cloud para Codex/ChatGPT',
    applicationName: 'Plugin de Open Design Cloud para Codex/ChatGPT',
  },
};

export default es;
