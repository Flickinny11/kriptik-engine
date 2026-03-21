/**
 * BrainOrbit3D — R3F scene: glowing icosahedron core + orbiting metallic knowledge nodes
 *
 * Design_References.md §4, §8 — PBR materials, Environment, Bloom postprocessing
 * Dependencies: @react-three/fiber, @react-three/drei (Float, Environment),
 *               @react-three/postprocessing, gl-noise (Simplex vertex displacement)
 */

import { useRef, useMemo, useState, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Float, Environment } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { Common, Simplex } from 'gl-noise'

const NODES = [
  { color: '#c8ff64', size: 0.12, orbit: 1.8, speed: 0.3, tilt: 0.2, phase: 0 },
  { color: '#06b6d4', size: 0.10, orbit: 2.1, speed: 0.25, tilt: 0.8, phase: 1.2 },
  { color: '#f59e0b', size: 0.14, orbit: 1.5, speed: 0.35, tilt: 0.5, phase: 2.4 },
  { color: '#c8ff64', size: 0.11, orbit: 2.4, speed: 0.2, tilt: 1.1, phase: 3.6 },
  { color: '#06b6d4', size: 0.09, orbit: 1.7, speed: 0.4, tilt: 0.3, phase: 4.8 },
  { color: '#f59e0b', size: 0.13, orbit: 2.0, speed: 0.28, tilt: 0.9, phase: 0.8 },
  { color: '#c8ff64', size: 0.08, orbit: 2.6, speed: 0.22, tilt: 0.6, phase: 2.0 },
  { color: '#06b6d4', size: 0.10, orbit: 1.9, speed: 0.32, tilt: 1.3, phase: 3.2 },
  { color: '#f59e0b', size: 0.15, orbit: 1.4, speed: 0.38, tilt: 0.4, phase: 4.0 },
  { color: '#c8ff64', size: 0.12, orbit: 2.3, speed: 0.18, tilt: 1.0, phase: 5.2 },
  { color: '#06b6d4', size: 0.09, orbit: 2.5, speed: 0.26, tilt: 0.7, phase: 1.6 },
  { color: '#f59e0b', size: 0.11, orbit: 1.6, speed: 0.33, tilt: 1.2, phase: 4.4 },
]

/** Camera follows mouse for parallax depth effect */
function CameraRig() {
  const { camera } = useThree()
  const mouse = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2
      mouse.current.y = (e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('mousemove', handler)
    return () => window.removeEventListener('mousemove', handler)
  }, [])

  useFrame(() => {
    camera.position.x += (mouse.current.x * 0.6 - camera.position.x) * 0.02
    camera.position.y += (-mouse.current.y * 0.4 - camera.position.y) * 0.02
    camera.lookAt(0, 0, 0)
  })

  return null
}

/** gl-noise vertex shader for organic breathing displacement */
const CORE_VS = /* glsl */ `
${Common}
${Simplex}
uniform float uTime;
varying vec3 vNormal;
varying vec3 vPosition;
varying float vDisplacement;

void main() {
  // gl-noise simplex displacement — organic breathing
  float noise1 = gln_simplex(position * 2.5 + uTime * 0.4);
  float noise2 = gln_simplex(position * 5.0 - uTime * 0.3) * 0.5;
  float noise3 = gln_simplex(position * 1.2 + vec3(uTime * 0.15)) * 0.3;
  float displacement = (noise1 + noise2 + noise3) * 0.12;

  vec3 newPos = position + normal * displacement;
  vDisplacement = displacement;
  vNormal = normalMatrix * normal;
  vPosition = (modelViewMatrix * vec4(newPos, 1.0)).xyz;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
}
`

