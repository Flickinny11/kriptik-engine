/**
 * Hero3D - Immersive 3D scene using React Three Fiber
 *
 * Glass/metallic orbs with distortion, bloom, chromatic aberration.
 * Mouse-reactive camera. Instanced particles. Fog + environment.
 * Dependencies: @react-three/fiber, @react-three/drei, @react-three/postprocessing
 */

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import {
  Float,
  MeshDistortMaterial,
  Environment,
  ContactShadows,
} from '@react-three/drei'
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
} from '@react-three/postprocessing'
import * as THREE from 'three'

/* ─── Liquid Glass Orb ─── */
interface OrbProps {
  position: [number, number, number]
  scale: number
  color: string
  speed?: number
  distort?: number
  metalness?: number
}

function Orb({ position, scale, color, speed = 1.5, distort = 0.4, metalness = 0.2 }: OrbProps) {
  const ref = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.rotation.x = Math.sin(clock.elapsedTime * speed * 0.2) * 0.15
    ref.current.rotation.z = Math.cos(clock.elapsedTime * speed * 0.15) * 0.1
  })

  return (
    <Float speed={speed} rotationIntensity={0.5} floatIntensity={2.5}>
      <mesh ref={ref} position={position} scale={scale} castShadow>
        <icosahedronGeometry args={[1, 12]} />
        <MeshDistortMaterial
          color={color}
          envMapIntensity={2.5}
          clearcoat={1}
          clearcoatRoughness={0.05}
          metalness={metalness}
          roughness={0.02}
          distort={distort}
          speed={speed * 1.5}
          transparent
          opacity={0.92}
        />
      </mesh>
    </Float>
  )
}

/* ─── Instanced Particle Field ─── */
function Particles({ count = 100 }: { count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const data = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        pos: [
          (Math.random() - 0.5) * 30,
          (Math.random() - 0.5) * 25,
          (Math.random() - 0.5) * 18 - 4,
        ] as [number, number, number],
        speed: Math.random() * 0.4 + 0.1,
        scale: Math.random() * 0.06 + 0.015,
        offset: i * 0.37,
      })),
    [count]
  )

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime
    data.forEach((d, i) => {
      dummy.position.set(
        d.pos[0] + Math.sin(t * d.speed + d.offset) * 0.8,
        d.pos[1] + Math.cos(t * d.speed * 0.7 + d.offset) * 0.6,
        d.pos[2] + Math.sin(t * d.speed * 0.5 + d.offset) * 0.3
      )
      dummy.scale.setScalar(d.scale)
      dummy.updateMatrix()
      ref.current.setMatrixAt(i, dummy.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color="#c8ff64" transparent opacity={0.35} />
    </instancedMesh>
  )
}

/* ─── Mouse-Reactive Camera ─── */
function CameraRig() {
  useFrame((state) => {
    const { camera, pointer } = state
    camera.position.x += (pointer.x * 0.6 - camera.position.x) * 0.015
    camera.position.y += (pointer.y * 0.4 - camera.position.y) * 0.015
    camera.lookAt(0, 0, 0)
  })
  return null
}

/* ─── Scene Composition ─── */
function Scene() {
  const chromaticOffset = useMemo(() => new THREE.Vector2(0.0018, 0.0018), [])

  return (
    <>
      <fog attach="fog" args={['#0a0a0a', 7, 30]} />

      {/* Lighting */}
      <ambientLight intensity={0.12} />
      <directionalLight position={[5, 8, 5]} intensity={0.5} color="#fafafa" castShadow />
      <pointLight position={[8, 5, 5]} intensity={2.5} color="#c8ff64" distance={28} decay={2} />
      <pointLight position={[-8, -3, -6]} intensity={1.8} color="#06b6d4" distance={22} decay={2} />
      <pointLight position={[3, -7, 4]} intensity={1.2} color="#f59e0b" distance={20} decay={2} />
      <pointLight position={[-3, 5, -2]} intensity={0.8} color="#c8ff64" distance={15} decay={2} />

      {/* Main orb - large, prominent */}
      <Orb position={[0, 0.3, 0]} scale={2.2} color="#c8ff64" speed={0.8} distort={0.32} metalness={0.35} />

      {/* Satellite orbs */}
      <Orb position={[-4.2, 1.8, -3.5]} scale={0.75} color="#06b6d4" speed={1.6} distort={0.5} metalness={0.25} />
      <Orb position={[3.8, -1.5, -2.5]} scale={1.05} color="#f59e0b" speed={1.2} distort={0.28} metalness={0.2} />
      <Orb position={[1.8, 3.2, -4.5]} scale={0.42} color="#fafafa" speed={2} distort={0.55} metalness={0.45} />
      <Orb position={[-2.8, -2.3, -1.8]} scale={0.58} color="#c8ff64" speed={1.8} distort={0.42} metalness={0.15} />
      <Orb position={[5.5, 0.8, -6]} scale={0.38} color="#06b6d4" speed={2.3} distort={0.6} metalness={0.3} />
      <Orb position={[-5, -0.5, -4]} scale={0.5} color="#f59e0b" speed={1.4} distort={0.35} metalness={0.2} />

      {/* Particle field */}
      <Particles count={80} />

      {/* Ground shadow */}
      <ContactShadows
        position={[0, -4, 0]}
        opacity={0.25}
        scale={30}
        blur={2.5}
        far={5}
        color="#c8ff64"
      />

      {/* Reflections */}
      <Environment preset="night" />

      {/* Post-processing */}
      <EffectComposer multisampling={0}>
        <Bloom
          intensity={1.8}
          luminanceThreshold={0.15}
          luminanceSmoothing={0.9}
          mipmapBlur
        />
        <ChromaticAberration offset={chromaticOffset} />
        <Vignette darkness={0.55} offset={0.3} />
      </EffectComposer>

      <CameraRig />
    </>
  )
}

/* ─── Canvas Export ─── */
export default function Hero3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 8], fov: 45 }}
      dpr={[1, 1.5]}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
        stencil: false,
      }}
      style={{ position: 'absolute', inset: 0 }}
      performance={{ min: 0.5 }}
    >
      <Scene />
    </Canvas>
  )
}
