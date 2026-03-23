/**
 * ProjectDependenciesPage — Per-project dependency management.
 *
 * Shows all services associated with a specific project, with ability to:
 * - View per-instance details (instance model, API keys, environment, status)
 * - Add new dependencies via a searchable mini catalog
 * - Remove dependencies with confirmation
 *
 * Accessible via /projects/:projectId/dependencies
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { HoverSidebar } from '@/components/navigation/HoverSidebar';
import { AccountSlideOut } from '@/components/account/AccountSlideOut';
import { KriptikLogo } from '@/components/ui/KriptikLogo';
import { GlitchText } from '@/components/ui/GlitchText';
import { BrandIcon } from '@/components/ui/BrandIcon';
import {
  ArrowLeftIcon,
  SearchIcon,
  PlusIcon,
  TrashIcon,
  ExternalLinkIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
  XIcon,
  LayersIcon,
  KeyIcon,
  GlobeIcon,
} from '@/components/ui/icons';
import { ConnectButton } from '@/components/dependencies/ConnectButton';
import { useDependencyConnect } from '@/hooks/useDependencyConnect';
import { useUserStore } from '@/store/useUserStore';
import { useProjectStore } from '@/store/useProjectStore';
import { apiClient } from '@/lib/api-client';
import type {
  ServiceRegistryEntry,
  ProjectServiceInstance,
  CategoryMeta,
  Project,
} from '@/lib/api-client';
import '@/styles/realistic-glass.css';

// ─── Instance model display info ────────────────────────────────────────────

function instanceModelLabel(model: string): string {
  switch (model) {
    case 'project-per-project': return 'Dedicated Project';
    case 'api-key-per-project': return 'Dedicated API Key';
    case 'shared': return 'Shared Instance';
    default: return model;
  }
}

function instanceModelDescription(model: string): string {
  switch (model) {
    case 'project-per-project': return 'This service creates a separate project/instance for this app';
    case 'api-key-per-project': return 'Same account, unique API key for billing isolation';
    case 'shared': return 'Single instance shared across all your apps';
    default: return '';
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ProjectDependenciesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const user = useUserStore(s => s.user);
  const { projects, fetchProjects } = useProjectStore();

  // Data
  const [dependencies, setDependencies] = useState<ProjectServiceInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add dependency dialog
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Remove confirmation
  const [removingInstance, setRemovingInstance] = useState<ProjectServiceInstance | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Key reveal/copy
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const dependencyConnect = useDependencyConnect();
  const {
    getConnectionState,
    startMcpConnect,
    startBrowserFallback,
    submitVerification,
    cancelFallback,
    retryFallback,
    getBrowserAgentState,
    disconnect,
    connections,
    refreshConnections,
  } = dependencyConnect;

  const project = projects.find(p => p.id === projectId) || null;

  // Load project dependencies
  const loadDependencies = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const { dependencies: deps } = await apiClient.getProjectDependencies(projectId);
      setDependencies(deps);
    } catch {
      // Load failed
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadDependencies();
    fetchProjects();
  }, [loadDependencies, fetchProjects]);

  const handleRemoveDependency = useCallback(async () => {
    if (!removingInstance || !projectId) return;
    setIsRemoving(true);
    try {
      await apiClient.removeProjectDependency(removingInstance.serviceId, projectId);
      setDependencies(prev => prev.filter(d => d.id !== removingInstance.id));
      setRemovingInstance(null);
    } catch {
      // Remove failed
    } finally {
      setIsRemoving(false);
    }
  }, [removingInstance, projectId]);

  const handleDependencyAdded = useCallback(() => {
    setShowAddDialog(false);
    loadDependencies();
  }, [loadDependencies]);

  const handleCopyKey = useCallback((key: string, keyId: string) => {
    navigator.clipboard.writeText(key).then(() => {
      setCopiedKey(keyId);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  }, []);

  const toggleRevealKey = useCallback((keyId: string) => {
    setRevealedKeys(prev => {
      const next = new Set(prev);
      if (next.has(keyId)) next.delete(keyId);
      else next.add(keyId);
      return next;
    });
  }, []);

  // Set of serviceIds already in the project
  const existingServiceIds = useMemo(() => new Set(dependencies.map(d => d.serviceId)), [dependencies]);

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ background: 'linear-gradient(145deg, #e8e4df 0%, #d8d4cf 50%, #ccc8c3 100%)' }}>
        <HoverSidebar />
        <AccountSlideOut />
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#c25a00 transparent #c25a00 #c25a00' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(145deg, #e8e4df 0%, #d8d4cf 50%, #ccc8c3 100%)' }}>
      <HoverSidebar />
      <AccountSlideOut />

      {/* Header */}
      <header
        className="sticky top-0 z-40"
        style={{
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.45) 100%)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06), 0 1px 0 rgba(255, 255, 255, 0.8), inset 0 -1px 0 rgba(0, 0, 0, 0.04), inset 0 1px 1px rgba(255, 255, 255, 0.9)',
        }}
      >
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
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
          <button
            onClick={() => navigate('/dependencies')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
            style={{
              background: 'linear-gradient(145deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.4) 100%)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 4px 0 rgba(200, 195, 190, 0.5), 0 8px 24px rgba(0, 0, 0, 0.06), inset 0 1px 2px rgba(255, 255, 255, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.5)',
              color: '#1a1a1a',
            }}
          >
            <ArrowLeftIcon size={16} />
            All Dependencies
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-6 md:py-10">
        <div className="max-w-6xl mx-auto">
          {/* Title and actions */}
          <div className="flex flex-col gap-4 mb-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: '#888' }}>
                Project Dependencies
              </p>
              <h1
                className="text-3xl md:text-4xl font-bold mb-1"
                style={{
                  fontFamily: '-apple-system, BlinkMacSystemFont, SF Pro Display, sans-serif',
                  color: '#1a1a1a',
                }}
              >
                {project?.name || 'Project'}
              </h1>
              <p className="text-sm" style={{ color: '#555' }}>
                {dependencies.length === 0
                  ? 'No dependencies yet. Add services your app needs.'
                  : `${dependencies.length} service${dependencies.length !== 1 ? 's' : ''} connected`
                }
              </p>
            </div>
            <button
              onClick={() => setShowAddDialog(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] self-start sm:self-auto"
              style={{
                background: 'linear-gradient(135deg, #c25a00 0%, #a04800 100%)',
                color: '#fff',
                boxShadow: '0 4px 0 rgba(130,60,0,0.4), 0 8px 24px rgba(194,90,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
            >
              <PlusIcon size={16} />
              Add Dependency
            </button>
          </div>

          {/* Dependency grid */}
          {dependencies.length === 0 ? (
            <EmptyProjectDependencies onAdd={() => setShowAddDialog(true)} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {dependencies.map((dep, i) => (
                  <motion.div
                    key={dep.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.25, delay: i * 0.04 }}
                  >
                    <ProjectDependencyCard
                      instance={dep}
                      onRemove={() => setRemovingInstance(dep)}
                      onNavigate={() => dep.service && navigate(`/dependencies/${dep.serviceId}`)}
                      onCopyKey={handleCopyKey}
                      onToggleReveal={toggleRevealKey}
                      revealedKeys={revealedKeys}
                      copiedKey={copiedKey}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>

      {/* Add dependency dialog */}
      <AnimatePresence>
        {showAddDialog && projectId && (
          <AddDependencyDialog
            projectId={projectId}
            existingServiceIds={existingServiceIds}
            onClose={() => setShowAddDialog(false)}
            onAdded={handleDependencyAdded}
            connectHook={dependencyConnect}
            user={user}
          />
        )}
      </AnimatePresence>

      {/* Remove confirmation dialog */}
      <AnimatePresence>
        {removingInstance && (
          <RemoveDependencyDialog
            instance={removingInstance}
            isRemoving={isRemoving}
            onConfirm={handleRemoveDependency}
            onCancel={() => setRemovingInstance(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Project Dependency Card ────────────────────────────────────────────────

interface ProjectDependencyCardProps {
  instance: ProjectServiceInstance;
  onRemove: () => void;
  onNavigate: () => void;
  onCopyKey: (key: string, keyId: string) => void;
  onToggleReveal: (keyId: string) => void;
  revealedKeys: Set<string>;
  copiedKey: string | null;
}

function ProjectDependencyCard({
  instance,
  onRemove,
  onNavigate,
  onCopyKey,
  onToggleReveal,
  revealedKeys,
  copiedKey,
}: ProjectDependencyCardProps) {
  const service = instance.service;
  const brandColor = service?.brandColor || '#888';
  const statusColor =
    instance.status === 'active' ? '#22c55e'
    : instance.status === 'pending' ? '#f59e0b'
    : '#ef4444';

  return (
    <div
      className="group rounded-2xl p-5 transition-all duration-300"
      style={{
        background: 'linear-gradient(145deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.4) 100%)',
        backdropFilter: 'blur(20px) saturate(150%)',
        WebkitBackdropFilter: 'blur(20px) saturate(150%)',
        border: `1px solid ${brandColor}20`,
        boxShadow: `0 4px 0 ${brandColor}08, 0 8px 24px rgba(0,0,0,0.05), inset 0 1px 2px rgba(255,255,255,0.9)`,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = `0 6px 2px ${brandColor}08, 0 12px 32px rgba(0,0,0,0.07), inset 0 1px 2px rgba(255,255,255,0.9)`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = `0 4px 0 ${brandColor}08, 0 8px 24px rgba(0,0,0,0.05), inset 0 1px 2px rgba(255,255,255,0.9)`;
      }}
    >
      {/* Header: logo, name, actions */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="relative rounded-xl p-2.5 flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${brandColor}12 0%, ${brandColor}06 100%)`,
              boxShadow: `inset 0 1px 2px rgba(255,255,255,0.5), 0 2px 8px ${brandColor}08`,
            }}
          >
            {service && (
              <BrandIcon
                iconId={service.iconSlug}
                size={24}
                color={brandColor}
                ariaLabel={service.name}
              />
            )}
            <div
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: statusColor,
                border: '2px solid rgba(255,255,255,0.9)',
                boxShadow: `0 0 6px ${statusColor}40`,
              }}
            />
          </div>
          <div className="min-w-0">
            <h3
              className="text-sm font-semibold truncate cursor-pointer hover:underline"
              style={{ color: '#1a1a1a' }}
              onClick={onNavigate}
            >
              {service?.name || instance.serviceId}
            </h3>
            <p className="text-xs" style={{ color: '#888' }}>
              {instance.status === 'active' ? 'Active' : instance.status === 'pending' ? 'Pending' : 'Error'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {service?.websiteUrl && (
            <button
              onClick={() => window.open(service.websiteUrl, '_blank')}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: '#999' }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = '#555'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = '#999'; }}
              title="Open service dashboard"
            >
              <ExternalLinkIcon size={14} />
            </button>
          )}
          <button
            onClick={onRemove}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: '#999' }}
            onMouseEnter={e => { (e.target as HTMLElement).style.color = '#ef4444'; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.color = '#999'; }}
            title="Remove from project"
          >
            <TrashIcon size={14} />
          </button>
        </div>
      </div>

      {/* Instance details */}
      <div className="space-y-2.5">
        {/* Instance model */}
        <div className="flex items-center gap-2">
          <LayersIcon size={13} />
          <span className="text-xs font-medium" style={{ color: '#555' }}>
            {instanceModelLabel(instance.instanceModel)}
          </span>
        </div>

        {/* Environment */}
        <div className="flex items-center gap-2">
          <GlobeIcon size={13} />
          <span
            className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
            style={{
              color: instance.environment === 'production' ? '#b45309' : '#6b7280',
              background: instance.environment === 'production' ? 'rgba(180,83,9,0.08)' : 'rgba(107,114,128,0.08)',
              border: instance.environment === 'production' ? '1px solid rgba(180,83,9,0.12)' : '1px solid rgba(107,114,128,0.12)',
            }}
          >
            {instance.environment || 'development'}
          </span>
        </div>

        {/* External ID */}
        {instance.externalId && (
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: '#999' }}>ID:</span>
            <code
              className="text-xs px-1.5 py-0.5 rounded font-mono"
              style={{ background: 'rgba(0,0,0,0.04)', color: '#555' }}
            >
              {instance.externalId}
            </code>
          </div>
        )}

        {/* API Key masked */}
        {instance.apiKeyMasked && (
          <div className="flex items-center gap-2">
            <KeyIcon size={13} />
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <code
                className="text-xs font-mono truncate flex-1"
                style={{ color: '#555' }}
              >
                {revealedKeys.has(instance.id) ? instance.apiKeyMasked : instance.apiKeyMasked.replace(/./g, '\u2022')}
              </code>
              <button
                onClick={() => onToggleReveal(instance.id)}
                className="p-1 rounded transition-colors flex-shrink-0"
                style={{ color: '#999' }}
              >
                {revealedKeys.has(instance.id) ? <EyeOffIcon size={12} /> : <EyeIcon size={12} />}
              </button>
              <button
                onClick={() => onCopyKey(instance.apiKeyMasked!, instance.id)}
                className="p-1 rounded transition-colors flex-shrink-0"
                style={{ color: copiedKey === instance.id ? '#22c55e' : '#999' }}
              >
                {copiedKey === instance.id ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Description tooltip */}
      <p
        className="text-[11px] mt-3 leading-relaxed"
        style={{ color: '#aaa' }}
      >
        {instanceModelDescription(instance.instanceModel)}
      </p>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────

function EmptyProjectDependencies({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      className="rounded-2xl p-12 text-center"
      style={{
        background: 'linear-gradient(145deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.3) 100%)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.6)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
      }}
    >
      <div
        className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, rgba(194,90,0,0.12) 0%, rgba(194,90,0,0.06) 100%)',
          boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5), 0 4px 12px rgba(194,90,0,0.08)',
        }}
      >
        <LayersIcon size={24} />
      </div>
      <p className="text-base font-medium mb-1" style={{ color: '#1a1a1a' }}>
        No dependencies yet
      </p>
      <p className="text-sm mb-5" style={{ color: '#666' }}>
        Add the external services this project needs to run
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]"
        style={{
          background: 'linear-gradient(135deg, #c25a00 0%, #a04800 100%)',
          color: '#fff',
          boxShadow: '0 4px 0 rgba(130,60,0,0.4), 0 8px 24px rgba(194,90,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
        }}
      >
        <PlusIcon size={16} />
        Add Dependency
      </button>
    </div>
  );
}

// ─── Add Dependency Dialog ──────────────────────────────────────────────────

interface AddDependencyDialogProps {
  projectId: string;
  existingServiceIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
  connectHook: {
    getConnectionState: (serviceId: string) => import('@/hooks/useDependencyConnect').ConnectFlowState;
    startMcpConnect: (service: ServiceRegistryEntry) => Promise<void>;
    startBrowserFallback: (service: ServiceRegistryEntry, userEmail: string, userName: string, projectId?: string) => Promise<void>;
    submitVerification: (serviceId: string, code: string, type: 'email' | 'sms') => Promise<void>;
    cancelFallback: (serviceId: string) => void;
    retryFallback: (serviceId: string, userEmail: string, userName: string, projectId?: string) => Promise<void>;
    getBrowserAgentState: (serviceId: string) => import('@/hooks/useDependencyConnect').BrowserAgentState | null;
    disconnect: (serviceId: string) => Promise<void>;
    connections: Map<string, import('@/hooks/useDependencyConnect').ConnectionInfo>;
  };
  user: { email?: string; name?: string } | null;
}

function AddDependencyDialog({
  projectId,
  existingServiceIds,
  onClose,
  onAdded,
  connectHook,
  user,
}: AddDependencyDialogProps) {
  const [services, setServices] = useState<ServiceRegistryEntry[]>([]);
  const [categories, setCategories] = useState<CategoryMeta[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [addingServiceId, setAddingServiceId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const {
    getConnectionState,
    startMcpConnect,
    startBrowserFallback,
    submitVerification,
    cancelFallback,
    retryFallback,
    getBrowserAgentState,
    disconnect,
    connections,
  } = connectHook;

  useEffect(() => {
    const load = async () => {
      setIsLoadingCatalog(true);
      try {
        const [servicesRes, categoriesRes] = await Promise.all([
          apiClient.getServiceRegistry(),
          apiClient.getServiceCategories(),
        ]);
        setServices(servicesRes.services);
        setCategories(categoriesRes.categories);
      } catch {
        // Failed to load
      } finally {
        setIsLoadingCatalog(false);
      }
    };
    load();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const connectedServiceIds = useMemo(() => {
    const ids = new Set<string>();
    connections.forEach((conn, id) => {
      if (conn.state === 'connected') ids.add(id);
    });
    return ids;
  }, [connections]);

  const filteredServices = useMemo(() => {
    let result = services;

    // Category filter
    if (selectedCategory !== 'all') {
      result = result.filter(s => s.category === selectedCategory);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q)),
      );
    }

    return result;
  }, [services, selectedCategory, search]);

  const handleAddService = useCallback(async (service: ServiceRegistryEntry) => {
    if (existingServiceIds.has(service.id)) return;

    // If connected, create instance directly
    if (connectedServiceIds.has(service.id)) {
      setAddingServiceId(service.id);
      try {
        await apiClient.createServiceInstance(service.id, projectId, `${service.name} for project`);
        onAdded();
      } catch {
        // Add failed
      } finally {
        setAddingServiceId(null);
      }
    }
    // If not connected, user needs to connect first — the ConnectButton handles that
  }, [existingServiceIds, connectedServiceIds, projectId, onAdded]);

  // Listen for connection completion to auto-add
  useEffect(() => {
    const autoAddConnected = async () => {
      if (!addingServiceId) return;
      const state = getConnectionState(addingServiceId);
      if (state === 'connected') {
        try {
          await apiClient.createServiceInstance(addingServiceId, projectId);
          onAdded();
        } catch {
          // Auto-add failed
        } finally {
          setAddingServiceId(null);
        }
      }
    };
    autoAddConnected();
  }, [connections, addingServiceId, getConnectionState, projectId, onAdded]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
    >
      <motion.div
        ref={dialogRef}
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-3xl max-h-[85vh] rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.95) 0%, rgba(248,245,242,0.95) 100%)',
          backdropFilter: 'blur(40px) saturate(200%)',
          WebkitBackdropFilter: 'blur(40px) saturate(200%)',
          border: '1px solid rgba(255,255,255,0.7)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.15), 0 8px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
        }}
      >
        {/* Dialog header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#1a1a1a' }}>Add Dependency</h2>
            <p className="text-xs" style={{ color: '#888' }}>Connect a service to this project</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl transition-colors"
            style={{ color: '#999' }}
            onMouseEnter={e => { (e.target as HTMLElement).style.color = '#555'; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.color = '#999'; }}
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 pt-4 pb-2">
          <div
            className="relative"
            style={{
              background: 'linear-gradient(145deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.4) 100%)',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.6)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03), inset 0 1px 2px rgba(255,255,255,0.9)',
            }}
          >
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#999' }}>
              <SearchIcon size={16} />
            </div>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search services..."
              className="w-full pl-10 pr-4 py-2.5 bg-transparent text-sm outline-none"
              style={{ color: '#1a1a1a' }}
              autoFocus
            />
          </div>
        </div>

        {/* Category chips */}
        <div className="px-6 pb-3 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1.5 min-w-max">
            <MiniCategoryChip label="All" active={selectedCategory === 'all'} onClick={() => setSelectedCategory('all')} />
            {categories.map(cat => (
              <MiniCategoryChip
                key={cat.id}
                label={cat.label}
                active={selectedCategory === cat.id}
                onClick={() => setSelectedCategory(cat.id)}
              />
            ))}
          </div>
        </div>

        {/* Service list */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {isLoadingCatalog ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#c25a00 transparent #c25a00 #c25a00' }} />
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: '#888' }}>No services match your search</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredServices.map(service => {
                const alreadyAdded = existingServiceIds.has(service.id);
                const isConnected = connectedServiceIds.has(service.id);
                const isAdding = addingServiceId === service.id;

                return (
                  <div
                    key={service.id}
                    className="flex items-center gap-3 p-3 rounded-xl transition-all duration-200"
                    style={{
                      background: alreadyAdded
                        ? 'rgba(34,197,94,0.04)'
                        : 'linear-gradient(145deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.25) 100%)',
                      border: alreadyAdded
                        ? '1px solid rgba(34,197,94,0.15)'
                        : '1px solid rgba(255,255,255,0.4)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03), inset 0 1px 1px rgba(255,255,255,0.8)',
                      opacity: alreadyAdded ? 0.7 : 1,
                    }}
                  >
                    {/* Logo */}
                    <div
                      className="rounded-lg p-2 flex-shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${service.brandColor}12 0%, ${service.brandColor}06 100%)`,
                      }}
                    >
                      <BrandIcon iconId={service.iconSlug} size={20} color={service.brandColor} ariaLabel={service.name} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: '#1a1a1a' }}>
                        {service.name}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: '#888' }}>
                        {service.description}
                      </p>
                    </div>

                    {/* Action */}
                    <div className="flex-shrink-0">
                      {alreadyAdded ? (
                        <span className="text-xs font-medium px-2.5 py-1 rounded-lg" style={{ color: '#22c55e', background: 'rgba(34,197,94,0.08)' }}>
                          Added
                        </span>
                      ) : isConnected ? (
                        <button
                          onClick={() => handleAddService(service)}
                          disabled={isAdding}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                          style={{
                            color: '#fff',
                            background: isAdding
                              ? '#999'
                              : 'linear-gradient(135deg, #c25a00 0%, #a04800 100%)',
                            boxShadow: isAdding
                              ? 'none'
                              : '0 2px 6px rgba(194,90,0,0.2)',
                          }}
                        >
                          {isAdding ? 'Adding...' : 'Add to Project'}
                        </button>
                      ) : (
                        <ConnectButton
                          service={service}
                          state={getConnectionState(service.id)}
                          onConnect={(s) => {
                            setAddingServiceId(s.id);
                            return startMcpConnect(s);
                          }}
                          onFallbackApprove={(s) => {
                            setAddingServiceId(s.id);
                            startBrowserFallback(s, user?.email || '', user?.name || '');
                          }}
                          onTierSelect={() => {}}
                          onDisconnect={disconnect}
                          userEmail={user?.email}
                          userName={user?.name}
                          showTierSelector={false}
                          compact={true}
                          showLogo={false}
                          browserAgentState={getBrowserAgentState(service.id)}
                          onSubmitVerificationCode={(code, type) => submitVerification(service.id, code, type)}
                          onCancelFallback={() => cancelFallback(service.id)}
                          onRetryFallback={() => retryFallback(service.id, user?.email || '', user?.name || '')}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Mini Category Chip ─────────────────────────────────────────────────────

function MiniCategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap"
      style={{
        color: active ? '#fff' : '#666',
        background: active
          ? 'linear-gradient(135deg, #c25a00 0%, #a04800 100%)'
          : 'rgba(0,0,0,0.03)',
        boxShadow: active ? '0 2px 6px rgba(194,90,0,0.2)' : 'none',
      }}
    >
      {label}
    </button>
  );
}

