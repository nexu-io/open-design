/*
 * Textos en español para la colección curada "DeepSeek Harness design".
 * Traducido a partir de la versión base en inglés.
 */
import type { DeepseekCopyOverride } from './index';

export const es: DeepseekCopyOverride = {
  collectionEyebrow: 'Colección curada',
  collectionHeading: 'Plugins de DeepSeek Harness para diseño',
  collectionLede:
    'Una colección curada de plugins dsh para diseñar: puentes de visión que leen capturas, lienzos y UI generativa donde el agente puede dibujar, herramientas de revisión de diseño y bancos de trabajo que lo previsualizan todo. DeepSeek Harness lee el mismo formato SKILL.md que Claude Code y Codex, así que tu biblioteca de skills de diseño te acompaña.',
  collectionStats: [
    { value: '13', label: 'plugins dsh seleccionados' },
    { value: '13', label: 'repos de origen' },
    { value: 'SKILL.md', label: 'compartido con Claude Code y Codex' },
  ],
  collectionIntro:
    'Cada plugin dsh de esta lista es real, nativo de DeepSeek Harness, se puede descubrir a través del topic dsh-plugin en GitHub, y enlaza a su fuente. Cumplen cuatro trabajos: dar visión al harness de solo texto, darle superficies de diseño sobre las que dibujar, conectar la revisión de diseño al bucle, y convertir su web UI en un espacio de trabajo de diseño.',
  collectionCategoryBlurbs: [
    'Convierte capturas de pantalla, mockups y gráficos en evidencia estructurada sobre la que un modelo de solo texto puede actuar.',
    'Dale al agente superficies sobre las que dibujar: lienzos vectoriales editables, tarjetas de UI en vivo, slides.',
    'Cierra el bucle: anota páginas reales, compila assets de movimiento, traslada tu biblioteca de skills.',
    'Convierte el propio harness en un espacio de trabajo de diseño: paneles de vista previa, bancos de trabajo y tableros junto al chat.',
  ],
  collectionCloserHeading: 'Sáltate la configuración: diseña con DeepSeek Harness dentro de Open Design',
  filterAll: 'Todos',
  collectionCloserBody:
    'Open Design es el espacio de trabajo de diseño de código abierto y nativo para agentes que envuelve a DeepSeek Harness. Mantiene coherentes tus sistemas, skills y plantillas para que el agente entregue trabajo que es tuyo.',

  categoryVision: 'Visión y entrada',
  categoryCanvas: 'Lienzo y UI generativa',
  categoryWorkflow: 'Flujo de diseño',
  categoryWorkspace: 'Espacio de trabajo y vista previa',

  ctaDownload: 'Descargar Open Design',
  ctaStarList: 'Dar una estrella a DeepSeek Harness',
  ctaGuide: 'Cómo diseñar con DeepSeek Harness',
  ctaBrowseAll: 'Ver todos los plugins',
  ctaViewSource: 'Ver el código fuente',
  ctaOurRepo: 'deepseek-harness en GitHub',
  cardKind: 'Plugin',
  cardWhatItDoes: 'Qué hace',
  cardCta: 'Ver el plugin',

  detailWhatIsIt: 'Qué es',
  detailWhyForDesign: 'Por qué importa para el diseño',
  detailHowWithAgent: 'Cómo ejecutarlo con DeepSeek Harness',
  detailExampleTag: 'Cuándo recurrir a él',
  detailSource: 'Fuente',
  detailCategory: 'Categoría',
  detailMaintainer: 'Autor',
  detailTags: 'Etiquetas',
  detailLicense: 'Licencia',
  detailCovers: 'Qué cubre',
  detailUpstream: 'Del README original',
  detailAgentNote: 'Funciona con DeepSeek Harness',
  detailTraction: 'Tracción',
  detailRepo: 'Repositorio de origen',
  detailStars: 'Estrellas',

  installHeading: 'Cómo instalarlo',
  installRunInAgent: 'Ejecuta esto en una terminal.',
  installRestart: 'Reinicia dsh web para que cargue el plugin.',
  installClone: 'Clona el repositorio.',
  installPoint: 'Señálale a DeepSeek Harness el archivo de la skill.',
  installThenUse: 'Luego describe el diseño que quieres. El harness recoge las herramientas del plugin.',

  installNote:
    'Todos los plugins de esta colección se pueden instalar gratis y enlazan a su fuente original real.',
  installNoteCta: 'Ver la colección completa',
  detailMoreOnList: 'Más en el repo de DeepSeek Harness',
  detailRelated: 'Más plugins de diseño para DeepSeek Harness',
  finalEyebrow: 'Siguiente paso',
  detailCloserHeading: 'Diseña con Open Design, sin montar nada',
  detailCloserBody:
    'Instala este plugin tú mismo, o ejecuta toda una capa de diseño curada alrededor de DeepSeek Harness con Open Design. Trae tu propia key: lo que produzcas es tuyo.',

  skills: {
    modlens: {
      tagline:
        'Da visión enchufable a los modelos DeepSeek de solo texto: pega una captura de pantalla y obtén evidencia estructurada.',
      whatIsIt:
        'Un puente de visión para agentes de código de solo texto. Pega una imagen en el chat y modlens la convierte en evidencia JSON estructurada — transcripción completa, regiones de maquetación en orden de lectura, entidades y relaciones — en lugar de la conjetura de un modelo.',
      whyForDesign: [
        'Las capturas de UI se convierten en recorridos elemento a elemento sobre los que el agente puede actuar.',
        'Los gráficos densos y las visualizaciones de datos se leen por completo: ejes, escalas, paletas, regiones destacadas.',
        'Pega varias referencias a la vez e identifica la familia visual compartida antes de describir cada una.',
      ],
      howWithAgent: [
        'Instala el plugin; el selector de modelos gana variantes de DeepSeek-V4 con visión de modlens.',
        'Pega una captura de pantalla, un mockup o un gráfico directamente en la conversación.',
        'Haz preguntas de diseño sobre la evidencia estructurada en vez de volver a describir la imagen.',
      ],
    },
    'dsh-vision-toolkit': {
      tagline:
        'Diez herramientas de visión para restauración de UI, grounding y verificación por diff de píxeles.',
      whatIsIt:
        'Un paquete nativo de DeepSeek Harness con diez herramientas de visión: preguntas sobre imágenes, grounding y detección con coordenadas de píxel, OCR de capturas largas, recorte, extracción de color, capturas HTML y diff de píxeles. Las herramientas se montan progresivamente mediante una skill de vision-tools.',
      whyForDesign: [
        'La restauración de UI cierra el bucle con números: un flujo incluido en el repo itera una reconstrucción desde un 6,04% de diferencia de píxeles hasta el 0%.',
        'El grounding y la detección devuelven cajas de píxeles de la imagen original, así el agente actúa sobre coordenadas en vez de interpretar prosa.',
        'Las infografías y los bocetos a mano se convierten en interfaces HTML/CSS editables.',
      ],
      howWithAgent: [
        'Añade el plugin a tu perfil web o headless y configura una credencial de visión para las herramientas remotas.',
        'Activa el toolkit; la skill de vision-tools monta los esquemas de las diez herramientas.',
        'Reconstruye una referencia, y luego verifica con vision_html_screenshot y vision_pixel_diff.',
      ],
    },
    'dsh-ui-spec': {
      tagline:
        'Convierte capturas de UI en especificaciones a nivel de implementación: tokens, escala de espaciado, rejilla de maquetación.',
      whatIsIt:
        'Una única herramienta analyze_ui_image que convierte una captura o un mockup en una spec de frontend estructurada. Una capa de geometría determinista mide dimensiones exactas, paleta, tokens de diseño sugeridos, rejilla de maquetación y escala de espaciado; un modelo de visión opcional añade semántica encima.',
      whyForDesign: [
        'Las coordenadas de píxel, las escalas de espaciado y las paletas de tokens se calculan de forma determinista, no las adivina un modelo de visión.',
        'Los campos de la spec se corresponden directamente con la implementación: los tokens sugeridos con los design tokens, la escala de espaciado con el CSS.',
        'Los roles semánticos aportan la intención mientras la geometría aporta la colocación, fusionados en una única spec JSON + Markdown.',
      ],
      howWithAgent: [
        'Añade el plugin; la capa de geometría funciona offline sin configuración alguna.',
        'Opcionalmente apunta la capa semántica a cualquier endpoint de visión compatible con OpenAI.',
        'Entrégale al agente una captura y construye a partir de la spec devuelta en vez de la imagen.',
      ],
    },
    'dsh-media-skills': {
      tagline:
        'Ojos gratis y un pincel gratis: lectura de imágenes pegadas más generación de imágenes sin marca de agua.',
      whatIsIt:
        'Dos skills en formato SKILL.md y una ruta gratuita de modelo de visión para el harness: vision-review lee capturas y caza bugs visuales, media-tools genera ilustraciones, avatares, fondos y banners — ambas funcionando sobre modelos de nivel gratuito.',
      whyForDesign: [
        'Caza bugs visuales de UI que un agente de texto no puede ver: solapamientos, desbordamientos, desalineaciones.',
        'Genera assets de diseño sin marca de agua en un nivel gratuito, así explorar no cuesta nada.',
        'Añade un botón «Add image» a las sesiones de solo texto; las imágenes pegadas se describen al modelo actual.',
      ],
      howWithAgent: [
        'Añade el plugin y guarda las API keys gratuitas en el almacén de credenciales del harness.',
        'Reinicia dsh web; el selector de modelos gana una ruta de visión gratuita.',
        'Pide la revisión de una captura, o un asset nuevo, en lenguaje natural.',
      ],
    },
    'dsh-openpencil': {
      tagline:
        'El agente diseña sobre un lienzo vectorial real y editable en vez de devolver imágenes estáticas.',
      whatIsIt:
        'Conecta el harness con OpenPencil, una herramienta de diseño vectorial de código abierto y nativa de IA. Cinco herramientas permiten al agente crear, editar, renderizar e inspeccionar documentos .op de diseño como código mediante lotes transaccionales, con vistas previas de varios frames y un editor gestionado para que un humano tome el control.',
      whyForDesign: [
        'Un único bucle del requisito al lienzo: el agente edita el documento real y las vistas previas renderizan frames fieles al diseño.',
        'Los lotes transaccionales solo se publican si tienen éxito y nunca sobrescriben ediciones externas — los conflictos afloran en vez de perderse.',
        'Un editor gestionado con selección, capas, propiedades y deshacer permite a un humano tomar el control del resultado del agente en cualquier momento.',
      ],
      howWithAgent: [
        'Instala OpenPencil, y luego añade el plugin a tu perfil web.',
        'Describe el diseño; el agente maneja openpencil_create y openpencil_edit por lotes.',
        'Abre la vista previa renderizada o el editor gestionado y sigue iterando ahí mismo.',
      ],
    },
    'dsh-visualize': {
      tagline:
        'El modelo dibuja tarjetas HTML interactivas directamente en el flujo de la conversación.',
      whatIsIt:
        'Una herramienta visualize más una skill complementaria: el modelo escribe un fragmento HTML y lo monta como una tarjeta interactiva aislada dentro del chat — simuladores, gráficos, paneles de comparación y mockups de UI, con vista previa en streaming y estilos a juego con el tema.',
      whyForDesign: [
        'Los mockups de UI viven en la conversación y se pueden clicar, no solo describir.',
        'Las tarjetas siguen el tema claro/oscuro y la paleta del anfitrión, así las vistas previas se ven nativas.',
        'Cada tarjeta corre en un iframe aislado con una CSP estricta — un fragmento roto no puede romper la sesión.',
      ],
      howWithAgent: [
        'Añade el plugin y reinicia dsh web.',
        'Pide un mockup o una comparación; el modelo llama a visualize con su propio HTML.',
        'Reproduce la sesión más tarde — las tarjetas se restauran desde el resultado de herramienta persistido.',
      ],
    },
    'dsh-genui': {
      tagline:
        'Más de treinta componentes interactivos renderizados en línea en las respuestas, con un bucle de acciones de vuelta al modelo.',
      whatIsIt:
        'El modelo describe una interfaz como JSON en un fence dsh-ui; un renderizador en el navegador la convierte en componentes vivos dentro de la respuesta — tarjetas, tablas, gráficos, formularios, pestañas, líneas de tiempo, diffs, mermaid, escenas 3D — que aparecen mientras la respuesta fluye.',
      whyForDesign: [
        'Las respuestas se convierten en interfaces: los paneles de datos, gráficos y formularios se renderizan donde ocurre la explicación.',
        'Los componentes interactivos envían acciones de vuelta al modelo, que a su vez actualiza la UI.',
        'Una lista blanca de componentes y un guardián de la spec hacen que un gráfico roto nunca llegue a la pantalla.',
      ],
      howWithAgent: [
        'Añade el plugin desde GitHub y reinicia dsh web.',
        'Pide un dashboard, un quiz o un formulario; el modelo escribe él mismo el fence dsh-ui.',
        'Interactúa con el resultado — las acciones locales responden al instante, las acciones de modelo vuelven al bucle.',
      ],
    },
    'dsh-openmaic': {
      tagline:
        'Slides, widgets interactivos y lecciones completas jugables, renderizados a partir de JSON escrito por el agente.',
      whatIsIt:
        'Cuatro herramientas y una skill de enseñanza socrática del grupo THU-MAIC: el agente escribe JSON de slides al estilo PPTist renderizado por el renderer oficial de OpenMAIC, emite widgets interactivos como tarjetas aisladas, y puede enviar una petición de una línea que vuelve convertida en un aula jugable.',
      whyForDesign: [
        'Decks de slides con texto, formas, imágenes, tablas, gráficos, fórmulas y código — escritos como JSON en la conversación.',
        'Las simulaciones interactivas y los juegos se renderizan en el sitio como tarjetas aisladas.',
        'Una lección completa con contenido visual está a una petición de distancia, devuelta como un enlace jugable.',
      ],
      howWithAgent: [
        'Añade el plugin desde GitHub; viene compilado, así que no hay paso de build.',
        'Reinicia dsh web y pide un deck o un widget.',
        'Para lecciones completas, openmaic_generate consulta el servicio de OpenMAIC y devuelve el enlace del aula.',
      ],
    },
    'dsh-web-review': {
      tagline:
        'Señala elementos en una página en vivo, anota visualmente, y el agente edita el código fuente.',
      whatIsIt:
        'Un navegador integrado para la web UI del harness: resalta al pasar el cursor y selecciona elementos como en una herramienta de diseño, adjunta notas y prueba ajustes visuales en vivo — texto, color, tipografía, tamaño, espaciado, bordes, efectos. Las anotaciones llevan selectores y pistas del código fuente para que el agente pueda encontrar y corregir el código.',
      whyForDesign: [
        'Señalar y anotar visualmente sustituye a describir los problemas de UI con palabras.',
        'Los ajustes en vivo previsualizan un cambio en la página antes de tocar cualquier código.',
        'Incluye ocho skills de diseño integradas, de better-typography a interface-review, usables desde el editor de anotaciones.',
      ],
      howWithAgent: [
        'Añade el plugin y arranca dsh web.',
        'Abre tu app en marcha en la pestaña Web Preview y anota lo que debe cambiar.',
        'Envía — el agente recibe los selectores, las notas y los valores probados, y edita el código fuente del workspace.',
      ],
    },
    'dsh-figma-to-lottie': {
      tagline:
        'Compila trazados SVG y keyframes en animaciones Lottie autocontenidas desde la conversación.',
      whatIsIt:
        'Dos herramientas que convierten datos de diseño en assets de movimiento: lottie_compile_shape convierte un trazado SVG en valores de forma de Lottie, y lottie_compile ensambla un JSON de Lottie completo a partir de una spec de capas compacta — rectángulos, degradados, trazados, imágenes embebidas y texto, con animación por keyframes por capa.',
      whyForDesign: [
        'Describe una animación de carga en lenguaje natural y obtén un .lottie.json que corre en iOS, Android y la web.',
        'Las tangentes bezier de entrada y salida y el easing de los keyframes se compilan, no se escriben a mano.',
        'Cero paso de build y ESM puro: lo que se publica es exactamente lo que corre.',
      ],
      howWithAgent: [
        'Añade el plugin desde npm, o fija un commit desde GitHub.',
        'Describe el movimiento: capas, timing, easing, escalonado.',
        'Suelta el .lottie.json compilado en LottieWeb, lottie-ios o lottie-android.',
      ],
    },
    'dsh-plugin-claude-bridge': {
      tagline:
        'Tus skills, memoria e instrucciones globales de Claude Code, disponibles en el harness sin migración alguna.',
      whatIsIt:
        'Lee directamente las ubicaciones de archivo estándar de Claude Code — sin scripts de migración, sin copias, sin symlinks. Las skills de ~/.claude/skills se suman al catálogo de skills del harness, la memoria de proyecto se inyecta como contexto en cada petición, y las instrucciones globales de CLAUDE.md se trasladan.',
      whyForDesign: [
        'Las skills de diseño que ya usas en Claude Code funcionan aquí sin mover un solo archivo.',
        'La memoria de proyecto se relee en cada petición, así las notas nuevas surten efecto de inmediato.',
        'Las instrucciones globales y las preferencias de colaboración se conservan entre agentes.',
      ],
      howWithAgent: [
        'Añade el plugin a tu perfil; funciona sin configuración alguna.',
        'Opcionalmente apúntalo a directorios de skills adicionales como ~/.agents/skills.',
        'Invoca tus skills existentes por su nombre, igual que harías en Claude Code.',
      ],
    },
    'dsh-web-ui': {
      tagline:
        'El kit de UI más grande del ecosistema: tablero de tareas, panel de vista previa, grafo de Git y un centro de skins.',
      whatIsIt:
        'Una colección de plugins y skins para la web UI del harness: un tablero de tareas de cinco columnas cuyas tarjetas ejecutan sesiones de agente reales, un panel lateral derecho con árbol de archivos y vistas previas en varias pestañas, un grafo de Git, control remoto desde el móvil y un centro de skins para probar antes de aplicar.',
      whyForDesign: [
        'El panel lateral derecho previsualiza Markdown, HTML, diffs, CSV, PDF, archivos de Office e imágenes junto a la conversación.',
        'El tablero de tareas convierte los pendientes de diseño en tarjetas que una sesión real del agente dsh ejecuta y sobre las que informa.',
        'El ancho del panel es arrastrable y se conserva por proyecto, así el espacio de trabajo se queda tal como lo dejaste.',
      ],
      howWithAgent: [
        'Añade el paquete agregado a tu perfil web para instalarlo todo de una vez.',
        'Abre el panel lateral derecho y fija los archivos y vistas previas con los que estás trabajando.',
        'Suelta tareas de diseño en el tablero y deja que las tarjetas se ejecuten en sesiones de agente reales.',
      ],
    },
    'dsh-better-sidebar': {
      tagline:
        'Un banco de trabajo completo en la barra lateral: explorador de archivos, vistas previas ricas, terminal, Git y un navegador.',
      whatIsIt:
        'Un banco de trabajo de doble panel para la web UI del harness: un explorador de archivos con carga diferida y edición con CodeMirror, vistas previas en línea de imágenes, Markdown, HTML, PDF y archivos de Office, una terminal real, un panel de Git con diffs al estilo VS Code, un navegador embebido y aislado, y pestañas arrastrables en paneles divididos.',
      whyForDesign: [
        'Previsualiza el HTML, las imágenes y los documentos que produce el agente sin salir de la conversación.',
        'Un navegador embebido y aislado abre tu prototipo en marcha en una pestaña junto al chat.',
        'Los plugins de terceros pueden registrar sus propias pestañas y previsualizadores de archivos a través de su API de servicios.',
      ],
      howWithAgent: [
        'Instálalo con el script de una línea, o añade el paquete de npm a tu perfil web.',
        'Abre el banco de trabajo y organiza las pestañas entre la barra lateral derecha y el panel inferior.',
        'Revisa lo que el agente construyó ahí mismo: vistas previas, diffs, terminal y pestañas del navegador.',
      ],
    },
  },
};
