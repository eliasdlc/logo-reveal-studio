/*
 * GLSL for the stage. Three.js compiles these as GLSL ES 3.00 (WebGL2), so textureLod,
 * textureGrad and unsigned integers are available.
 *
 * Color pipeline: logo textures are SRGB8_ALPHA8, so sampling returns linear light; blur
 * averages happen there (premultiplied), and every shader re-encodes to sRGB before
 * writing, so blending happens on sRGB values like a browser compositing a PNG. An
 * untouched opaque pixel comes out with exactly the value it had in the file.
 */

const SRGB_ENCODE = /* glsl */ `
  vec3 linearToSrgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }
  vec3 srgbToLinear(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
  }
`

/**
 * Sampling a logo texture in "image uv" (0–1, y up; the bitmaps are stored top row first).
 * Results are premultiplied linear RGBA, and zero outside the image so blur never smears
 * the clamped edge texels.
 */
const LOGO_SAMPLING = /* glsl */ `
  const int BLUR_TAPS = 40;
  const float GOLDEN_ANGLE = 2.39996323;

  bool outside(vec2 u) { return u.x < 0.0 || u.y < 0.0 || u.x > 1.0 || u.y > 1.0; }

  vec4 premultiply(vec4 t) { return vec4(t.rgb * t.a, t.a); }

  vec4 texelGrad(sampler2D map, vec2 u, vec2 dx, vec2 dy) {
    if (outside(u)) return vec4(0.0);
    return premultiply(textureGrad(map, vec2(u.x, 1.0 - u.y), vec2(dx.x, -dx.y), vec2(dy.x, -dy.y)));
  }

  vec4 texelLod(sampler2D map, vec2 u, float lod) {
    if (outside(u)) return vec4(0.0);
    return premultiply(textureLod(map, vec2(u.x, 1.0 - u.y), lod));
  }

  /*
   * Lens blur (a disc of radius 'radius') plus motion blur (a line along 'smear'), both in
   * image uv. Taps sit on a golden-angle spiral and read from a mip level matching their
   * spacing, so even large blurs are smooth. dx/dy are the screen derivatives of the
   * unshifted uv (explicit gradients keep sharp sampling correct inside branches).
   */
  vec4 logoSample(sampler2D map, vec2 texSize, vec2 u, vec2 radius, vec2 smear, vec2 dx, vec2 dy) {
    if (radius.x <= 0.0 && radius.y <= 0.0 && dot(smear, smear) <= 0.0) return texelGrad(map, u, dx, dy);
    float footprint = max(length(dx * texSize), length(dy * texSize));
    float spacing = max(length(radius * texSize) * 1.7725 / sqrt(float(BLUR_TAPS)), length(smear * texSize) / float(BLUR_TAPS));
    float lod = log2(max(max(spacing, footprint), 1.0));
    vec4 sum = vec4(0.0);
    for (int i = 0; i < BLUR_TAPS; i++) {
      float fi = float(i);
      float r = sqrt((fi + 0.5) / float(BLUR_TAPS));
      float a = fi * GOLDEN_ANGLE;
      // Position along the smear, decorrelated from the disc radius.
      float s = fract(fi * 0.618034 + 0.5) - 0.5;
      sum += texelLod(map, u + vec2(cos(a), sin(a)) * r * radius + s * smear, lod);
    }
    return sum / float(BLUR_TAPS);
  }
`

/**
 * The light sweep: a band crossing the logo along 'dir' (unit, in content space scaled to
 * logo heights). 'params' = (band centre, width, intensity, style). The band is mixed into
 * the logo's own colour, so it only ever shows where the logo is.
 */
const SHINE = /* glsl */ `
  vec3 applyShine(vec3 color, vec2 content, float aspect, vec4 params, vec2 dir) {
    if (params.z <= 0.0) return color;
    vec2 p = (content - 0.5) * vec2(aspect, 1.0);
    float d = (dot(p, dir) - params.x) / params.y;
    float g;
    if (params.w < 0.5) {
      g = exp(-d * d);
    } else if (params.w < 1.5) {
      // Glint: a soft halo around a crisp, bright core.
      g = 0.45 * exp(-d * d) + exp(-9.0 * d * d);
    } else {
      // Double: a main band followed by a thinner echo.
      float a = (d + 1.1) * 1.8;
      float b = (d - 0.9) * 2.6;
      g = exp(-a * a) + 0.75 * exp(-b * b);
    }
    return mix(color, vec3(1.0), clamp(g * params.z, 0.0, 1.0));
  }
`

