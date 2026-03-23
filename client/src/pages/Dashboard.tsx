/**
 * Dashboard — Main project hub with premium liquid glass design.
 *
 * Migrated from old KripTik app's visual design. All mechanical patterns
 * (Fix My App orchestration, WebSocket polling, phase tracking) stripped.
 * Wired to new Brain-driven engine via existing stores and API.
 */

import { useState, useEffect, useRef, useCallback, memo, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useUserStore } from '@/store/useUserStore';
import { useProjectStore } from '@/store/useProjectStore';
import { apiClient } from '@/lib/api-client';
import { ProjectCard3D } from '@/components/ui/ProjectCard3D';
import { AccountSlideOut } from '@/components/account/AccountSlideOut';
import { HoverSidebar } from '@/components/navigation/HoverSidebar';
import { KriptikLogo } from '@/components/ui/KriptikLogo';
import { GlitchText } from '@/components/ui/GlitchText';
import { HandDrawnArrow } from '@/components/ui/HandDrawnArrow';
import { GenerateButton3D } from '@/components/ui/GenerateButton3D';
import { DeleteConfirmModal } from '@/components/dashboard/DeleteConfirmModal';
import { FixMyAppIntro } from '@/components/fix-my-app/FixMyAppIntro';
import { FixBrokenAppIcon } from '@/components/ui/AbstractIcons';
import { EmailMcpBanner } from '@/components/dependencies/EmailMcpBanner';
import {
  SettingsIcon,
  ChevronDownIcon,
  LogOutIcon,
  CreditCardIcon,
  SparklesIcon,
  PlugIcon,
} from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { v4 as uuid } from 'uuid';
import '@/components/ui/premium-buttons/Premium3DButtons.css';
import '@/styles/realistic-glass.css';

// Animated prompt suggestions
const PROMPT_IDEAS = [
  "Build a SaaS dashboard with user analytics...",
  "Create an AI-powered image editor...",
  "Design a modern e-commerce store...",
  "Make a real-time collaboration tool...",
  "Build a social media scheduler...",
  "Create a fitness tracking app...",
  "Design a restaurant booking system...",
  "Build an AI chatbot for customer support...",
  "Create a project management dashboard...",
  "Make a personal finance tracker...",
];

// Animated typing placeholder
function AnimatedPlaceholder() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentIdea = PROMPT_IDEAS[currentIndex];
    const speed = isDeleting ? 30 : 50;

    const timeout = setTimeout(() => {
      if (!isDeleting) {
        if (displayText.length < currentIdea.length) {
          setDisplayText(currentIdea.slice(0, displayText.length + 1));
        } else {
          setTimeout(() => setIsDeleting(true), 2000);
        }
      } else {
        if (displayText.length > 0) {
          setDisplayText(displayText.slice(0, -1));
        } else {
          setIsDeleting(false);
          setCurrentIndex((prev) => (prev + 1) % PROMPT_IDEAS.length);
        }
      }
    }, speed);

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, currentIndex]);

  return (
    <span className="text-slate-500 pointer-events-none">
      {displayText}
      <span className="animate-pulse">|</span>
    </span>
  );
}

