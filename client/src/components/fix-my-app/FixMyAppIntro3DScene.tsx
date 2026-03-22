/**
 * FixMyAppIntro3DScene.tsx - Photorealistic 3D Intro Scene
 *
 * Features:
 * - Realistic liquid glass "Start Fixing" button with refraction
 * - Animated 3D error text blocks raining from above
 * - High frame rate butter-smooth animations (60fps)
 * - Spline Hanna-style glass effects
 */

import { useRef, useMemo, useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  MeshTransmissionMaterial,
  Text,
  Float,
  Environment,
  Lightformer,
  RoundedBox,
} from '@react-three/drei';
import * as THREE from 'three';
import { supportsTransmission, getQualityLevel } from '@/lib/webgl';

// =============================================================================
// ERROR TYPES FOR RAIN ANIMATION
// =============================================================================

const ERROR_TYPES = [
  'TypeError',
  'SyntaxError',
  'ReferenceError',
  'ImportError',
  'ModuleNotFound',
  'BuildFailed',
  'CORS',
  '500 Error',
  'undefined',
  'null',
  'NaN',
  'Promise Rejected',
  'Stack Overflow',
  'Memory Leak',
  'Timeout',
  'Network Error',
  'Auth Failed',
  'Invalid Token',
  'Missing Props',
  'Type Mismatch',
];

// =============================================================================
// FALLING ERROR TEXT COMPONENT - 3D Block Letters
// =============================================================================

interface FallingErrorProps {
  text: string;
  startPosition: [number, number, number];
  speed: number;
  rotation: [number, number, number];
  delay: number;
  color: string;
}

function FallingError({ text, startPosition, speed, rotation, delay, color }: FallingErrorProps) {
  const meshRef = useRef<THREE.Group>(null);
  const [active, setActive] = useState(false);
  const startY = startPosition[1];
  const endY = -15;

  useEffect(() => {
    const timer = setTimeout(() => setActive(true), delay * 1000);
    return () => clearTimeout(timer);
  }, [delay]);

  useFrame((_, delta) => {
    if (!meshRef.current || !active) return;

    // Fall down with smooth motion
    meshRef.current.position.y -= speed * delta;

    // Reset when below view
    if (meshRef.current.position.y < endY) {
      meshRef.current.position.y = startY;
      meshRef.current.position.x = (Math.random() - 0.5) * 20;
    }

    // Tumbling rotation while falling
    meshRef.current.rotation.x += delta * 0.3;
    meshRef.current.rotation.z += delta * 0.15;
    meshRef.current.rotation.y += delta * 0.1;
  });

  if (!active) return null;

  // Calculate box dimensions based on text length
  const boxWidth = text.length * 0.22 + 0.5;
  const boxHeight = 0.45;
  const boxDepth = 0.2;

  return (
    <group ref={meshRef} position={startPosition} rotation={rotation}>
      {/* 3D block background */}
      <RoundedBox args={[boxWidth, boxHeight, boxDepth]} radius={0.08} smoothness={4}>
        <meshPhysicalMaterial
          color={color}
          metalness={0.3}
          roughness={0.4}
          emissive={color}
          emissiveIntensity={0.15}
          clearcoat={0.3}
          clearcoatRoughness={0.2}
        />
      </RoundedBox>

      {/* Depth/shadow layer */}
      <mesh position={[0.03, -0.03, -0.12]}>
        <RoundedBox args={[boxWidth, boxHeight, boxDepth * 0.5]} radius={0.08} smoothness={2}>
          <meshStandardMaterial color="#1a0000" />
        </RoundedBox>
      </mesh>

      {/* Text */}
      <Text
        position={[0, 0, 0.12]}
        fontSize={0.22}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        font="https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPVmUsaaDhw.woff2"
      >
        {text}
      </Text>
    </group>
  );
}

// =============================================================================
// ERROR RAIN SYSTEM
// =============================================================================

