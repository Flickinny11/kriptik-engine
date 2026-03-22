/**
 * PremiumWorkflowSteps.tsx - Premium 3D Glass Workflow Steps
 * 
 * Unified premium design for all Fix My App workflow steps:
 * - Consent/URL input
 * - Login
 * - Upload
 * - Context capture
 * - Analysis
 * - UI Preferences
 * - Strategy selection
 * - Fix execution
 * - Complete
 * 
 * Features:
 * - Spline Hanna-style liquid glass aesthetic
 * - 3D depth, visible edges, realistic thickness
 * - Butter-smooth GSAP animations
 * - Consistent with PremiumGlassSelection design
 */

import { useRef, useEffect, useState, ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  MeshTransmissionMaterial,
  Float,
  Environment,
  Lightformer,
  RoundedBox,
  Sphere,
} from '@react-three/drei';
import gsap from 'gsap';

// =============================================================================
// TYPES
// =============================================================================

export type WorkflowStep = 
  | 'consent' 
  | 'login' 
  | 'upload' 
  | 'context' 
  | 'analysis' 
  | 'preferences' 
  | 'strategy' 
  | 'fix' 
  | 'complete';

interface PremiumWorkflowContainerProps {
  children: ReactNode;
  currentStep: WorkflowStep;
  onCancel: () => void;
  title: string;
  subtitle?: string;
}

// =============================================================================
// STEP CONFIGURATION
// =============================================================================

const STEP_CONFIG: Record<WorkflowStep, { label: string; icon: string; color: string }> = {
  consent: { label: 'Access', icon: '🔐', color: '#f59e0b' },
  login: { label: 'Login', icon: '🔑', color: '#3b82f6' },
  upload: { label: 'Upload', icon: '📤', color: '#8b5cf6' },
  context: { label: 'Context', icon: '📋', color: '#06b6d4' },
  analysis: { label: 'Analysis', icon: '🔍', color: '#10b981' },
  preferences: { label: 'UI Pref', icon: '🎨', color: '#ec4899' },
  strategy: { label: 'Strategy', icon: '🎯', color: '#f97316' },
  fix: { label: 'Fix', icon: '🔧', color: '#ef4444' },
  complete: { label: 'Done', icon: '✅', color: '#22c55e' },
};

const STEP_ORDER: WorkflowStep[] = [
  'consent', 'login', 'upload', 'context', 'analysis', 'preferences', 'strategy', 'fix', 'complete'
];

// =============================================================================
// 3D BACKGROUND SCENE
// =============================================================================

function BackgroundScene() {
  return (
    <>
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} color="#fff5eb" />
      <directionalLight position={[-5, 3, 5]} intensity={0.4} color="#e0f2fe" />
      <pointLight position={[0, 0, 5]} intensity={0.5} color="#f59e0b" distance={15} />
      
      <Environment preset="studio">
        <Lightformer position={[0, 5, -5]} scale={[10, 5, 1]} intensity={1} color="#fef3c7" />
        <Lightformer position={[0, -5, 0]} scale={[10, 5, 1]} intensity={0.3} color="#1e1b4b" />
      </Environment>

      {/* Floating glass decorations */}
      <Float speed={1} rotationIntensity={0.2} floatIntensity={0.3}>
        <group position={[-6, 2, -5]}>
          <RoundedBox args={[1, 1, 0.3]} radius={0.1} smoothness={4}>
            <MeshTransmissionMaterial
              backside
              samples={4}
              resolution={128}
              transmission={0.9}
              roughness={0.1}
              thickness={0.3}
              ior={1.45}
              distortionScale={0.1}
              temporalDistortion={0.1}
              color="#f59e0b"
              attenuationDistance={0.5}
              attenuationColor="#78350f"
            />
          </RoundedBox>
        </group>
      </Float>

      <Float speed={1.5} rotationIntensity={0.15} floatIntensity={0.2}>
        <group position={[6, -1, -4]}>
          <Sphere args={[0.6, 32, 32]}>
            <MeshTransmissionMaterial
              backside
              samples={4}
              resolution={128}
              transmission={0.92}
              roughness={0.08}
              thickness={0.5}
              ior={1.5}
              distortionScale={0.15}
              temporalDistortion={0.1}
              color="#3b82f6"
              attenuationDistance={0.4}
              attenuationColor="#1e40af"
            />
          </Sphere>
        </group>
      </Float>

      <Float speed={0.8} rotationIntensity={0.1} floatIntensity={0.4}>
        <group position={[5, 3, -6]}>
          <RoundedBox args={[0.8, 0.8, 0.2]} radius={0.08} smoothness={4}>
            <MeshTransmissionMaterial
              backside
              samples={4}
              resolution={128}
              transmission={0.88}
              roughness={0.12}
              thickness={0.25}
              ior={1.4}
              distortionScale={0.08}
              temporalDistortion={0.08}
              color="#10b981"
              attenuationDistance={0.3}
              attenuationColor="#064e3b"
            />
          </RoundedBox>
        </group>
      </Float>

      <fog attach="fog" args={['#030305', 8, 25]} />
    </>
  );
}