/*
 * Studio lighting for the 3D emblem, in view space: a key light from the upper left, a
 * soft environment (bright softbox above, darker floor) for reflections, and a rim.
 * Normalised so a flat face looking at the camera keeps exactly the logo's own colours;
 * only bevels and turns change them.
 */
const EMBLEM_LIGHT = /* glsl */ `
  const vec3 KEY = vec3(-0.4534, 0.6549, 0.6045);
  const float AMBIENT = 0.62;
  const float DIFFUSE = 0.55;

  float studio(vec3 r) {
    float sky = 0.5 + 0.5 * smoothstep(-0.35, 0.85, r.y);
    float a = (r.y - 0.5) / 0.11;
    float b = (r.x + 0.62) / 0.12;
    float softbox = 0.9 * exp(-a * a) * smoothstep(-0.2, 0.4, r.z);
    float strip = 0.5 * exp(-b * b);
    return sky + softbox + strip;
  }

  /* 'base' is linear colour, 'n' the surface normal in view space. */
  vec3 emblemLight(vec3 base, vec3 n, vec3 viewPos, float gloss, float metal) {
    vec3 v = normalize(-viewPos);
    float front = AMBIENT + DIFFUSE * KEY.z;
    vec3 lit = base * (AMBIENT + DIFFUSE * max(dot(n, KEY), 0.0)) / front;
    vec3 r = reflect(-v, n);
    lit = mix(lit, base * studio(r) / studio(vec3(0.0, 0.0, 1.0)), metal);
    float spec = pow(max(dot(n, normalize(KEY + v)), 0.0), 70.0);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 4.0);
    return lit + vec3(gloss * (1.3 * spec + 0.35 * rim));
  }
`

const EASINGS = /* glsl */ `
  float easeOutCubic(float x) { float y = 1.0 - x; return 1.0 - y * y * y; }
  float easeOutQuint(float x) { float y = 1.0 - x; return 1.0 - y * y * y * y * y; }
  float easeInOutCubic(float x) {
    return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) / 2.0;
  }
`

/** Integer-hash value noise: identical on every GPU, unlike sin()-based hashes. */
const NOISE = /* glsl */ `
  float hash(ivec2 p) {
    uvec2 q = uvec2(p) * uvec2(1597334673u, 3812015801u);
    uint n = (q.x ^ q.y) * 1597334673u;
    n ^= n >> 16;
    n *= 2246822519u;
    n ^= n >> 13;
    return float(n) / 4294967295.0;
  }
  float valueNoise(vec2 x) {
    ivec2 i = ivec2(floor(x));
    vec2 f = fract(x);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + ivec2(1, 0));
    float c = hash(i + ivec2(0, 1));
    float d = hash(i + ivec2(1, 1));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 x) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * valueNoise(x);
      x = x * 2.03 + vec2(17.1, 9.7);
      amp *= 0.5;
    }
    return v / 0.9375;
  }
`

/** Full-screen quad in clip space; ignores the camera. */
export const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
  }
`

/**
 * A quad in the scene. Also passes its world position (frame-space masks) and, for the
 * 3D emblem lighting, its axes and position in view space.
 */
export const MESH_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec2 vWorld;
  varying vec3 vAxisX;
  varying vec3 vAxisY;
  varying vec3 vAxisZ;
  varying vec3 vViewPos;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xy;
    vAxisX = normalMatrix * vec3(1.0, 0.0, 0.0);
    vAxisY = normalMatrix * vec3(0.0, 1.0, 0.0);
    vAxisZ = normalMatrix * vec3(0.0, 0.0, 1.0);
    vec4 view = viewMatrix * world;
    vViewPos = view.xyz;
    gl_Position = projectionMatrix * view;
  }
`

