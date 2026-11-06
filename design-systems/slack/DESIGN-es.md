# Sistema de diseño inspirado en Slack

> Category: Productividad y SaaS
> Plataforma de comunicación en el lugar de trabajo. Paleta primaria berenjena, paleta multicolor del logotipo, superficies claras con barra lateral oscura, tono cálido y accesible.

## 1. Tema visual y atmósfera

La identidad de Slack se construye alrededor de la idea de que el trabajo debe sentirse humano e incluso un poco divertido. La superficie canónica es **clara** — áreas de contenido blancas con una profunda barra lateral berenjena (`#4A154B`) — lo opuesto a las herramientas con fondo oscuro. Este contraste es intencional: la barra lateral es un ancla de navegación tranquila y siempre presente, mientras que el área de contenido es brillante y abierta.

La paleta del logotipo — azul, verde, amarillo, rojo — aparece principalmente en el ícono de almohadilla y en contextos de marketing, no diseminada por la interfaz. En el propio producto, Slack utiliza un sistema de colores sobrio y profesional con el berenjena como único ancla de marca.

**Características clave:**
- Superficies de contenido predominantemente claras: blanco `#FFFFFF` y casi blanco `#F8F8F8`
- Profunda barra lateral berenjena `#4A154B` — el elemento de interfaz más reconocible de la marca
- Cuatro colores de acento del logotipo (azul, verde, amarillo, rojo) usados con moderación, solo como destacados
- Larsseit para encabezados (marketing), sans-serif del sistema para la interfaz
- Redondeado pero no caricaturesco: radio de 4–8px en la mayoría de componentes
- Denso pero respirable: filas de mensajes compactas con jerarquía de hilos clara
- Tono cálido y conversacional — emojis, reacciones e ilustraciones son elementos de primera clase

---

## 2. Paleta de colores y roles

### Color primario de marca
| Token | Hex | Rol |
|---|---|---|
| `--color-aubergine` | `#4A154B` | Fondo de la barra lateral, color principal de la marca |
| `--color-aubergine-dark` | `#350d36` | Estados de hover en superficies berenjena |
| `--color-aubergine-light` | `#611f69` | Destacado del elemento activo en la barra lateral |

### Colores de acento del logotipo (usar con moderación — solo destacados, íconos, marketing)
| Token | Hex | Nombre | Rol |
|---|---|---|---|
| `--color-blue` | `#36C5F0` | Azul cielo | Íconos de canales, enlaces, estados informativos |
| `--color-green` | `#2EB67D` | Verde azulado | Estado en línea, estados de éxito |
| `--color-yellow` | `#ECB22E` | Dorado | Estado ausente, advertencias, destacados |
| `--color-red` | `#E01E5A` | Rubí | Notificaciones, errores, insignia de menciones |

### Superficie y fondo
| Token | Hex | Rol |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | Área principal de mensajes, modales |
| `--bg-secondary` | `#F8F8F8` | Paneles de hilos, superficies secundarias |
| `--bg-tertiary` | `#F1F1F1` | Fondos de campos de entrada, estados de hover |
| `--bg-sidebar` | `#4A154B` | Barra lateral izquierda (berenjena) |
| `--bg-sidebar-hover` | `rgba(255,255,255,0.1)` | Hover en elemento de la barra lateral |
| `--bg-sidebar-active` | `rgba(255,255,255,0.2)` | Elemento activo de la barra lateral |
| `--bg-message-hover` | `#F8F8F8` | Hover en fila de mensaje |

### Colores de texto
| Token | Hex | Rol |
|---|---|---|
| `--text-primary` | `#1D1C1D` | Texto principal del cuerpo (casi negro) |
| `--text-secondary` | `#616061` | Marcas de tiempo, etiquetas atenuadas |
| `--text-sidebar` | `rgba(255,255,255,0.9)` | Nombres de canales en la barra lateral |
| `--text-sidebar-muted` | `rgba(255,255,255,0.6)` | Elementos inactivos de la barra lateral |
| `--text-link` | `#1264A3` | Enlaces en línea en mensajes |
| `--text-mention` | `#1264A3` | Color de texto de las @menciones |