// =============================================================================
// PREMIUM WORKFLOW CONTAINER
// =============================================================================

export function PremiumWorkflowContainer({
  children,
  currentStep,
  onCancel,
  title,
  subtitle,
}: PremiumWorkflowContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const currentStepIndex = STEP_ORDER.indexOf(currentStep);

  // Entrance animation
  useEffect(() => {
    const tl = gsap.timeline();
    
    if (headerRef.current) {
      tl.fromTo(
        headerRef.current,
        { opacity: 0, y: -30 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }
      );
    }
    
    if (contentRef.current) {
      tl.fromTo(
        contentRef.current,
        { opacity: 0, y: 40, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out' },
        '-=0.3'
      );
    }
  }, [currentStep]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-[#030305] overflow-hidden">
      {/* 3D Background */}
      <div className="absolute inset-0 pointer-events-none">
        <Canvas
          camera={{ position: [0, 0, 10], fov: 45 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          dpr={[1, 1.5]}
        >
          <BackgroundScene />
        </Canvas>
      </div>

      {/* Ambient gradient overlay */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 30% 20%, rgba(245,158,11,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(59,130,246,0.05) 0%, transparent 40%)',
        }}
      />

      {/* Content overlay */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <header
          ref={headerRef}
          className="flex-shrink-0 px-6 py-4"
          style={{
            background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0.7) 80%, transparent 100%)',
          }}
        >
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            {/* Logo and title */}
            <div className="flex items-center gap-4">
              <div
                className="relative w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, rgba(251,191,36,0.2), rgba(245,158,11,0.3))',
                  boxShadow: '0 4px 20px rgba(245,158,11,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
                  border: '1px solid rgba(245,158,11,0.3)',
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-amber-500">
                  <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" fill="currentColor"/>
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </div>
              <div>
                <h1 
                  className="text-xl font-bold text-white"
                  style={{ fontFamily: '"Clash Display", system-ui' }}
                >
                  Fix My App
                </h1>
                <p className="text-xs text-slate-400" style={{ fontFamily: '"Satoshi", system-ui' }}>
                  Import & fix broken AI-built apps
                </p>
              </div>
            </div>

            {/* Cancel button */}
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 transition-all hover:text-white hover:bg-white/5"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              Cancel
            </button>
          </div>

          {/* Step progress */}
          <div className="max-w-5xl mx-auto mt-4">
            <div className="flex items-center justify-center gap-1">
              {STEP_ORDER.map((step, idx) => {
                const config = STEP_CONFIG[step];
                const isActive = idx === currentStepIndex;
                const isComplete = idx < currentStepIndex;
                
                return (
                  <div key={step} className="flex items-center">
                    <div
                      className="relative px-3 py-1.5 rounded-lg transition-all duration-300"
                      style={{
                        background: isActive 
                          ? `linear-gradient(135deg, ${config.color}30, ${config.color}15)` 
                          : isComplete 
                          ? 'rgba(34,197,94,0.15)' 
                          : 'rgba(255,255,255,0.03)',
                        border: isActive 
                          ? `1px solid ${config.color}50` 
                          : isComplete 
                          ? '1px solid rgba(34,197,94,0.3)' 
                          : '1px solid rgba(255,255,255,0.05)',
                        boxShadow: isActive ? `0 0 20px ${config.color}20` : 'none',
                      }}
                    >
                      <span 
                        className="text-[10px] font-semibold uppercase tracking-wider"
                        style={{ 
                          color: isActive ? config.color : isComplete ? '#22c55e' : '#64748b',
                          fontFamily: '"Satoshi", system-ui',
                        }}
                      >
                        {config.label}
                      </span>
                      
                      {/* Active indicator */}
                      {isActive && (
                        <div
                          className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                          style={{ background: config.color, boxShadow: `0 0 8px ${config.color}` }}
                        />
                      )}
                    </div>
                    
                    {idx < STEP_ORDER.length - 1 && (
                      <div 
                        className="w-4 h-px mx-1"
                        style={{
                          background: isComplete 
                            ? 'linear-gradient(90deg, rgba(34,197,94,0.5), rgba(34,197,94,0.3))' 
                            : 'rgba(255,255,255,0.1)',
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </header>

        {/* Main content area */}
        <div className="flex-1 overflow-hidden px-6 py-8">
          <div ref={contentRef} className="max-w-3xl mx-auto h-full">
            {/* Glass card container */}
            <div
              className="relative h-full rounded-3xl overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, rgba(30,41,59,0.6), rgba(15,23,42,0.85))',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: '0 6px 0 rgba(0,0,0,0.25), 0 12px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              {/* Top highlight */}
              <div 
                className="absolute top-0 left-0 right-0 h-[2px]"
                style={{
                  background: 'linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.15) 30%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.15) 70%, transparent 90%)',
                }}
              />
              
              {/* Card header */}
              <div className="p-6 pb-4">
                <h2
                  className="text-2xl font-semibold text-white mb-1"
                  style={{ fontFamily: '"Clash Display", system-ui' }}
                >
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-slate-400 text-sm" style={{ fontFamily: '"Satoshi", system-ui' }}>
                    {subtitle}
                  </p>
                )}
              </div>

              {/* Scrollable content */}
              <div 
                className="px-6 pb-6 overflow-y-auto"
                style={{
                  maxHeight: 'calc(100% - 100px)',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(245,158,11,0.3) transparent',
                }}
              >
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PREMIUM GLASS INPUT
// =============================================================================

interface PremiumGlassInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  label?: string;
  error?: string;
}

export function PremiumGlassInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  label,
  error,
}: PremiumGlassInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="space-y-2">
      {label && (
        <label 
          className="block text-sm font-medium text-slate-300"
          style={{ fontFamily: '"Satoshi", system-ui' }}
        >
          {label}
        </label>
      )}
      <div
        className="relative rounded-xl overflow-hidden transition-all duration-300"
        style={{
          background: isFocused 
            ? 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(255,255,255,0.05))' 
            : 'rgba(255,255,255,0.03)',
          border: error 
            ? '1px solid rgba(239,68,68,0.5)' 
            : isFocused 
            ? '1px solid rgba(245,158,11,0.4)' 
            : '1px solid rgba(255,255,255,0.08)',
          boxShadow: isFocused 
            ? '0 4px 20px rgba(245,158,11,0.15), inset 0 1px 0 rgba(255,255,255,0.05)' 
            : '0 2px 10px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
      >
        <input
          ref={inputRef}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="w-full px-4 py-3.5 bg-transparent text-white placeholder-slate-500 outline-none text-sm"
          style={{ fontFamily: '"Satoshi", system-ui' }}
        />
        
        {/* Glass highlight */}
        <div 
          className="absolute top-0 left-0 right-0 h-[1px]"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1) 30%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.1) 70%, transparent)',
          }}
        />
      </div>
      {error && (
        <p className="text-sm text-red-400" style={{ fontFamily: '"Satoshi", system-ui' }}>
          {error}
        </p>
      )}
    </div>
  );
}

// =============================================================================
// PREMIUM GLASS BUTTON
// =============================================================================

interface PremiumGlassButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  fullWidth?: boolean;
}

export function PremiumGlassButton({
  onClick,
  disabled,
  loading,
  children,
  variant = 'primary',
  fullWidth,
}: PremiumGlassButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Hover animation
  useEffect(() => {
    if (!buttonRef.current || !glowRef.current || disabled) return;

    if (isHovered) {
      gsap.to(buttonRef.current, {
        y: -4,
        scale: 1.02,
        duration: 0.3,
        ease: 'power2.out',
      });
      gsap.to(glowRef.current, {
        opacity: 1,
        scale: 1.2,
        duration: 0.3,
        ease: 'power2.out',
      });
    } else {
      gsap.to(buttonRef.current, {
        y: 0,
        scale: 1,
        duration: 0.3,
        ease: 'power2.out',
      });
      gsap.to(glowRef.current, {
        opacity: 0.6,
        scale: 1,
        duration: 0.3,
        ease: 'power2.out',
      });
    }
  }, [isHovered, disabled]);

  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';

  return (
    <div className={`relative ${fullWidth ? 'w-full' : ''}`}>
      {/* Glow effect for primary */}
      {isPrimary && (
        <div
          ref={glowRef}
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(251,191,36,0.4) 0%, rgba(245,158,11,0.2) 40%, transparent 70%)',
            filter: 'blur(15px)',
            opacity: 0.6,
            transform: 'scale(1) translateY(5px)',
          }}
        />
      )}

      <button
        ref={buttonRef}
        onClick={onClick}
        disabled={disabled || loading}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`relative flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${fullWidth ? 'w-full' : ''}`}
        style={{
          background: isPrimary
            ? 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(251,191,36,0.4) 40%, rgba(245,158,11,0.5) 60%, rgba(234,88,12,0.4) 80%, rgba(255,255,255,0.1) 100%)'
            : isSecondary
            ? 'rgba(255,255,255,0.05)'
            : 'transparent',
          boxShadow: isPrimary
            ? '0 4px 0 rgba(180,83,9,0.7), 0 6px 0 rgba(154,52,18,0.4), 0 10px 30px rgba(245,158,11,0.3), inset 0 2px 0 rgba(255,255,255,0.3), inset 0 -2px 0 rgba(180,83,9,0.2)'
            : isSecondary
            ? '0 2px 0 rgba(0,0,0,0.2), 0 4px 15px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)'
            : 'none',
          border: isPrimary
            ? '1px solid rgba(255,255,255,0.2)'
            : isSecondary
            ? '1px solid rgba(255,255,255,0.08)'
            : '1px solid transparent',
          color: isPrimary ? '#1c1917' : '#e2e8f0',
          fontFamily: '"Cabinet Grotesk", system-ui',
        }}
      >
        {/* Top highlight */}
        {(isPrimary || isSecondary) && (
          <div 
            className="absolute top-0 left-4 right-4 h-[1px]"
            style={{
              background: isPrimary
                ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6) 30%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0.6) 70%, transparent)'
                : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1) 50%, transparent)',
            }}
          />
        )}

        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
            Processing...
          </>
        ) : (
          children
        )}
      </button>
    </div>
  );
}

