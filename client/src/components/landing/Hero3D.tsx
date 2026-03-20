/**
 * Hero3D — Ray-Marched SDF Metaball Scene
 *
 * Liquid metaballs rendered via ray marching in a custom fragment shader.
 * Mouse-reactive, organic movement, fresnel + specular lighting.
 * Colors: kriptik lime → cyan → amber gradient on surface normals.
 *
 * Dependencies: @react-three/fiber, three
 */

import { useRef, useMemo, useCallback } from 'react'
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
uniform float uScroll;

// ── SDF Primitives ──
float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

// Smooth union — the liquid blend between metaballs
float opSmoothUnion(float d1, float d2, float k) {
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

// ── Scene Definition ──
float sceneSDF(vec3 p) {
  float t = uTime * 0.4;

  // 6 metaballs with organic orbits
  float d1 = sdSphere(p - vec3(
    sin(t * 0.7) * 1.8,
    cos(t * 0.5) * 1.2,
    sin(t * 0.3) * 0.6
  ), 0.85);

  float d2 = sdSphere(p - vec3(
    cos(t * 0.6) * 1.5,
    sin(t * 0.9) * 0.9,
    cos(t * 0.4) * 0.8
  ), 0.72);

  float d3 = sdSphere(p - vec3(
    sin(t * 0.5 + 2.0) * 1.1,
    cos(t * 0.35) * 1.5,
    sin(t * 0.7 + 1.0) * 0.5
  ), 0.65);

  float d4 = sdSphere(p - vec3(
    cos(t * 0.8 + 1.5) * 0.9,
    sin(t * 0.6 + 3.0) * 0.7,
    cos(t * 0.5 + 2.0) * 1.1
  ), 0.58);

  float d5 = sdSphere(p - vec3(
    sin(t * 0.45 + 4.0) * 1.3,
    cos(t * 0.7 + 1.0) * 1.0,
    sin(t * 0.55 + 3.0) * 0.7
  ), 0.62);

  // Mouse-reactive metaball
  float d6 = sdSphere(p - vec3(
    uMouse.x * 3.0,
    uMouse.y * 2.0,
    0.5
  ), 0.55);

  // Smooth blend all together — k controls liquid smoothness
  float d = opSmoothUnion(d1, d2, 0.65);
  d = opSmoothUnion(d, d3, 0.55);
  d = opSmoothUnion(d, d4, 0.5);
  d = opSmoothUnion(d, d5, 0.6);
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

// ── Ray Marching ──
float rayMarch(vec3 ro, vec3 rd) {
  float d = 0.0;
  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * d;
    float ds = sceneSDF(p);
    if (ds < 0.002) return d;
    d += ds;
    if (d > 40.0) break;
  }
  return -1.0;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

  // Camera
  vec3 ro = vec3(0.0, 0.0, 5.5);
  vec3 rd = normalize(vec3(uv * 1.1, -1.5));

  // Background — very dark with subtle gradient
  vec3 col = mix(
    vec3(0.035, 0.035, 0.04),
    vec3(0.02, 0.025, 0.035),
    vUv.y
  );

  float d = rayMarch(ro, rd);

  if (d > 0.0) {
    vec3 p = ro + rd * d;
    vec3 n = calcNormal(p);

    // Multi-light setup
    vec3 light1Dir = normalize(vec3(2.0, 3.0, 4.0));
    vec3 light2Dir = normalize(vec3(-3.0, 1.0, 2.0));
    vec3 light3Dir = normalize(vec3(0.0, -2.0, 3.0));

    // Diffuse
    float diff1 = max(dot(n, light1Dir), 0.0);
    float diff2 = max(dot(n, light2Dir), 0.0);
    float diff3 = max(dot(n, light3Dir), 0.0);

    // Specular (Phong)
    vec3 viewDir = -rd;
    float spec1 = pow(max(dot(reflect(-light1Dir, n), viewDir), 0.0), 48.0);
    float spec2 = pow(max(dot(reflect(-light2Dir, n), viewDir), 0.0), 32.0);
    float spec3 = pow(max(dot(reflect(-light3Dir, n), viewDir), 0.0), 64.0);

    // Fresnel — rim lighting for liquid glass look
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.5);

    // Color: gradient across surface normal direction
    // Lime on top, cyan on sides, amber underneath
    vec3 limeColor = vec3(0.78, 1.0, 0.39);    // #c8ff64
    vec3 cyanColor = vec3(0.024, 0.714, 0.831); // #06b6d4
    vec3 amberColor = vec3(0.961, 0.620, 0.043); // #f59e0b

    float yBlend = n.y * 0.5 + 0.5; // 0 at bottom, 1 at top
    float xBlend = abs(n.x);

    vec3 baseColor = mix(amberColor, limeColor, yBlend);
    baseColor = mix(baseColor, cyanColor, xBlend * 0.5);

    // Combine lighting
    vec3 diffuse = baseColor * (diff1 * 0.5 + diff2 * 0.3 + diff3 * 0.2);
    vec3 specular = vec3(1.0) * (spec1 * 0.5 + spec2 * 0.25 + spec3 * 0.3);
    vec3 rim = baseColor * fresnel * 0.6;
    vec3 ambient = baseColor * 0.08;

    col = diffuse + specular + rim + ambient;

    // Subtle subsurface scattering approximation
    float sss = pow(max(dot(viewDir, -light1Dir + n * 0.5), 0.0), 3.0) * 0.15;
    col += limeColor * sss;
  }

  // Vignette
  float vig = 1.0 - pow(length(vUv - 0.5) * 1.3, 2.5);
  col *= max(vig, 0.0);

  // Subtle film grain
  float grain = fract(sin(dot(vUv * uTime, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.015;

  // Tone mapping (simple Reinhard)
  col = col / (col + vec3(1.0));

  gl_FragColor = vec4(col, 1.0);
}
`

/* ═══════════════════════════════════════════
   R3F COMPONENTS
   ═══════════════════════════════════════════ */

function MetaballPlane() {
  const meshRef = useRef<THREE.Mesh>(null!)
  const materialRef = useRef<THREE.ShaderMaterial>(null!)
  const { size, pointer } = useThree()
  const mouseSmooth = useRef(new THREE.Vector2(0, 0))

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uScroll: { value: 0 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  useFrame(({ clock }) => {
    if (!materialRef.current) return

    materialRef.current.uniforms.uTime.value = clock.elapsedTime

    // Smooth mouse following
    mouseSmooth.current.x += (pointer.x * 0.5 - mouseSmooth.current.x) * 0.03
    mouseSmooth.current.y += (pointer.y * 0.5 - mouseSmooth.current.y) * 0.03
    materialRef.current.uniforms.uMouse.value.copy(mouseSmooth.current)
  })

  return (
    <mesh ref={meshRef}>
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