export const BACKGROUND_FRAG = /* glsl */ `
  uniform vec3 color;
  void main() { gl_FragColor = vec4(color, 1.0); }
`

export const SHADOW_FRAG = /* glsl */ `
  uniform float strength;
  varying vec2 vUv;
  void main() {
    vec2 d = (vUv - 0.5) * 2.0;
    float falloff = exp(-4.0 * dot(d, d));
    gl_FragColor = vec4(0.0, 0.0, 0.0, strength * falloff * (1.0 - smoothstep(0.8, 1.0, length(d))));
  }
`

/** Box-filters the supersampled scene down to the canvas, byte for byte when ss = 1. */
export const RESOLVE_FRAG = /* glsl */ `
  uniform sampler2D source;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(source, vUv); }
`

/** Reveal kinds, matching the LOGO_FRAG branches. */
export const REVEAL_KIND = { none: 0, slide: 1, wipe: 2, iris: 3, slices: 4, dissolve: 5, sweep: 6 } as const

export const SHINE_STYLE = { soft: 0, glint: 1, double: 2 } as const

/*
 * One logo layer. The quad may be larger than the texture ('uvScale' > 1) so blur, motion
 * blur and sliding strips can spill past the logo's own bounds. 'content' coordinates are
 * the logo's visible box (0–1, without the transparent padding).
 */
