# Logo Reveal Studio

Animaciones de presentación de logos (BarCamp) renderizadas de forma determinística con
Three.js y exportadas a MP4 en el navegador. 100 % client-side.

> Sube logos con **fondo transparente** (PNG o SVG). Un fondo blanco en la imagen se verá
> como un recuadro sobre el fondo del video.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests unitarios (Vitest)
npm run typecheck
npm run lint
npm run build
```

Requiere Node 20.19 o superior y un navegador de escritorio actual (Chrome, Edge, Firefox
o Safari).

Si actualizas el código (`git pull`) y se agregó una dependencia, `npm run dev`, `build` y
`test` corren `npm install` solos antes de arrancar (`scripts/ensure-deps.mjs`), en vez de
fallar con «Failed to resolve import».

### Actualizar desde la app

Con `npm run dev`, la app revisa GitHub al abrirse, cada 10 minutos y al volver a la
pestaña. Si hay cambios nuevos aparece **↻ Actualizar** arriba a la derecha (al pasar el
mouse muestra qué trae): un clic hace `git pull` (solo avance rápido, nunca pisa trabajo
local), instala dependencias si cambiaron y recarga la página. Lo que estabas editando se
conserva. Si hay cambios locales en los archivos que se actualizan, o commits locales sin
subir, no toca nada y explica qué hacer (`scripts/updater.ts`).

## Animación

Todo se ajusta en el panel **Animación** (derecha). Hay una animación general para todos
los logos y cada logo puede tener la suya («Personalizar solo este logo»).

- **Entrada** — 14 efectos:
  - Clásicas: Fundido, Swing, Card Flip, Pop.
  - Cinemáticas: Enfoque (desenfocado → nítido), Llegada 3D, Destello, Deslizar (con
    desenfoque de movimiento).
  - Revelados: Ascenso (sale de detrás de una línea), Barrido, Círculo, Franjas, Disolver.
  - Especiales: Partículas (miles de partículas con los colores del logo se ensamblan).

  Cada una con duración, intensidad y dirección (cuando aplica).
- **Brillo** — un reflejo de luz opcional que se combina con cualquier efecto: estilo
  (suave, destello, doble), 8 direcciones (incluida hacia arriba), intensidad, ancho,
  duración, retardo (negativo = durante la entrada) y repetición.
- **Permanencia** — el tiempo que el logo se queda en pantalla y qué hace mientras tanto:
  - **Animación en reposo**, en bucle: Flotar (levita sobre su sombra), Respirar, Balanceo
    3D, Inclinación 3D (un ocho lento) o Latido (doble pulso de luz). Intensidad y ritmo
    configurables; empieza y termina suavemente, así no altera la entrada ni la salida.
  - **Cámara**: un acercamiento o alejamiento lento y continuo.
- **Acabado** — «Plano» (el logo tal cual) o «Emblema 3D»: el logo se convierte en una pieza
  sólida con grosor real, bordes biselados en cada forma y letra, y una iluminación de
  estudio con brillos y reflejo metálico que se mueven al girar (luce mejor con
  «Inclinación 3D» o «Balanceo 3D» en reposo). Grosor, bisel, brillo y reflejo metálico
  son ajustables, y cualquier logo puede tener además un reflejo en el suelo. Con el
  Emblema 3D, el «Morph líquido» también funde un emblema en el otro con la misma luz,
  bisel y reflejo.
- **Salida** — los mismos efectos (o ninguna), con su duración, intensidad y dirección.
- **Secuencia** — cómo pasa cada logo al siguiente: Morph líquido y Morph de partículas
  (un logo se transforma en el otro), Fundido cruzado, Zoom desenfocado, Giro, Empuje,
  Barrido de luz, o «Salida + entrada» (la salida de uno y la entrada del siguiente).
  Con **Loop perfecto** el video termina transformándose en el primer logo, para
  repetirse en una pantalla sin corte.

«▶ Ver» (y cualquier cambio de efecto) salta el preview justo antes de esa parte.

## Sesión guardada

Todo se guarda solo en el navegador: al recargar la página vuelven los logos (en su
orden), sus ajustes, las animaciones, la secuencia, la escena y el export. Los ajustes van
a `localStorage` y los archivos subidos a IndexedDB (`src/state/persistence.ts`); al
arrancar se decodifican y procesan de nuevo. Borrar un logo borra también su archivo.

## Proyectos

Arriba a la derecha está el proyecto abierto, con su estado («Cambios sin guardar» o la
hora del último guardado):

- **Guardar** (Ctrl/Cmd+S) guarda sobre el proyecto abierto; si todavía no tiene nombre,
  lo pide. **Guardar como…** crea un proyecto nuevo con otro nombre.
- **Proyectos** abre la biblioteca: abrir, eliminar, empezar uno nuevo, y **Exportar /
  Importar archivo** (`.logoreveal`, un zip con los ajustes y los logos) para hacer copia
  de seguridad o llevarlo a otro equipo.

Un proyecto guarda todo: logos (con sus archivos) y su orden, ajustes de cada logo,
animaciones generales y propias, secuencia, escena y export. La biblioteca vive en
IndexedDB, en este navegador. Antes de reemplazar trabajo sin guardar, la app pide
confirmación. El trabajo de versiones anteriores se abre como «Sin título» con cambios sin
guardar, listo para «Guardar como…».

## Estructura

- `src/engine/` — escena Three.js (`LogoStage.renderFrame(t)`), normalización de tamaño
  (misma área visual, máx. 55% × 45% del frame) y la animación, toda en funciones puras
  del tiempo: `effects.ts` (entradas; las salidas son la entrada al revés),
  `transitions.ts`, `shine.ts`, `drift.ts`, `timeline.ts` (programas: segmentos de
  entrada, permanencia, salida y transición), `particles.ts` (muestreo determinista de
  partículas y emparejamiento para el morph) y `shaders.ts`.
- `src/processing/` — carga de PNG/JPG/SVG y preparación de la textura:
  análisis de transparencia, quitar fondo blanco (opcional), auto-trim, margen
  transparente, color bleeding y rasterizado de SVG a 2× su tamaño en pantalla.
- `src/export/` — export MP4 frame por frame: RGB → YUV BT.709 (`yuv.ts`), H.264 en
  WebAssembly en un worker (`h264.worker.ts`), MP4 final y verificación con Mediabunny
  (`mp4.ts`), nivel H.264 (`codec.ts`).
- `src/ui/` — componentes React.
- `src/state/` — estado global (Zustand), procesamiento por logo y los «programas» que
  reproduce el preview y se exportan (logo individual o secuencia).

## Pipeline de color

Las texturas se suben como sRGB, los shaders re-codifican a sRGB y la mezcla ocurre sobre
valores sRGB (igual que un navegador o un editor de imágenes componen un PNG). Sin
iluminación ni tone mapping: un píxel opaco del logo sale con el mismo valor que en el
archivo. Los desenfoques (enfoque, movimiento, morph líquido) promedian en luz lineal y
premultiplicada, así los bordes no se oscurecen.

## Export

Tres salidas, cada una idéntica a lo que muestra el preview en el modo correspondiente:

- **Exportar este logo** — un MP4 del logo seleccionado (con el margen de 1 s opcional).
- **Exportar todos (ZIP)** — un MP4 por logo, numerados en el orden de la lista.
- **Exportar secuencia completa** — un solo MP4 con todos los logos en orden, unidos por la
  transición elegida.

- Frame por frame (`t = i / fps`), nunca en tiempo real: el video sale igual aunque la
  PC sea lenta, y cada frame es exactamente el del preview.
- Pensado para que se reproduzca en cualquier lado, teléfonos y WhatsApp incluidos:
  H.264 **Constrained Baseline** (el perfil que decodifica todo aparato), 8-bit 4:2:0,
  colores BT.709 en rango limitado declarados en el archivo, un keyframe por segundo, el
  **nivel** calculado del tamaño, los fps y el bitrate real (1080p30 → 4.0, 1080p60 → 4.2,
  4K30 → 5.1, 4K60 → 5.2) y el índice (`moov`) al inicio.
- Bitrate controlado (24 Mbps en 1080p30, 26 en 1080p60, 60–90 en 4K): los logos quietos
  salen casi sin pérdida y los momentos más cargados (partículas, disolver) no se pasan de
  lo que el nivel permite.
- El encoder es el mismo en todos los navegadores (minih264 en WebAssembly, en un worker),
  así que el archivo no depende del navegador ni de la tarjeta de video.
- Antes de descargarse, el MP4 se vuelve a leer y se comprueba: contenedor, códec,
  tamaño, cantidad de frames, duración y keyframes; donde el navegador puede decodificar
  H.264, además se decodifica frame por frame. Si algo falla, no se descarga y lo avisa.
- Para mandar por WhatsApp o al teléfono conviene 1080p: el 4K pesa mucho y muchos
  teléfonos no lo reproducen a 60 fps.
