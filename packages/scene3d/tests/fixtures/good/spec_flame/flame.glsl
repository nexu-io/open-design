// Looping fire flipbook. Time enters ONLY through the unit circle
// (cos/sin of 2*pi*t), so cell 15 flows seamlessly back into cell 0 —
// the discipline every looping flipbook kernel should follow.
vec4 kernel(vec2 uv) {
  float t = uS3dTime * 6.283185307179586;
  vec2 loopOffset = vec2(cos(t), sin(t)) * 0.9;
  float turbulence = s3d_fbm(vec2(uv.x * 4.0, uv.y * 3.0) + loopOffset);
  // Flame body: widest at the base, licked narrower by turbulence upward.
  float core = uv.y + (turbulence - 0.5) * 0.55 * uv.y;
  float body = smoothstep(0.95, 0.25, core) * smoothstep(0.0, 0.12, uv.y);
  float width = 1.0 - abs(uv.x - 0.5) * (1.6 + core * 2.2);
  float flame = clamp(body * smoothstep(0.0, 0.45, width), 0.0, 1.0);
  vec3 hot = vec3(1.0, 0.93, 0.55);
  vec3 mid = vec3(1.0, 0.45, 0.08);
  vec3 cool = vec3(0.75, 0.08, 0.02);
  vec3 col = mix(cool, mix(mid, hot, smoothstep(0.45, 0.9, flame)), smoothstep(0.1, 0.6, flame));
  return vec4(col * flame, flame);
}