### Colores semánticos
| Token | Hex | Rol |
|---|---|---|
| `--color-success` | `#2EB67D` | Notificaciones de éxito, estados positivos |
| `--color-warning` | `#ECB22E` | Estados de advertencia |
| `--color-danger` | `#E01E5A` | Estados de error, acciones destructivas |
| `--color-info` | `#36C5F0` | Destacados informativos |

### Borde y divisor
| Token | Hex | Rol |
|---|---|---|
| `--border-default` | `#DDDDDD` | Divisores estándar, bordes de tarjetas |
| `--border-subtle` | `#F1F1F1` | Separadores sutiles entre filas |
| `--border-focus` | `#1264A3` | Color del anillo de enfoque |

---

## 3. Reglas tipográficas

### Tipografías
| Rol | Oficial | Alternativa web |
|---|---|---|
| Encabezados de pantalla / Marketing | Larsseit | `'Larsseit', 'Helvetica Neue', Arial, sans-serif` |
| Interfaz / Cuerpo / Chrome | Slack Lato (personalizado) | `system-ui, -apple-system, BlinkMacSystemFont, sans-serif` |
| Código / Monoespaciado | — | `'Monaco', 'Menlo', 'Courier New', monospace` |

> Slack usa **Larsseit** para los titulares de marketing y una variante personalizada de Lato para la interfaz del producto. Para uso web, `system-ui` es la alternativa más segura.

### Escala tipográfica

| Nivel | Tamaño | Peso | Altura de línea | Espaciado de letras | Uso |
|---|---|---|---|---|---|
| Pantalla XL | 48px | 800 | 1.1 | -1px | Titulares héroe de marketing |
| Pantalla L | 36px | 700 | 1.15 | -0.5px | Héroes de sección |
| Encabezado 1 | 28px | 700 | 1.25 | normal | Títulos de modales, encabezados de página |
| Encabezado 2 | 22px | 700 | 1.3 | normal | Títulos de tarjetas, secciones de configuración |
| Encabezado 3 | 18px | 700 | 1.35 | normal | Encabezados de subsección |
| Cuerpo L | 16px | 400 | 1.5 | normal | Texto de mensajes, descripciones |
| Cuerpo | 15px | 400 | 1.46667 | normal | Texto de interfaz predeterminado (tamaño base de Slack) |
| Cuerpo SM | 13px | 400 | 1.38462 | normal | Metadatos secundarios |
| Leyenda | 12px | 400 | 1.33 | normal | Marcas de tiempo, sugerencias |
| Código | 12px | 400 | 1.5 | normal | Código en línea, bloques de código |

### Reglas tipográficas
- El tamaño de cuerpo base de Slack es **15px** — ligeramente menor que 16px para mayor densidad
- Canales no leídos: peso 700 — la negrita es el indicador principal de no leído
- Marcas de tiempo: 12px `--text-secondary`, mostrar solo al pasar el cursor
- Bloques de código: fondo `#F8F8F8`, borde `1px solid #DDDDDD`, border-radius 4px
- Nunca usar tamaños de fuente inferiores a 12px
- Encabezados de marketing: espaciado de letras `-1px` para tamaños de pantalla grandes

---

## 4. Estilos de componentes

### Botones

```css
/* Primary */
.btn-primary {
  background: #4A154B;
  color: #FFFFFF;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
  border: none;
}
.btn-primary:hover { background: #611f69; }

/* Secondary */
.btn-secondary {
  background: #FFFFFF;
  color: #1D1C1D;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
}
.btn-secondary:hover { background: #F8F8F8; }

/* Danger */
.btn-danger {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 4px;
}
.btn-danger:hover { background: #B3114A; }
```

