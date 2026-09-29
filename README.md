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

Requiere Chrome o Edge de escritorio (WebCodecs para exportar).

## Estructura

- `src/engine/` — escena Three.js (`LogoStage.renderFrame(t)`), efectos puros, easings y
  normalización de tamaño (misma área visual, máx. 55% × 45% del frame).
- `src/processing/` — carga de PNG/JPG/SVG y preparación de la textura:
  análisis de transparencia, quitar fondo blanco (opcional), auto-trim, margen
  transparente, color bleeding y rasterizado de SVG a 2× su tamaño en pantalla.
- `src/export/` — export MP4 frame por frame: WebCodecs (H.264) + Mediabunny.
- `src/ui/` — componentes React.
- `src/state/` — estado global (Zustand), procesamiento por logo y los «programas» que
  reproduce el preview y se exportan (logo individual o secuencia).

## Pipeline de color

Las texturas se suben como sRGB, los shaders re-codifican a sRGB y la mezcla ocurre sobre
valores sRGB (igual que un navegador o un editor de imágenes componen un PNG). Sin
iluminación ni tone mapping: un píxel opaco del logo sale con el mismo valor que en el
archivo.

## Export

Tres salidas, cada una idéntica a lo que muestra el preview en el modo correspondiente:

- **Exportar este logo** — un MP4 del logo seleccionado (con el margen de 1 s opcional).
- **Exportar todos (ZIP)** — un MP4 por logo, numerados en el orden de la lista.
- **Exportar secuencia completa** — un solo MP4 con todos los logos en orden; cada uno sale
  (escala 1 → 0.95, opacidad 1 → 0 en 0.5 s) antes de que entre el siguiente.


- Frame por frame (`t = i / fps`), nunca en tiempo real: el video sale igual aunque la
  PC sea lenta, y cada frame es exactamente el del preview.
- H.264 8-bit 4:2:0 con el nivel correcto para tamaño **y** fps (1080p30 → 4.0,
  1080p60 → 4.2, 4K30 → 5.1, 4K60 → 5.2), perfil High → Main → Baseline según lo que
  acepte el navegador, y el índice (`moov`) al inicio del archivo para QuickTime y
  PowerPoint.
- La calidad final depende del encoder del navegador: con aceleración por hardware
  (Windows/macOS) respeta el bitrate; el encoder por software de Chrome en Linux tiene
  un tope de calidad propio.
