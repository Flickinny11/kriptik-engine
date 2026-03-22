/**
 * PremiumSourceSelection.tsx - Premium AI Builder Source Selection
 *
 * Photorealistic liquid glass design with:
 * - 3D progress stepper with glass spheres
 * - Animated 3D gear header
 * - Branded icons for all AI builders
 * - Tilt/perspective effects on hover
 * - Slider Revolution-inspired animations
 */

import { useState, useRef, useMemo, Suspense } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  MeshTransmissionMaterial,
  Float,
  Environment,
  Lightformer,
} from '@react-three/drei';
import { Shape, Path, ExtrudeGeometry, Mesh } from 'three';
import { cn } from '@/lib/utils';
import { supportsTransmission, getQualityLevel } from '@/lib/webgl';
import '@/styles/fix-my-app-premium.css';

// =============================================================================
// FONTS
// =============================================================================

const FONT = {
  clash: '"Clash Display", "SF Pro Display", system-ui, sans-serif',
  cabinet: '"Cabinet Grotesk", "SF Pro Display", system-ui, sans-serif',
  satoshi: '"Satoshi", "SF Pro Display", system-ui, sans-serif',
};

// =============================================================================
// TYPES
// =============================================================================

export type ImportSource =
  | 'lovable' | 'bolt' | 'v0' | 'create' | 'tempo' | 'gptengineer' | 'databutton' | 'magic_patterns'
  | 'claude' | 'chatgpt' | 'gemini' | 'copilot'
  | 'cursor' | 'windsurf' | 'antigravity' | 'vscode' | 'cody' | 'continue'
  | 'replit' | 'codesandbox'
  | 'github' | 'gitlab' | 'bitbucket'
  | 'zip';

type SourceCategory = 'ai_builder' | 'ai_assistant' | 'ai_editor' | 'dev_platform' | 'repository' | 'file_upload';

interface SourceConfig {
  id: ImportSource;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any> | null;
  brandColor: string;
  description: string;
  category: SourceCategory;
  contextAvailable: boolean;
}

interface PremiumSourceSelectionProps {
  selectedSource: ImportSource | null;
  onSelectSource: (source: ImportSource) => void;
  onContinue: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  currentStep?: number;
}

// =============================================================================
// CUSTOM ICONS
// =============================================================================

// Custom branded icons
const LovableIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
  </svg>
);

const BoltIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z"/>
  </svg>
);

const VercelIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 1L24 22H0L12 1z"/>
  </svg>
);

const OpenAIIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494z"/>
  </svg>
);

const AnthropicIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.343-3.461H5.017l-1.344 3.46H0l6.57-16.96zm2.327 10.239l-2.064-5.358-2.064 5.358h4.128z"/>
  </svg>
);

const GeminiIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 24A14.304 14.304 0 0 1 0 12 14.304 14.304 0 0 1 12 0a14.305 14.305 0 0 1 12 12 14.305 14.305 0 0 1-12 12"/>
  </svg>
);

const GitHubIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
  </svg>
);

const GitLabIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M23.955 13.587l-1.342-4.135-2.664-8.189a.455.455 0 0 0-.867 0L16.418 9.45H7.582L4.918 1.263a.455.455 0 0 0-.867 0L1.386 9.45.044 13.587a.924.924 0 0 0 .331 1.023L12 23.054l11.625-8.443a.92.92 0 0 0 .33-1.024"/>
  </svg>
);

const BitbucketIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M.778 1.213a.768.768 0 0 0-.768.892l3.263 19.81c.084.5.515.868 1.022.873H19.95a.772.772 0 0 0 .77-.646l3.27-20.03a.768.768 0 0 0-.768-.891zM14.52 15.53H9.522L8.17 8.466h7.561z"/>
  </svg>
);

const ReplitIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M2 1.5A1.5 1.5 0 0 1 3.5 0h7A1.5 1.5 0 0 1 12 1.5V6H3.5A1.5 1.5 0 0 1 2 4.5zM12 6h8.5A1.5 1.5 0 0 1 22 7.5v9a1.5 1.5 0 0 1-1.5 1.5H12zM2 19.5A1.5 1.5 0 0 1 3.5 18H12v4.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 2 22.5z"/>
  </svg>
);

const CodeSandboxIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M2 6l10.455-6L22.91 6 23 17.95 12.455 24 2 18V6zm2.088 2.481v4.757l3.345 1.86v3.516l3.972 2.296v-8.272zm16.739 0l-7.317 4.157v8.272l3.972-2.296V15.1l3.345-1.861V8.48zM4.134 6.601l7.303 4.144 7.32-4.18-3.871-2.197-3.41 1.945-3.43-1.968L4.133 6.6z"/>
  </svg>
);

const VSCodeIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z"/>
  </svg>
);

const SourcegraphIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M14.03 1.065a.94.94 0 0 0-.47-.31c-.19-.05-.39-.03-.57.05l-6.2 2.94a.957.957 0 0 0-.55.87v6.93l-3.86 1.83a.963.963 0 0 0-.55.87v5.53c0 .36.2.7.52.87l5.89 3.15c.14.08.3.12.46.12.16 0 .32-.04.46-.12l7.41-3.96 5.56 2.98c.14.08.3.12.46.12.16 0 .32-.04.46-.12l.03-.02a.945.945 0 0 0 .46-.82V6.39a.93.93 0 0 0-.55-.87z"/>
  </svg>
);

const CursorIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 3l14 9-6 2-2 6z"/>
    <path d="M14 14l5 5"/>
  </svg>
);

const WindsurfIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
    <circle cx="12" cy="12" r="4"/>
  </svg>
);

const CreateIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3"/>
    <path d="M12 8v8m-4-4h8"/>
  </svg>
);

const TempoIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 6v6l4 2"/>
  </svg>
);

const GptEngineerIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
    <path d="M2 17l10 5 10-5"/>
    <path d="M2 12l10 5 10-5"/>
  </svg>
);

const DatabuttonIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);

const MagicIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2l2.4 7.4h7.6l-6.2 4.5 2.4 7.3-6.2-4.5-6.2 4.5 2.4-7.3-6.2-4.5h7.6z"/>
  </svg>
);

const CopilotIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
  </svg>
);

const AntigravityIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 2v4m0 12v4M2 12h4m12 0h4" stroke={color} strokeWidth="2" fill="none"/>
  </svg>
);

const ContinueIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M8 5v14l11-7z"/>
  </svg>
);

const ZipIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    <path d="M12 11v6m-3-3h6"/>
  </svg>
);

// =============================================================================
// SOURCE CONFIGURATIONS
// =============================================================================