export const LOGO_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform vec2 texSize;
  uniform vec2 uvScale;
  uniform vec2 pad;
  uniform float aspect;
  uniform float opacity;
  uniform float flash;
  uniform vec2 blurRadius;
  uniform vec2 smear;
  uniform int revealKind;
  uniform vec4 revealA;
  uniform vec4 revealB;
  uniform vec4 shine;
  uniform vec2 shineDir;
  uniform vec4 emblem;
  uniform float mirror;
  varying vec2 vUv;
  varying vec2 vWorld;
  varying vec3 vAxisX;
  varying vec3 vAxisY;
  varying vec3 vAxisZ;
  varying vec3 vViewPos;
  ${SRGB_ENCODE}
  ${LOGO_SAMPLING}
  ${SHINE}
  ${EASINGS}
  ${NOISE}
  ${EMBLEM_LIGHT}

  float bell(float x, float width) { float y = x / width; return exp(-y * y); }

  /*
   * Bevelled face: the coverage, blurred over the bevel width, is a height field whose
   * slope tilts the normal near every edge (outline, letters, holes). 'emblem' = (on,
   * bevel width in texels, gloss, metal).
   */
  vec3 emblemFace(vec3 base, vec2 at) {
    float w = emblem.y;
    float lod = log2(max(w * 0.35, 1.0));
    vec2 o = vec2(w * 0.5) / texSize;
    float hx = texelLod(map, at + vec2(o.x, 0.0), lod).a - texelLod(map, at - vec2(o.x, 0.0), lod).a;
    float hy = texelLod(map, at + vec2(0.0, o.y), lod).a - texelLod(map, at - vec2(0.0, o.y), lod).a;
    vec3 n = normalize(vec3(-hx, -hy, 0.55));
    vec3 nv = normalize(n.x * normalize(vAxisX) + n.y * normalize(vAxisY) + n.z * normalize(vAxisZ));
    return emblemLight(base, nv, vViewPos, emblem.z, emblem.w);
  }

  void main() {
    vec2 u = (vUv - 0.5) * uvScale + 0.5;
    vec2 span = 1.0 - 2.0 * pad;
    vec2 content = (u - pad) / span;
    vec2 dx = dFdx(u);
    vec2 dy = dFdy(u);

    vec2 at = u;
    vec2 motion = smear;
    float mask = 1.0;
    float glow = 0.0;

    if (revealKind == 1) {
      // Slide: the content sits (1 − progress) of its length back along the direction,
      // hidden behind the edge it comes from.
      vec2 d = revealA.xy;
      at = u + d * (1.0 - revealA.z) * span;
      motion += d * revealA.w * span;
      float along = dot(content - 0.5, d) + 0.5;
      // Screen-space footprint of 'along' from the derivatives taken outside any branch
      // (derivatives inside flow control fail to compile on some Windows drivers).
      float footprint = abs(dot(dx / span, d)) + abs(dot(dy / span, d));
      mask = clamp(along / max(footprint, 1e-6) + 0.5, 0.0, 1.0);
    } else if (revealKind == 2) {
      // Wipe: a soft edge travels along the direction.
      vec2 d = revealA.xy;
      float soft = revealA.w;
      float along = dot(content - 0.5, d) + 0.5;
      float edge = mix(0.0, 1.0 + soft, revealA.z);
      mask = 1.0 - smoothstep(edge - soft, edge, along);
      glow = revealB.x * bell(along - edge + soft * 0.5, soft * 0.45);
    } else if (revealKind == 3) {
      // Iris: a circle opening from the centre, in logo-height units.
      float soft = revealA.y;
      float radius = revealA.x * (0.5 * sqrt(aspect * aspect + 1.0) + soft);
      float dist = length((content - 0.5) * vec2(aspect, 1.0));
      mask = 1.0 - smoothstep(radius - soft, radius, dist);
      glow = revealA.z * bell(dist - radius + soft * 0.5, soft * 0.45);
    } else if (revealKind == 4) {
      // Slices: strips across the travel direction, each sliding in from alternating
      // sides, one after the other, with its own motion blur.
      vec2 d = revealA.xy;
      float n = revealA.w;
      float across = abs(d.x) > 0.5 ? 1.0 - content.y : content.x;
      float i = clamp(floor(across * n), 0.0, n - 1.0);
      float stagger = 0.08;
      float window = 1.0 - stagger * (n - 1.0);
      float q = clamp((revealA.z - i * stagger) / window, 0.0, 1.0);
      float q0 = clamp((revealA.z - revealB.y - i * stagger) / window, 0.0, 1.0);
      float side = mod(i, 2.0) < 0.5 ? 1.0 : -1.0;
      float travel = revealB.x;
      at = u + d * side * (1.0 - easeOutQuint(q)) * travel * span;
      motion += d * (easeOutQuint(q) - easeOutQuint(q0)) * travel * span;
      mask = smoothstep(0.0, 0.3, q);
    } else if (revealKind == 5) {
      // Dissolve: organic noise decides which parts appear first.
      float soft = revealA.y;
      float n = smoothstep(0.3, 0.7, fbm(content * vec2(aspect, 1.0) * revealA.w));
      float threshold = mix(0.0, 1.0 + soft, revealA.x);
      mask = 1.0 - smoothstep(threshold - soft, threshold, n);
      glow = revealA.z * bell(n - threshold + soft * 0.5, soft * 0.5);
    } else if (revealKind == 6) {
      // Sweep: a line crossing the frame, shared by the two logos of a transition.
      float soft = revealA.w;
      float sd = dot(vWorld, revealA.xy) - revealA.z;
      mask = smoothstep(-soft, soft, sd * revealB.x);
      glow = revealB.y * bell(sd, soft * 1.3);
    }

    vec4 s = logoSample(map, texSize, at, blurRadius, motion, dx, dy);
    vec3 base = s.rgb / max(s.a, 1e-6);
    if (emblem.x > 0.5) base = emblemFace(base, at);
    vec3 color = linearToSrgb(base);
    color = mix(color, vec3(1.0), clamp(flash + glow, 0.0, 1.0));
    color = applyShine(color, content, aspect, shine, shineDir);
    float alpha = s.a * mask * opacity;
    // Floor reflection: strongest where the logo meets the floor, fading upwards.
    if (mirror > 0.0) alpha *= mirror * (1.0 - smoothstep(0.0, 0.6, content.y));
    gl_FragColor = vec4(color, alpha);
  }
