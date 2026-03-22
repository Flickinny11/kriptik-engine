/**
 * ThreeGlassModal - Photorealistic 3D Glass Modal using Three.js
 *
 * Uses MeshTransmissionMaterial for real light refraction, visible thickness,
 * layered shadows, and edge highlights. Inspired by Spline Hana glass concept.
 * Adapts quality based on device capability with graceful fallback.
 *
 * NOT glassmorphism — actual Three.js rendered glass with:
 * - MeshTransmissionMaterial for refraction
 * - Visible thickness and edges
 * - Environment-mapped reflections
 * - Layered shadow depth
 * - Butter-smooth 60fps animations
 */

import { useRef, useMemo, useState, useEffect, Suspense, useCallback, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  MeshTransmissionMaterial,
  Environment,
  Lightformer,
  RoundedBox,
} from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { supportsTransmission, getQualityLevel } from '@/lib/webgl';

// =============================================================================
// GLASS PANE 3D MESH — The actual Three.js rendered glass
// =============================================================================

interface GlassPaneProps {
  width: number;
  height: number;
  depth: number;
  hovered: boolean;
}

function GlassPane({ width, height, depth, hovered }: GlassPaneProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const edgeMeshRef = useRef<THREE.Mesh>(null);
  const quality = useMemo(() => getQualityLevel(), []);
  const useTransmissionMat = quality === 'high' && supportsTransmission();

  // Smooth hover animation
  const targetRotX = useRef(0);
  const targetRotY = useRef(0);
  const currentRotX = useRef(0);
  const currentRotY = useRef(0);

  useFrame((state) => {
    if (!meshRef.current) return;

    // Subtle idle floating rotation
    const t = state.clock.elapsedTime;
    targetRotX.current = Math.sin(t * 0.4) * 0.008 + (hovered ? 0.01 : 0);
    targetRotY.current = Math.sin(t * 0.3) * 0.006 + (hovered ? -0.005 : 0);

    currentRotX.current = THREE.MathUtils.lerp(currentRotX.current, targetRotX.current, 0.08);
    currentRotY.current = THREE.MathUtils.lerp(currentRotY.current, targetRotY.current, 0.08);

    meshRef.current.rotation.x = currentRotX.current;
    meshRef.current.rotation.y = currentRotY.current;

    if (edgeMeshRef.current) {
      edgeMeshRef.current.rotation.x = currentRotX.current;
      edgeMeshRef.current.rotation.y = currentRotY.current;
    }
  });

  return (
    <group>
      {/* Main glass body */}
      <mesh ref={meshRef}>
        <RoundedBox args={[width, height, depth]} radius={0.08} smoothness={8}>
          {useTransmissionMat ? (
            <MeshTransmissionMaterial
              backside
              samples={8}
              resolution={256}
              transmission={0.92}
              roughness={0.05}
              thickness={depth}
              ior={1.45}
              chromaticAberration={0.04}
              anisotropy={0.2}
              distortion={0.05}
              distortionScale={0.15}
              temporalDistortion={0.15}
              clearcoat={1}
              attenuationDistance={0.6}
              attenuationColor="#e8f0ff"
              color="#f0f4ff"
            />
          ) : (
            <meshPhysicalMaterial
              color="#f0f4ff"
              transmission={0.88}
              roughness={0.08}
              thickness={depth}
              ior={1.45}
              clearcoat={1}
              clearcoatRoughness={0.05}
              envMapIntensity={1.8}
              transparent
              metalness={0.02}
            />
          )}
        </RoundedBox>
      </mesh>

      {/* Edge highlight — visible thickness / bevel */}
      <mesh ref={edgeMeshRef} position={[0, 0, -depth * 0.52]}>
        <RoundedBox args={[width + 0.01, height + 0.01, 0.02]} radius={0.08} smoothness={4}>
          <meshStandardMaterial
            color="#8899bb"
            metalness={0.6}
            roughness={0.2}
            transparent
            opacity={0.35}
          />
        </RoundedBox>
      </mesh>

      {/* Top specular highlight — edge catch light */}
      <mesh position={[0, height * 0.42, depth * 0.3]} rotation={[0.1, 0, 0]}>
        <planeGeometry args={[width * 0.7, 0.03]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
      </mesh>

      {/* Bottom shadow layer — adds visible depth */}
      <mesh position={[0.02, -0.02, -depth * 0.6]}>
        <RoundedBox args={[width, height, 0.01]} radius={0.08} smoothness={2}>
          <meshBasicMaterial color="#000000" transparent opacity={0.15} />
        </RoundedBox>
      </mesh>
    </group>
  );
}

// =============================================================================
// SCENE LIGHTING — Three-point setup for glass
// =============================================================================

function GlassLighting() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 5, 4]} intensity={1.2} color="#f0f4ff" />
      <directionalLight position={[-4, 2, 3]} intensity={0.6} color="#e0eaff" />
      <directionalLight position={[0, -2, 5]} intensity={0.4} color="#ffffff" />
      <pointLight position={[0, 0, 3]} intensity={0.8} color="#ddeeff" distance={6} />

      <Environment preset="studio">
        <Lightformer
          position={[0, 4, -3]}
          scale={[8, 3, 1]}
          intensity={1.5}
          color="#f0f4ff"
        />
        <Lightformer
          position={[0, -3, 0]}
          scale={[8, 3, 1]}
          intensity={0.4}
          color="#aabbdd"
        />
      </Environment>
    </>
  );
}