// Credit usage meter component
function CreditMeter({ used, total }: { used: number; total: number }) {
  const percentage = Math.min((used / total) * 100, 100);
  const remaining = total - used;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs">
        <span style={{ color: '#666' }}>Credits Used</span>
        <span className="font-mono" style={{ color: '#c25a00' }}>{remaining.toLocaleString()} left</span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{
          background: 'rgba(0,0,0,0.08)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
        }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${percentage}%`,
            background: percentage > 80
              ? 'linear-gradient(90deg, #dc2626, #ef4444)'
              : percentage > 50
                ? 'linear-gradient(90deg, #c25a00, #d97706)'
                : 'linear-gradient(90deg, #16a34a, #22c55e)',
            boxShadow: percentage > 80
              ? '0 0 12px rgba(220, 38, 38, 0.4)'
              : percentage > 50
                ? '0 0 12px rgba(194, 90, 0, 0.4)'
                : '0 0 12px rgba(22, 163, 74, 0.4)',
          }}
        />
      </div>
      <p className="text-xs" style={{ color: '#999' }}>
        {used.toLocaleString()} of {total.toLocaleString()} credits this month
      </p>
    </div>
  );
}

// Liquid Glass Menu Button Component
function MenuButton({
  icon: Icon,
  label,
  danger = false,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  danger?: boolean;
  onClick?: () => void | Promise<void>;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: isHovered
          ? danger
            ? 'rgba(220, 38, 38, 0.08)'
            : 'rgba(194, 90, 0, 0.08)'
          : 'transparent',
        cursor: 'pointer',
        border: 'none',
      }}
    >
      <Icon size={18} className={danger ? 'text-red-500' : ''} />
      <span
        className="text-sm font-medium"
        style={{ color: danger ? '#dc2626' : isHovered ? '#c25a00' : '#1a1a1a' }}
      >
        {label}
      </span>
    </button>
  );
}

// User menu with credit meter - Liquid Glass Style
function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [isButtonHovered, setIsButtonHovered] = useState(false);
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useUserStore();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      {/* Liquid Glass Badge Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsButtonHovered(true)}
        onMouseLeave={() => setIsButtonHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 16px',
          borderRadius: '50px',
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
          background: isButtonHovered
            ? 'linear-gradient(145deg, rgba(255,230,215,0.7) 0%, rgba(255,220,200,0.55) 40%, rgba(255,210,185,0.5) 100%)'
            : 'linear-gradient(145deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.4) 40%, rgba(248,248,250,0.45) 100%)',
          backdropFilter: 'blur(24px) saturate(200%)',
          boxShadow: isButtonHovered
            ? '0 4px 0 rgba(200, 180, 160, 0.5), 0 16px 50px rgba(255, 150, 100, 0.2), 0 8px 25px rgba(255, 130, 80, 0.15), inset 0 2px 2px rgba(255, 255, 255, 1), inset 0 -2px 2px rgba(0, 0, 0, 0.02), 0 0 20px rgba(255, 180, 140, 0.3), 0 0 0 1px rgba(255, 220, 200, 0.7)'
            : '0 4px 0 rgba(200, 195, 190, 0.5), 0 12px 40px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.05), inset 0 2px 2px rgba(255, 255, 255, 0.95), inset 0 -2px 2px rgba(0, 0, 0, 0.03), 0 0 0 1px rgba(255, 255, 255, 0.6)',
          transform: isButtonHovered ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'all 0.4s cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      >
        {/* Shine animation overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: isButtonHovered ? '150%' : '-100%',
            width: '60%',
            height: '100%',
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
            transform: 'skewX(-15deg)',
            transition: 'left 0.6s ease',
            pointerEvents: 'none',
          }}
        />

        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #c25a00 0%, #a04800 100%)',
            boxShadow: '0 2px 8px rgba(194, 90, 0, 0.3)',
          }}
        >
          <span className="text-sm font-bold text-white">
            {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
          </span>
        </div>
        <div className="hidden md:block text-left">
          <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>{user?.name || user?.email || 'User'}</p>
          <p className="text-xs" style={{ color: '#666' }}>{(user?.credits ?? 0).toLocaleString()} credits</p>
        </div>
        <ChevronDownIcon
          size={16}
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Liquid Glass Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="absolute right-0 mt-3 w-80 z-50"
            style={{
              borderRadius: '24px',
              overflow: 'hidden',
              background: 'linear-gradient(145deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.5) 50%, rgba(248,248,250,0.55) 100%)',
              backdropFilter: 'blur(40px) saturate(200%)',
              WebkitBackdropFilter: 'blur(40px) saturate(200%)',
              boxShadow: '0 30px 80px rgba(0, 0, 0, 0.15), 0 15px 40px rgba(0, 0, 0, 0.1), 0 8px 20px rgba(0, 0, 0, 0.08), inset 0 2px 4px rgba(255, 255, 255, 0.9), inset 0 -1px 2px rgba(0, 0, 0, 0.02), 0 0 0 1px rgba(255, 255, 255, 0.5)',
            }}
          >
            {/* Top highlight */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '10%',
                right: '10%',
                height: '1px',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
              }}
            />

            {/* Header */}
            <div
              className="p-4"
              style={{
                background: 'linear-gradient(145deg, rgba(255,200,170,0.2) 0%, rgba(255,180,150,0.1) 100%)',
                borderBottom: '1px solid rgba(255,255,255,0.3)',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, #c25a00 0%, #a04800 100%)',
                    boxShadow: '0 4px 16px rgba(194, 90, 0, 0.3), inset 0 1px 2px rgba(255,255,255,0.2)',
                  }}
                >
                  <span className="text-lg font-bold text-white">
                    {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                  </span>
                </div>
                <div>
                  <p className="font-semibold" style={{ color: '#1a1a1a' }}>{user?.name || 'User'}</p>
                  <p className="text-xs" style={{ color: '#666' }}>{user?.email}</p>
                </div>
              </div>
            </div>

            {/* Credit display */}
            <div className="p-4" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <CreditMeter
                used={0}
                total={Math.max(user?.credits ?? 1000, 1)}
              />
              <p className="mt-2 text-xs font-mono" style={{ color: '#16a34a' }}>
                {(user?.credits ?? 0).toLocaleString()} credits available
              </p>
            </div>

            {/* Menu items */}
            <div className="p-2">
              <MenuButton
                icon={PlugIcon}
                label="Dependencies"
                onClick={() => { setIsOpen(false); navigate('/dependencies'); }}
              />
              <MenuButton
                icon={SettingsIcon}
                label="Settings"
                onClick={() => { setIsOpen(false); navigate('/settings'); }}
              />
              <MenuButton
                icon={CreditCardIcon}
                label="Billing & Credits"
                onClick={() => { setIsOpen(false); navigate('/settings?tab=billing'); }}
              />
              <div className="my-2" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }} />
              <MenuButton
                icon={LogOutIcon}
                label="Sign Out"
                danger
                onClick={async () => { setIsOpen(false); await logout(); navigate('/login'); }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Project thumbnail card
interface ProjectThumbnailProps {
  project: any;
  index: number;
  isManageMode: boolean;
  onDelete: (project: any, cardElement: HTMLElement) => void;
}

const ProjectThumbnail = memo(function ProjectThumbnail({
  project, index, isManageMode, onDelete,
}: ProjectThumbnailProps) {
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const lastModified = project.updatedAt
    ? new Date(project.updatedAt).toLocaleDateString()
    : project.createdAt
      ? new Date(project.createdAt).toLocaleDateString()
      : 'Today';

  const handleNuke = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (wrapperRef.current) {
      onDelete(project, wrapperRef.current);
    }
  };

  // Delete button — visible in manage mode
  const deleteButton = isManageMode && (
    <button
      onClick={handleNuke}
      style={{
        position: 'absolute', top: -8, right: -8, zIndex: 25,
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '5px 10px', borderRadius: 8,
        background: 'rgba(220, 38, 38, 0.92)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.15)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        color: '#fff', cursor: 'pointer',
        fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
        transition: 'transform 0.15s, background 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.06)';
        e.currentTarget.style.background = 'rgba(239, 68, 68, 1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.background = 'rgba(220, 38, 38, 0.92)';
      }}
      title="Delete this project"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
      Delete
    </button>
  );

  const wrapperStyle: CSSProperties = {
    marginBottom: '24px',
    position: 'relative',
  };

  // Status mapped from project.status — clean, no old app patterns
  const cardStatus = project.status === 'completed' ? 'completed' :
                     project.status === 'building' ? 'building' : 'active';

  return (
    <div ref={wrapperRef} className="group" style={wrapperStyle}>
      {deleteButton}
      <div className={isManageMode ? 'card-manage-glitch' : ''} style={{ '--gi': index } as CSSProperties}>
        <ProjectCard3D
          onClick={isManageMode ? undefined : () => navigate(`/builder/${project.id}`)}
          projectName={project.name}
          description={project.description}
          status={cardStatus}
          lastModified={lastModified}
        />
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  const prev = prevProps.project;
  const next = nextProps.project;
  return (
    prev.id === next.id &&
    prev.name === next.name &&
    prev.status === next.status &&
    prev.updatedAt === next.updatedAt &&
    prevProps.index === nextProps.index &&
    prevProps.isManageMode === nextProps.isManageMode
  );
});

// Main dashboard component
export default function Dashboard() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { user, isAuthenticated, isLoading: authLoading, logout } = useUserStore();
  const { projects, addProject, fetchProjects, removeProject, isLoading: projectsLoading } = useProjectStore();

  // Modal states
  const [isManageMode, setIsManageMode] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showFixMyAppIntro, setShowFixMyAppIntro] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Fetch projects on mount
  useEffect(() => {
    if (isAuthenticated) fetchProjects();
  }, [isAuthenticated, fetchProjects]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [prompt]);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      const projectId = uuid();
      const name = prompt.slice(0, 50) + (prompt.length > 50 ? '...' : '');
      const { project } = await apiClient.createProject({ id: projectId, name, description: prompt });
      addProject(project);
      navigate(`/builder/${projectId}`, { state: { initialPrompt: prompt } });
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleDeleteProject = useCallback((project: any, _cardElement: HTMLElement) => {
    setProjectToDelete(project);
    setDeleteModalOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!projectToDelete) return;
    try {
      await removeProject(projectToDelete.id);
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
    setDeleteModalOpen(false);
    setProjectToDelete(null);
  }, [projectToDelete, removeProject]);

  const handleCancelDelete = useCallback(() => {
    setDeleteModalOpen(false);
    setProjectToDelete(null);
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(145deg, #e8e4df 0%, #d8d4cf 50%, #ccc8c3 100%)' }}>
        <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(145deg, #e8e4df 0%, #d8d4cf 50%, #ccc8c3 100%)' }}>
      {/* Hover Sidebar */}
      <HoverSidebar />

      <AccountSlideOut />

      {/* 3D Glass Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteModalOpen}
        projectName={projectToDelete?.name || ''}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* Header - 3D Glass with visible edges */}
      <header
        className="sticky top-0 z-40"
        style={{
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.45) 100%)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06), 0 1px 0 rgba(255, 255, 255, 0.8), inset 0 -1px 0 rgba(0, 0, 0, 0.04), inset 0 1px 1px rgba(255, 255, 255, 0.9)',
        }}
      >
        {/* Bottom edge - visible glass thickness */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(200,200,205,0.4) 0%, rgba(180,180,185,0.3) 100%)',
            transform: 'translateY(100%)',
          }}
        />
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo + Title */}
          <div className="flex items-center gap-2">
            <HandDrawnArrow className="mr-2" />
            <div
              className="flex items-center gap-4 cursor-pointer group"
              onClick={() => navigate('/dashboard')}
            >
              <KriptikLogo size="sm" animated />
              <GlitchText
                text="KripTik AI"
                className="text-2xl group-hover:opacity-90 transition-opacity"
              />
            </div>
          </div>
          <UserMenu />
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8 md:py-16">
        {/* Hero section with prompt */}
        <div className="max-w-4xl mx-auto text-center mb-12">
          <h1
            className="text-4xl md:text-5xl font-bold mb-4"
            style={{
              fontFamily: '-apple-system, BlinkMacSystemFont, SF Pro Display, sans-serif',
              color: '#1a1a1a',
            }}
          >
            What do you want to build today?
          </h1>
          <p className="text-lg mb-8" style={{ color: '#404040' }}>
            Describe your app and let AI bring it to life in minutes
          </p>

          {/* Prompt input - Realistic Glass */}
          <div className={cn("glass-input relative transition-all duration-500", isFocused && "focused")}>
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder=""
                className="w-full min-h-[120px] p-6 resize-none bg-transparent text-lg focus:outline-none overflow-hidden"
                style={{ color: '#1a1a1a' }}
                rows={3}
              />

              {/* Animated placeholder */}
              {!prompt && !isFocused && (
                <div className="absolute inset-0 p-5 pointer-events-none text-lg">
                  <AnimatedPlaceholder />
                </div>
              )}
            </div>

            {/* Generate button + Fix My App */}
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.5)' }}>
              <button
                onClick={() => setShowFixMyAppIntro(true)}
                className="glass-button flex items-center gap-2 px-4 py-2 text-sm font-medium"
                style={{ borderRadius: '12px', color: '#1a1a1a' }}
              >
                <FixBrokenAppIcon size={18} />
                <span className="hidden sm:inline">Fix Broken App</span>
                <span className="sm:hidden">Fix App</span>
              </button>
              <GenerateButton3D
                onClick={handleGenerate}
                disabled={!prompt.trim() || isGenerating}
                loading={isGenerating}
              />
            </div>
          </div>
        </div>

        {/* Email MCP Banner — prompts users to connect email for auto-verification */}
        <div className="max-w-6xl mx-auto">
          <EmailMcpBanner projectCount={projects.length} />
        </div>

        {/* Project grid */}
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold" style={{ color: '#1a1a1a' }}>
              Your Projects
            </h2>
            <div className="flex items-center gap-3">
              {projects.length > 0 && (
                <button
                  onClick={() => setIsManageMode(!isManageMode)}
                  className="glass-button px-4 py-2 text-sm font-medium"
                  style={{ borderRadius: '12px' }}
                >
                  {isManageMode ? "I'm Done" : 'Manage Apps'}
                </button>
              )}
            </div>
          </div>

          {projectsLoading ? (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm mt-4" style={{ color: '#666' }}>Loading your projects...</p>
            </div>
          ) : projects.length === 0 ? (
            <div
              className="text-center py-16 rounded-2xl"
              style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.3) 100%)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.6)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
              }}
            >
              <SparklesIcon size={48} className="mx-auto mb-4 text-amber-600 opacity-50" />
              <p className="text-lg font-medium" style={{ color: '#1a1a1a' }}>No projects yet</p>
              <p className="text-sm mt-1" style={{ color: '#666' }}>
                Enter a prompt above to create your first app
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {projects.map((project, index) => (
                <ProjectThumbnail
                  key={project.id}
                  project={project}
                  index={index}
                  isManageMode={isManageMode}
                  onDelete={handleDeleteProject}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Fix My App intro modal — 3D scene with falling error blocks */}
      {showFixMyAppIntro && (
        <FixMyAppIntro onComplete={() => {
          setShowFixMyAppIntro(false);
          navigate('/fix-my-app');
        }} />
      )}
    </div>
  );
}
