/**
 * SplineLiquidGlassSelection.tsx - True Liquid Glass Source Selection
 *
 * Uses actual Spline 3D scenes for liquid glass effects (NOT glassmorphism!)
 * Real branded logos from simple-icons CDN
 * 
 * Features:
 * - Spline-style liquid glass with visible depth, refraction, edges
 * - Real branded SVG logos from SimpleIcons CDN
 * - 3D animated progress stepper
 * - High frame rate butter-smooth animations
 */

import { useState, lazy, Suspense, useMemo, useRef, useCallback } from 'react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';

// Lazy load Spline for performance
const Spline = lazy(() => import('@splinetool/react-spline'));

// =============================================================================
// TYPES
// =============================================================================

export type ImportSource =
  | 'lovable' | 'bolt' | 'v0' | 'create' | 'tempo' | 'gptengineer' | 'databutton' | 'magic_patterns'
  | 'claude' | 'chatgpt' | 'gemini' | 'copilot'
  | 'cursor' | 'windsurf' | 'antigravity' | 'vscode' | 'cody' | 'continue'
  | 'replit' | 'codesandbox' | 'stackblitz'
  | 'github' | 'gitlab' | 'bitbucket'
  | 'zip';

type SourceCategory = 'ai_builder' | 'ai_assistant' | 'ai_editor' | 'dev_platform' | 'repository' | 'file_upload';

interface SourceConfig {
  id: ImportSource;
  name: string;
  logoUrl: string | null; // SimpleIcons CDN URL or custom URL
  brandColor: string;
  description: string;
  category: SourceCategory;
  contextAvailable: boolean;
}

interface SplineLiquidGlassSelectionProps {
  selectedSource: ImportSource | null;
  onSelectSource: (source: ImportSource) => void;
  onContinue: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  currentStep?: number;
}

// =============================================================================
// REAL BRANDED LOGOS - SimpleIcons CDN
// =============================================================================

const SIMPLE_ICONS_CDN = 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons';