const SOURCES: SourceConfig[] = [
  // AI Builders
  { id: 'lovable', name: 'Lovable', icon: LovableIcon, brandColor: '#FF6B9D', description: 'Full-stack AI app builder', category: 'ai_builder', contextAvailable: true },
  { id: 'bolt', name: 'Bolt.new', icon: BoltIcon, brandColor: '#FFCC00', description: 'AI-powered web builder', category: 'ai_builder', contextAvailable: true },
  { id: 'v0', name: 'v0.dev', icon: VercelIcon, brandColor: '#FFFFFF', description: 'Vercel component builder', category: 'ai_builder', contextAvailable: true },
  { id: 'create', name: 'Create.xyz', icon: CreateIcon, brandColor: '#FF4D4D', description: 'AI-powered app creation', category: 'ai_builder', contextAvailable: true },
  { id: 'tempo', name: 'Tempo Labs', icon: TempoIcon, brandColor: '#6366F1', description: 'AI development platform', category: 'ai_builder', contextAvailable: true },
  { id: 'gptengineer', name: 'GPT Engineer', icon: GptEngineerIcon, brandColor: '#10B981', description: 'gptengineer.app', category: 'ai_builder', contextAvailable: true },
  { id: 'databutton', name: 'Databutton', icon: DatabuttonIcon, brandColor: '#3B82F6', description: 'AI data app builder', category: 'ai_builder', contextAvailable: true },
  { id: 'magic_patterns', name: 'Magic Patterns', icon: MagicIcon, brandColor: '#F59E0B', description: 'Design-to-code AI', category: 'ai_builder', contextAvailable: true },

  // AI Assistants
  { id: 'claude', name: 'Claude', icon: AnthropicIcon, brandColor: '#D97757', description: 'Anthropic Claude', category: 'ai_assistant', contextAvailable: true },
  { id: 'chatgpt', name: 'ChatGPT', icon: OpenAIIcon, brandColor: '#10A37F', description: 'OpenAI ChatGPT', category: 'ai_assistant', contextAvailable: true },
  { id: 'gemini', name: 'Gemini', icon: GeminiIcon, brandColor: '#4285F4', description: 'Google Gemini', category: 'ai_assistant', contextAvailable: true },
  { id: 'copilot', name: 'Copilot', icon: CopilotIcon, brandColor: '#FFFFFF', description: 'GitHub Copilot', category: 'ai_assistant', contextAvailable: true },

  // AI Editors
  { id: 'cursor', name: 'Cursor', icon: CursorIcon, brandColor: '#00D9FF', description: 'AI-first code editor', category: 'ai_editor', contextAvailable: true },
  { id: 'windsurf', name: 'Windsurf', icon: WindsurfIcon, brandColor: '#00B4D8', description: 'Codeium AI editor', category: 'ai_editor', contextAvailable: true },
  { id: 'antigravity', name: 'Antigravity', icon: AntigravityIcon, brandColor: '#EA4335', description: 'Google agentic AI', category: 'ai_editor', contextAvailable: true },
  { id: 'vscode', name: 'VS Code', icon: VSCodeIcon, brandColor: '#007ACC', description: 'VS Code + AI', category: 'ai_editor', contextAvailable: true },
  { id: 'cody', name: 'Cody', icon: SourcegraphIcon, brandColor: '#FF5543', description: 'Sourcegraph AI', category: 'ai_editor', contextAvailable: true },
  { id: 'continue', name: 'Continue', icon: ContinueIcon, brandColor: '#6366F1', description: 'Open-source AI', category: 'ai_editor', contextAvailable: true },

  // Dev Platforms
  { id: 'replit', name: 'Replit', icon: ReplitIcon, brandColor: '#F26207', description: 'Online IDE + AI', category: 'dev_platform', contextAvailable: true },
  { id: 'codesandbox', name: 'CodeSandbox', icon: CodeSandboxIcon, brandColor: '#151515', description: 'Browser IDE', category: 'dev_platform', contextAvailable: false },

  // Repositories
  { id: 'github', name: 'GitHub', icon: GitHubIcon, brandColor: '#FFFFFF', description: 'GitHub repo', category: 'repository', contextAvailable: false },
  { id: 'gitlab', name: 'GitLab', icon: GitLabIcon, brandColor: '#FC6D26', description: 'GitLab repo', category: 'repository', contextAvailable: false },
  { id: 'bitbucket', name: 'Bitbucket', icon: BitbucketIcon, brandColor: '#0052CC', description: 'Bitbucket repo', category: 'repository', contextAvailable: false },

  // File Upload
  { id: 'zip', name: 'ZIP Upload', icon: ZipIcon, brandColor: '#64748B', description: 'Upload project', category: 'file_upload', contextAvailable: false },
];

const CATEGORIES: Record<SourceCategory, { label: string; color: string }> = {
  ai_builder: { label: 'AI App Builders', color: '#F59E0B' },
  ai_assistant: { label: 'AI Assistants', color: '#10B981' },
  ai_editor: { label: 'AI Code Editors', color: '#3B82F6' },
  dev_platform: { label: 'Dev Platforms', color: '#F97316' },
  repository: { label: 'Repositories', color: '#6B7280' },
  file_upload: { label: 'File Upload', color: '#8B5CF6' },
};

const SOURCE_STEPS = ['Source', 'Access', 'Import', 'Context', 'Analysis', 'Strategy', 'Fix', 'Done'];

// =============================================================================
// 3D ANIMATED GEARS
// =============================================================================

