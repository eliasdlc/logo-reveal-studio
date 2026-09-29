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
- `src/export/` — export MP4 frame por frame (fase 4).
- `src/ui/` — componentes React.
- `src/state/` — estado global (Zustand).

## Pipeline de color

Las texturas se suben como sRGB, los shaders re-codifican a sRGB y la mezcla ocurre sobre
valores sRGB (igual que un navegador o un editor de imágenes componen un PNG). Sin
iluminación ni tone mapping: un píxel opaco del logo sale con el mismo valor que en el
archivo.