// Real logo URLs - using SimpleIcons where available, custom for others
const SOURCES: SourceConfig[] = [
  // AI Builders - some don't have official simple-icons yet
  { id: 'lovable', name: 'Lovable', logoUrl: null, brandColor: '#FF6B6B', description: 'Full-stack AI app builder', category: 'ai_builder', contextAvailable: true },
  { id: 'bolt', name: 'Bolt.new', logoUrl: null, brandColor: '#FFCC00', description: 'StackBlitz-powered AI builder', category: 'ai_builder', contextAvailable: true },
  { id: 'v0', name: 'v0.dev', logoUrl: `${SIMPLE_ICONS_CDN}/v0.svg`, brandColor: '#000000', description: 'Vercel component builder', category: 'ai_builder', contextAvailable: true },
  { id: 'create', name: 'Create.xyz', logoUrl: null, brandColor: '#7C3AED', description: 'AI-powered app creator', category: 'ai_builder', contextAvailable: true },
  { id: 'tempo', name: 'Tempo Labs', logoUrl: null, brandColor: '#00D4FF', description: 'AI development platform', category: 'ai_builder', contextAvailable: true },
  { id: 'gptengineer', name: 'GPT Engineer', logoUrl: null, brandColor: '#10B981', description: 'gptengineer.app', category: 'ai_builder', contextAvailable: false },
  { id: 'databutton', name: 'Databutton', logoUrl: null, brandColor: '#6366F1', description: 'AI data app builder', category: 'ai_builder', contextAvailable: true },
  { id: 'magic_patterns', name: 'Magic Patterns', logoUrl: null, brandColor: '#F472B6', description: 'Design-to-code AI', category: 'ai_builder', contextAvailable: true },
  
  // AI Assistants
  { id: 'claude', name: 'Claude', logoUrl: `${SIMPLE_ICONS_CDN}/claude.svg`, brandColor: '#D4A574', description: 'Anthropic AI assistant', category: 'ai_assistant', contextAvailable: true },
  { id: 'chatgpt', name: 'ChatGPT', logoUrl: `${SIMPLE_ICONS_CDN}/openai.svg`, brandColor: '#10A37F', description: 'OpenAI assistant', category: 'ai_assistant', contextAvailable: true },
  { id: 'gemini', name: 'Gemini', logoUrl: `${SIMPLE_ICONS_CDN}/googlegemini.svg`, brandColor: '#8E75B2', description: 'Google AI assistant', category: 'ai_assistant', contextAvailable: true },
  { id: 'copilot', name: 'GitHub Copilot', logoUrl: `${SIMPLE_ICONS_CDN}/githubcopilot.svg`, brandColor: '#000000', description: 'AI pair programmer', category: 'ai_assistant', contextAvailable: false },
  
  // AI Editors
  { id: 'cursor', name: 'Cursor', logoUrl: `${SIMPLE_ICONS_CDN}/cursor.svg`, brandColor: '#000000', description: 'AI-first code editor', category: 'ai_editor', contextAvailable: true },
  { id: 'windsurf', name: 'Windsurf', logoUrl: `${SIMPLE_ICONS_CDN}/windsurf.svg`, brandColor: '#00D4AA', description: 'Codeium AI IDE', category: 'ai_editor', contextAvailable: true },
  { id: 'vscode', name: 'VS Code', logoUrl: `${SIMPLE_ICONS_CDN}/visualstudiocode.svg`, brandColor: '#007ACC', description: 'With AI extensions', category: 'ai_editor', contextAvailable: false },
  
  // Dev Platforms
  { id: 'replit', name: 'Replit', logoUrl: `${SIMPLE_ICONS_CDN}/replit.svg`, brandColor: '#F26207', description: 'AI-powered IDE', category: 'dev_platform', contextAvailable: true },
  { id: 'codesandbox', name: 'CodeSandbox', logoUrl: `${SIMPLE_ICONS_CDN}/codesandbox.svg`, brandColor: '#151515', description: 'Cloud development', category: 'dev_platform', contextAvailable: false },
  { id: 'stackblitz', name: 'StackBlitz', logoUrl: `${SIMPLE_ICONS_CDN}/stackblitz.svg`, brandColor: '#1389FD', description: 'Web IDE', category: 'dev_platform', contextAvailable: false },
  
  // Repositories
  { id: 'github', name: 'GitHub', logoUrl: `${SIMPLE_ICONS_CDN}/github.svg`, brandColor: '#181717', description: 'GitHub repository', category: 'repository', contextAvailable: true },
  { id: 'gitlab', name: 'GitLab', logoUrl: `${SIMPLE_ICONS_CDN}/gitlab.svg`, brandColor: '#FC6D26', description: 'GitLab repository', category: 'repository', contextAvailable: true },
  { id: 'bitbucket', name: 'Bitbucket', logoUrl: `${SIMPLE_ICONS_CDN}/bitbucket.svg`, brandColor: '#0052CC', description: 'Bitbucket repository', category: 'repository', contextAvailable: true },
  
  // File Upload
  { id: 'zip', name: 'Upload ZIP', logoUrl: null, brandColor: '#F59E0B', description: 'Upload project files', category: 'file_upload', contextAvailable: false },
];

const CATEGORY_INFO: Record<SourceCategory, { label: string; color: string }> = {
  ai_builder: { label: 'AI App Builders', color: '#F59E0B' },
  ai_assistant: { label: 'AI Assistants', color: '#10B981' },
  ai_editor: { label: 'AI Code Editors', color: '#3B82F6' },
  dev_platform: { label: 'Dev Platforms', color: '#8B5CF6' },
  repository: { label: 'Repositories', color: '#EC4899' },
  file_upload: { label: 'File Upload', color: '#6B7280' },
};

const STEP_LABELS = ['SOURCE', 'ACCESS', 'IMPORT', 'CONTEXT', 'ANALYSIS', 'UI PREF', 'STRATEGY', 'FIX', 'DONE'];

// =============================================================================
// SPLINE GLASS SCENE URLS
// These are public Spline glass scenes
// =============================================================================

const SPLINE_SCENES = {
  // Glass background scene
  glassBackground: 'https://prod.spline.design/KUdlbGgiKyu9tTlF/scene.splinecode',
  // Alternative glass scenes if needed
  liquidGlass: 'https://prod.spline.design/6Wq1Q7YGyM-iab9i/scene.splinecode',
};

// =============================================================================
// LOGO COMPONENT - Real branded logos
// =============================================================================