function ErrorRain() {
  const errors = useMemo(() => {
    return Array.from({ length: 40 }).map((_, i) => ({
      text: ERROR_TYPES[i % ERROR_TYPES.length],
      startPosition: [
        (Math.random() - 0.5) * 25,
        10 + Math.random() * 20,
        (Math.random() - 0.5) * 15 - 5,
      ] as [number, number, number],
      speed: 1.5 + Math.random() * 2,
      rotation: [
        Math.random() * Math.PI * 0.2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 0.2,
      ] as [number, number, number],
      delay: Math.random() * 3,
      color: ['#ef4444', '#f97316', '#f59e0b', '#dc2626', '#ea580c'][Math.floor(Math.random() * 5)],
    }));
  }, []);

  return (
    <group>
      {errors.map((error, i) => (
        <FallingError key={i} {...error} />
      ))}
    </group>
  );
}

// =============================================================================
// LIQUID GLASS BUTTON
// =============================================================================

interface GlassButtonProps {
  onClick: () => void;
  hovered: boolean;
  onHover: (hovered: boolean) => void;
}

function LiquidGlassButton({ onClick, hovered, onHover }: GlassButtonProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const quality = useMemo(() => getQualityLevel(), []);
  const useTransmission = quality === 'high' && supportsTransmission();

  // Animation state
  const targetScale = useRef(1);
  const currentScale = useRef(1);

  useEffect(() => {
    targetScale.current = hovered ? 1.08 : 1;
  }, [hovered]);

  useFrame((state) => {
    if (!meshRef.current) return;

    // Smooth scale interpolation
    currentScale.current = THREE.MathUtils.lerp(currentScale.current, targetScale.current, 0.15);
    meshRef.current.scale.setScalar(currentScale.current);

    // Subtle floating motion
    meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 1.5) * 0.05;
    meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.02;
    meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.7) * 0.02;

    // Update shader time uniform
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.elapsedTime;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.1} floatIntensity={0.3}>
      <group position={[0, -0.5, 2]}>
        {/* Main button shape - rounded rectangle */}
        <mesh
          ref={meshRef}
          onClick={onClick}
          onPointerOver={() => onHover(true)}
          onPointerOut={() => onHover(false)}
        >
          <RoundedBox args={[4, 1.2, 0.4]} radius={0.2} smoothness={8}>
            {useTransmission ? (
              <MeshTransmissionMaterial
                backside
                samples={16}
                resolution={512}
                transmission={0.95}
                roughness={0.05}
                thickness={0.5}
                ior={1.5}
                chromaticAberration={0.08}
                anisotropy={0.3}
                distortion={0.1}
                distortionScale={0.2}
                temporalDistortion={0.3}
                clearcoat={1}
                attenuationDistance={0.5}
                attenuationColor="#f59e0b"
                color="#fff7ed"
              />
            ) : (
              <meshPhysicalMaterial
                color="#fff7ed"
                transmission={0.9}
                roughness={0.1}
                thickness={0.5}
                ior={1.5}
                clearcoat={1}
                clearcoatRoughness={0.1}
                envMapIntensity={1.5}
                transparent
              />
            )}
          </RoundedBox>

          {/* 3D depth edges - visible thickness */}
          <mesh position={[0, 0, -0.22]}>
            <RoundedBox args={[4.02, 1.22, 0.05]} radius={0.2} smoothness={4}>
              <meshStandardMaterial
                color="#78350f"
                metalness={0.5}
                roughness={0.3}
              />
            </RoundedBox>
          </mesh>

          {/* Inner glow layer */}
          <mesh position={[0, 0, 0.1]}>
            <RoundedBox args={[3.8, 1, 0.1]} radius={0.15} smoothness={4}>
              <meshBasicMaterial
                color="#f59e0b"
                transparent
                opacity={hovered ? 0.4 : 0.2}
              />
            </RoundedBox>
          </mesh>
        </mesh>

        {/* Button text */}
        <Text
          position={[0, 0, 0.25]}
          fontSize={0.32}
          color="#1c1917"
          anchorX="center"
          anchorY="middle"
          font="https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZJhiI2B.woff2"
          letterSpacing={0.02}
        >
          Start Fixing →
        </Text>

        {/* Specular highlight */}
        <mesh position={[-0.8, 0.35, 0.21]} rotation={[0, 0, 0.1]}>
          <planeGeometry args={[1.5, 0.15]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.4} />
        </mesh>
      </group>
    </Float>
  );
}

// =============================================================================
// SCENE LIGHTING
// =============================================================================