`

/*
 * Liquid morph between two logos drawn as one shape: both are blurred, their coverage is
 * blended and then sharpened again with a threshold, so the outlines melt into each other
 * like metaballs. With goo = 0 and no blur it's exactly one logo or the other.
 */
export const LIQUID_FRAG = /* glsl */ `
  uniform sampler2D mapA;
  uniform sampler2D mapB;
  uniform vec2 texSizeA;
  uniform vec2 texSizeB;
  uniform vec4 rectA;
  uniform vec4 rectB;
  uniform vec2 padA;
  uniform vec2 padB;
  uniform float aspectA;
  uniform float aspectB;
  uniform vec2 blurA;
  uniform vec2 blurB;
  uniform float opacityA;
  uniform float opacityB;
  uniform vec4 shineA;
  uniform vec4 shineB;
  uniform vec2 shineDirA;
  uniform vec2 shineDirB;
  uniform float mixAmount;
  uniform float goo;
  uniform vec4 emblemA;
  uniform vec4 emblemB;
  uniform float mirror;
  uniform float mirrorFloor;
  uniform float mirrorHeight;
  varying vec2 vUv;
  varying vec2 vWorld;
  varying vec3 vViewPos;
  ${SRGB_ENCODE}
  ${LOGO_SAMPLING}
  ${SHINE}
  ${EMBLEM_LIGHT}

  /*
   * Slope of one logo's coverage over its bevel (or the current blur, if wider): the same
   * height field the emblem face uses, so the melting shape keeps the emblem's relief.
   */
  vec2 bevelSlope(sampler2D map, vec2 texSize, vec2 u, float bevelTexels, vec2 blurUv) {
    float w = max(bevelTexels, length(blurUv * texSize) * 1.4);
    float lod = log2(max(w * 0.35, 1.0));
    vec2 o = vec2(w * 0.5) / texSize;
    return vec2(
      texelLod(map, u + vec2(o.x, 0.0), lod).a - texelLod(map, u - vec2(o.x, 0.0), lod).a,
      texelLod(map, u + vec2(0.0, o.y), lod).a - texelLod(map, u - vec2(0.0, o.y), lod).a
    );
  }

  /*
   * Straight sRGB colour of one logo: from a lightly blurred sample where the logo really
   * is, falling back to the heavily blurred one in the gaps the liquid fills in.
   */
  vec3 liquidColor(vec4 soft, vec4 crisp) {
    vec3 blurred = soft.rgb / max(soft.a, 1e-6);
    vec3 sharp = crisp.rgb / max(crisp.a, 1e-6);
    return linearToSrgb(mix(blurred, sharp, smoothstep(0.05, 0.6, crisp.a)));
  }

  void main() {
    // The floor reflection is this same shape mirrored: undo the mirror to sample it.
    vec2 world = mirror > 0.0 ? vec2(vWorld.x, 2.0 * mirrorFloor - vWorld.y) : vWorld;
    vec2 uA = (world - rectA.xy) / rectA.zw + 0.5;
    vec2 uB = (world - rectB.xy) / rectB.zw + 0.5;
    vec2 dxA = dFdx(uA);
    vec2 dyA = dFdy(uA);
    vec2 dxB = dFdx(uB);
    vec2 dyB = dFdy(uB);
    vec4 a = logoSample(mapA, texSizeA, uA, blurA, vec2(0.0), dxA, dyA) * opacityA;
    vec4 b = logoSample(mapB, texSizeB, uB, blurB, vec2(0.0), dxB, dyB) * opacityB;
    vec4 a2 = logoSample(mapA, texSizeA, uA, blurA * 0.3, vec2(0.0), dxA, dyA);
    vec4 b2 = logoSample(mapB, texSizeB, uB, blurB * 0.3, vec2(0.0), dxB, dyB);
    vec3 colorA = applyShine(liquidColor(a, a2), (uA - padA) / (1.0 - 2.0 * padA), aspectA, shineA, shineDirA);
    vec3 colorB = applyShine(liquidColor(b, b2), (uB - padB) / (1.0 - 2.0 * padB), aspectB, shineB, shineDirB);

    float wa = a.a * (1.0 - mixAmount);
    float wb = b.a * mixAmount;
    float alpha = wa + wb;
    vec3 color = (colorA * wa + colorB * wb) / max(alpha, 1e-6);
    // Coverage field normalised so that, half-way, the two shapes add up (they merge).
    float field = alpha / max(1.0 - mixAmount, mixAmount);
    float liquid = smoothstep(0.28, 0.46, field);
    float coverage = mix(alpha, liquid, goo);

    // 3D emblem look, blended between the two logos' settings.
    float emblem = mix(emblemA.x, emblemB.x, mixAmount);
    if (emblem > 0.0) {
      vec2 slope = ((1.0 - mixAmount) * bevelSlope(mapA, texSizeA, uA, emblemA.y, blurA)
        + mixAmount * bevelSlope(mapB, texSizeB, uB, emblemB.y, blurB)) / max(1.0 - mixAmount, mixAmount);
      // The gooey edge is steeper than the logos' own bevels.
      vec3 n = normalize(vec3(-slope * mix(1.0, 2.0, goo), 0.55));
      if (mirror > 0.0) n.y = -n.y;
      vec3 lit = emblemLight(
        srgbToLinear(color), n, vViewPos,
        mix(emblemA.z, emblemB.z, mixAmount), mix(emblemA.w, emblemB.w, mixAmount)
      );
      color = mix(color, linearToSrgb(lit), emblem);
    }
    if (mirror > 0.0) coverage *= mirror * (1.0 - smoothstep(0.0, 0.6 * mirrorHeight, world.y - mirrorFloor));
    gl_FragColor = vec4(color, coverage);
  }
