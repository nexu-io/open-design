// Wordmark rendered by a WebGL fragment shader: a diagonal band sweeps across
// and assembles the OpenDesign logo (mark + wordmark, sampled from an SVG)
// out of a dense spray of tiny coloured blocks, then rests as the solid logo
// while the cursor lights a pool of blocks with a lasting wake.
// Framework-agnostic core logic; mount it on a sized, position:relative host
// (see PixelScanLogo).
//
// Adapted for this repo from the reference implementation: the sound hooks
// (glitchScan/glitchTick) are stripped, `three` is injected by the caller so
// the component can lazy-import it, defaults carry the OpenDesign wordmark and
// the three-green brand palette, and plain-array reads carry `!` where the
// index is provably in range (strict noUncheckedIndexedAccess).

const SHADER = `
precision highp float;
uniform sampler2D src;
uniform vec2 resolution;
uniform vec2 offset;
uniform float time;
uniform float enterTime;
uniform float leaveTime;

uniform int mode;
uniform float speed;
uniform float delay;
uniform float width;
uniform vec3 accent;
uniform vec3 accent2;
uniform vec3 baseCol;
uniform vec2 mouse;
uniform float hover;
uniform float spot;

#define TRAIL 24
uniform vec2 trail[TRAIL];
uniform float trailW[TRAIL];

#define W width
#define LAYERS 3.0

vec4 readTex(vec2 uv) {
  if (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.) return vec4(0);
  return texture2D(src, uv);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(4859., 3985.))) * 3984.); }
float sdBox(vec2 p, float r) { vec2 q = abs(p) - r; return min(length(q), max(q.y, q.x)); }

float dir = 1.;
vec2 mp = vec2(0.);
vec2 tp[TRAIL];

vec2 pxToP(vec2 px) {
  vec2 uv = (px - offset) / resolution;
  vec2 q = uv * 2. - 1.;
  q.y *= resolution.y / resolution.x;
  return q;
}

float toRangeT(vec2 p, float scale) {
  float d;
  if (mode == 0) d = p.x / (scale * 2.) + .5;
  else if (mode == 1) d = 1. - (p.y / (scale * 2.) + .5);
  else if (mode == 2) d = length(p) / scale;

  else d = dot(p, vec2(0.7071, 0.7071)) / (scale * 2.) + .5;
  d = dir > 0. ? d : (1. - d);
  return d;
}

vec4 cell(vec2 p, vec2 pi, float scale, float t, float edge) {
  vec2 pc = pi + .5;

  vec2 uvc = pc / scale;
  uvc.y /= resolution.y / resolution.x;
  uvc = uvc * 0.5 + 0.5;
  if (uvc.x < 0. || uvc.x > 1. || uvc.y < 0. || uvc.y > 1.) return vec4(0);
  float alpha = smoothstep(.0, .1, texture2D(src, uvc).a);

  float x = toRangeT(pi, scale);
  float n = hash(pi);
  float SPREAD = W * 2.2;
  float anim = smoothstep(W * 2., .0, abs(x + n * SPREAD - t));

  vec2 cellP = pc / scale;
  float spotA = 0.;
  for (int i = 0; i < TRAIL; i++) {
    float w = trailW[i];
    if (w <= 0.) continue;
    vec2 rel = cellP - tp[i];
    float ang = atan(rel.y, rel.x);
    float wob = 1.
      + 0.30 * sin(3. * ang + time * 1.6)
      + 0.16 * sin(5. * ang - time * 1.1 + 1.3);
    float reach = spot * 0.8 * wob;
    spotA = max(spotA, smoothstep(reach, reach * 0.4, length(rel)) * w);
  }
  anim = max(anim, spotA * hover);

  float tone = 0.5 + 0.5 * sin(time * 2.0 + n * 6.2831)
                   + 0.18 * sin(time * 3.7 + n * 12.566);
  tone = clamp(tone, 0., 1.);
  vec3 cellAccent = mix(accent, accent2, tone);
  vec4 color = vec4(mix(baseCol, cellAccent, anim), 1.) * anim;

  float pull = hover * smoothstep(spot * 1.4, 0., length(cellP - mp));
  vec2 mag = normalize(mp - cellP + 1e-5) * pull * 0.18;
  vec2 bp = p - pc - mag;

  float sd = sdBox(bp, .38);
  color *= mix(1., clamp(.3 / abs(sd), 0., 10.), edge * pow(anim, 9.));
  color += vec4(cellAccent, 1.) * anim * smoothstep(.55, .0, abs(sd)) * 0.07;

  return color * alpha;
}

vec4 cellsColor(vec2 p, float scale, float t) {
  vec2 pi = floor(p);
  vec2 d = vec2(0, 1);
  vec4 cc = vec4(0);
  cc += cell(p, pi, scale, t, .2) * 4.;
  cc += cell(p, pi + d.xy, scale, t, .9);
  cc += cell(p, pi - d.xy, scale, t, .9);
  cc += cell(p, pi + d.yx, scale, t, .9);
  cc += cell(p, pi - d.yx, scale, t, .9);
  return cc / 8.;
}

vec4 draw(vec2 uv, vec2 p, float t, float scale) {
  vec4 c = readTex(uv);
  vec2 pi = floor(p * scale);
  float n = hash(pi);
  t = t * (1. + W * 4.) - W * 2.;
  float x = toRangeT(pi, scale);
  float a1 = smoothstep(t, t - W, x + n * W);
  c *= a1;
  c += cellsColor(p * scale, scale, t) * 1.1;
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  vec2 p = uv * 2. - 1.;
  p.y *= resolution.y / resolution.x;

  mp = pxToP(mouse);
  for (int i = 0; i < TRAIL; i++) tp[i] = pxToP(trail[i]);

  float t;
  if (leaveTime > 0.) { dir = -1.; t = clamp(leaveTime * speed, 0., 1.); }
  else { t = clamp((enterTime - delay) * speed, 0., 1.); }
  t = (fract(t * .99999) - 0.5) * dir + 0.5;

  for (float i = 0.; i < LAYERS; i++) {
    float s = cos(i) * 11. + 32.;
    gl_FragColor += draw(uv, p, t, abs(s));
  }
  gl_FragColor /= LAYERS;
  gl_FragColor *= smoothstep(0., 0.01, t);
}
`;

