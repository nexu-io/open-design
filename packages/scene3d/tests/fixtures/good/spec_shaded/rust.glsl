// Weathered rust: fbm patina between two authored tones, with a voronoi
// cell modulation for the flaked-paint read. Pure kernel — uniforms are
// declared in scene.json, scaffolding belongs to the compiler.
vec4 kernel(vec2 uv) {
  float patina = s3d_fbm(uv * uScale);
  float flakes = s3d_voronoi(uv * uScale * 0.5);
  vec3 col = mix(uColorA, uColorB, smoothstep(0.35, 0.75, patina));
  col *= 0.85 + 0.15 * flakes;
  return vec4(col, 1.0);
}

// Rust is rougher where the patina is thick.
vec4 kernel_roughness(vec2 uv) {
  float patina = s3d_fbm(uv * uScale);
  return vec4(vec3(clamp(0.55 + 0.4 * patina, 0.0, 1.0)), 1.0);
}
