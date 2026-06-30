/* Reusable Guizang-style electronic magazine background.
   Copy or inline into generated HTML. It renders a deterministic WebGL ink-flow
   canvas and falls back to 2D if WebGL is unavailable. */
(function () {
  function rgb(input, fallback) {
    return Array.isArray(input) && input.length === 3 ? input.map((v) => v / 255) : fallback;
  }

  function fallback2d(canvas, opts) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width;
    const h = rect.height;
    const ink = opts.inkCss || "rgba(26,46,31,.22)";
    const accent = opts.accentCss || "rgba(46,107,79,.18)";
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      const x = w * (0.14 + ((i * 0.19 + 0.17) % 0.72));
      const y = h * (0.10 + ((i * 0.29 + 0.23) % 0.78));
      const r = Math.max(w, h) * (0.22 + i * 0.045);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, i % 2 ? accent : ink);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 0.09;
    ctx.strokeStyle = opts.inkCss || "rgba(26,46,31,.22)";
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      ctx.ellipse(w * (0.5 + Math.sin(i) * 0.34), h * (0.5 + Math.cos(i * 1.7) * 0.28), 120 + i * 18, 42 + i * 9, i * 0.37, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function mount(canvas, options) {
    const opts = options || {};
    const gl = canvas.getContext("webgl", { alpha: true, antialias: true, preserveDrawingBuffer: true });
    if (!gl) {
      fallback2d(canvas, opts);
      return { mode: "2d" };
    }

    const vert = `
      attribute vec2 aPos;
      void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
    `;
    const frag = `
      precision mediump float;
      uniform vec2 uRes;
      uniform float uTime;
      uniform vec3 uInk;
      uniform vec3 uPaper;
      uniform vec3 uAccent;
      uniform float uStrength;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float noise(vec2 p){
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
          mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x),
          u.y
        );
      }
      float fbm(vec2 p){
        float v = 0.0;
        float a = 0.5;
        mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
        for(int i=0; i<5; i++){
          v += a * noise(p);
          p = m * p * 1.18;
          a *= 0.52;
        }
        return v;
      }
      void main(){
        vec2 uv = gl_FragCoord.xy / uRes.xy;
        vec2 p = (gl_FragCoord.xy - 0.5 * uRes.xy) / min(uRes.x, uRes.y);
        float t = uTime * 0.045;
        float n = fbm(p * 2.2 + vec2(t, -t * 0.7));
        float n2 = fbm(p * 5.4 - vec2(t * 1.7, t));
        float contour = smoothstep(0.015, 0.0, abs(fract((n + n2 * 0.35) * 7.0) - 0.5));
        float wash = smoothstep(0.22, 0.88, n);
        float vignette = 1.0 - smoothstep(0.28, 0.92, length(p));
        vec3 col = mix(uPaper, uInk, wash * 0.42 + contour * 0.18);
        col = mix(col, uAccent, (0.18 + 0.25 * n2) * contour);
        float alpha = uStrength * (0.18 + wash * 0.42 + contour * 0.30) * (0.55 + 0.45 * vignette);
        gl_FragColor = vec4(col, alpha);
      }
    `;

    function shader(type, source) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, source);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    }

    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vert));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "uRes");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uInk = gl.getUniformLocation(program, "uInk");
    const uPaper = gl.getUniformLocation(program, "uPaper");
    const uAccent = gl.getUniformLocation(program, "uAccent");
    const uStrength = gl.getUniformLocation(program, "uStrength");
    const ink = rgb(opts.ink, [0.10, 0.18, 0.12]);
    const paper = rgb(opts.paper, [0.96, 0.94, 0.90]);
    const accent = rgb(opts.accent, [0.18, 0.42, 0.31]);

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function draw(time) {
      resize();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, opts.frozenTime == null ? time * 0.001 : opts.frozenTime);
      gl.uniform3f(uInk, ink[0], ink[1], ink[2]);
      gl.uniform3f(uPaper, paper[0], paper[1], paper[2]);
      gl.uniform3f(uAccent, accent[0], accent[1], accent[2]);
      gl.uniform1f(uStrength, opts.strength == null ? 0.34 : opts.strength);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    draw(0);
    if (opts.frozenTime == null) requestAnimationFrame(draw);
    return { mode: "webgl", redraw: () => draw(0) };
  }

  window.MagazineBg = { mount };
})();
