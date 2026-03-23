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
import { createPortal } from 'react-dom';
import { useUserStore } from '@/store/useUserStore';
import { useProjectStore } from '@/store/useProjectStore';
import { apiClient } from '@/lib/api-client';
import type { GitHubRepo } from '@/lib/api-client';
import { authenticatedFetch, API_URL } from '@/lib/api-config';
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
import NewProjectModal from '@/components/dashboard/NewProjectModal';
import {
  SettingsIcon,
  ChevronDownIcon,
  LogOutIcon,
  CreditCardIcon,
  SparklesIcon,
  BellIcon,
  UploadIcon,
  PlusIcon,
  GitHubIcon,
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

// ── Notification Bell ────────────────────────────────────────────────
interface DashboardNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  actionUrl: string;
  metadata: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const bellRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Fetch initial notifications
    authenticatedFetch(`${API_URL}/api/notifications?limit=20`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        const notifs = data.notifications || [];
        setNotifications(notifs);
        setUnreadCount(notifs.filter((n: DashboardNotification) => !n.read).length);
      })
      .catch(() => {});

    // SSE for real-time
    const es = new EventSource(`${API_URL}/api/training/notifications/stream`, { withCredentials: true });
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notification') {
          setNotifications(prev => [data.payload, ...prev.slice(0, 19)]);
          setUnreadCount(prev => prev + 1);
        }
      } catch {}
    };
    es.onerror = () => { es.close(); };
    eventSourceRef.current = es;
    return () => { es.close(); };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: MouseEvent | TouchEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
    };
  }, [isOpen]);

  const markRead = async (id: string) => {
    await authenticatedFetch(`${API_URL}/api/notifications/${id}/read`, { method: 'POST' }).catch(() => {});
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const formatTimeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const getIcon = (type: string) => {
    if (type.includes('complete')) return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#22c55e" strokeWidth="2"/><path d="M8 12l3 3 5-5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    if (type.includes('error') || type.includes('fail')) return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="2"/><path d="M15 9l-6 6M9 9l6 6" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/></svg>;
    if (type.includes('alert') || type.includes('freeze')) return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#f59e0b" strokeWidth="2"/></svg>;
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="#666" strokeWidth="2"/><path d="M13.73 21a2 2 0 01-3.46 0" stroke="#666" strokeWidth="2"/></svg>;
  };

  return (
    <div ref={bellRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="glass-button relative"
        style={{ padding: '8px', borderRadius: '12px' }}
        title="Notifications"
      >
        <BellIcon size={18} />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center rounded-full text-white text-[10px] font-bold"
            style={{ background: '#ef4444', boxShadow: '0 2px 6px rgba(239,68,68,0.4)' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </button>

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
              />
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                style={{
                  position: 'fixed',
                  top: '4rem',
                  right: '1rem',
                  width: '22rem',
                  maxHeight: '26rem',
                  overflow: 'hidden',
                  borderRadius: '20px',
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.85) 0%, rgba(248,248,250,0.9) 100%)',
                  backdropFilter: 'blur(40px) saturate(200%)',
                  WebkitBackdropFilter: 'blur(40px) saturate(200%)',
                  border: '1px solid rgba(255,255,255,0.5)',
                  boxShadow: '0 30px 80px rgba(0,0,0,0.12), 0 15px 40px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
                  zIndex: 9999,
                }}
              >
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <h3 className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>Notifications</h3>
                  {unreadCount > 0 && <span className="text-xs" style={{ color: '#666' }}>{unreadCount} unread</span>}
                </div>
                <div style={{ maxHeight: '20rem', overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-sm" style={{ color: '#999' }}>No notifications yet</div>
                  ) : (
                    notifications.map(notif => (
                      <button
                        key={notif.id}
                        onClick={() => { if (!notif.read) markRead(notif.id); if (notif.actionUrl) window.location.href = notif.actionUrl; setIsOpen(false); }}
                        className="w-full px-4 py-3 text-left transition-colors"
                        style={{
                          borderBottom: '1px solid rgba(0,0,0,0.04)',
                          background: notif.read ? 'transparent' : 'rgba(194,90,0,0.04)',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 mt-0.5">{getIcon(notif.type)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: notif.read ? '#666' : '#1a1a1a' }}>{notif.title}</p>
                            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: '#999' }}>{notif.message}</p>
                            <span className="text-xs mt-1 block" style={{ color: '#bbb' }}>{formatTimeAgo(notif.createdAt)}</span>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

// ── GitHub Repo Selector ─────────────────────────────────────────────
function GitHubRepoSelector({
  onSelect,
}: {
  onSelect: (repo: GitHubRepo) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [ghConnected, setGhConnected] = useState(false);
  const [ghUsername, setGhUsername] = useState('');
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [search, setSearch] = useState('');
  const dropRef = useRef<HTMLDivElement>(null);

  // Check connection status on mount
  useEffect(() => {
    apiClient.getGitHubConnection()
      .then(data => {
        setGhConnected(data.connected);
        if (data.username) setGhUsername(data.username);
      })
      .catch(() => setGhConnected(false));
  }, []);

  // Fetch repos when dropdown opens
  useEffect(() => {
    if (!isOpen || !ghConnected || repos.length > 0) return;
    setReposLoading(true);
    apiClient.getGitHubRepos()
      .then(data => setRepos(data.repos))
      .catch(() => {})
      .finally(() => setReposLoading(false));
  }, [isOpen, ghConnected, repos.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isOpen]);

  const handleConnect = async () => {
    try {
      const { url } = await apiClient.getGitHubAuthUrl();
      window.location.href = url;
    } catch (err) {
      console.error('GitHub auth failed:', err);
    }
  };

  const filtered = search
    ? repos.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || r.fullName.toLowerCase().includes(search.toLowerCase()))
    : repos;

  return (
    <div ref={dropRef} className="relative">
      <button
        onClick={() => ghConnected ? setIsOpen(!isOpen) : handleConnect()}
        className="glass-button flex items-center gap-1.5"
        style={{ padding: '7px 10px', borderRadius: '10px', color: '#1a1a1a' }}
        title={ghConnected ? 'Select GitHub repo' : 'Connect GitHub'}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.167 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
        </svg>
        {ghConnected && <span className="hidden sm:inline text-xs font-medium">{ghUsername || 'GitHub'}</span>}
        {ghConnected && <ChevronDownIcon size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
      </button>

      <AnimatePresence>
        {isOpen && ghConnected && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            className="absolute bottom-full mb-2 left-0 z-50"
            style={{
              width: '20rem',
              maxHeight: '22rem',
              borderRadius: '16px',
              overflow: 'hidden',
              background: 'linear-gradient(145deg, rgba(255,255,255,0.88) 0%, rgba(248,248,250,0.92) 100%)',
              backdropFilter: 'blur(40px) saturate(200%)',
              WebkitBackdropFilter: 'blur(40px) saturate(200%)',
              border: '1px solid rgba(255,255,255,0.5)',
              boxShadow: '0 -20px 60px rgba(0,0,0,0.1), 0 -8px 24px rgba(0,0,0,0.06), inset 0 -1px 0 rgba(255,255,255,0.9)',
            }}
          >
            <div className="p-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search repositories..."
                className="w-full px-3 py-2 text-sm rounded-lg"
                style={{
                  background: 'rgba(0,0,0,0.04)',
                  border: '1px solid rgba(0,0,0,0.06)',
                  outline: 'none',
                  color: '#1a1a1a',
                }}
                autoFocus
              />
            </div>
            <div style={{ maxHeight: '16rem', overflowY: 'auto' }}>
              {reposLoading ? (
                <div className="p-6 text-center">
                  <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-center text-sm" style={{ color: '#999' }}>No repos found</div>
              ) : (
                filtered.map(repo => (
                  <button
                    key={repo.id}
                    onClick={() => { onSelect(repo); setIsOpen(false); }}
                    className="w-full px-4 py-2.5 text-left hover:bg-black/[0.03] transition-colors flex items-center gap-3"
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: '#1a1a1a' }}>{repo.name}</p>
                      {repo.description && <p className="text-xs truncate mt-0.5" style={{ color: '#999' }}>{repo.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {repo.language && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.04)', color: '#666' }}>{repo.language}</span>}
                      {repo.private && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Import App Dropdown ──────────────────────────────────────────────
function ImportAppDropdown() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<'zip' | 'github' | 'gitlab' | null>(null);
  const [ghConnected, setGhConnected] = useState(false);
  const [ghUsername, setGhUsername] = useState('');
  const [glConnected, setGlConnected] = useState(false);
  const [glUsername, setGlUsername] = useState('');
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [showRepoSelector, setShowRepoSelector] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Check connection status on mount
  useEffect(() => {
    apiClient.getGitHubConnection()
      .then(data => { setGhConnected(data.connected); if (data.username) setGhUsername(data.username); })
      .catch(() => setGhConnected(false));
    apiClient.getGitLabConnection()
      .then(data => { setGlConnected(data.connected); if (data.username) setGlUsername(data.username); })
      .catch(() => setGlConnected(false));
  }, []);

  // Click outside to close
  useEffect(() => {
    if (!isOpen && !showRepoSelector) return;
    const handle = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowRepoSelector(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isOpen, showRepoSelector]);

  const handleSourceSelect = async (source: 'zip' | 'github' | 'gitlab') => {
    setSelectedSource(source);
    setIsOpen(false);

    if (source === 'zip') {
      fileRef.current?.click();
      return;
    }

    const isConnected = source === 'github' ? ghConnected : glConnected;
    if (!isConnected) {
      // Redirect to OAuth
      try {
        if (source === 'github') {
          const { url } = await apiClient.getGitHubAuthUrl();
          window.location.href = url;
        } else {
          const { url } = await apiClient.getGitLabAuthUrl();
          window.location.href = url;
        }
      } catch (err) {
        console.error(`${source} auth failed:`, err);
      }
      return;
    }

    // Connected — show repo selector
    setShowRepoSelector(true);
    setReposLoading(true);
    try {
      const data = source === 'github'
        ? await apiClient.getGitHubRepos()
        : await apiClient.getGitLabRepos();
      setRepos(data.repos);
    } catch { setRepos([]); }
    finally { setReposLoading(false); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setShowConfirmModal(true);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleRepoSelect = (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setShowRepoSelector(false);
    setShowConfirmModal(true);
  };

  const handleConfirm = async () => {
    setShowConfirmModal(false);
    try {
      const projectId = uuid();
      const name = selectedRepo
        ? selectedRepo.name
        : selectedFile?.name.replace(/\.zip$/i, '') || 'Imported App';
      const { project } = await apiClient.createProject({ id: projectId, name, description: `Imported from ${selectedSource}` });
      const { addProject } = useProjectStore.getState();
      addProject(project);
      navigate(`/builder/${projectId}`, {
        state: {
          importSource: selectedSource,
          repoUrl: selectedRepo?.htmlUrl,
          repoFullName: selectedRepo?.fullName,
          defaultBranch: selectedRepo?.defaultBranch,
          runForensicAudit: true,
          initialPrompt: `[FORENSIC AUDIT] Import and audit ${selectedRepo?.fullName || selectedFile?.name || 'uploaded project'} — clone the repository, install dependencies, start the dev server, and run a comprehensive forensic audit of the entire codebase.`,
        },
      });
    } catch (err) {
      console.error('Failed to create import project:', err);
    }
  };

  const filteredRepos = repoSearch
    ? repos.filter(r => r.name.toLowerCase().includes(repoSearch.toLowerCase()) || r.fullName.toLowerCase().includes(repoSearch.toLowerCase()))
    : repos;

  return (
    <div ref={dropRef} className="relative">
      <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={handleFileChange} />

      <button
        onClick={() => { setIsOpen(!isOpen); setShowRepoSelector(false); }}
        className="glass-button flex items-center gap-2 px-4 py-2 text-sm font-medium"
        style={{ borderRadius: '12px', color: '#1a1a1a' }}
      >
        <UploadIcon size={16} />
        <span>Import App</span>
        <ChevronDownIcon size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Source dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-2 right-0 z-50"
            style={{
              width: '13rem',
              borderRadius: '14px',
              overflow: 'hidden',
              background: 'linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,248,250,0.96) 100%)',
              backdropFilter: 'blur(40px) saturate(200%)',
              WebkitBackdropFilter: 'blur(40px) saturate(200%)',
              border: '1px solid rgba(255,255,255,0.5)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
            }}
          >
            {/* ZIP Upload */}
            <button
              onClick={() => handleSourceSelect('zip')}
              className="w-full px-4 py-3 text-left hover:bg-black/[0.04] transition-colors flex items-center gap-3"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-sm font-medium" style={{ color: '#1a1a1a' }}>ZIP Upload</span>
            </button>

            <div style={{ height: '1px', background: 'rgba(0,0,0,0.06)' }} />

            {/* GitHub */}
            <button
              onClick={() => handleSourceSelect('github')}
              className="w-full px-4 py-3 text-left hover:bg-black/[0.04] transition-colors flex items-center gap-3"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#24292f">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.167 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium" style={{ color: '#1a1a1a' }}>GitHub</span>
                {ghConnected && <span className="text-[10px] ml-1.5 text-emerald-600">Connected</span>}
              </div>
            </button>

            <div style={{ height: '1px', background: 'rgba(0,0,0,0.06)' }} />

            {/* GitLab */}
            <button
              onClick={() => handleSourceSelect('gitlab')}
              className="w-full px-4 py-3 text-left hover:bg-black/[0.04] transition-colors flex items-center gap-3"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z" fill="#FC6D26" />
                <path d="M12 22.13L16.05 9.67H7.95L12 22.13z" fill="#E24329" />
                <path d="M12 22.13L7.95 9.67H4.71L12 22.13z" fill="#FC6D26" />
                <path d="M4.71 9.67L1.35 14.39a.84.84 0 00.3.94L12 22.13 4.71 9.67z" fill="#FCA326" />
                <path d="M4.71 9.67H7.95L5.51 2.18A.42.42 0 005.4 2a.43.43 0 00-.58 0 .42.42 0 00-.11.18L4.71 9.67z" fill="#E24329" />
                <path d="M12 22.13L16.05 9.67H19.29L12 22.13z" fill="#FC6D26" />
                <path d="M19.29 9.67L22.65 14.39a.84.84 0 01-.3.94L12 22.13l7.29-12.46z" fill="#FCA326" />
                <path d="M19.29 9.67H16.05l2.44-7.49A.42.42 0 0118.6 2a.43.43 0 01.58 0c.05.05.09.11.11.18l2.44 7.49h-2.44z" fill="#E24329" />
              </svg>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium" style={{ color: '#1a1a1a' }}>GitLab</span>
                {glConnected && <span className="text-[10px] ml-1.5 text-emerald-600">Connected</span>}
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Repo selector dropdown */}
      <AnimatePresence>
        {showRepoSelector && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            className="absolute top-full mt-2 right-0 z-50"
            style={{
              width: '22rem',
              maxHeight: '24rem',
              borderRadius: '16px',
              overflow: 'hidden',
              background: 'linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,248,250,0.96) 100%)',
              backdropFilter: 'blur(40px) saturate(200%)',
              WebkitBackdropFilter: 'blur(40px) saturate(200%)',
              border: '1px solid rgba(255,255,255,0.5)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)',
            }}
          >
            <div className="p-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              {selectedSource === 'github' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#24292f"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.167 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z" fill="#FC6D26" /></svg>
              )}
              <input
                type="text"
                value={repoSearch}
                onChange={(e) => setRepoSearch(e.target.value)}
                placeholder={`Search ${selectedSource === 'github' ? 'GitHub' : 'GitLab'} repos...`}
                className="flex-1 px-2 py-1.5 text-sm rounded-lg"
                style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)', outline: 'none', color: '#1a1a1a' }}
                autoFocus
              />
            </div>
            <div style={{ maxHeight: '18rem', overflowY: 'auto' }}>
              {reposLoading ? (
                <div className="p-6 text-center">
                  <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : filteredRepos.length === 0 ? (
                <div className="p-4 text-center text-sm" style={{ color: '#999' }}>No repos found</div>
              ) : (
                filteredRepos.map(repo => (
                  <button
                    key={repo.id}
                    onClick={() => handleRepoSelect(repo)}
                    className="w-full px-4 py-2.5 text-left hover:bg-black/[0.03] transition-colors flex items-center gap-3"
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: '#1a1a1a' }}>{repo.name}</p>
                      {repo.description && <p className="text-xs truncate mt-0.5" style={{ color: '#999' }}>{repo.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {repo.language && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.04)', color: '#666' }}>{repo.language}</span>}
                      {repo.private && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => setShowConfirmModal(false)}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 w-full max-w-md mx-4"
              style={{
                borderRadius: '20px',
                background: 'linear-gradient(145deg, rgba(255,255,255,0.95) 0%, rgba(248,248,250,0.98) 100%)',
                backdropFilter: 'blur(40px)',
                border: '1px solid rgba(255,255,255,0.6)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.15), 0 8px 24px rgba(0,0,0,0.08)',
                padding: '2rem',
              }}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(249,115,22,0.15))' }}>
                  🔬
                </div>
                <h3 className="text-lg font-bold mb-2" style={{ color: '#1a1a1a' }}>Do you wish to continue?</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#666' }}>
                  Selecting yes will perform a <strong>forensic audit</strong> of your codebase.
                  This will analyze every component, endpoint, route, hook, API call, and function —
                  running concurrent AI agents that build, browse, and test your app in real-time
                  to detect issues including silent errors that traditional tools miss.
                </p>
              </div>

              {selectedRepo && (
                <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)' }}>
                  <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>{selectedRepo.fullName}</p>
                  {selectedRepo.description && <p className="text-xs mt-1" style={{ color: '#999' }}>{selectedRepo.description}</p>}
                </div>
              )}
              {selectedFile && (
                <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)' }}>
                  <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>{selectedFile.name}</p>
                  <p className="text-xs mt-1" style={{ color: '#999' }}>{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 px-4 py-3 text-sm font-medium rounded-xl transition-colors"
                  style={{ background: 'rgba(0,0,0,0.05)', color: '#666', border: 'none', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 px-4 py-3 text-sm font-semibold rounded-xl transition-all hover:translate-y-[-1px]"
                  style={{
                    background: 'linear-gradient(135deg, #fbbf24, #f97316)',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(249,115,22,0.3)',
                  }}
                >
                  Yes, Start Audit
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
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

  // Status mapped from project.status to ProjectCard3D's accepted values
  const cardStatus: 'idle' | 'building' | 'complete' | 'failed' =
    project.status === 'completed' ? 'complete' :
    project.status === 'building' ? 'building' :
    project.status === 'failed' ? 'failed' : 'idle';

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
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) setUploadedFiles(prev => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleRepoSelect = useCallback((repo: GitHubRepo) => {
    setSelectedRepo(repo);
  }, []);

  const clearSelectedRepo = useCallback(() => {
    setSelectedRepo(null);
  }, []);

  const removeUploadedFile = useCallback((index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

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
          <div className="flex items-center gap-3">
            <NotificationBell />
            <UserMenu />
          </div>
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
            {/* Selected repo badge */}
            {selectedRepo && (
              <div className="px-5 pt-4 pb-0 flex items-center gap-2">
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    background: 'rgba(0,0,0,0.04)',
                    border: '1px solid rgba(0,0,0,0.08)',
                    color: '#1a1a1a',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.6 }}>
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.167 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                  </svg>
                  <span>{selectedRepo.fullName}</span>
                  <button
                    onClick={clearSelectedRepo}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: '#999' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                </div>
              </div>
            )}

            {/* Uploaded files badges */}
            {uploadedFiles.length > 0 && (
              <div className="px-5 pt-3 pb-0 flex flex-wrap gap-2">
                {uploadedFiles.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                    style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', color: '#1a1a1a' }}
                  >
                    <UploadIcon size={12} />
                    <span className="truncate max-w-[120px]">{file.name}</span>
                    <button
                      onClick={() => removeUploadedFile(i)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#999' }}
                    >
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

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
              {!prompt && !isFocused && !selectedRepo && (
                <div className="absolute inset-0 p-5 pointer-events-none text-lg">
                  <AnimatedPlaceholder />
                </div>
              )}
            </div>

            {/* Bottom bar: + button, GH button, Generate */}
            <div className="px-5 py-3 flex items-center gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.5)' }}>
              {/* File upload + button */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                accept="*/*"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="glass-button flex items-center justify-center"
                style={{ padding: '7px', borderRadius: '10px', color: '#1a1a1a' }}
                title="Attach files"
              >
                <PlusIcon size={18} />
              </button>

              {/* GitHub repo selector */}
              <GitHubRepoSelector onSelect={handleRepoSelect} />

              <div className="flex-1" />

              <GenerateButton3D
                onClick={handleGenerate}
                disabled={!prompt.trim() || isGenerating}
                loading={isGenerating}
              />
            </div>
          </div>
        </div>

        {/* Project grid */}
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <h2 className="text-xl font-bold" style={{ color: '#1a1a1a' }}>
              Your Projects
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Create Project */}
              <NewProjectModal />

              {/* Import App — dropdown with zip/github/gitlab */}
              <ImportAppDropdown />

              {/* Fix My App — moved here from NLP input area */}
              <button
                onClick={() => setShowFixMyAppIntro(true)}
                className="glass-button flex items-center gap-2 px-4 py-2 text-sm font-medium"
                style={{ borderRadius: '12px', color: '#1a1a1a' }}
              >
                <FixBrokenAppIcon size={16} />
                <span className="hidden sm:inline">Fix Broken App</span>
                <span className="sm:hidden">Fix App</span>
              </button>

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