function AnimatedGears() {
  const gear1Ref = useRef<Mesh>(null);
  const gear2Ref = useRef<Mesh>(null);
  const gear3Ref = useRef<Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (gear1Ref.current) gear1Ref.current.rotation.z = t * 0.5;
    if (gear2Ref.current) gear2Ref.current.rotation.z = -t * 0.7;
    if (gear3Ref.current) gear3Ref.current.rotation.z = t * 0.4;
  });

  const GearMesh = ({ outerRadius = 0.4, innerRadius = 0.12, teeth = 10, depth = 0.08, color = '#f59e0b' }) => {
    const gearGeometry = useMemo(() => {
      const shape = new Shape();
      const toothDepth = 0.06;
      const toothWidth = (2 * Math.PI) / teeth / 3;

      shape.moveTo(outerRadius, 0);

      for (let i = 0; i < teeth; i++) {
        const angle = (i / teeth) * Math.PI * 2;
        const nextAngle = ((i + 1) / teeth) * Math.PI * 2;

        shape.lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius);
        shape.lineTo(Math.cos(angle + toothWidth) * (outerRadius + toothDepth), Math.sin(angle + toothWidth) * (outerRadius + toothDepth));
        shape.lineTo(Math.cos(angle + toothWidth * 2) * outerRadius, Math.sin(angle + toothWidth * 2) * outerRadius);
        shape.lineTo(Math.cos(nextAngle) * outerRadius, Math.sin(nextAngle) * outerRadius);
      }

      const hole = new Path();
      hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
      shape.holes.push(hole);

      const extrudeSettings = { depth, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 };
      return new ExtrudeGeometry(shape, extrudeSettings);
    }, [outerRadius, innerRadius, teeth, depth]);

    return (
      <mesh geometry={gearGeometry}>
        <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
      </mesh>
    );
  };

  return (
    <group>
      <mesh ref={gear1Ref} position={[0, 0, 0]}>
        <GearMesh outerRadius={0.38} teeth={12} color="#f59e0b" />
      </mesh>
      <mesh ref={gear2Ref} position={[0.48, 0.28, -0.03]}>
        <GearMesh outerRadius={0.24} innerRadius={0.08} teeth={8} color="#ea580c" />
      </mesh>
      <mesh ref={gear3Ref} position={[-0.35, 0.32, 0.03]}>
        <GearMesh outerRadius={0.18} innerRadius={0.06} teeth={6} color="#fbbf24" />
      </mesh>
    </group>
  );
}

// =============================================================================
// 3D PROGRESS SPHERE
// =============================================================================

interface ProgressSphereProps {
  position: [number, number, number];
  isActive: boolean;
  isComplete: boolean;
  delay: number;
}

function ProgressSphere({ position, isActive, isComplete, delay }: ProgressSphereProps) {
  const meshRef = useRef<Mesh>(null);
  const quality = useMemo(() => getQualityLevel(), []);
  const useHQ = quality === 'high' && supportsTransmission();

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2 + delay) * 0.03;

    if (isActive) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.08;
      meshRef.current.scale.setScalar(pulse);
    }
  });

  const color = isActive || isComplete ? '#f59e0b' : '#334155';

  return (
    <Float speed={1.5} rotationIntensity={0.15} floatIntensity={0.2}>
      <mesh ref={meshRef} position={position}>
        <sphereGeometry args={[0.12, 24, 24]} />
        {useHQ ? (
          <MeshTransmissionMaterial
            backside
            samples={6}
            resolution={128}
            transmission={isComplete ? 0.5 : 0.85}
            roughness={0.1}
            thickness={0.2}
            ior={1.4}
            chromaticAberration={0.03}
            clearcoat={1}
            attenuationColor={color}
            color={color}
            distortionScale={0}
            temporalDistortion={0}
          />
        ) : (
          <meshPhysicalMaterial
            color={color}
            transmission={isComplete ? 0.3 : 0.7}
            roughness={0.15}
            thickness={0.2}
            ior={1.4}
            clearcoat={1}
            transparent
          />
        )}
      </mesh>

      {(isActive || isComplete) && (
        <mesh position={position}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.5} />
        </mesh>
      )}
    </Float>
  );
}

// =============================================================================
// 3D PROGRESS STEPPER SCENE
// =============================================================================

function ProgressScene({ currentStep }: { currentStep: number }) {
  const spacing = 0.9;
  const totalSteps = 8;
  const startX = -((totalSteps - 1) * spacing) / 2;

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} color="#fff5eb" />
      <pointLight position={[0, 0, 2]} intensity={1} color="#f59e0b" distance={8} />

      <Environment preset="studio">
        <Lightformer position={[0, 4, -4]} scale={[8, 2, 1]} intensity={1.5} color="#fef3c7" />
      </Environment>

      {Array.from({ length: totalSteps }).map((_, i) => (
        <ProgressSphere
          key={i}
          position={[startX + i * spacing, 0, 0]}
          isActive={i === currentStep}
          isComplete={i < currentStep}
          delay={i * 0.4}
        />
      ))}

      {Array.from({ length: totalSteps - 1 }).map((_, i) => (
        <mesh key={`line-${i}`} position={[startX + i * spacing + spacing / 2, 0, -0.05]}>
          <boxGeometry args={[spacing - 0.32, 0.015, 0.015]} />
          <meshStandardMaterial color={i < currentStep ? '#f59e0b' : '#1e293b'} metalness={0.4} roughness={0.4} />
        </mesh>
      ))}

      <fog attach="fog" args={['#0a0a0b', 2, 12]} />
    </>
  );
}

// =============================================================================
// SOURCE CARD COMPONENT
// =============================================================================

