# Sistema de diseño inspirado en Webflow

> Category: Diseño y creatividad
> Constructor web visual. Estética de sitio de marketing pulida con acento azul.

## 1. Tema visual y atmósfera

El sitio web de Webflow es una plataforma visualmente rica y orientada a herramientas que comunica el "diseño sin código" a través de superficies blancas limpias, el característico azul Webflow（`#146ef5`）y una rica paleta de colores secundarios（violeta, rosa, verde, naranja, amarillo, rojo）. La fuente personalizada WF Visual Sans Variable crea un sistema tipográfico seguro y preciso con peso 600 para el display y 500 para el cuerpo.

**Características clave：**
- Lienzo blanco con texto casi negro（`#080808`）
- Azul Webflow（`#146ef5`）como color de marca principal e interactivo
- WF Visual Sans Variable — fuente variable personalizada con peso 500–600
- Paleta secundaria rica：violeta `#7a3dff`, rosa `#ed52cb`, verde `#00d722`, naranja `#ff6b00`, amarillo `#ffae13`, rojo `#ee1d36`
- Radio de borde conservador de 4px–8px — nítido, no redondeado
- Apilamientos de sombra multicapa（sombras en cascada de 5 capas）
- Etiquetas en mayúsculas：10px–15px, peso 500–600, espaciado amplio（0,6px–1,5px）
- Animación translate(6px) al pasar el cursor sobre los botones

## 2. Paleta de colores y roles

### Primario
- **Casi Negro**（`#080808`）：Texto principal
- **Azul Webflow**（`#146ef5`）：`--_color---primary--webflow-blue`, CTA principal y enlaces
- **Azul 400**（`#3b89ff`）：`--_color---primary--blue-400`, azul interactivo más claro
- **Azul 300**（`#006acc`）：`--_color---blue-300`, variante de azul más oscuro
- **Azul hover del botón**（`#0055d4`）：`--mkto-embed-color-button-hover`

### Acentos secundarios
- **Violeta**（`#7a3dff`）：`--_color---secondary--purple`
- **Rosa**（`#ed52cb`）：`--_color---secondary--pink`
- **Verde**（`#00d722`）：`--_color---secondary--green`
- **Naranja**（`#ff6b00`）：`--_color---secondary--orange`
- **Amarillo**（`#ffae13`）：`--_color---secondary--yellow`
- **Rojo**（`#ee1d36`）：`--_color---secondary--red`

### Neutro
- **Gris 800**（`#222222`）：Texto secundario oscuro
- **Gris 700**（`#363636`）：Texto medio
- **Gris 300**（`#ababab`）：Texto atenuado, marcador de posición
- **Gris medio**（`#5a5a5a`）：Texto de enlace
- **Gris borde**（`#d8d8d8`）：Bordes, divisores
- **Borde hover**（`#898989`）：Borde al pasar el cursor

### Sombras
- **Cascada de 5 capas**：`rgba(0,0,0,0) 0px 84px 24px, rgba(0,0,0,0.01) 0px 54px 22px, rgba(0,0,0,0.04) 0px 30px 18px, rgba(0,0,0,0.08) 0px 13px 13px, rgba(0,0,0,0.09) 0px 3px 7px`

## 3. Reglas tipográficas

### Fuente：`WF Visual Sans Variable`, alternativa：`Arial`

| Rol | Tamaño | Peso | Altura de línea | Espaciado de letras | Notas |
|------|------|--------|-------------|----------------|-------|
| Hero de display | 80px | 600 | 1,04 | -0,8px | |
| Encabezado de sección | 56px | 600 | 1,04 | normal | |
| Subencabezado | 32px | 500 | 1,30 | normal | |
| Título de función | 24px | 500–600 | 1,30 | normal | |
| Cuerpo | 20px | 400–500 | 1,40–1,50 | normal | |
| Cuerpo estándar | 16px | 400–500 | 1,60 | -0,16px | |
| Botón | 16px | 500 | 1,60 | -0,16px | |
| Etiqueta en mayúsculas | 15px | 500 | 1,30 | 1,5px | uppercase |
| Leyenda | 14px | 400–500 | 1,40–1,60 | normal | |
| Badge en mayúsculas | 12,8px | 550 | 1,20 | normal | uppercase |
| Micro en mayúsculas | 10px | 500–600 | 1,30 | 1px | uppercase |
| Código：Inconsolata（fuente monoespaciada complementaria）

## 4. Estilos de componentes

### Botones
- Transparente：texto `#080808`, translate(6px) al pasar el cursor
- Círculo blanco：radio 50%, fondo blanco
- Badge azul：fondo `#146ef5`, radio 4px, peso 550

### Tarjetas：`1px solid #d8d8d8`, radio 4px–8px
### Badges：fondo con tinte azul al 10% de opacidad, radio 4px

## 5. Maquetación
- Espaciado：escala fraccionaria（1px, 2,4px, 3,2px, 4px, 5,6px, 6px, 7,2px, 8px, 9,6px, 12px, 16px, 24px）
- Radio：2px, 4px, 8px, 50% — conservador, nítido
- Puntos de quiebre：479px, 768px, 992px

## 6. Profundidad：sistema de sombras en cascada de 5 capas

## 7. Lo que se debe y no se debe hacer
- Hacer：Usar WF Visual Sans Variable con peso 500–600. Azul（`#146ef5`）para los CTA. Radio 4px. translate(6px) al pasar el cursor.
- No hacer：Redondear elementos funcionales más de 8px. Usar colores secundarios en CTA primarios.

## 8. Responsive：479px, 768px, 992px

## 9. Guía de prompt para Agent
- Texto：Casi Negro（`#080808`）
- CTA：Azul Webflow（`#146ef5`）
- Fondo：Blanco（`#ffffff`）
- Borde：`#d8d8d8`
- Secundario：Violeta `#7a3dff`, Rosa `#ed52cb`, Verde `#00d722`