const VERT = `
precision highp float;
attribute vec3 position;
void main() { gl_Position = vec4(position, 1.0); }
`;

const ENTRANCE_SECONDS = 2.6;
const HOVER_EASE = 0.22;
const LIVE_EASE = 0.35;
const SPOT_RADIUS = 0.28;

const TRAIL = 24;
const TRAIL_LIFE = 1.1;
const TRAIL_MIN_PX = 3;

// Brand greens: #87EA5C leads the wave, #D0FFB5 is the shimmer partner, and
// the deep #2F781D tints the rising edge of each block.
const ACCENT: [number, number, number] = [0.529, 0.918, 0.361]; // #87EA5C
const ACCENT2: [number, number, number] = [0.816, 1.0, 0.71]; // #D0FFB5
const BASE: [number, number, number] = [0.184, 0.471, 0.114]; // #2F781D
// The resting artwork: the real logo SVG (paths filled #202020, matching the
// app's near-black text tone); its alpha channel is the glyph mask the shader
// samples. Same 1705:291 aspect as the host box.
const LOGO_SRC = '/logo-scan.svg';

let logoImgPromise: Promise<HTMLImageElement> | null = null;
function loadLogo(): Promise<HTMLImageElement> {
  logoImgPromise ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`[pixel-scan] failed to load ${LOGO_SRC}`));
    img.src = LOGO_SRC;
  });
  return logoImgPromise;
}

type Three = typeof import('three');

export type PixelScanFieldOptions = {
  accent?: [number, number, number];
  accent2?: [number, number, number];
  base?: [number, number, number];
};

export class PixelScanField {
  private host: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private THREE: Three;

  private accent: [number, number, number];
  private accent2: [number, number, number];
  private base: [number, number, number];

  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private img: HTMLImageElement | null = null;
  private disposed = false;

  private renderer: InstanceType<Three['WebGLRenderer']>;
  private scene: InstanceType<Three['Scene']>;
  private camera: InstanceType<Three['Camera']>;
  private geo: InstanceType<Three['PlaneGeometry']>;
  private material: InstanceType<Three['RawShaderMaterial']>;
  private uniforms: Record<string, { value: unknown }>;

  private texture: InstanceType<Three['CanvasTexture']>;
  private wordCanvas: HTMLCanvasElement | null = null;
  private wordCtx: CanvasRenderingContext2D | null = null;

  private rect: DOMRect;

  private entranceStart = performance.now();

  private hoverTarget = 0;
  private hoverVal = 0;

  private trailVecs: InstanceType<Three['Vector2']>[];
  private trailWeights: number[];
  private trailBorn: number[] = new Array<number>(TRAIL).fill(-1e9);
  private liveX = -1e4;
  private liveY = -1e4;
  private liveOn = false;
  private head = 1;
  private lastPx = 0;
  private lastPy = 0;

  private targetX = -1e4;
  private targetY = -1e4;

