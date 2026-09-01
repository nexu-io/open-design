// Spanish (es) overrides for the Codex Slides landing copy.
import type { DeepPartial, CodexSlidesCopy } from '../codex-slides-i18n';

const es: DeepPartial<CodexSlidesCopy> = {
  title: "Codex Slides — el estudio de diapositivas con IA dentro de Codex",
  description:
    "Codex Slides es un estudio de diapositivas con IA de código abierto que vive dentro de Codex. Describe una presentación —o apúntala a un repositorio, un PDF o una hoja de cálculo— y tu Codex local investiga, esquematiza, aplica estilo, renderiza y exporta un PPTX real y un PDF listo para imprenta. Cada diapositiva es un lienzo visual completo. 45 plantillas de presentación, 73 estilos de la comunidad, 24 escenarios guiados; el Fast mode renderiza más de 10 diapositivas en unos 4–5 minutos. Browser-first, licencia MIT, funciona con tu codex login actual y sin claves de API adicionales.",
  label: "Proyecto hermano",
  heading: "El estudio de diapositivas con IA dentro de tu agente de código",
  lead:
    "La mayoría de los generadores de diapositivas con IA esconden el trabajo detrás de una sola petición y te devuelven un archivo. Codex Slides mantiene toda la cadena viva dentro de Codex —investigación, esquema, dirección visual, render, edición, presentación, exportación— y cada presentación queda como un proyecto duradero en tu propio disco. Image-native: cada diapositiva es un lienzo visual completo, no una plantilla con el texto cambiado.",
  downloadCta: "Descargar OpenDesign",
  heroAlt:
    "Codex Slides — Codex a la izquierda pilotando el estudio de diapositivas en el navegador, y a la derecha una diapositiva renderizada de informe de mercado",

  glanceAria: "De un vistazo",
  glance: {
    stars: "Estrellas en GitHub",
    templates: "Plantillas de presentación",
    styles: "Estilos de la comunidad",
    scenarios: "Escenarios guiados",
    license: "Licencia",
  },

  whyTitle: "Por qué existe",
  whyLead:
    "Una presentación no es un problema de generación de un solo disparo. Es una serie de decisiones —qué decir, en qué orden, en qué lenguaje visual— y cada una sale más barata si se corrige antes del render que después.",
  ideas: [
    {
      headline: "Lo ves ocurrir en lugar de esperar a un archivo.",
      body: "Codex abre el estudio en su Browser y lo mantiene a la vista. Confirmas el brief, revisas el esquema y apruebas la dirección visual antes de que se renderice una sola página, así que los errores caros se detectan mientras todavía son baratos.",
    },
    {
      headline: "Cada presentación es un proyecto duradero, no una descarga.",
      body: "La conversación, las fuentes, el esquema, las reglas de marca, los checkpoints y las páginas renderizadas persisten en disco. Vuelve mañana y sigue editando el mismo proyecto: cada comando de IA y cada edición manual deja un checkpoint inmutable que puedes inspeccionar, restaurar o exportar.",
    },
    {
      headline: "Image-native: la diapositiva es el lienzo.",
      body: "Cada página se compone como un único lienzo visual completo, no como una caja de texto soltada sobre un tema, y por eso el resultado aguanta al lado de presentaciones diseñadas a mano. Anota una diapositiva directamente y regenera solo esa página a partir de tus marcas.",
    },
  ],

  flowTitle: "Cómo funciona",
  flowLead:
    "Un prompt entra y sale una presentación lista para exponer, con un punto de control en cada paso donde tu criterio vale más que otra llamada al modelo.",
  flow: [
    { step: '01', headline: "Aclara el brief", body: "Un formulario de preguntas a medida confirma audiencia, número de páginas, relación de aspecto, idioma, resolución e intención visual antes de escribir una línea." },
    { step: '02', headline: "Investiga los hechos", body: "Una investigación web opcional de varias rondas produce un brief en Markdown respaldado por fuentes, inspeccionable y editable en Design Files." },
    { step: '03', headline: "Da forma al esquema", body: "Edita cada título y cada idea clave, añade o quita diapositivas, reordena el relato o pide al agente que lo reestructure, todo antes de que existan los visuales." },
    { step: '04', headline: "Fija la dirección visual", body: "Codex Slides ordena su biblioteca de estilos según tu tema y tu esquema. Elige uno, busca en el catálogo completo o quédate con el predeterminado." },
    { step: '05', headline: "Renderiza en paralelo", body: "El Fast mode lanza todas las páginas a la vez en lugar de una por una, así que una presentación de más de 10 diapositivas aterriza en unos cuatro o cinco minutos con la dirección visual intacta." },
    { step: '06', headline: "Edita sobre la marcha", body: "Pide una reescritura, marca una zona con flechas y comentarios, sustituye una imagen, reordena páginas, define transiciones y escribe notas del ponente." },
    { step: '07', headline: "Presenta y exporta", body: "Usa el Presenter Mode con ventana de audiencia sincronizada y temporizador, y luego descarga un PPTX real y un PDF listo para imprenta con las notas conservadas." },
  ],

  showcaseTitle: "Qué aspecto tienen las presentaciones",
  showcaseLead:
    "Cada tarjeta es un sistema visual que viene con Codex Slides: una dirección terminada desde la que arrancar, para luego meter tu propio tema, tu audiencia o tus archivos.",
  showcase: [
    { alt: "Presentación de informe de negocio y mercado con gráficos y KPIs destacados", tag: "Informe de mercado · gráficos y KPIs" },
    { alt: "Presentación de dashboard de datos con mapamundi, gráfico de anillo y mosaicos de métricas", tag: "Relato de datos · dashboard" },
    { alt: "Diapositiva de keynote de producto cinematográfica con un momento de título de alto contraste", tag: "Keynote · cinematográfico" },
    { alt: "Presentación estilo revista editorial con titulares en serif y retícula de imprenta", tag: "Editorial · retícula de imprenta" },
    { alt: "Diapositiva de keynote de producto clara y despejada, con nodos de diagrama 3D suaves y un único acento índigo", tag: "Keynote · luz de día limpia" },
    { alt: "Diapositiva técnica de vista en corte con etiquetas que reconstruye un sistema como sección transversal", tag: "Técnico · corte etiquetado" },
  ],

  insideTitle: "El producto de verdad",
  insideLead:
    "Estas son las pantallas reales que Codex maneja en su Browser, las mismas que usarías a mano, así que puedes entrar y tomar el control en cualquier momento.",
  inside: [
    { alt: "Inicio de Codex Slides con el compositor de prompts, los accesos a escenarios y los estilos de la comunidad", tag: "Inicio · describe tu presentación" },
    { alt: "Biblioteca de escenarios con flujos de presentación preconfigurados", tag: "Escenarios · elige un flujo" },
    { alt: "Esquema de presentación editable con títulos y puntos clave", tag: "Esquema · da forma a la historia" },
    { alt: "Editor de diapositivas con el lienzo completo a la vista, barra de herramientas, notas del ponente y miniaturas", tag: "Editor · lienzo completo" },
  ],

  scenariosTitle: "Seis grupos de flujos",
  scenariosLead:
    "Veinticuatro escenarios guiados, agrupados en seis grupos de flujos. Cada grupo trae sus propias preguntas, sus huecos para fuentes y su gramática visual. Empieza por uno o simplemente describe lo que necesitas.",
  scenarios: [
    { name: "Crear desde cero", blurb: "Informes de negocio, pitch decks y propuestas de proyecto a partir de un solo brief." },
    { name: "Transformar una fuente", blurb: "Embellece un PPTX, HTML o PDF existente; convierte documentos, notas o la foto de una pizarra en diapositivas." },
    { name: "Datos e insights", blurb: "Dashboards, informes de rendimiento recurrentes, resultados financieros y lecturas de encuestas." },
    { name: "Investigación y decisiones", blurb: "Presentaciones de deep research, estudios de mercado, análisis competitivos y revisiones de literatura." },
    { name: "Optimizar una presentación", blurb: "Aplica un sistema de marca, recrea un estilo de referencia, traduce y localiza, comprime o amplía." },
    { name: "Salidas especializadas", blurb: "Material de formación, keynotes de lanzamiento, porfolios y casos de estudio, lotes guiados por plantilla." },
  ],

  formatsTitle: "Archivos reales que puedes entregar",
  formatsLead:
    "Cuando la presentación se ve bien, exporta un PowerPoint (.pptx) de verdad y un PDF listo para imprenta, ambos con tus notas del ponente. Elige la calidad de render y el formato que encaje con la sala o el feed:",
  formatsRows: [
    { label: "Formatos de exportación", values: "PowerPoint (.pptx) · PDF · notas del ponente conservadas" },
    { label: "Calidad de render", values: "1K · 2K · 4K" },
    { label: "Relaciones de aspecto", values: "16:9 · 4:3 · 1:1 · 9:16 · 3:4" },
  ],

  duoTitle: "Rápido y sin fricción",
  fastTitle: "Fast mode",
  fastLead:
    "Las páginas se renderizan en paralelo —hasta cuatro a la vez y el resto en cola— en lugar de una tras otra, mientras el esquema aprobado y la dirección visual quedan fijados. Una presentación de diez diapositivas suele aterrizar en unos cuatro o cinco minutos, y una ejecución interrumpida se reanuda desde el estado guardado del proyecto en vez de empezar de cero.",
  installTitle: "Instalar en Codex",
  installLead:
    "Añade el repositorio como marketplace de plugins, instala el plugin, reinicia Codex y empieza una tarea nueva. Necesitas Codex con soporte de plugins, Node.js 20 o superior y un `codex login`: ninguna clave de OpenAI aparte ni archivo `.env` para el flujo por defecto.",

  finalEyebrow: "Siguiente paso",
  tiebackTitle: "De la familia OpenDesign",
  tiebackBody:
    "OpenDesign es el espacio de diseño abierto y local-first que vive fuera del agente de código que ya usas. Codex Slides es la misma idea apuntada a las presentaciones: tu agente hace el trabajo a la vista, el proyecto se queda en tu máquina y nada queda encerrado tras una suscripción. Para el kit de diseño completo más allá de las diapositivas, hazte con la app de OpenDesign.",

  schemaAlternateName: "El estudio de diapositivas con IA de código abierto dentro de Codex",
  schemaWhatQuestion: "¿Qué es Codex Slides?",
  schemaWhatAnswer:
    "Codex Slides es un estudio de diapositivas con IA de código abierto, con licencia MIT, que funciona como plugin dentro de Codex. Convierte un prompt, un repositorio o un conjunto de archivos en una presentación lista para exponer a través de un flujo visible —aclaración, investigación opcional, esquema, dirección visual, render en paralelo, edición, presentación y exportación a PPTX/PDF— y conserva cada presentación como un proyecto duradero en tu propio disco.",
  schemaKeyQuestion: "¿Codex Slides necesita una clave de API aparte?",
  schemaKeyAnswer:
    "No. Funciona con la cuenta de ChatGPT con la que ya te autenticaste mediante `codex login`. El flujo por defecto no necesita una clave de API de OpenAI aparte ni un archivo `.env`; requiere Codex con soporte de plugins, Node.js 20 o superior y Git.",
  schemaExportQuestion: "¿Codex Slides puede exportar archivos de PowerPoint reales?",
  schemaExportAnswer:
    "Sí. Codex Slides exporta un PPTX real y un PDF listo para imprenta, ambos conservando las notas del ponente del proyecto, con calidad de render 1K/2K/4K en cinco relaciones de aspecto (16:9, 4:3, 1:1, 9:16, 3:4). Al ser image-native, las diapositivas del PPTX exportado contienen imágenes a página completa en lugar de formas de PowerPoint editables una a una; la exportación con formas editables está en la hoja de ruta.",
  schemaRelationQuestion: "¿Codex Slides tiene relación con OpenDesign?",
  schemaRelationAnswer:
    "Sí. Codex Slides es un proyecto hermano del equipo que hay detrás de OpenDesign: el mismo enfoque abierto, local-first y agent-native aplicado a las presentaciones en lugar de a los archivos de diseño.",
};

export default es;
