precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColor;
uniform float uState; // 0=idle, 1=thinking, 2=writing, 3=tool, 4=communicating, 5=error
uniform float uSpawnProgress; // 0→1 during spawn animation

varying vec2 vUv;

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);
  float t = uTime;

  // ── Core shape — organic metaball cluster ──
  float core = length(uv) - 0.25 * uSpawnProgress;

  // Orbiting satellite blobs — count and speed change with state
  float numBlobs = 2.0 + uState;
  float orbitSpeed = 1.0 + uState * 0.3;
  float blobs = 999.0;
  for (float i = 0.0; i < 6.0; i++) {
    if (i >= numBlobs) break;
    float angle = i * 6.283 / numBlobs + t * orbitSpeed * (0.5 + 0.3 * i);
    float radius = 0.18 + 0.03 * sin(t * 2.0 + i * 1.5);
    vec2 pos = vec2(cos(angle), sin(angle)) * radius;
    float blobSize = 0.06 + 0.02 * sin(t * 3.0 + i);
    float blob = length(uv - pos) - blobSize * uSpawnProgress;
    blobs = smin(blobs, blob, 0.12);
  }

  // Smooth union core + blobs
  float shape = smin(core, blobs, 0.15);

  // ── Surface rendering ──
  float edge = smoothstep(0.01, -0.01, shape);

  // Inner glow gradient
  float innerDist = length(uv);
  float innerGlow = exp(-innerDist * innerDist * 8.0) * edge;

  // Fresnel-like rim
  float rim = smoothstep(-0.02, 0.01, shape) * smoothstep(0.04, 0.0, shape);

  // Color composition
  vec3 col = vec3(0.0);

  // Core fill
  col += uColor * edge * 0.6;
  // Bright center
  col += uColor * 1.5 * innerGlow * 0.4;
  // Rim light
  col += (uColor + vec3(0.2)) * rim * 0.8;

  // ── State-specific effects ──

  // Thinking: breathing pulse
  if (uState > 0.5 && uState < 1.5) {
    float breathe = sin(t * 3.0) * 0.5 + 0.5;
    col += uColor * 0.3 * breathe * edge;
  }

  // Writing: rapid inner flicker
  if (uState > 1.5 && uState < 2.5) {
    float flicker = hash(vec2(floor(t * 20.0), 0.0));
    col += uColor * 0.4 * flicker * innerGlow;
  }

  // Tool call: rotating highlight
  if (uState > 2.5 && uState < 3.5) {
    float rotHighlight = smoothstep(0.3, 0.0, abs(atan(uv.y, uv.x) - t * 4.0));
    col += uColor * 0.5 * rotHighlight * edge;
  }

  // Error: red pulse
  if (uState > 4.5) {
    float errorPulse = sin(t * 8.0) * 0.5 + 0.5;
    col = mix(col, vec3(1.0, 0.15, 0.1), errorPulse * 0.6 * edge);
  }

  // Ambient glow around shape
  float outerGlow = exp(-shape * shape * 30.0) * 0.25;
  col += uColor * outerGlow * (0.5 + 0.5 * uSpawnProgress);

  // Alpha
  float alpha = edge + outerGlow * 0.6;

  // Spawn animation — grow from nothing
  alpha *= uSpawnProgress;

  gl_FragColor = vec4(col, alpha);
}
