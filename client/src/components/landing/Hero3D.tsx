/**
 * Hero3D — Ray-Marched SDF Metaball Scene
 *
 * Liquid metaballs rendered via ray marching in a custom fragment shader.
 * Mouse-reactive, organic movement with noise-warped positions.
 * Iridescent fresnel coloring, subsurface scattering, chromatic aberration.
 * Colors: kriptik lime / cyan / amber mapped via surface normals.
 *
 * Dependencies: @react-three/fiber, three
 */

import { useRef, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/* ═══════════════════════════════════════════
   RAY-MARCHED SDF METABALL SHADER
   ═══════════════════════════════════════════ */

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
precision highp float;

varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;

// ── Constants ──
#define MAX_STEPS 80
#define MAX_DIST 40.0
#define SURF_DIST 0.002
#define AO_STEPS 3
#define PI 3.14159265

// ── Palette ──
const vec3 LIME  = vec3(0.78, 1.0, 0.39);
const vec3 CYAN  = vec3(0.024, 0.714, 0.831);
const vec3 AMBER = vec3(0.961, 0.620, 0.043);
const vec3 BG    = vec3(0.039, 0.039, 0.039);

// ── Hash-based 3D noise ──
mediump float hash3(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

mediump float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash3(i);
  float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
  float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
  float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
  float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
  float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
  float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
  float n111 = hash3(i + vec3(1.0, 1.0, 1.0));

  float n00 = mix(n000, n001, f.z);
  float n01 = mix(n010, n011, f.z);
  float n10 = mix(n100, n101, f.z);
  float n11 = mix(n110, n111, f.z);

  float n0 = mix(n00, n01, f.y);
  float n1 = mix(n10, n11, f.y);

  return mix(n0, n1, f.x);
}

// ── FBM (3 octaves) ──
mediump float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  vec3 shift = vec3(100.0);
  for (int i = 0; i < 3; i++) {
    v += a * noise3(p);
    p = p * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

// ── SDF Primitives ──
float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

// Smooth union — liquid blend between metaballs
float opSmoothUnion(float d1, float d2, float k) {
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

// ── Noise-warped metaball position ──
vec3 warpPos(vec3 center, float t) {
  float n = noise3(center * 1.5 + t * 0.3);
  return center + (n - 0.5) * 0.35;
}

// ── Scene Definition ──
float sceneSDF(vec3 p) {
  float t = uTime * 0.35;

  // 5 metaballs with organic orbits + noise warp
  vec3 c1 = vec3(
    sin(t * 0.7) * 1.8,
    cos(t * 0.5) * 1.2,
    sin(t * 0.3) * 0.6
  );
  float d1 = sdSphere(p - warpPos(c1, t), 0.85);

  vec3 c2 = vec3(
    cos(t * 0.6) * 1.5,
    sin(t * 0.85) * 0.9,
    cos(t * 0.4) * 0.8
  );
  float d2 = sdSphere(p - warpPos(c2, t + 7.0), 0.72);

  vec3 c3 = vec3(
    sin(t * 0.5 + 2.0) * 1.1,
    cos(t * 0.35) * 1.5,
    sin(t * 0.65 + 1.0) * 0.5
  );
  float d3 = sdSphere(p - warpPos(c3, t + 13.0), 0.65);

  vec3 c4 = vec3(
    cos(t * 0.75 + 1.5) * 0.9,
    sin(t * 0.55 + 3.0) * 0.7,
    cos(t * 0.5 + 2.0) * 1.1
  );
  float d4 = sdSphere(p - warpPos(c4, t + 21.0), 0.58);

  vec3 c5 = vec3(
    sin(t * 0.45 + 4.0) * 1.3,
    cos(t * 0.65 + 1.0) * 1.0,
    sin(t * 0.55 + 3.0) * 0.7
  );
  float d5 = sdSphere(p - warpPos(c5, t + 31.0), 0.62);

  // Mouse-reactive metaball
  float d6 = sdSphere(p - vec3(
    uMouse.x * 3.0,
    uMouse.y * 2.0,
    0.5
  ), 0.55);

  // Smooth blend — k values between 0.5-0.7 for liquid feel
  float d = opSmoothUnion(d1, d2, 0.65);
  d = opSmoothUnion(d, d3, 0.55);
  d = opSmoothUnion(d, d4, 0.6);
  d = opSmoothUnion(d, d5, 0.55);
  d = opSmoothUnion(d, d6, 0.7);

  return d;
}

// ── Normal Calculation ──
vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(
    sceneSDF(p + e.xyy) - sceneSDF(p - e.xyy),
    sceneSDF(p + e.yxy) - sceneSDF(p - e.yxy),
    sceneSDF(p + e.yyx) - sceneSDF(p - e.yyx)
  ));
}

// ── 3-step Ambient Occlusion ──
float calcAO(vec3 p, vec3 n) {
  float ao = 0.0;
  float weight = 1.0;
  for (int i = 1; i <= AO_STEPS; i++) {
    float dist = 0.06 * float(i);
    float sd = sceneSDF(p + n * dist);
    ao += weight * (dist - sd);
    weight *= 0.5;
  }
  return clamp(1.0 - 3.0 * ao, 0.0, 1.0);
}

// ── Iridescent color shift ──
vec3 iridescence(float angle, float t) {
  // Rainbow hue shift based on viewing angle and time
  float hue = angle * 2.0 + t * 0.15;
  vec3 c = vec3(
    sin(hue) * 0.5 + 0.5,
    sin(hue + 2.094) * 0.5 + 0.5,
    sin(hue + 4.189) * 0.5 + 0.5
  );
  return c;
}

// ── Ray Marching ──
float rayMarch(vec3 ro, vec3 rd) {
  float d = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 p = ro + rd * d;
    float ds = sceneSDF(p);
    if (ds < SURF_DIST) return d;
    d += ds;
    if (d > MAX_DIST) break;
  }
  return -1.0;
}