function BrandLogo({ source, size = 24, className = '' }: { source: SourceConfig; size?: number; className?: string }) {
  const [error, setError] = useState(false);
  
  // Fallback: First letter of brand name
  if (!source.logoUrl || error) {
    return (
      <div 
        className={`flex items-center justify-center rounded-lg font-bold text-white ${className}`}
        style={{ 
          width: size, 
          height: size, 
          fontSize: size * 0.5,
          background: `linear-gradient(135deg, ${source.brandColor}, ${source.brandColor}99)`,
          boxShadow: `0 2px 8px ${source.brandColor}40`,
        }}
      >
        {source.name.charAt(0)}
      </div>
    );
  }
  
  return (
    <img 
      src={source.logoUrl}
      alt={`${source.name} logo`}
      width={size}
      height={size}
      className={className}
      style={{ 
        filter: source.brandColor === '#000000' ? 'invert(1)' : 'none',
      }}
      onError={() => setError(true)}
    />
  );
}

// =============================================================================
// 3D GLASS CARD - Real depth and edges
// =============================================================================

interface GlassCardProps {
  source: SourceConfig;
  isSelected: boolean;
  onSelect: () => void;
}

function GlassCard({ source, isSelected, onSelect }: GlassCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  
  // 3D tilt effect
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const rotateX = useTransform(y, [-0.5, 0.5], [8, -8]);
  const rotateY = useTransform(x, [-0.5, 0.5], [-8, 8]);
  
  const config = { stiffness: 400, damping: 30 };
  const rotateXSpring = useSpring(rotateX, config);
  const rotateYSpring = useSpring(rotateY, config);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    x.set((e.clientX - rect.left - rect.width / 2) / rect.width);
    y.set((e.clientY - rect.top - rect.height / 2) / rect.height);
  }, [x, y]);
  
  const handleMouseLeave = useCallback(() => {
    x.set(0);
    y.set(0);
    setIsHovered(false);
  }, [x, y]);
  
  return (
    <motion.div
      ref={cardRef}
      onClick={onSelect}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX: rotateXSpring,
        rotateY: rotateYSpring,
        transformStyle: 'preserve-3d',
        perspective: '1000px',
      }}
      whileTap={{ scale: 0.98 }}
      className="relative cursor-pointer"
    >
      {/* Main card with REAL 3D depth */}
      <div
        className="relative p-4 rounded-2xl transition-all duration-200"
        style={{
          // Real 3D box shadow for visible depth
          background: isSelected 
            ? `linear-gradient(145deg, ${source.brandColor}15, ${source.brandColor}05)`
            : 'linear-gradient(145deg, rgba(30,41,59,0.9), rgba(15,23,42,0.95))',
          border: isSelected 
            ? `2px solid ${source.brandColor}`
            : '1px solid rgba(255,255,255,0.1)',
          // VISIBLE 3D DEPTH SHADOWS - not flat
          boxShadow: isSelected 
            ? `
              0 4px 0 ${source.brandColor}50,
              0 8px 0 ${source.brandColor}30,
              0 12px 25px rgba(0,0,0,0.5),
              inset 0 1px 0 rgba(255,255,255,0.1)
            `
            : isHovered
            ? `
              0 3px 0 rgba(0,0,0,0.4),
              0 6px 0 rgba(0,0,0,0.25),
              0 10px 20px rgba(0,0,0,0.4),
              inset 0 1px 0 rgba(255,255,255,0.08)
            `
            : `
              0 2px 0 rgba(0,0,0,0.35),
              0 4px 0 rgba(0,0,0,0.2),
              0 6px 12px rgba(0,0,0,0.3),
              inset 0 1px 0 rgba(255,255,255,0.05)
            `,
          transform: isSelected 
            ? 'translateY(-4px) translateZ(10px)' 
            : isHovered 
            ? 'translateY(-2px) translateZ(5px)' 
            : 'translateY(0) translateZ(0)',
        }}
      >
        {/* Top edge highlight - simulates glass edge */}
        <div 
          className="absolute top-0 left-2 right-2 h-[1px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${isSelected ? source.brandColor : 'rgba(255,255,255,0.2)'}50%, transparent)`,
          }}
        />
        
        {/* Content */}
        <div className="flex items-center gap-3">
          {/* Logo container with 3D depth */}
          <div 
            className="flex-shrink-0 p-2 rounded-xl"
            style={{
              background: isSelected 
                ? `${source.brandColor}20` 
                : 'rgba(255,255,255,0.05)',
              boxShadow: isSelected
                ? `0 2px 0 ${source.brandColor}30, inset 0 1px 0 rgba(255,255,255,0.1)`
                : '0 1px 0 rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            <BrandLogo source={source} size={28} />
          </div>
          
          {/* Text */}
          <div className="flex-1 min-w-0">
            <h4 
              className="font-semibold text-sm truncate"
              style={{ 
                color: isSelected ? '#fff' : '#e2e8f0',
                fontFamily: '"Cabinet Grotesk", system-ui',
              }}
            >
              {source.name}
            </h4>
            <p 
              className="text-xs truncate"
              style={{ 
                color: '#64748b',
                fontFamily: '"Satoshi", system-ui',
              }}
            >
              {source.description}
            </p>
          </div>
          
          {/* Context badge with depth */}
          {source.contextAvailable && (
            <span
              className="px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background: isSelected ? `${source.brandColor}20` : 'rgba(16,185,129,0.15)',
                color: isSelected ? source.brandColor : '#10b981',
                boxShadow: '0 1px 0 rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              CTX
            </span>
          )}
        </div>
        
        {/* Selected indicator with glow */}
        {isSelected && (
          <motion.div
            layoutId="card-selected"
            className="absolute top-2 right-2 w-2 h-2 rounded-full"
            style={{ 
              background: source.brandColor,
              boxShadow: `0 0 8px ${source.brandColor}, 0 0 16px ${source.brandColor}50`,
            }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', bounce: 0.5 }}
          />
        )}
      </div>
      
      {/* Bottom 3D edge - VISIBLE depth layer */}
      <div 
        className="absolute -bottom-1 left-2 right-2 h-2 rounded-b-2xl -z-10"
        style={{
          background: isSelected 
            ? `linear-gradient(180deg, ${source.brandColor}40, ${source.brandColor}10)` 
            : 'linear-gradient(180deg, rgba(0,0,0,0.4), rgba(0,0,0,0.1))',
          transform: 'translateY(2px)',
        }}
      />
    </motion.div>
  );
}

// =============================================================================
// 3D PROGRESS STEPPER WITH LIQUID GLASS SPHERES
// =============================================================================

function ProgressStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="relative py-8">
      {/* Connection line */}
      <div className="absolute top-1/2 left-8 right-8 h-1 -translate-y-1/2 rounded-full overflow-hidden">
        <div 
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(90deg, rgba(30,41,59,0.8), rgba(30,41,59,0.8))',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
          }}
        />
        {/* Progress fill */}
        <motion.div
          className="absolute top-0 left-0 h-full"
          style={{
            background: 'linear-gradient(90deg, #f59e0b, #ea580c)',
            boxShadow: '0 0 10px #f59e0b50',
          }}
          initial={{ width: '0%' }}
          animate={{ width: `${(currentStep / (STEP_LABELS.length - 1)) * 100}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      
      {/* Step indicators */}
      <div className="relative flex justify-between">
        {STEP_LABELS.map((label, i) => {
          const isActive = i === currentStep;
          const isComplete = i < currentStep;
          
          return (
            <div key={label} className="flex flex-col items-center">
              {/* 3D Glass sphere with VISIBLE depth */}
              <motion.div
                className="relative"
                animate={{
                  scale: isActive ? 1.2 : 1,
                  y: isActive ? -4 : 0,
                }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                {/* Sphere with 3D depth */}
                <div
                  className="w-6 h-6 rounded-full relative"
                  style={{
                    background: isComplete || isActive
                      ? 'linear-gradient(135deg, #fbbf24, #f59e0b, #ea580c)'
                      : 'linear-gradient(135deg, rgba(51,65,85,0.9), rgba(30,41,59,0.95))',
                    // REAL 3D spherical appearance with visible depth
                    boxShadow: isComplete || isActive
                      ? `
                        0 3px 0 #b45309,
                        0 6px 12px rgba(245,158,11,0.5),
                        inset -3px -3px 6px rgba(0,0,0,0.3),
                        inset 3px 3px 6px rgba(255,255,255,0.3)
                      `
                      : `
                        0 2px 0 rgba(0,0,0,0.4),
                        0 4px 8px rgba(0,0,0,0.3),
                        inset -2px -2px 4px rgba(0,0,0,0.3),
                        inset 2px 2px 4px rgba(255,255,255,0.05)
                      `,
                  }}
                >
                  {/* Inner highlight for glass effect */}
                  <div 
                    className="absolute top-1 left-1 w-2 h-2 rounded-full"
                    style={{
                      background: isComplete || isActive
                        ? 'rgba(255,255,255,0.4)'
                        : 'rgba(255,255,255,0.1)',
                    }}
                  />
                </div>
                
                {/* Active glow */}
                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-full -z-10"
                    animate={{
                      scale: [1, 1.4, 1],
                      opacity: [0.5, 0, 0.5],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    style={{
                      background: '#f59e0b',
                      filter: 'blur(8px)',
                    }}
                  />
                )}
              </motion.div>
              
              {/* Label */}
              <span
                className="mt-3 text-[9px] font-semibold uppercase tracking-wider"
                style={{
                  color: isActive ? '#f59e0b' : isComplete ? '#92400e' : '#475569',
                  fontFamily: '"Satoshi", system-ui',
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// SPLINE BACKGROUND COMPONENT
// =============================================================================

function SplineBackground() {
  const [loaded, setLoaded] = useState(false);
  
  return (
    <div className="absolute inset-0 -z-10">
      <Suspense fallback={null}>
        <Spline
          scene={SPLINE_SCENES.glassBackground}
          onLoad={() => setLoaded(true)}
          style={{
            width: '100%',
            height: '100%',
            opacity: loaded ? 0.3 : 0,
            transition: 'opacity 1s ease-out',
          }}
        />
      </Suspense>
      
      {/* Gradient overlay */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 30% 20%, rgba(245,158,11,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(234,88,12,0.06) 0%, transparent 50%)',
        }}
      />
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function SplineLiquidGlassSelection({
  selectedSource,
  onSelectSource,
  onContinue,
  onCancel,
  isLoading = false,
  currentStep = 0,
}: SplineLiquidGlassSelectionProps) {
  const sourcesByCategory = useMemo(() => {
    const grouped: Record<SourceCategory, SourceConfig[]> = {
      ai_builder: [], ai_assistant: [], ai_editor: [],
      dev_platform: [], repository: [], file_upload: [],
    };
    SOURCES.forEach((s) => grouped[s.category].push(s));
    return grouped;
  }, []);
  
  const selectedConfig = SOURCES.find(s => s.id === selectedSource);
  
  return (
    <div 
      className="min-h-screen relative overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #0a0a0b 0%, #0f172a 50%, #0a0a0b 100%)',
      }}
    >
      {/* Spline 3D Background */}
      <SplineBackground />
      
      {/* Grid pattern */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }}
      />
      
      {/* Header with 3D depth */}
      <header 
        className="relative z-20 border-b"
        style={{
          borderColor: 'rgba(255,255,255,0.05)',
          background: 'linear-gradient(180deg, rgba(15,23,42,0.95), rgba(15,23,42,0.8))',
        }}
      >
        {/* Bottom edge glow */}
        <div 
          className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(245,158,11,0.4), transparent)',
          }}
        />
        
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* 3D Gear icon with visible depth */}
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center relative"
              style={{
                background: 'linear-gradient(135deg, #fbbf24, #f59e0b, #ea580c)',
                boxShadow: `
                  0 4px 0 #b45309,
                  0 8px 20px rgba(245,158,11,0.5),
                  inset 0 2px 0 rgba(255,255,255,0.3)
                `,
                transform: 'translateY(-2px)',
              }}
            >
              {/* Animated gear SVG */}
              <motion.svg 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none"
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              >
                <path
                  d="M12 15a3 3 0 100-6 3 3 0 000 6z"
                  stroke="#1c1917"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"
                  stroke="#1c1917"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </motion.svg>
            </div>
            
            <div>
              <h1 
                className="text-xl font-bold text-white"
                style={{ fontFamily: '"Clash Display", system-ui' }}
              >
                Fix My App
              </h1>
              <p 
                className="text-xs text-slate-400"
                style={{ fontFamily: '"Satoshi", system-ui' }}
              >
                Import & fix broken AI-built apps
              </p>
            </div>
          </div>
          
          {/* Cancel button with 3D depth */}
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 transition-all"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 2px 0 rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            Cancel
          </button>
        </div>
      </header>
      
      {/* Progress Stepper */}
      <div className="max-w-4xl mx-auto px-6">
        <ProgressStepper currentStep={currentStep} />
      </div>
      
      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 pb-8">
        {/* Main card with REAL 3D depth */}
        <div 
          className="relative rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(30,41,59,0.7), rgba(15,23,42,0.9))',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: `
              0 6px 0 rgba(0,0,0,0.35),
              0 12px 0 rgba(0,0,0,0.2),
              0 20px 40px rgba(0,0,0,0.5),
              inset 0 1px 0 rgba(255,255,255,0.08)
            `,
          }}
        >
          {/* Top edge highlight */}
          <div 
            className="absolute top-0 left-4 right-4 h-[1px]"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
            }}
          />
          
          {/* Header */}
          <div className="p-6 pb-4">
            <h2 
              className="text-2xl font-semibold text-white mb-1"
              style={{ fontFamily: '"Clash Display", system-ui' }}
            >
              Where is your app from?
            </h2>
            <p 
              className="text-slate-400 text-sm"
              style={{ fontFamily: '"Satoshi", system-ui' }}
            >
              Select the platform where your broken app was built. We support 25+ AI builders.
            </p>
          </div>
          
          {/* Source grid */}
          <div 
            className="px-6 pb-6 max-h-[50vh] overflow-y-auto"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(245,158,11,0.3) transparent',
            }}
          >
            {Object.entries(sourcesByCategory).map(([category, sources]) => {
              if (sources.length === 0) return null;
              const info = CATEGORY_INFO[category as SourceCategory];
              
              return (
                <div key={category} className="mb-6 last:mb-0">
                  <div className="flex items-center gap-2 mb-3">
                    <div 
                      className="w-1 h-4 rounded-full"
                      style={{ background: info.color }}
                    />
                    <h3 
                      className="text-sm font-semibold text-slate-300"
                      style={{ fontFamily: '"Cabinet Grotesk", system-ui' }}
                    >
                      {info.label}
                    </h3>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sources.map((source) => (
                      <GlassCard
                        key={source.id}
                        source={source}
                        isSelected={selectedSource === source.id}
                        onSelect={() => onSelectSource(source.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Footer with 3D Continue button */}
          <div 
            className="px-6 py-4 flex items-center justify-between"
            style={{
              background: 'rgba(15,23,42,0.7)',
              borderTop: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <div className="text-sm text-slate-500">
              {selectedConfig && (
                <span>
                  Selected: <span className="text-white font-medium">{selectedConfig.name}</span>
                </span>
              )}
            </div>
            
            {/* 3D Continue Button with VISIBLE depth */}
            <motion.button
              onClick={onContinue}
              disabled={!selectedSource || isLoading}
              whileHover={{ y: -2 }}
              whileTap={{ y: 1 }}
              className="relative px-8 py-3 rounded-xl font-semibold text-black disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #fbbf24, #f59e0b, #ea580c)',
                fontFamily: '"Cabinet Grotesk", system-ui',
                // VISIBLE 3D depth
                boxShadow: `
                  0 4px 0 #b45309,
                  0 8px 0 #92400e,
                  0 12px 24px rgba(245,158,11,0.4),
                  inset 0 2px 0 rgba(255,255,255,0.3)
                `,
                transform: 'translateY(-4px)',
              }}
            >
              {/* Top highlight */}
              <div 
                className="absolute top-0 left-0 right-0 h-1/2 rounded-t-xl"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%)',
                }}
              />
              
              {/* Shimmer */}
              <motion.div
                className="absolute inset-0"
                animate={{
                  x: ['0%', '200%'],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'linear',
                }}
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                  transform: 'skewX(-20deg)',
                }}
              />
              
              <span className="relative z-10">
                {isLoading ? 'Loading...' : 'Continue →'}
              </span>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SplineLiquidGlassSelection;
