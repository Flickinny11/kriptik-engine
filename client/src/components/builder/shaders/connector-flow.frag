precision highp float;

uniform float uTime;
uniform float uProgress; // 0-1 flow along the line
uniform vec3 uColor;     // agent's color
uniform float uIntensity; // 0=idle, 1=active transfer

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  vec2 uv = vUv;

  // Core line — thin bright center
  float dist = abs(uv.y - 0.5);
  float core = smoothstep(0.08, 0.0, dist);

  // Outer glow — wider, softer
  float glow = exp(-dist * dist * 40.0);

  // Flowing energy pulses along the line
  float flowSpeed = uTime * 3.0;
  float energyPulse = sin(uv.x * 30.0 - flowSpeed) * 0.5 + 0.5;
  energyPulse *= sin(uv.x * 12.0 - flowSpeed * 0.7) * 0.5 + 0.5;

  // Noise turbulence for organic feel
  float turb = noise(vec2(uv.x * 5.0 - uTime * 2.0, uv.y * 3.0)) * 0.3;

  // Combine
  float intensity = (core * 1.2 + glow * 0.4) * (0.3 + 0.7 * energyPulse + turb);
  intensity *= uIntensity;

  // Leading edge of transfer
  float edge = smoothstep(uProgress - 0.15, uProgress, uv.x) *
               smoothstep(uProgress + 0.01, uProgress, uv.x);
  intensity += edge * 2.0;

  // Color with chromatic slight shift at edges
  vec3 col = uColor;
  col += vec3(0.1, -0.05, 0.15) * glow * 0.3; // subtle hue shift in glow

  gl_FragColor = vec4(col * intensity, intensity * 0.9);
}