`

/*
 * Particles assembling into one logo (or scattering from it, played backwards). Positions
 * are in logo heights; the object's matrix places and scales them like the logo.
 */
export const ASSEMBLY_VERT = /* glsl */ `
  attribute vec2 target;
  attribute vec3 dotColor;
  attribute vec4 seed;
  uniform float progress;
  uniform vec2 direction;
  uniform float spread;
  uniform float aspect;
  uniform float dotSize;
  uniform float pixelScale;
  varying vec3 vColor;
  varying float vAlpha;
  ${EASINGS}

  void main() {
    // The side the particles travel towards lands first; the rest follow in a wave.
    vec2 extent = vec2(aspect, 1.0) * 0.5;
    float lead = dot(target / extent, direction) * 0.5 + 0.5;
    float delay = 0.3 * (0.7 * (1.0 - lead) + 0.3 * seed.x);
    float q = clamp((progress - delay) / 0.55, 0.0, 1.0);
    float e = easeOutCubic(q);

    vec3 home = vec3(target, 0.0);
    vec3 scatter = (seed.yzw - 0.5) * vec3(3.2, 2.4, 4.0) + vec3(0.0, 0.0, -0.6);
    vec3 start = home - vec3(direction, 0.0) * (1.6 + 1.8 * seed.x) * spread + scatter * spread;
    // Curved flight: the control point pulls the path sideways.
    vec3 bend = vec3(-direction.y, direction.x, 0.0) * (seed.w - 0.5) * 1.6 * spread;
    vec3 control = mix(start, home, 0.55) + bend;
    vec3 pos = (1.0 - e) * (1.0 - e) * start + 2.0 * (1.0 - e) * e * control + e * e * home;
    // The whole swarm swirls around the logo's centre as it closes in, like a vortex.
    float turn = 1.25 * (1.0 - e) * (1.0 - e);
    pos.xy = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * pos.xy;

    vec4 view = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = max(1.0, dotSize * mix(1.6, 1.0, e) * pixelScale / -view.z);
    vColor = dotColor;
    vAlpha = smoothstep(0.0, 0.08, q) * (1.0 - smoothstep(0.88, 1.0, progress));
  }
