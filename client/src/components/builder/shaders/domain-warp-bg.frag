precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uAgentCount; // drives visual intensity
uniform float uBuildActive; // 0 or 1

varying vec2 vUv;

// Hash and noise
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Fractal Brownian Motion
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = rot * p * 2.1 + vec2(100.0);
    a *= 0.5;
  }
  return v;
}

// Domain warping — feed noise into noise for surreal organic patterns
float domainWarp(vec2 p) {
  float t = uTime * 0.08;
  vec2 q = vec2(
    fbm(p + vec2(1.7, 9.2) + t * 0.3),
    fbm(p + vec2(8.3, 2.8) + t * 0.2)
  );
  vec2 r = vec2(
    fbm(p + 4.0 * q + vec2(1.2, 3.4) + t * 0.15),
    fbm(p + 4.0 * q + vec2(5.1, 7.3) + t * 0.1)
  );
  return fbm(p + 4.0 * r);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  // Scale UV for noise detail
  vec2 p = uv * 3.0;

  float warp = domainWarp(p);

  // Color palette — deep blacks, warm underlighting
  vec3 darkBase = vec3(0.02, 0.02, 0.03); // near-black
  vec3 warmDeep = vec3(0.08, 0.04, 0.01); // deep warm brown
  vec3 limeHint = vec3(0.15, 0.25, 0.05); // subtle lime
  vec3 amberHint = vec3(0.2, 0.12, 0.02); // subtle amber

  // Layer the warped noise into color
  vec3 col = darkBase;
  col = mix(col, warmDeep, smoothstep(0.3, 0.6, warp) * 0.6);
  col = mix(col, limeHint, smoothstep(0.5, 0.8, warp) * 0.15 * uBuildActive);
  col = mix(col, amberHint, smoothstep(0.6, 0.9, warp) * 0.1);

  // Agent activity adds energy to the warp
  float activityBoost = uAgentCount * 0.02;
  col += limeHint * activityBoost * smoothstep(0.4, 0.7, warp);

  // Subtle vignette
  float vignette = 1.0 - length((uv - 0.5) * 1.5);
  vignette = smoothstep(0.0, 0.7, vignette);
  col *= vignette;

  // Very subtle grain for texture
  float grain = hash21(uv * uResolution + uTime) * 0.015;
  col += grain;

  gl_FragColor = vec4(col, 1.0);
}