// =============================================================================
// 3D GLASS SCENE WRAPPER
// =============================================================================

interface GlassSceneProps {
  width: number;
  height: number;
  hovered: boolean;
}

function GlassScene({ width, height, hovered }: GlassSceneProps) {
  const { viewport } = useThree();
  // Scale pane to fit viewport while maintaining proportions
  const scale = Math.min(viewport.width / (width + 0.5), viewport.height / (height + 0.5), 1);

  return (
    <>
      <GlassLighting />
      <group scale={scale}>
        <GlassPane
          width={width}
          height={height}
          depth={0.12}
          hovered={hovered}
        />
      </group>
    </>
  );
}

// =============================================================================
// EXPORTED MODAL COMPONENT
// =============================================================================

type ThreeGlassModalSize = 'sm' | 'md' | 'lg';

const SIZE_CONFIG: Record<ThreeGlassModalSize, { maxWidth: string; paneWidth: number; paneHeight: number }> = {
  sm: { maxWidth: '420px', paneWidth: 3.5, paneHeight: 2.4 },
  md: { maxWidth: '520px', paneWidth: 4.2, paneHeight: 3 },
  lg: { maxWidth: '640px', paneWidth: 5, paneHeight: 3.8 },
};

interface ThreeGlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: ThreeGlassModalSize;
  /** Disable Three.js for environments that can't support it */
  disableThreeJS?: boolean;
}

export function ThreeGlassModal({
  isOpen,
  onClose,
  children,
  size = 'sm',
  disableThreeJS = false,
}: ThreeGlassModalProps) {
  const [hovered, setHovered] = useState(false);
  const [webglSupported, setWebglSupported] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);
  const prevActiveEl = useRef<HTMLElement | null>(null);
  const cfg = SIZE_CONFIG[size];

  // Detect WebGL support — iOS fully supports WebGL (stickman was the crash cause, not WebGL)
  // Only disable for truly low-end Android devices with insufficient RAM
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      const isAndroidLowEnd = /Android/.test(ua) && ((navigator as any).deviceMemory ?? 8) < 4;
      if (isAndroidLowEnd) {
        setWebglSupported(false);
        return;
      }
    }
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) setWebglSupported(false);
    } catch {
      setWebglSupported(false);
    }
  }, []);

  const canUseThree = webglSupported && !disableThreeJS;

  // Escape key + focus management
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      prevActiveEl.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleEscape);
      setTimeout(() => modalRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = '';
      prevActiveEl.current?.focus();
    }
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, handleEscape]);

  // Backdrop click
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Outer wrapper styles
  const backdropStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  };

  const containerStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    maxWidth: cfg.maxWidth,
  };

  // The Three.js Canvas sits behind the HTML content
  const canvasWrapperStyle: CSSProperties = {
    position: 'absolute',
    inset: '-20px',
    zIndex: 0,
    pointerEvents: 'none',
  };

  // HTML overlay sits on top of the 3D glass
  const contentOverlayStyle: CSSProperties = {
    position: 'relative',
    zIndex: 1,
    padding: '28px 28px 24px',
  };

  // Render into a portal on document.body so the modal is never trapped
  // inside a parent stacking context (transform, filter, will-change, etc.)
  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={backdropStyle}
          onClick={handleBackdrop}
        >
          {/* Blurred backdrop layer — pointer-events: none so it never
              intercepts clicks meant for modal buttons */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              pointerEvents: 'none',
            }}
          />

          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            style={containerStyle}
            initial={{ scale: 0.92, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{
              type: 'spring',
              damping: 28,
              stiffness: 300,
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            {/* Three.js Glass Background */}
            {canUseThree && (
              <div style={canvasWrapperStyle}>
                <Canvas
                  camera={{ position: [0, 0, 5], fov: 35 }}
                  gl={{
                    antialias: true,
                    alpha: true,
                    powerPreference: 'high-performance',
                    stencil: false,
                    depth: true,
                  }}
                  dpr={[1, 1.5]}
                  style={{ background: 'transparent', pointerEvents: 'none' }}
                  onCreated={({ gl }) => {
                    gl.setClearColor(0x000000, 0);
                  }}
                  frameloop="always"
                >
                  <Suspense fallback={null}>
                    <GlassScene
                      width={cfg.paneWidth}
                      height={cfg.paneHeight}
                      hovered={hovered}
                    />
                  </Suspense>
                </Canvas>
              </div>
            )}

            {/* Fallback glass background when Three.js unavailable */}
            {!canUseThree && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '20px',
                  background: 'linear-gradient(145deg, rgba(220,230,255,0.18) 0%, rgba(200,215,250,0.1) 100%)',
                  backdropFilter: 'blur(40px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  boxShadow: `
                    0 30px 80px rgba(0,0,0,0.4),
                    0 12px 32px rgba(0,0,0,0.3),
                    inset 0 1px 0 rgba(255,255,255,0.15),
                    inset 0 -1px 0 rgba(0,0,0,0.05)
                  `,
                  pointerEvents: 'none',
                }}
              />
            )}

            {/* HTML Content Overlay — explicit pointer-events: auto
                ensures buttons are always clickable */}
            <div style={{ ...contentOverlayStyle, pointerEvents: 'auto' }}>
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}

export default ThreeGlassModal;