`

/*
 * Particles flying from one logo to the next. 'from' / 'to' are in each logo's heights;
 * matrixA / matrixB place them in the world like the logos themselves.
 */
export const SWARM_VERT = /* glsl */ `
  attribute vec2 from;
  attribute vec2 to;
  attribute vec3 colorA;
  attribute vec3 colorB;
  attribute vec4 seed;
  uniform mat4 matrixA;
  uniform mat4 matrixB;
  uniform float progress;
  uniform float dotA;
  uniform float dotB;
  uniform float pixelScale;
  varying vec3 vColor;
  varying float vAlpha;
  ${EASINGS}

  void main() {
    float q = clamp((progress - 0.08 - 0.3 * seed.x) / 0.52, 0.0, 1.0);
    float e = easeInOutCubic(q);
    vec3 a = (matrixA * vec4(from, 0.0, 1.0)).xyz;
    vec3 b = (matrixB * vec4(to, 0.0, 1.0)).xyz;
    // Arc towards the camera, peaking mid-flight, with a little individual scatter.
    vec3 lift = vec3((seed.y - 0.5) * 0.35, (seed.z - 0.5) * 0.25, 0.15 + 0.35 * seed.w);
    vec3 control = mix(a, b, 0.5) + lift;
    vec3 pos = (1.0 - e) * (1.0 - e) * a + 2.0 * (1.0 - e) * e * control + e * e * b;
    // A gentle collective swirl around the centre of the frame.
    float turn = 0.9 * sin(3.14159265 * e);
    pos.xy = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * pos.xy;

    vec4 view = viewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = max(1.0, mix(dotA, dotB, e) * (1.0 + 0.5 * sin(3.14159265 * e)) * pixelScale / -view.z);
    vColor = mix(colorA, colorB, smoothstep(0.3, 0.7, e));
    vAlpha = smoothstep(0.0, 0.1, progress) * (1.0 - smoothstep(0.9, 1.0, progress));
  }
`

/** Round, softly anti-aliased dots in the particle's own (sRGB) colour. */
export const PARTICLE_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    gl_FragColor = vec4(vColor, vAlpha * (1.0 - smoothstep(0.55, 1.0, r)));
  }
`

/*
 * The emblem's thickness: copies of the logo's silhouette stacked behind it ('slice' 0 →
 * just behind the face, 1 → the back), lit like the sides of a solid.
 */
export const EXTRUDE_VERT = /* glsl */ `
  attribute float slice;
  uniform float thickness;
  varying vec2 vUv;
  varying float vSlice;
  varying vec3 vAxisX;
  varying vec3 vAxisY;
  varying vec3 vViewPos;
  void main() {
    vUv = uv;
    vSlice = slice;
    vAxisX = normalMatrix * vec3(1.0, 0.0, 0.0);
    vAxisY = normalMatrix * vec3(0.0, 1.0, 0.0);
    vec4 view = modelViewMatrix * vec4(position.xy, -slice * thickness, 1.0);
    vViewPos = view.xyz;
    gl_Position = projectionMatrix * view;
  }
`

export const EXTRUDE_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform vec2 texSize;
  uniform float opacity;
  uniform vec4 emblem;
  varying vec2 vUv;
  varying float vSlice;
  varying vec3 vAxisX;
  varying vec3 vAxisY;
  varying vec3 vViewPos;
  ${SRGB_ENCODE}
  ${LOGO_SAMPLING}
  ${EMBLEM_LIGHT}

  void main() {
    vec4 t = texture2D(map, vec2(vUv.x, 1.0 - vUv.y));
    // The side faces outwards, along the silhouette's gradient.
    float lod = log2(max(emblem.y * 0.35, 1.0));
    vec2 o = vec2(emblem.y * 0.5) / texSize;
    vec2 g = -vec2(
      texelLod(map, vUv + vec2(o.x, 0.0), lod).a - texelLod(map, vUv - vec2(o.x, 0.0), lod).a,
      texelLod(map, vUv + vec2(0.0, o.y), lod).a - texelLod(map, vUv - vec2(0.0, o.y), lod).a
    );
    vec2 outward = dot(g, g) > 1e-8 ? normalize(g) : vec2(0.0, -1.0);
    vec3 n = normalize(outward.x * normalize(vAxisX) + outward.y * normalize(vAxisY));
    // Sides are darker than the face and fade towards the back.
    vec3 side = emblemLight(t.rgb * 0.62, n, vViewPos, emblem.z * 0.6, emblem.w) * (1.0 - 0.35 * vSlice);
    gl_FragColor = vec4(linearToSrgb(side), t.a * opacity);
  }
`