// ── Shade a single channel at a given UV (for chromatic aberration) ──
vec3 shade(vec3 ro, vec3 rd, vec2 uv) {
  float d = rayMarch(ro, rd);

  // Background with FBM glow spots
  vec3 col = BG;
  vec3 bgNoise = vec3(fbm(vec3(uv * 3.0, uTime * 0.08)));
  // Subtle glow spots — warm tones in noise peaks
  float glowSpot = smoothstep(0.48, 0.7, bgNoise.x);
  col += mix(LIME, CYAN, uv.x + 0.5) * glowSpot * 0.04;
  col += vec3(0.015, 0.012, 0.02) * (1.0 - uv.y * 0.5); // subtle vertical gradient

  if (d > 0.0) {
    vec3 p = ro + rd * d;
    vec3 n = calcNormal(p);
    vec3 viewDir = -rd;

    // ── Lights ──
    vec3 l1 = normalize(vec3(2.0, 3.0, 4.0));
    vec3 l2 = normalize(vec3(-3.0, 1.0, 2.0));
    vec3 l3 = normalize(vec3(0.0, -2.0, 3.0));

    // Diffuse
    float diff1 = max(dot(n, l1), 0.0);
    float diff2 = max(dot(n, l2), 0.0);
    float diff3 = max(dot(n, l3), 0.0);

    // Specular (Blinn-Phong for sharper highlights)
    vec3 h1 = normalize(l1 + viewDir);
    vec3 h2 = normalize(l2 + viewDir);
    vec3 h3 = normalize(l3 + viewDir);
    float spec1 = pow(max(dot(n, h1), 0.0), 64.0);
    float spec2 = pow(max(dot(n, h2), 0.0), 48.0);
    float spec3 = pow(max(dot(n, h3), 0.0), 80.0);

    // Fresnel — enhanced rim lighting
    float NdotV = max(dot(n, viewDir), 0.0);
    float fresnel = pow(1.0 - NdotV, 4.0);
    // Schlick approximation with tinted rim
    float fresnelRim = 0.04 + 0.96 * fresnel;

    // Ambient occlusion
    float ao = calcAO(p, n);

    // ── Color mapping via surface normal ──
    float yBlend = n.y * 0.5 + 0.5; // 0 bottom, 1 top
    float xBlend = abs(n.x);

    vec3 baseColor = mix(AMBER, LIME, yBlend);
    baseColor = mix(baseColor, CYAN, xBlend * 0.5);

    // ── Iridescent shift ──
    float iridAngle = acos(NdotV);
    vec3 iridCol = iridescence(iridAngle, uTime);
    baseColor = mix(baseColor, iridCol, fresnel * 0.25);

    // ── Subsurface scattering approximation ──
    // Light wraps around the surface — strongest on lime color
    vec3 sssDir = l1 + n * 0.6;
    float sss = pow(clamp(dot(viewDir, normalize(sssDir)), 0.0, 1.0), 3.0);
    float sss2 = pow(clamp(dot(viewDir, normalize(l2 + n * 0.4)), 0.0, 1.0), 4.0);
    vec3 sssColor = LIME * sss * 0.2 + CYAN * sss2 * 0.08;

    // ── Combine lighting ──
    vec3 diffuse = baseColor * (diff1 * 0.5 + diff2 * 0.3 + diff3 * 0.2);
    vec3 specular = vec3(1.0, 0.98, 0.95) * (spec1 * 0.5 + spec2 * 0.25 + spec3 * 0.3);
    vec3 rim = mix(LIME, CYAN, fresnel) * fresnelRim * 0.55;
    vec3 ambient = baseColor * 0.06;

    col = (diffuse + ambient) * ao + specular + rim + sssColor;
  }

  return col;
}

