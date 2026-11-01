export type ChromaKeyingParameters = {
  algorithm: "dominance-v2";
  mode: "green" | "magenta";
  keyColor: [number, number, number];
  similarity: number;
  smoothness: number;
  dominanceStart: number;
  dominanceEnd: number;
  spillStart: number;
  spillEnd: number;
  spill: number;
};

export type ChromaVideoRendererOptions = {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  frameCount: number;
  fps: number;
  keying?: ChromaKeyingParameters;
  keyColor?: [number, number, number];
  similarity?: number;
  smoothness?: number;
  spill?: number;
  maxDpr?: number;
  onFrame?: (frame: number, seekMilliseconds: number) => void;
};

export type ChromaVideoRenderer = {
  render(frame: number): void;
  startLive(): void;
  stopLive(): void;
  resize(): void;
  destroy(): void;
};

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vTextureCoordinate;
uniform vec2 uUvScale;
uniform vec2 uUvOffset;

void main() {
  vec2 normalized = (aPosition + 1.0) * 0.5;
  vTextureCoordinate = normalized * uUvScale + uUvOffset;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 vTextureCoordinate;
uniform sampler2D uTexture;
uniform vec3 uKeyColor;
uniform float uSimilarity;
uniform float uSmoothness;
uniform float uKeyMode;
uniform float uDominanceStart;
uniform float uDominanceEnd;
uniform float uSpillStart;
uniform float uSpillEnd;
uniform float uSpill;

vec2 chroma(vec3 color) {
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  return vec2(color.b - luminance, color.r - luminance);
}

void main() {
  vec4 sampleColor = texture2D(uTexture, vTextureCoordinate);
  float distanceFromKey = distance(chroma(sampleColor.rgb), chroma(uKeyColor));
  float distanceAlpha = smoothstep(
    uSimilarity,
    uSimilarity + max(0.0001, uSmoothness),
    distanceFromKey
  );

  vec3 color = sampleColor.rgb;
  float greenDominance = color.g - max(color.r, color.b);
  float magentaDominance = min(color.r, color.b) - color.g;
  float keyDominance = mix(greenDominance, magentaDominance, uKeyMode);
  float dominanceMask = smoothstep(
    uDominanceStart,
    uDominanceEnd,
    keyDominance
  );
  float alpha = min(distanceAlpha, 1.0 - dominanceMask);
  float dominanceSpill = smoothstep(uSpillStart, uSpillEnd, keyDominance);
  float spillMask = clamp(
    max(dominanceSpill, (1.0 - alpha) * uSpill),
    0.0,
    1.0
  );
  if (uKeyMode < 0.5) {
    color.g = mix(color.g, max(color.r, color.b), spillMask);
  } else {
    color.r = mix(color.r, color.g, spillMask);
    color.b = mix(color.b, color.g, spillMask);
  }

  gl_FragColor = vec4(color * alpha, alpha);
}
`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("无法创建 WebGL Shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "未知 Shader 编译错误";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const program = gl.createProgram();
  if (!program) throw new Error("无法创建 WebGL Program");
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "未知 WebGL 链接错误";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function requiredLocation(
  value: WebGLUniformLocation | null,
  name: string,
): WebGLUniformLocation {
  if (value === null) throw new Error(`缺少 WebGL 变量：${name}`);
  return value;
}

export function createChromaVideoRenderer(
  options: ChromaVideoRendererOptions,
): ChromaVideoRenderer {
  const { video, canvas } = options;
  const frameCount = Math.max(1, Math.floor(options.frameCount));
  const fps = Math.max(1, options.fps);
  const legacyKeyColor = options.keyColor ?? [0, 255, 0];
  const keying: ChromaKeyingParameters = options.keying ?? {
    algorithm: "dominance-v2",
    mode:
      legacyKeyColor[0] >= legacyKeyColor[1] + 40 &&
      legacyKeyColor[2] >= legacyKeyColor[1] + 40
        ? "magenta"
        : "green",
    keyColor: legacyKeyColor,
    similarity: options.similarity ?? 0.12,
    smoothness: options.smoothness ?? 0.06,
    dominanceStart: 0,
    dominanceEnd: 0.12,
    spillStart: -0.005,
    spillEnd: 0.06,
    spill: options.spill ?? 1,
  };
  if (keying.algorithm !== "dominance-v2") {
    throw new Error(`不支持的色键算法：${keying.algorithm}`);
  }
  const maxDpr = options.maxDpr ?? 2;
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error("当前浏览器无法创建 WebGL 绿幕渲染器");

  const program = createProgram(gl);
  const positionLocation = gl.getAttribLocation(program, "aPosition");
  if (positionLocation < 0) throw new Error("缺少 WebGL 顶点位置变量");
  const uvScaleLocation = requiredLocation(
    gl.getUniformLocation(program, "uUvScale"),
    "uUvScale",
  );
  const uvOffsetLocation = requiredLocation(
    gl.getUniformLocation(program, "uUvOffset"),
    "uUvOffset",
  );
  const keyColorLocation = requiredLocation(
    gl.getUniformLocation(program, "uKeyColor"),
    "uKeyColor",
  );
  const similarityLocation = requiredLocation(
    gl.getUniformLocation(program, "uSimilarity"),
    "uSimilarity",
  );
  const smoothnessLocation = requiredLocation(
    gl.getUniformLocation(program, "uSmoothness"),
    "uSmoothness",
  );
  const keyModeLocation = requiredLocation(
    gl.getUniformLocation(program, "uKeyMode"),
    "uKeyMode",
  );
  const dominanceStartLocation = requiredLocation(
    gl.getUniformLocation(program, "uDominanceStart"),
    "uDominanceStart",
  );
  const dominanceEndLocation = requiredLocation(
    gl.getUniformLocation(program, "uDominanceEnd"),
    "uDominanceEnd",
  );
  const spillStartLocation = requiredLocation(
    gl.getUniformLocation(program, "uSpillStart"),
    "uSpillStart",
  );
  const spillEndLocation = requiredLocation(
    gl.getUniformLocation(program, "uSpillEnd"),
    "uSpillEnd",
  );
  const spillLocation = requiredLocation(
    gl.getUniformLocation(program, "uSpill"),
    "uSpill",
  );

  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (!buffer || !texture) throw new Error("无法创建 WebGL 缓冲区");
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);

  let destroyed = false;
  let seeking = false;
  let pendingFrame: number | null = 0;
  let requestedFrame = 0;
  let seekStartedAt = 0;
  let live = false;
  let liveHandle = 0;

  const resize = () => {
    if (destroyed) return;
    const rectangle = canvas.getBoundingClientRect();
    const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rectangle.width * dpr));
    const height = Math.max(1, Math.round(rectangle.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
  };

  const updateCoverTransform = () => {
    const sourceAspect = video.videoWidth / Math.max(1, video.videoHeight);
    const canvasAspect = canvas.width / Math.max(1, canvas.height);
    let scaleX = 1;
    let scaleY = 1;
    if (sourceAspect > canvasAspect) scaleX = canvasAspect / sourceAspect;
    else scaleY = sourceAspect / canvasAspect;
    gl.uniform2f(uvScaleLocation, scaleX, scaleY);
    gl.uniform2f(uvOffsetLocation, (1 - scaleX) / 2, (1 - scaleY) / 2);
  };

  let contextLost = false;

  const draw = () => {
    if (destroyed || contextLost || video.readyState < video.HAVE_CURRENT_DATA) return;
    resize();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      video,
    );
    updateCoverTransform();
    gl.uniform3f(
      keyColorLocation,
      keying.keyColor[0] / 255,
      keying.keyColor[1] / 255,
      keying.keyColor[2] / 255,
    );
    gl.uniform1f(similarityLocation, keying.similarity);
    gl.uniform1f(smoothnessLocation, keying.smoothness);
    gl.uniform1f(keyModeLocation, keying.mode === "magenta" ? 1 : 0);
    gl.uniform1f(dominanceStartLocation, keying.dominanceStart);
    gl.uniform1f(dominanceEndLocation, keying.dominanceEnd);
    gl.uniform1f(spillStartLocation, keying.spillStart);
    gl.uniform1f(spillEndLocation, keying.spillEnd);
    gl.uniform1f(spillLocation, keying.spill);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const cancelLiveFrame = () => {
    if (!liveHandle) return;
    if (video.cancelVideoFrameCallback) {
      video.cancelVideoFrameCallback(liveHandle);
    } else {
      cancelAnimationFrame(liveHandle);
    }
    liveHandle = 0;
  };

  const scheduleLiveFrame = () => {
    cancelLiveFrame();
    if (!live || destroyed) return;
    const callback = () => {
      liveHandle = 0;
      if (!live || destroyed) return;
      draw();
      scheduleLiveFrame();
    };
    if (video.requestVideoFrameCallback) {
      liveHandle = video.requestVideoFrameCallback(callback);
    } else {
      liveHandle = requestAnimationFrame(callback);
    }
  };

  const flush = () => {
    if (
      destroyed ||
      seeking ||
      pendingFrame === null ||
      !Number.isFinite(video.duration) ||
      video.duration <= 0
    ) return;
    const nextFrame = pendingFrame;
    pendingFrame = null;
    const nextTime = Math.min(
      nextFrame / fps,
      Math.max(0, video.duration - 1 / fps),
    );
    if (Math.abs(video.currentTime - nextTime) <= 1 / (fps * 2)) {
      draw();
      options.onFrame?.(nextFrame, 0);
      return;
    }
    requestedFrame = nextFrame;
    seeking = true;
    seekStartedAt = performance.now();
    video.currentTime = nextTime;
  };

  const handleSeeked = () => {
    seeking = false;
    if (pendingFrame !== null) {
      if (pendingFrame !== requestedFrame) {
        flush();
        return;
      }
      pendingFrame = null;
    }
    draw();
    options.onFrame?.(requestedFrame, performance.now() - seekStartedAt);
    flush();
  };
  const handleLoaded = () => {
    video.pause();
    draw();
    flush();
  };
  const handleVideoError = () => {
    seeking = false;
    pendingFrame = null;
  };
  const handleContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    cancelLiveFrame();
  };
  const handleContextRestored = () => {
    contextLost = false;
    draw();
  };
  const resizeObserver = new ResizeObserver(() => draw());
  resizeObserver.observe(canvas);
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.addEventListener("loadeddata", handleLoaded);
  video.addEventListener("seeked", handleSeeked);
  video.addEventListener("error", handleVideoError);
  canvas.addEventListener("webglcontextlost", handleContextLost);
  canvas.addEventListener("webglcontextrestored", handleContextRestored);
  if (video.readyState >= video.HAVE_CURRENT_DATA) handleLoaded();

  return {
    render(frame: number) {
      pendingFrame = Math.round(clamp(frame, 0, frameCount - 1));
      flush();
    },
    startLive() {
      live = true;
      draw();
      scheduleLiveFrame();
    },
    stopLive() {
      live = false;
      cancelLiveFrame();
    },
    resize,
    destroy() {
      destroyed = true;
      live = false;
      cancelLiveFrame();
      resizeObserver.disconnect();
      video.removeEventListener("loadeddata", handleLoaded);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleVideoError);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}
