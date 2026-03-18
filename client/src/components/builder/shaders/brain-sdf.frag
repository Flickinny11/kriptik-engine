precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uActivity; // 0.0 = idle, 1.0 = intense activity
uniform float uReadPulse; // 0→1 when agent reads from brain
uniform float uWritePulse; // 0→1 when agent writes to brain
uniform vec3 uBaseColor; // warm lime: vec3(0.78, 1.0, 0.39)

varying vec2 vUv;

// Smooth min for organic metaball blending
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Noise function
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

// FBM for organic surface detail
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.1;
    a *= 0.5;
  }
  return v;
}

// The Brain SDF — organic neural form
float brainSDF(vec3 p) {
  float t = uTime * 0.5;

  // Core sphere
  float core = length(p) - 0.35;

  // Pulsing lobes — smooth union metaballs
  float pulse = 0.02 * sin(t * 2.0) * uActivity;
  float lobe1 = length(p - vec3(0.2 * sin(t * 0.7), 0.15 * cos(t * 0.5), 0.0)) - (0.2 + pulse);
  float lobe2 = length(p - vec3(-0.18 * cos(t * 0.6), 0.12 * sin(t * 0.8), 0.1)) - (0.18 + pulse);
  float lobe3 = length(p - vec3(0.0, -0.15 * sin(t * 0.4), 0.15 * cos(t * 0.9))) - (0.15 + pulse);

  // Synaptic tendrils that grow with activity
  float tendril1 = length(p - vec3(0.3 + 0.1 * uActivity, 0.25, 0.0)) - 0.06;
  float tendril2 = length(p - vec3(-0.28, -0.2 + 0.05 * sin(t), 0.15)) - 0.05;

  // Smooth union everything with organic blending
  float brain = smin(core, lobe1, 0.25);
  brain = smin(brain, lobe2, 0.22);
  brain = smin(brain, lobe3, 0.2);
  brain = smin(brain, tendril1, 0.15 + 0.05 * uActivity);
  brain = smin(brain, tendril2, 0.15 + 0.05 * uActivity);

  // Surface detail from FBM noise — wrinkled cortex texture
  float detail = fbm(p * 8.0 + t * 0.3) * 0.04;
  brain += detail;

  // Read/write pulse deformation
  float rwPulse = uReadPulse * 0.03 * sin(length(p) * 20.0 - t * 8.0);
  rwPulse += uWritePulse * 0.04 * sin(length(p) * 15.0 + t * 10.0);
  brain += rwPulse;

  return brain;
}

// Normal calculation
vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    brainSDF(p + e.xyy) - brainSDF(p - e.xyy),
    brainSDF(p + e.yxy) - brainSDF(p - e.yxy),
    brainSDF(p + e.yyx) - brainSDF(p - e.yyx)
  ));
}

// Ray march
float rayMarch(vec3 ro, vec3 rd) {
  float d = 0.0;
  for (int i = 0; i < 80; i++) {
    vec3 p = ro + rd * d;
    float ds = brainSDF(p);
    if (ds < 0.001) return d;
    d += ds;
    if (d > 5.0) break;
  }
  return -1.0;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);

  // Camera
  vec3 ro = vec3(0.0, 0.0, 1.5);
  vec3 rd = normalize(vec3(uv, -1.0));

  // March
  float d = rayMarch(ro, rd);

  vec4 col = vec4(0.0);

  if (d > 0.0) {
    vec3 p = ro + rd * d;
    vec3 n = calcNormal(p);

    // Lighting — warm key light + cool fill
    vec3 lightDir1 = normalize(vec3(0.8, 0.6, 0.5));
    vec3 lightDir2 = normalize(vec3(-0.5, 0.3, 0.8));
    float diff1 = max(dot(n, lightDir1), 0.0);
    float diff2 = max(dot(n, lightDir2), 0.0);

    // Specular
    vec3 viewDir = normalize(ro - p);
    vec3 halfDir = normalize(lightDir1 + viewDir);
    float spec = pow(max(dot(n, halfDir), 0.0), 32.0);

    // Fresnel rim glow
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);

    // Base color modulated by activity
    vec3 baseCol = uBaseColor;
    vec3 activeCol = vec3(1.0, 0.85, 0.3); // warm gold when active

    vec3 surfaceColor = mix(baseCol, activeCol, uActivity * 0.5);

    // Read pulse = cyan flash, Write pulse = amber flash
    surfaceColor += vec3(0.0, 0.8, 0.9) * uReadPulse * fresnel * 2.0;
    surfaceColor += vec3(1.0, 0.6, 0.1) * uWritePulse * fresnel * 2.0;

    // Subsurface scattering approximation
    float sss = max(dot(n, -lightDir1), 0.0) * 0.3;
    vec3 sssColor = surfaceColor * 0.6 * sss;

    // Compose
    vec3 color = surfaceColor * (diff1 * 0.7 + diff2 * 0.3) + spec * 0.4 + fresnel * surfaceColor * 0.5 + sssColor;

    // Ambient occlusion approximation from SDF
    float ao = 1.0 - smoothstep(0.0, 0.1, brainSDF(p + n * 0.05));
    color *= 0.7 + 0.3 * ao;

    float alpha = 1.0;
    // Soft edge
    alpha *= smoothstep(0.0, 0.02, -brainSDF(p));

    col = vec4(color, alpha);
  }

  // Ambient glow around the brain
  float glowDist = length(uv) - 0.3;
  float glow = exp(-glowDist * glowDist * 8.0) * (0.15 + 0.15 * uActivity);
  vec3 glowColor = mix(uBaseColor, vec3(1.0, 0.85, 0.3), uActivity * 0.4);
  col.rgb += glowColor * glow * (1.0 - col.a);
  col.a = max(col.a, glow * 0.5);

  gl_FragColor = col;
}