  private startTime = performance.now();
  private lastFrame = this.startTime;
  private raf = 0;
  private running = false;

  constructor(
    host: HTMLDivElement,
    canvas: HTMLCanvasElement,
    THREE: Three,
    opts: PixelScanFieldOptions = {},
  ) {
    this.host = host;
    this.canvas = canvas;
    this.THREE = THREE;
    this.accent = opts.accent ?? ACCENT;
    this.accent2 = opts.accent2 ?? ACCENT2;
    this.base = opts.base ?? BASE;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: false,
    });
    this.renderer.setPixelRatio(this.dpr);

    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.geo = new THREE.PlaneGeometry(2, 2);

    this.rect = host.getBoundingClientRect();
    this.texture = this.makeTexture(this.rect.width, this.rect.height);

    this.uniforms = {
      src: { value: this.texture },
      resolution: {
        value: new THREE.Vector2(this.rect.width * this.dpr, this.rect.height * this.dpr),
      },
      offset: { value: new THREE.Vector2(0, 0) },
      time: { value: 0 },
      enterTime: { value: 0 },
      leaveTime: { value: 0 },
      mode: { value: 3 },
      speed: { value: 1 },
      delay: { value: 0 },
      width: { value: 0.2 },
      accent: { value: new THREE.Vector3(...this.accent) },
      accent2: { value: new THREE.Vector3(...this.accent2) },
      baseCol: { value: new THREE.Vector3(...this.base) },
      mouse: { value: new THREE.Vector2(-1e4, -1e4) },
      hover: { value: 0 },
      spot: { value: SPOT_RADIUS },
      trail: {
        value: Array.from({ length: TRAIL }, () => new THREE.Vector2(-1e4, -1e4)),
      },
      trailW: { value: new Array<number>(TRAIL).fill(0) },
    };

    this.material = new THREE.RawShaderMaterial({
      vertexShader: VERT,
      fragmentShader: SHADER,
      uniforms: this.uniforms,
      transparent: true,
    });
    this.scene.add(new THREE.Mesh(this.geo, this.material));

    this.trailVecs = this.uniforms.trail!.value as InstanceType<Three['Vector2']>[];
    this.trailWeights = this.uniforms.trailW!.value as number[];

    this.setSize();

    this.host.addEventListener('pointerenter', this.onEnter);
    this.host.addEventListener('pointerdown', this.onDown);
    this.host.addEventListener('pointerleave', this.onLeave);
    this.host.addEventListener('pointermove', this.onMove);
    window.addEventListener('resize', this.onResize);

    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);

    // The artwork loads async; rebuild the texture when it lands and restart
    // the entrance so the sweep begins with the logo actually visible.
    void loadLogo()
      .then((img) => {
        if (this.disposed) return;
        this.img = img;
        this.entranceStart = performance.now();
        this.setSize();
      })
      .catch((err: unknown) => console.error(err));
  }

  private makeTexture(w: number, h: number): InstanceType<Three['CanvasTexture']> {
    const src = rasteriseLogo(w, h, this.dpr, this.img);
    this.wordCanvas = src;
    this.wordCtx = src.getContext('2d', { willReadFrequently: true });
    const tex = new this.THREE.CanvasTexture(src);

    tex.minFilter = this.THREE.LinearFilter;
    tex.magFilter = this.THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  private overGlyph(bx: number, by: number): boolean {
    if (!this.wordCanvas || !this.wordCtx) return false;
    const cx = Math.round(bx);
    const cy = Math.round(this.wordCanvas.height - by);
    if (cx < 0 || cy < 0 || cx >= this.wordCanvas.width || cy >= this.wordCanvas.height) {
      return false;
    }
    try {
      return (this.wordCtx.getImageData(cx, cy, 1, 1).data[3] ?? 0) > 20;
    } catch {
      return false;
    }
  }

  private setSize = () => {
    this.rect = this.host.getBoundingClientRect();
    this.renderer.setSize(this.rect.width, this.rect.height, false);
    (this.uniforms.resolution!.value as InstanceType<Three['Vector2']>).set(
      this.rect.width * this.dpr,
      this.rect.height * this.dpr,
    );
    this.texture.dispose();
    this.texture = this.makeTexture(this.rect.width, this.rect.height);
    this.uniforms.src!.value = this.texture;
  };

  private enterTimeVal(): number {
    const e = (performance.now() - this.entranceStart) / 1000;
    if (e >= ENTRANCE_SECONDS) return 2;
    const x = e / ENTRANCE_SECONDS;
    return 1 - (1 - x) * (1 - x);
  }

  private toLocal(ev: PointerEvent) {
    const r = this.host.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) * this.dpr,
      y: (r.height - (ev.clientY - r.top)) * this.dpr,
    };
  }

  private onEnter = (ev: PointerEvent) => {
    this.hoverTarget = 1;
    this.liveOn = true;
    const l = this.toLocal(ev);
    this.targetX = this.liveX = this.lastPx = l.x;
    this.targetY = this.liveY = this.lastPy = l.y;

    this.entranceStart = performance.now();
  };
  private onLeave = () => {
    this.hoverTarget = 0;
    this.liveOn = false;
  };
  private onMove = (ev: PointerEvent) => {
    const l = this.toLocal(ev);
    this.targetX = l.x;
    this.targetY = l.y;
  };

  private onDown = (ev: PointerEvent) => {
    if (ev.pointerType === 'touch') {
      this.entranceStart = performance.now();
    }
  };

  private onResize = () => this.setSize();

  private onContextLost = (e: Event) => {
    e.preventDefault();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  };

  private onContextRestored = () => {
    this.setSize();
    if (this.running && !this.raf) this.raf = requestAnimationFrame(this.tick);
  };

  private tick = () => {
    const now = performance.now();
    this.uniforms.time!.value = (now - this.startTime) / 1000;
    this.uniforms.enterTime!.value = this.enterTimeVal();

    this.hoverVal += (this.hoverTarget - this.hoverVal) * HOVER_EASE;
    this.uniforms.hover!.value = this.hoverVal;

    this.liveX += (this.targetX - this.liveX) * LIVE_EASE;
    this.liveY += (this.targetY - this.liveY) * LIVE_EASE;

    if (this.liveOn) {
      const step = TRAIL_MIN_PX * this.dpr;

      const MAX_PER_FRAME = 4;
      let moved = Math.hypot(this.liveX - this.lastPx, this.liveY - this.lastPy);
      const total = moved;
      let placed = 0;
      while (moved >= step && placed < MAX_PER_FRAME) {
        const f = step / moved;
        this.lastPx += (this.liveX - this.lastPx) * f;
        this.lastPy += (this.liveY - this.lastPy) * f;
        this.head = this.head + 1 >= TRAIL ? 1 : this.head + 1;
        this.trailVecs[this.head]!.set(this.lastPx, this.lastPy);

        const along = total > 0 ? 1 - moved / total : 1;
        this.trailBorn[this.head] = this.lastFrame + (now - this.lastFrame) * along;
        moved = Math.hypot(this.liveX - this.lastPx, this.liveY - this.lastPy);
        placed++;
      }
    }
    this.lastFrame = now;

    this.trailVecs[0]!.set(this.liveX, this.liveY);
    this.trailWeights[0] = this.liveOn ? 1 : 0;
    for (let i = 1; i < TRAIL; i++) {
      const age = (now - this.trailBorn[i]!) / 1000;

      const d = Math.max(0, Math.min(1, 1 - age / TRAIL_LIFE));
      this.trailWeights[i] = d * d * (3 - 2 * d);
    }
    (this.uniforms.mouse!.value as InstanceType<Three['Vector2']>).set(this.liveX, this.liveY);

    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.tick);
  };

  start() {
    if (this.running) return;
    this.running = true;

    const now = performance.now();
    this.lastFrame = now;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  resize() {
    this.setSize();
  }

  destroy() {
    this.disposed = true;
    this.stop();
    this.host.removeEventListener('pointerenter', this.onEnter);
    this.host.removeEventListener('pointerdown', this.onDown);
    this.host.removeEventListener('pointerleave', this.onLeave);
    this.host.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.texture.dispose();
    this.geo.dispose();
    this.material.dispose();
    this.renderer.dispose();

    this.renderer.forceContextLoss?.();
    this.renderer.getContext().getExtension('WEBGL_lose_context')?.loseContext();
  }
}

function rasteriseLogo(
  w: number,
  h: number,
  dpr: number,
  img: HTMLImageElement | null,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
    // Contain-fit, centred — the host box shares the artwork's aspect ratio,
    // so in practice this fills the canvas edge to edge.
    const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  return c;
}

export function drawStaticLogo(canvas: HTMLCanvasElement, host: HTMLElement) {
  void loadLogo()
    .then((img) => {
      const r = host.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      // A canvas already claimed by a WebGL context returns null here (e.g.
      // the engine constructor failed after creating its renderer) — skip
      // quietly rather than crashing the fallback path.
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(rasteriseLogo(r.width, r.height, dpr, img), 0, 0);
    })
    .catch((err: unknown) => console.error(err));
}
