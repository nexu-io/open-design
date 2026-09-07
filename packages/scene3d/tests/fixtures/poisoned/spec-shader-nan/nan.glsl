vec4 kernel(vec2 uv) {
  // 1/0 at runtime: uv.x - uv.x is zero for every fragment.
  return vec4(vec3(1.0) / max(uv.x - uv.x, 0.0), 1.0);
}
