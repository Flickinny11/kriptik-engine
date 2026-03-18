precision mediump float;

varying vec2 vTextureCoord;
varying vec2 vVertexPosition;

uniform sampler2D uSampler0; // DOM element texture
uniform float uTime;
uniform float uHover;        // 0-1
uniform float uActivity;     // 0-1 streaming state
uniform vec2 uMouse;         // normalized mouse position
uniform vec3 uAgentColor;    // agent's identity color
uniform float uCorrection;   // 1 when correction is being sent

// Noise
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1,0)), f.x),
    mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
    f.y);
}

void main() {
  vec2 uv = vTextureCoord;

  // ── Mouse-reactive displacement ──
  float dist = distance(uv, uMouse);
  float mouseInfluence = smoothstep(0.35, 0.0, dist) * uHover;
  // Refraction-like displacement — push pixels away from mouse
  vec2 dir = normalize(uv - uMouse + 0.001);
  vec2 displaced = uv + dir * mouseInfluence * 0.015;

  // ── Activity displacement — subtle liquid ripple when new content streams ──
  float ripple = sin(uv.y * 40.0 - uTime * 5.0) * 0.002 * uActivity;
  ripple += sin(uv.x * 25.0 + uTime * 3.0) * 0.001 * uActivity;
  displaced += vec2(ripple, ripple * 0.5);

  // ── Correction flash — amber chromatic distortion ──
  vec2 corrDisp = vec2(0.003, 0.001) * uCorrection * sin(uTime * 10.0);

  // ── Sample with chromatic aberration on hover ──
  float aberration = mouseInfluence * 0.003 + uCorrection * 0.004;
  float r = texture2D(uSampler0, displaced + corrDisp + vec2(aberration, 0.0)).r;
  float g = texture2D(uSampler0, displaced + corrDisp).g;
  float b = texture2D(uSampler0, displaced + corrDisp - vec2(aberration, 0.0)).b;
  float a = texture2D(uSampler0, displaced).a;

  vec3 color = vec3(r, g, b);

  // ── Edge glow in agent's color — depth indication ──
  float edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float edgeGlow = smoothstep(0.05, 0.0, edgeDist) * (0.15 + 0.25 * uHover);
  color += uAgentColor * edgeGlow;

  // ── Subtle heat distortion shimmer above active boxes ──
  float heatShimmer = noise(vec2(uv.x * 20.0, uTime * 2.0)) * 0.03 * uActivity;
  float topFade = smoothstep(0.1, 0.0, uv.y); // only at the top
  color += vec3(0.05, 0.03, 0.01) * heatShimmer * topFade;

  // ── Depth shadow — thick edge illusion ──
  float shadow = smoothstep(0.02, 0.0, edgeDist) * 0.4;
  color *= 1.0 - shadow * (1.0 - uHover * 0.5);

  gl_FragColor = vec4(color, a);
}