const CORE_FS = /* glsl */ `
uniform float uTime;
varying vec3 vNormal;
varying vec3 vPosition;
varying float vDisplacement;

void main() {
  vec3 lime  = vec3(0.78, 1.0, 0.39);
  vec3 cyan  = vec3(0.024, 0.714, 0.831);
  vec3 amber = vec3(0.961, 0.620, 0.043);

  // Fresnel rim glow
  vec3 viewDir = normalize(-vPosition);
  float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 3.0);

  // Color based on displacement + normal
  float blend = vDisplacement * 6.0 + 0.5;
  vec3 baseColor = mix(lime, cyan, clamp(blend, 0.0, 1.0));
  baseColor = mix(baseColor, amber, fresnel * 0.4);

  // Emissive glow
  float pulse = sin(uTime * 1.5) * 0.15 + 0.85;
  vec3 emission = baseColor * (0.6 + fresnel * 1.2) * pulse;

  gl_FragColor = vec4(emission, 0.35 + fresnel * 0.3);
}
`

/** Glowing glass-like icosahedron core with gl-noise vertex displacement */
function GlassCore() {
  const ref = useRef<THREE.Mesh>(null!)
  const matRef = useRef<THREE.ShaderMaterial>(null!)

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
  }), [])

  useFrame(({ clock }) => {
    if (!ref.current || !matRef.current) return
    ref.current.rotation.y = clock.elapsedTime * 0.1
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.15) * 0.2
    matRef.current.uniforms.uTime.value = clock.elapsedTime
  })

  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.5}>
      <mesh ref={ref}>
        <icosahedronGeometry args={[0.6, 4]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={CORE_VS}
          fragmentShader={CORE_FS}
          uniforms={uniforms}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </Float>
  )
}

/** Metallic node orbiting the core */
function OrbitNode({ data, index }: { data: (typeof NODES)[0]; index: number }) {
  const ref = useRef<THREE.Mesh>(null!)
  const color = useMemo(() => new THREE.Color(data.color), [data.color])

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * data.speed + data.phase
    ref.current.position.set(
      Math.cos(t) * data.orbit,
      Math.sin(t * 0.7 + data.tilt) * data.orbit * 0.4,
      Math.sin(t) * data.orbit * 0.6,
    )
    ref.current.rotation.y = clock.elapsedTime * 0.5
  })

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[data.size, 24, 24]} />
      <meshStandardMaterial
        color={color}
        metalness={0.95}
        roughness={0.1}
        emissive={color}
        emissiveIntensity={0.4}
        envMapIntensity={2}
      />
    </mesh>
  )
}

/** Ambient particle cloud */
function ParticleField() {
  const count = 300
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI
      const r = 1 + Math.random() * 2.8
      pos[i * 3] = Math.sin(phi) * Math.cos(theta) * r
      pos[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r * 0.6
      pos[i * 3 + 2] = Math.cos(phi) * r * 0.8
    }
    return pos
  }, [])

  const ref = useRef<THREE.Points>(null!)

  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.elapsedTime * 0.02
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.018} color="#c8ff64" transparent opacity={0.35} sizeAttenuation />
    </points>
  )
}

function BrainScene() {
  return (
    <>
      <Environment preset="night" />
      <ambientLight intensity={0.1} />
      <directionalLight position={[3, 5, 4]} intensity={1} />
      <pointLight position={[-3, 2, 0]} intensity={0.6} color="#c8ff64" distance={10} />
      <pointLight position={[2, -1, 3]} intensity={0.4} color="#06b6d4" distance={10} />
      <pointLight position={[0, 3, -2]} intensity={0.3} color="#f59e0b" distance={8} />

      <CameraRig />
      <GlassCore />
      <ParticleField />
      {NODES.map((node, i) => (
        <OrbitNode key={i} data={node} index={i} />
      ))}

      <EffectComposer multisampling={0}>
        <Bloom intensity={1.2} luminanceThreshold={0.45} luminanceSmoothing={0.4} mipmapBlur />
      </EffectComposer>
    </>
  )
}

export default function BrainOrbit3D({ className = '' }: { className?: string }) {
  const [visible, setVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.05,
      rootMargin: '200px',
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div ref={containerRef} className={className} style={{ position: 'absolute', inset: 0 }}>
      {visible && (
        <Canvas
          camera={{ position: [0, 0, 5], fov: 40 }}
          dpr={[1, 1.5]}
          gl={{ antialias: false, alpha: true, powerPreference: 'high-performance', stencil: false, depth: true }}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          performance={{ min: 0.5 }}
        >
          <BrainScene />
        </Canvas>
      )}
    </div>
  )
}