// =============================================================================
// PREMIUM GLASS CHECKBOX
// =============================================================================

interface PremiumGlassCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

export function PremiumGlassCheckbox({
  checked,
  onChange,
  label,
  description,
}: PremiumGlassCheckboxProps) {
  return (
    <div
      onClick={() => onChange(!checked)}
      className="flex items-start gap-4 p-4 rounded-xl cursor-pointer transition-all duration-300"
      style={{
        background: checked 
          ? 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(16,185,129,0.05))' 
          : 'rgba(255,255,255,0.02)',
        border: checked 
          ? '1px solid rgba(34,197,94,0.3)' 
          : '1px solid rgba(255,255,255,0.06)',
        boxShadow: checked 
          ? '0 4px 20px rgba(34,197,94,0.1), inset 0 1px 0 rgba(255,255,255,0.05)' 
          : 'inset 0 1px 0 rgba(255,255,255,0.02)',
      }}
    >
      <div
        className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center transition-all duration-300"
        style={{
          background: checked 
            ? 'linear-gradient(135deg, #22c55e, #16a34a)' 
            : 'rgba(255,255,255,0.05)',
          border: checked 
            ? '1px solid rgba(34,197,94,0.5)' 
            : '1px solid rgba(255,255,255,0.1)',
          boxShadow: checked 
            ? '0 2px 8px rgba(34,197,94,0.3)' 
            : 'inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {checked && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      <div>
        <p 
          className="text-sm font-medium text-white"
          style={{ fontFamily: '"Satoshi", system-ui' }}
        >
          {label}
        </p>
        {description && (
          <p 
            className="text-xs text-slate-400 mt-0.5"
            style={{ fontFamily: '"Satoshi", system-ui' }}
          >
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// PREMIUM PROGRESS INDICATOR
// =============================================================================

interface PremiumProgressProps {
  progress: number;
  label?: string;
  status?: string;
}

export function PremiumProgress({
  progress,
  label,
  status,
}: PremiumProgressProps) {
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!progressRef.current) return;
    gsap.to(progressRef.current, {
      width: `${progress}%`,
      duration: 0.5,
      ease: 'power2.out',
    });
  }, [progress]);

  return (
    <div className="space-y-3">
      {(label || status) && (
        <div className="flex items-center justify-between">
          {label && (
            <span 
              className="text-sm font-medium text-white"
              style={{ fontFamily: '"Satoshi", system-ui' }}
            >
              {label}
            </span>
          )}
          {status && (
            <span 
              className="text-xs text-slate-400"
              style={{ fontFamily: '"Satoshi", system-ui' }}
            >
              {status}
            </span>
          )}
        </div>
      )}
      <div
        className="relative h-3 rounded-full overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.05)',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
        }}
      >
        <div
          ref={progressRef}
          className="absolute top-0 left-0 h-full rounded-full"
          style={{
            width: '0%',
            background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)',
            boxShadow: '0 0 20px rgba(245,158,11,0.5), inset 0 1px 0 rgba(255,255,255,0.3)',
          }}
        />
        
        {/* Shine effect */}
        <div
          className="absolute top-0 left-0 right-0 h-1/2 rounded-t-full"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.2), transparent)',
          }}
        />
      </div>
      <div className="text-right">
        <span 
          className="text-sm font-semibold"
          style={{ 
            color: '#f59e0b',
            fontFamily: '"Cabinet Grotesk", system-ui',
          }}
        >
          {Math.round(progress)}%
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// PREMIUM LOG VIEWER
// =============================================================================

interface PremiumLogViewerProps {
  logs: string[];
  maxHeight?: string;
}

export function PremiumLogViewer({
  logs,
  maxHeight = '300px',
}: PremiumLogViewerProps) {
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      ref={logRef}
      className="rounded-xl overflow-auto"
      style={{
        maxHeight,
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.05)',
        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      <div className="p-4 font-mono text-xs space-y-1">
        {logs.map((log, idx) => (
          <div 
            key={idx}
            className="text-slate-400"
            style={{
              color: log.includes('ERROR') || log.includes('error') 
                ? '#ef4444' 
                : log.includes('SUCCESS') || log.includes('✓') 
                ? '#22c55e' 
                : log.includes('WARN') 
                ? '#f59e0b' 
                : '#94a3b8',
            }}
          >
            <span className="text-slate-600 mr-2">[{String(idx + 1).padStart(3, '0')}]</span>
            {log}
          </div>
        ))}
      </div>
    </div>
  );
}

export default PremiumWorkflowContainer;