interface SourceCardProps {
  source: SourceConfig;
  isSelected: boolean;
  onSelect: () => void;
}

function SourceCard({ source, isSelected, onSelect }: SourceCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useTransform(y, [-0.5, 0.5], [4, -4]);
  const rotateY = useTransform(x, [-0.5, 0.5], [-4, 4]);

  const config = { stiffness: 350, damping: 30 };
  const rotateXSpring = useSpring(rotateX, config);
  const rotateYSpring = useSpring(rotateY, config);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    x.set((e.clientX - rect.left - rect.width / 2) / rect.width);
    y.set((e.clientY - rect.top - rect.height / 2) / rect.height);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
    setIsHovered(false);
  };

  const Icon = source.icon;

  return (
    <motion.div
      ref={cardRef}
      onClick={onSelect}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      whileTap={{ scale: 0.97 }}
      style={{
        rotateX: rotateXSpring,
        rotateY: rotateYSpring,
        transformStyle: 'preserve-3d',
      }}
      className="relative cursor-pointer select-none"
    >
      <div
        className={cn(
          'relative p-3.5 rounded-xl overflow-hidden transition-all duration-200',
          isSelected && 'ring-2'
        )}
        style={{
          background: isSelected
            ? `linear-gradient(135deg, ${source.brandColor}18, ${source.brandColor}08)`
            : 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(12px)',
          border: `1px solid ${isSelected ? source.brandColor + '50' : 'rgba(255,255,255,0.06)'}`,
          boxShadow: isSelected
            ? `0 4px 0 ${source.brandColor}30, 0 8px 20px ${source.brandColor}25, inset 0 1px 0 rgba(255,255,255,0.08)`
            : isHovered
            ? '0 4px 0 rgba(0,0,0,0.25), 0 8px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)'
            : '0 2px 0 rgba(0,0,0,0.2), 0 4px 10px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.04)',
          transform: isSelected ? 'translateY(-2px)' : isHovered ? 'translateY(-1px)' : 'none',
          // @ts-expect-error - ring color is a Tailwind utility
          '--tw-ring-color': source.brandColor,
        }}
      >
        {/* Depth edge */}
        <div
          className="absolute bottom-0 left-2 right-2 h-[3px] rounded-b-lg"
          style={{
            background: isSelected ? source.brandColor + '50' : 'rgba(0,0,0,0.2)',
            transform: 'translateY(100%)',
          }}
        />

        <div className="flex items-center gap-3">
          {/* Icon */}
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200"
            style={{
              background: isSelected ? `${source.brandColor}20` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isSelected ? source.brandColor + '35' : 'rgba(255,255,255,0.08)'}`,
              boxShadow: isSelected ? `0 2px 6px ${source.brandColor}18` : 'none',
            }}
          >
            {Icon && <Icon size={18} color={isSelected ? source.brandColor : '#94a3b8'} />}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <h4
              className={cn('font-semibold text-sm truncate', isSelected ? 'text-white' : 'text-slate-200')}
              style={{ fontFamily: FONT.cabinet }}
            >
              {source.name}
            </h4>
            <p
              className="text-[11px] text-slate-500 truncate"
              style={{ fontFamily: FONT.satoshi }}
            >
              {source.description}
            </p>
          </div>

          {/* Context badge */}
          {source.contextAvailable && (
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider"
              style={{
                background: isSelected ? `${source.brandColor}15` : 'rgba(16,185,129,0.1)',
                color: isSelected ? source.brandColor : '#10b981',
                fontFamily: FONT.satoshi,
              }}
            >
              CTX
            </span>
          )}
        </div>

        {/* Selected dot */}
        {isSelected && (
          <motion.div
            layoutId="source-selected"
            className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
            style={{ background: source.brandColor }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', bounce: 0.5 }}
          />
        )}
      </div>
    </motion.div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function PremiumSourceSelection({
  selectedSource,
  onSelectSource,
  onContinue,
  onCancel,
  isLoading = false,
  currentStep = 0,
}: PremiumSourceSelectionProps) {
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
    <div className="fma-container min-h-screen">
      {/* Header */}
      <header className="fma-header relative z-20">
        <div className="fma-header-bg" />
        <div className="fma-header-edge" />

        <div className="relative max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* 3D Gears */}
            <div className="fma-gear-container">
              <Canvas camera={{ position: [0, 0, 1.8], fov: 50 }} gl={{ antialias: true, alpha: true }} dpr={[1, 2]}>
                <ambientLight intensity={0.5} />
                <directionalLight position={[2, 2, 2]} intensity={1} />
                <Suspense fallback={null}>
                  <AnimatedGears />
                </Suspense>
              </Canvas>
            </div>

            <div>
              <h1 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: FONT.clash }}>
                Fix My App
              </h1>
              <p className="text-xs text-slate-400" style={{ fontFamily: FONT.satoshi }}>
                Import & fix broken AI-built apps
              </p>
            </div>
          </div>

          <motion.button
            onClick={onCancel}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="fma-button-ghost"
          >
            Cancel
          </motion.button>
        </div>
      </header>

      {/* Progress Stepper */}
      <div className="relative max-w-5xl mx-auto px-6 py-4">
        <div className="fma-progress-container">
          <Canvas camera={{ position: [0, 0, 4], fov: 40 }} gl={{ antialias: true, alpha: true }} dpr={[1, 2]}>
            <Suspense fallback={null}>
              <ProgressScene currentStep={currentStep} />
            </Suspense>
          </Canvas>

          <div className="fma-progress-labels">
            {SOURCE_STEPS.map((label, i) => (
              <span
                key={label}
                className={cn(
                  'fma-progress-label',
                  i === currentStep && 'active',
                  i < currentStep && 'complete'
                )}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="fma-content relative z-10">
        <div className="fma-main-card">
          {/* Header */}
          <div className="fma-card-header">
            <h2 className="fma-card-title" style={{ fontFamily: FONT.clash }}>
              Where is your app from?
            </h2>
            <p className="fma-card-subtitle" style={{ fontFamily: FONT.satoshi }}>
              Select the platform where your broken app was built. We support 25+ AI builders.
            </p>
          </div>

          {/* Source grid */}
          <div className="fma-card-body">
            {Object.entries(sourcesByCategory).map(([category, sources]) => {
              if (sources.length === 0) return null;
              const info = CATEGORIES[category as SourceCategory];

              return (
                <motion.div
                  key={category}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Object.keys(sourcesByCategory).indexOf(category) * 0.05 }}
                  className="mb-5"
                >
                  <div className="fma-category-header">
                    <div className="fma-category-indicator" style={{ background: info.color }} />
                    <h3 className="fma-category-title">{info.label}</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    <AnimatePresence mode="popLayout">
                      {sources.map((source, i) => (
                        <motion.div
                          key={source.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.02 }}
                        >
                          <SourceCard
                            source={source}
                            isSelected={selectedSource === source.id}
                            onSelect={() => onSelectSource(source.id)}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="fma-card-footer">
            {/* Selected info */}
            {selectedConfig && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 rounded-xl mb-4"
                style={{
                  background: `linear-gradient(135deg, ${selectedConfig.brandColor}10, transparent)`,
                  border: `1px solid ${selectedConfig.brandColor}25`,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ background: `${selectedConfig.brandColor}20` }}
                  >
                    {selectedConfig.icon && <selectedConfig.icon size={22} color={selectedConfig.brandColor} />}
                  </div>
                  <div>
                    <div className="font-semibold text-white text-sm" style={{ fontFamily: FONT.cabinet }}>
                      {selectedConfig.name}
                    </div>
                    <div className="text-xs text-slate-400" style={{ fontFamily: FONT.satoshi }}>
                      {selectedConfig.contextAvailable
                        ? '✓ Full context extraction (95% fix rate)'
                        : '⚠ Code only (60% fix rate)'}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Continue button */}
            <motion.button
              onClick={onContinue}
              disabled={!selectedSource || isLoading}
              whileHover={{ scale: !selectedSource || isLoading ? 1 : 1.01 }}
              whileTap={{ scale: !selectedSource || isLoading ? 1 : 0.99 }}
              className={cn(
                'fma-button-primary w-full relative overflow-hidden',
                (!selectedSource || isLoading) && 'opacity-50 cursor-not-allowed'
              )}
            >
              {/* Shimmer */}
              {selectedSource && !isLoading && (
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  animate={{ x: ['-200%', '200%'] }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: 'linear' }}
                  style={{ width: '50%' }}
                />
              )}

              <span className="relative z-10 flex items-center justify-center gap-2">
                {isLoading ? (
                  <>
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                      className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                    />
                    Initializing...
                  </>
                ) : (
                  <>
                    Continue
                    <motion.span
                      animate={{ x: [0, 4, 0] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                    >
                      →
                    </motion.span>
                  </>
                )}
              </span>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PremiumSourceSelection;