function SceneLighting() {
  return (
    <>
      {/* Main ambient light */}
      <ambientLight intensity={0.3} />

      {/* Key light - warm from top right */}
      <directionalLight
        position={[5, 8, 5]}
        intensity={1.5}
        color="#fff5eb"
        castShadow
      />

      {/* Fill light - cool from left */}
      <directionalLight
        position={[-5, 3, 5]}
        intensity={0.8}
        color="#e0f2fe"
      />

      {/* Rim light - from behind */}
      <directionalLight
        position={[0, 2, -5]}
        intensity={0.6}
        color="#fef3c7"
      />

      {/* Point lights for button glow */}
      <pointLight position={[0, 0, 3]} intensity={2} color="#f59e0b" distance={5} />

      {/* Environment map for reflections */}
      <Environment preset="studio">
        <Lightformer
          position={[0, 5, -5]}
          scale={[10, 5, 1]}
          intensity={2}
          color="#fef3c7"
        />
        <Lightformer
          position={[0, -5, 0]}
          scale={[10, 5, 1]}
          intensity={0.5}
          color="#1e1b4b"
        />
      </Environment>
    </>
  );
}

// =============================================================================
// TITLE TEXT - Floating 3D Title
// =============================================================================

function TitleText() {
  const meshRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    // Smooth floating animation
    meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.08 + 1.8;
  });

  return (
    <group ref={meshRef} position={[0, 1.8, 0]}>
      <Text
        fontSize={0.7}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        font="https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYAZJhiI2B.woff2"
        letterSpacing={-0.02}
        outlineWidth={0.01}
        outlineColor="#f59e0b"
      >
        Let's Fix This
      </Text>
    </group>
  );
}

// =============================================================================
// SUBTITLE TEXT
// =============================================================================

function SubtitleText() {
  return (
    <Text
      position={[0, 1.0, 0]}
      fontSize={0.18}
      color="#94a3b8"
      anchorX="center"
      anchorY="middle"
      font="https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZJhiI2B.woff2"
      maxWidth={8}
      textAlign="center"
    >
      Import your broken app and watch KripTik AI make it work
    </Text>
  );
}

// =============================================================================
// MAIN 3D SCENE
// =============================================================================

interface FixMyAppIntro3DSceneProps {
  onButtonClick: () => void;
}

function Scene({ onButtonClick }: FixMyAppIntro3DSceneProps) {
  const [buttonHovered, setButtonHovered] = useState(false);
  const { viewport } = useThree();
  const isMobile = viewport.width < 5.5;
  const mobileScale = isMobile ? 0.7 : 1;

  return (
    <>
      <SceneLighting />
      <ErrorRain />
      <group scale={mobileScale}>
        <TitleText />
        <SubtitleText />
        <LiquidGlassButton
          onClick={onButtonClick}
          hovered={buttonHovered}
          onHover={setButtonHovered}
        />
      </group>

      {/* Fog for depth */}
      <fog attach="fog" args={['#050507', 5, 30]} />
    </>
  );
}

// =============================================================================
// FALLBACK FOR 2D
// =============================================================================

function Fallback2DButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-black text-white mb-4">
          Let's Fix This
        </h1>
        <p className="text-slate-400 mb-8">
          Import your broken app and watch KripTik AI make it work
        </p>
        <button
          onClick={onClick}
          className="px-8 py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-2xl shadow-amber-500/30 hover:shadow-amber-500/50 transition-all duration-300 hover:scale-105"
        >
          Start Fixing →
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// EXPORTED COMPONENT
// =============================================================================

export function FixMyAppIntro3DScene({ onButtonClick }: FixMyAppIntro3DSceneProps) {
  const [webglSupported, setWebglSupported] = useState(true);

  useEffect(() => {
    // Check if WebGL is available
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) {
        setWebglSupported(false);
      }
    } catch {
      setWebglSupported(false);
    }
  }, []);

  if (!webglSupported) {
    return <Fallback2DButton onClick={onButtonClick} />;
  }

  return (
    <div className="absolute inset-0" style={{ cursor: 'pointer' }}>
      <Canvas
        camera={{ position: [0, 0, 8], fov: 45 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        dpr={[1, 2]}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <Suspense fallback={null}>
          <Scene onButtonClick={onButtonClick} />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default FixMyAppIntro3DScene;
