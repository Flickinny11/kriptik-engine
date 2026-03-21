/**
 * BrainOrbit3D — R3F scene: glowing icosahedron core + orbiting metallic knowledge nodes
 *
 * Design_References.md §4, §8 — PBR materials, Environment, Bloom postprocessing
 * Dependencies: @react-three/fiber, @react-three/drei (Float, Environment), @react-three/postprocessing
 */

import { useRef, useMemo, useState, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Float, Environment } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

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

/** Glowing glass-like icosahedron core */
function GlassCore() {
  const ref = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.rotation.y = clock.elapsedTime * 0.1
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.15) * 0.2
  })

  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.5}>
      <mesh ref={ref}>
        <icosahedronGeometry args={[0.6, 2]} />
        <meshStandardMaterial
          color="#c8ff64"
          emissive="#c8ff64"
          emissiveIntensity={0.6}
          metalness={0.3}
          roughness={0.1}
          transparent
          opacity={0.35}
          envMapIntensity={1.5}
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