// ─── Remove Dependency Dialog ───────────────────────────────────────────────

interface RemoveDependencyDialogProps {
  instance: ProjectServiceInstance;
  isRemoving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function RemoveDependencyDialog({ instance, isRemoving, onConfirm, onCancel }: RemoveDependencyDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const serviceName = instance.service?.name || instance.serviceId;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
    >
      <motion.div
        ref={dialogRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-md rounded-2xl p-6"
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.97) 0%, rgba(248,245,242,0.97) 100%)',
          backdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.7)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.15), 0 8px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          {instance.service && (
            <div
              className="rounded-xl p-2.5"
              style={{
                background: `linear-gradient(135deg, ${instance.service.brandColor}12 0%, ${instance.service.brandColor}06 100%)`,
              }}
            >
              <BrandIcon
                iconId={instance.service.iconSlug}
                size={24}
                color={instance.service.brandColor}
                ariaLabel={instance.service.name}
              />
            </div>
          )}
          <div>
            <h3 className="text-base font-bold" style={{ color: '#1a1a1a' }}>Remove {serviceName}?</h3>
          </div>
        </div>

        <p className="text-sm mb-6 leading-relaxed" style={{ color: '#555' }}>
          This will remove {serviceName} from this project. Your {serviceName} account and data will not be deleted. You can add it back later.
        </p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              color: '#555',
              background: 'linear-gradient(145deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.4) 100%)',
              border: '1px solid rgba(255,255,255,0.5)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isRemoving}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              color: '#fff',
              background: isRemoving
                ? '#999'
                : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              boxShadow: isRemoving
                ? 'none'
                : '0 4px 0 rgba(185,28,28,0.3), 0 8px 16px rgba(239,68,68,0.2)',
            }}
          >
            {isRemoving ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