### Campos de entrada
```css
.input {
  background: #FFFFFF;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  color: #1D1C1D;
  font-size: 15px;
  padding: 8px 12px;
  height: 36px;
}
.input:focus {
  border-color: #1264A3;
  box-shadow: 0 0 0 2px rgba(18,100,163,0.25);
  outline: none;
}
```

### Elemento de canal en la barra lateral
```css
.channel-item {
  height: 28px;
  padding: 0 16px;
  border-radius: 6px;
  color: rgba(255,255,255,0.7);
  font-size: 15px;
  font-weight: 400;
}
.channel-item:hover {
  background: rgba(255,255,255,0.1);
  color: #FFFFFF;
}
.channel-item.active {
  background: rgba(255,255,255,0.2);
  color: #FFFFFF;
}
.channel-item.unread {
  color: #FFFFFF;
  font-weight: 700;
}
```

### Insignia de no leído
```css
.badge {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  min-width: 18px;
}
```

### Adjuntos de mensajes / Tarjetas
```css
.attachment {
  border-left: 4px solid #DDDDDD;
  background: #F8F8F8;
  border-radius: 0 4px 4px 0;
  padding: 8px 12px;
  margin: 4px 0;
}
```

### Reacciones
```css
.reaction {
  border: 1px solid #DDDDDD;
  border-radius: 24px;
  background: #F8F8F8;
  padding: 2px 8px;
  font-size: 13px;
  cursor: pointer;
}
.reaction:hover { background: #F1F1F1; }
.reaction.active {
  background: rgba(18,100,163,0.1);
  border-color: #1264A3;
}
```

---

## 5. Principios de maquetación

### Maquetación de tres columnas
```
┌──────────────┬──────────────────────────────┬─────────────┐
│   Sidebar    │        Message Area          │   Thread    │
│   (240px)    │          (flex: 1)           │  (400px)    │
│  #4A154B     │          #FFFFFF             │  optional   │
└──────────────┴──────────────────────────────┴─────────────┘
```

### Sistema de espaciado (base 4px)
| Token | Valor | Uso |
|---|---|---|
| `--space-1` | 4px | Espacios reducidos |
| `--space-2` | 8px | Relleno de componentes |
| `--space-3` | 12px | Relleno de campos de entrada |
| `--space-4` | 16px | Relleno estándar |
| `--space-6` | 24px | Relleno de tarjetas |
| `--space-8` | 32px | Separación entre secciones |

### Estructura de la barra lateral
```
[Workspace Name ▼]
────────────────────
Threads
All DMs
Drafts & Sent
────────────────────
▼ Channels
  # general
  # random
  # design  ● (unread)
────────────────────
▼ Direct Messages
  John Doe
  Jane Smith
```

### Compositor de mensajes
- Fijado en la parte inferior del área de mensajes
- `border: 1px solid #DDDDDD`, `border-radius: 8px`, `margin: 0 16px 16px`
- Barra de herramientas: emoji, adjuntar, formato, botón de envío

---

## 6. Profundidad y elevación

Slack usa sombras suaves sobre una superficie clara:

| Nivel | Uso | Sombra |
|---|---|---|
| Plano | Filas de mensajes, elementos de la barra lateral | none |
| Bajo | Tarjetas, campos de entrada | `0 1px 3px rgba(0,0,0,0.08)` |
| Medio | Menús desplegables, popovers | `0 4px 12px rgba(0,0,0,0.12)` |
| Alto | Modales, diálogos | `0 8px 24px rgba(0,0,0,0.15)` |
| Superposición | Fondos de modales | `rgba(0,0,0,0.5)` |

---

## 7. Lo que se debe y no se debe hacer