void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 uv = (vUv - 0.5) * vec2(aspect, 1.0);

  // Camera
  vec3 ro = vec3(0.0, 0.0, 5.5);
  vec3 rd = normalize(vec3(uv * 1.1, -1.5));

  // ── Chromatic Aberration ──
  // Shift R and B ray directions based on distance from center
  float distFromCenter = length(uv);
  float caStrength = distFromCenter * 0.008;

  vec2 uvR = uv + normalize(uv + 0.001) * caStrength;
  vec2 uvB = uv - normalize(uv + 0.001) * caStrength;

  vec3 rdR = normalize(vec3(uvR * 1.1, -1.5));
  vec3 rdB = normalize(vec3(uvB * 1.1, -1.5));

  // Shade each channel with slightly offset rays
  float colR = shade(ro, rdR, uvR).r;
  vec3 colG_full = shade(ro, rd, uv);
  float colG = colG_full.g;
  float colB = shade(ro, rdB, uvB).b;

  vec3 col = vec3(colR, colG, colB);

  // ── Vignette ──
  float vig = 1.0 - pow(distFromCenter * 1.1, 2.8);
  col *= clamp(vig, 0.0, 1.0);

  // ── Film Grain ──
  float grain = fract(sin(dot(vUv * (uTime + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.018;

  // ── Reinhard Tone Mapping ──
  col = col / (col + vec3(1.0));

  // ── Gamma correction ──
  col = pow(col, vec3(1.0 / 2.2));

  gl_FragColor = vec4(col, 1.0);
}
`

/* ═══════════════════════════════════════════
   R3F COMPONENTS
   ═══════════════════════════════════════════ */

function MetaballPlane() {
  const materialRef = useRef<THREE.ShaderMaterial>(null!)
  const { size, pointer } = useThree()
  const mouseSmooth = useRef(new THREE.Vector2(0, 0))

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
      uMouse: { value: new THREE.Vector2(0, 0) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  useFrame(({ clock, size: frameSize }) => {
    if (!materialRef.current) return

    materialRef.current.uniforms.uTime.value = clock.elapsedTime
    materialRef.current.uniforms.uResolution.value.set(frameSize.width, frameSize.height)

    // Smooth mouse following (lerp 0.03)
    mouseSmooth.current.x += (pointer.x * 0.5 - mouseSmooth.current.x) * 0.03
    mouseSmooth.current.y += (pointer.y * 0.5 - mouseSmooth.current.y) * 0.03
    materialRef.current.uniforms.uMouse.value.copy(mouseSmooth.current)
  })

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  )
}

/* ═══════════════════════════════════════════
   CANVAS EXPORT
   ═══════════════════════════════════════════ */

export default function Hero3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 1], fov: 45 }}
      dpr={[1, 1.5]}
      gl={{
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false,
        depth: false,
      }}
      style={{ position: 'absolute', inset: 0 }}
      performance={{ min: 0.5 }}
    >
      <MetaballPlane />
    </Canvas>
  )
}