### ✅ Hacer
- Usar berenjena `#4A154B` para la barra lateral — es el elemento de interfaz más icónico de Slack
- Mantener el área de contenido principal blanca y clara
- Usar `#1D1C1D` (casi negro) para todo el texto del cuerpo, no negro puro
- Poner en negrita los nombres de canales para mostrar el estado no leído — el peso es el indicador
- Usar los cuatro colores de acento solo para roles semánticos (éxito, advertencia, peligro, información)
- Aplicar `border-left: 4px` en adjuntos e inserciones de mensajes
- Mostrar marcas de tiempo solo al pasar el cursor
- Usar `#1264A3` para enlaces y estados de enfoque
- Mantener los elementos de la barra lateral compactos: altura 28px, border-radius 6px

### ❌ No hacer
- No usar un área de contenido principal oscura — Slack es predominantemente claro
- No dispersar azul/verde/amarillo/rojo como acentos decorativos
- No usar negro puro `#000000` para el texto
- No usar burbujas de diálogo — los mensajes son filas planas
- No hacer botones con radio grande — 4px es el estándar
- No mostrar marcas de tiempo permanentemente
- No usar MAYÚSCULAS para los nombres de canales
- No usar tamaños de fuente inferiores a 12px

---

## 8. Comportamiento responsivo

### Puntos de ruptura
| Punto de ruptura | Ancho | Maquetación |
|---|---|---|
| Móvil | < 768px | Panel único, barra lateral como cajón izquierdo |
| Tablet | 768–1024px | Solo barra lateral + área de mensajes |
| Escritorio | > 1024px | Maquetación completa de tres columnas |

### Adaptaciones móviles
- Barra lateral: cajón izquierdo, deslizar a la derecha para abrir
- Barra de pestañas inferior: Inicio, MDs, Actividad, Tú
- Panel de hilo: superposición de pantalla completa
- Compositor: fijado sobre el teclado
- Elementos de la lista de canales: altura de objetivo táctil 44px
- Barra de encabezado berenjena superior conservada en móvil

---

## 9. Guía de prompts para agente

Al generar diseños con estilo Slack, sigue este enfoque:

**Aplicación de colores:**
> Establece `background: #FFFFFF` como lienzo principal. Usa `#4A154B` (berenjena) para la barra lateral. Todo el texto principal es `#1D1C1D`. Los enlaces y anillos de enfoque usan `#1264A3`. Los cuatro colores del logotipo — `#36C5F0`, `#2EB67D`, `#ECB22E`, `#E01E5A` — son únicamente semánticos: información, éxito, advertencia, peligro.

**Tipografía:**
> Usa `system-ui, -apple-system, sans-serif` para toda la interfaz. El tamaño base es 15px. Canales no leídos: peso 700. Texto del cuerpo: peso 400. Marcas de tiempo: 12px `#616061`, solo al pasar el cursor. Código: `Monaco, Menlo, monospace`, 12px, fondo `#F8F8F8`.

**Maquetación:**
> Tres columnas: barra lateral berenjena de 240px + área de mensajes blanca flexible + panel de hilo opcional de 400px. Elementos de la barra lateral: altura 28px, radio 6px, negrita cuando no leído. Compositor: fijado abajo, `border: 1px solid #DDDDDD`, `border-radius: 8px`.

**Componentes:**
> Botones: radio 4px, altura 36px, berenjena primario. Campos de entrada: borde `1px solid #DDDDDD`, anillo de enfoque `#1264A3`. Filas de mensajes: planas, sin burbujas, avatar circular de 36px. Reacciones: píldora `border: 1px solid #DDDDDD`, `border-radius: 24px`.

**Tono:**
> Slack es cálido, profesional y humano. Los estados vacíos usan ilustraciones amigables. Las llamadas a la acción son directas: «Enviar mensaje», «Comenzar». Los mensajes de error son claros y útiles. Nunca alarmante.

**Antipatrones a evitar:**
> Sin área de contenido oscura. Sin burbujas de diálogo. Sin texto negro puro. Sin acentos multicolor dispersos. Sin nombres de canales en MAYÚSCULAS. Sin fuentes inferiores a 12px. Sin radio de botón grande.
