/**
 * Dependencies Page — Full dependency management view.
 *
 * Two modes:
 * - My Dependencies: connected services with status, project badges, management
 * - Browse All: full catalog for discovery and connecting new services
 *
 * Features: search, category filters, project selector, responsive grid,
 * branded tiles with depth and warm glass styling.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { HoverSidebar } from '@/components/navigation/HoverSidebar';
import { AccountSlideOut } from '@/components/account/AccountSlideOut';
import { KriptikLogo } from '@/components/ui/KriptikLogo';
import { GlitchText } from '@/components/ui/GlitchText';
import { HandDrawnArrow } from '@/components/ui/HandDrawnArrow';
import { ArrowLeftIcon, SearchIcon, ChevronDownIcon } from '@/components/ui/icons';
import { BrandIcon } from '@/components/ui/BrandIcon';
import { ConnectButton } from '@/components/dependencies/ConnectButton';
import { useDependencyConnect } from '@/hooks/useDependencyConnect';
import { useUserStore } from '@/store/useUserStore';
import { useProjectStore } from '@/store/useProjectStore';
import { useDependencyStore } from '@/store/useDependencyStore';
import { apiClient } from '@/lib/api-client';
import type { ServiceRegistryEntry, CategoryMeta, Project } from '@/lib/api-client';
import '@/styles/realistic-glass.css';

type ViewMode = 'my-deps' | 'browse';

const CATEGORY_ALL = 'all';

export default function DependenciesPage() {
  const navigate = useNavigate();
  const user = useUserStore(s => s.user);
  const { projects, fetchProjects } = useProjectStore();

  // Service registry from global store
  const storeServices = useDependencyStore(s => s.services);
  const storeCategories = useDependencyStore(s => s.categories);
  const registryLoaded = useDependencyStore(s => s.registryLoaded);
  const loadRegistry = useDependencyStore(s => s.loadRegistry);
  const loadStoreConnections = useDependencyStore(s => s.loadConnections);
  const startHealthChecks = useDependencyStore(s => s.startHealthChecks);

  // Use store data, fall back to local state for first load
  const [services, setServices] = useState<ServiceRegistryEntry[]>([]);
  const [categories, setCategories] = useState<CategoryMeta[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(CATEGORY_ALL);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  // Connection management
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
  } = useDependencyConnect();

  // Load data on mount — use global store, sync to local state
  useEffect(() => {
    loadRegistry();
    loadStoreConnections();
    startHealthChecks();
    fetchProjects();
  }, [loadRegistry, loadStoreConnections, startHealthChecks, fetchProjects]);

  // Sync store data to local state for rendering
  useEffect(() => {
    if (registryLoaded) {
      setServices(storeServices);
      setCategories(storeCategories);
      setIsLoadingServices(false);
    }
  }, [registryLoaded, storeServices, storeCategories]);

  // Close project dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setShowProjectDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Filter logic
  const connectedServiceIds = useMemo(() => {
    const ids = new Set<string>();
    connections.forEach((conn, id) => {
      if (conn.state === 'connected') ids.add(id);
    });
    return ids;
  }, [connections]);

  const filteredServices = useMemo(() => {
    let result = services;

    // Mode filter
    if (viewMode === 'my-deps') {
      result = result.filter(s => connectedServiceIds.has(s.id) || getConnectionState(s.id) === 'connecting');
    }

    // Category filter
    if (selectedCategory !== CATEGORY_ALL) {
      result = result.filter(s => s.category === selectedCategory);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    return result;
  }, [services, viewMode, selectedCategory, searchQuery, connectedServiceIds, getConnectionState]);

  // Category counts for filter tabs
  const categoryCounts = useMemo(() => {
    const sourceServices = viewMode === 'my-deps'
      ? services.filter(s => connectedServiceIds.has(s.id))
      : services;

    const counts: Record<string, number> = { [CATEGORY_ALL]: sourceServices.length };
    for (const s of sourceServices) {
      counts[s.category] = (counts[s.category] || 0) + 1;
    }
    return counts;
  }, [services, viewMode, connectedServiceIds]);

  const handleTierSelect = useCallback(() => {
    // Tier selection handled post-connection
  }, []);

  const selectedProjectName = selectedProjectId
    ? projects.find(p => p.id === selectedProjectId)?.name || 'Unknown'
    : 'All Projects';

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
        <div
          className="absolute bottom-0 left-0 right-0 h-1 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(200,200,205,0.4) 0%, rgba(180,180,185,0.3) 100%)',
            transform: 'translateY(100%)',
          }}
        />
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
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
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
            style={{
              background: 'linear-gradient(145deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.4) 100%)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 4px 0 rgba(200, 195, 190, 0.5), 0 8px 24px rgba(0, 0, 0, 0.06), inset 0 1px 2px rgba(255, 255, 255, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.5)',
              color: '#1a1a1a',
            }}
          >
            <ArrowLeftIcon size={16} />
            Dashboard
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-6 md:py-10">
        <div className="max-w-7xl mx-auto">
          {/* Page title and view controls */}
          <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1
                className="text-3xl md:text-4xl font-bold mb-1"
                style={{
                  fontFamily: '-apple-system, BlinkMacSystemFont, SF Pro Display, sans-serif',
                  color: '#1a1a1a',
                }}
              >
                Dependencies
              </h1>
              <p className="text-sm md:text-base" style={{ color: '#555' }}>
                Connect and manage all external services your apps depend on
              </p>
            </div>

            {/* View mode toggle + project selector */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {/* Project selector */}
              <div className="relative" ref={projectDropdownRef}>
                <button
                  onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.01]"
                  style={{
                    background: 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.35) 100%)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255,255,255,0.5)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04), inset 0 1px 2px rgba(255,255,255,0.8)',
                    color: '#1a1a1a',
                  }}
                >
                  <span className="max-w-[120px] truncate">{selectedProjectName}</span>
                  <ChevronDownIcon size={14} />
                </button>

                <AnimatePresence>
                  {showProjectDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-56 rounded-xl overflow-hidden z-50"
                      style={{
                        background: 'linear-gradient(145deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.7) 100%)',
                        backdropFilter: 'blur(24px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                        border: '1px solid rgba(255,255,255,0.6)',
                        boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
                      }}
                    >
                      <div className="py-1">
                        <button
                          onClick={() => { setSelectedProjectId(null); setShowProjectDropdown(false); }}
                          className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                          style={{
                            color: selectedProjectId === null ? '#c25a00' : '#1a1a1a',
                            background: selectedProjectId === null ? 'rgba(194,90,0,0.06)' : 'transparent',
                            fontWeight: selectedProjectId === null ? 600 : 400,
                          }}
                          onMouseEnter={e => { if (selectedProjectId !== null) (e.target as HTMLButtonElement).style.background = 'rgba(0,0,0,0.03)'; }}
                          onMouseLeave={e => { if (selectedProjectId !== null) (e.target as HTMLButtonElement).style.background = 'transparent'; }}
                        >
                          All Projects
                        </button>
                        {projects.map(p => (
                          <button
                            key={p.id}
                            onClick={() => { setShowProjectDropdown(false); navigate(`/projects/${p.id}/dependencies`); }}
                            className="w-full text-left px-4 py-2.5 text-sm transition-colors truncate"
                            style={{
                              color: '#1a1a1a',
                              background: 'transparent',
                              fontWeight: 400,
                            }}
                            onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = 'rgba(0,0,0,0.03)'; }}
                            onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'transparent'; }}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Mode toggle */}
              <div
                className="flex rounded-xl overflow-hidden"
                style={{
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.3) 100%)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255,255,255,0.5)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04), inset 0 1px 2px rgba(255,255,255,0.8)',
                }}
              >
                <button
                  onClick={() => setViewMode('my-deps')}
                  className="px-4 py-2 text-sm font-medium transition-all duration-200"
                  style={{
                    color: viewMode === 'my-deps' ? '#fff' : '#555',
                    background: viewMode === 'my-deps'
                      ? 'linear-gradient(135deg, #c25a00 0%, #a04800 100%)'
                      : 'transparent',
                    boxShadow: viewMode === 'my-deps'
                      ? '0 2px 8px rgba(194,90,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)'
                      : 'none',
                  }}
                >
                  My Dependencies
                </button>
                <button
                  onClick={() => setViewMode('browse')}
                  className="px-4 py-2 text-sm font-medium transition-all duration-200"
                  style={{
                    color: viewMode === 'browse' ? '#fff' : '#555',
                    background: viewMode === 'browse'
                      ? 'linear-gradient(135deg, #c25a00 0%, #a04800 100%)'
                      : 'transparent',
                    boxShadow: viewMode === 'browse'
                      ? '0 2px 8px rgba(194,90,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)'
                      : 'none',
                  }}
                >
                  Browse All
                </button>
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="mb-4">
            <div
              className="relative max-w-xl"
              style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.4) 100%)',
                backdropFilter: 'blur(20px)',
                borderRadius: '14px',
                border: '1px solid rgba(255,255,255,0.6)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.04), inset 0 1px 2px rgba(255,255,255,0.9), 0 0 0 0 rgba(194,90,0,0)',
                transition: 'box-shadow 0.3s ease',
              }}
            >
              <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#999' }}>
                <SearchIcon size={18} />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={viewMode === 'my-deps' ? 'Search connected services...' : 'Search all services...'}
                className="w-full pl-11 pr-4 py-3 bg-transparent text-sm outline-none"
                style={{
                  color: '#1a1a1a',
                  fontFamily: '-apple-system, BlinkMacSystemFont, SF Pro Text, sans-serif',
                }}
              />
            </div>
          </div>

          {/* Category filter tabs */}
          <div className="mb-6 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex gap-2 pb-1 min-w-max">
              <CategoryTab
                label="All"
                count={categoryCounts[CATEGORY_ALL] || 0}
                active={selectedCategory === CATEGORY_ALL}
                onClick={() => setSelectedCategory(CATEGORY_ALL)}
              />
              {categories.map(cat => {
                const count = categoryCounts[cat.id] || 0;
                if (count === 0 && viewMode === 'my-deps') return null;
                return (
                  <CategoryTab
                    key={cat.id}
                    label={cat.label}
                    count={count}
                    active={selectedCategory === cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                  />
                );
              })}
            </div>
          </div>

          {/* Service grid */}
          {isLoadingServices ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonTile key={i} />
              ))}
            </div>
          ) : filteredServices.length === 0 ? (
            <EmptyState viewMode={viewMode} searchQuery={searchQuery} />
          ) : (
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              layout
            >
              <AnimatePresence mode="popLayout">
                {filteredServices.map(service => (
                  <motion.div
                    key={service.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                  >
                    <DependencyTile
                      service={service}
                      connectionState={getConnectionState(service.id)}
                      onConnect={startMcpConnect}
                      onFallbackApprove={(s) => startBrowserFallback(s, user?.email || '', user?.name || '')}
                      onTierSelect={handleTierSelect}
                      onDisconnect={disconnect}
                      userEmail={user?.email}
                      userName={user?.name}
                      browserAgentState={getBrowserAgentState(service.id)}
                      onSubmitVerificationCode={(code, type) => submitVerification(service.id, code, type)}
                      onCancelFallback={() => cancelFallback(service.id)}
                      onRetryFallback={() => retryFallback(service.id, user?.email || '', user?.name || '')}
                      projects={projects}
                      connectedServiceIds={connectedServiceIds}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Footer spacing */}
          <div className="h-16" />
        </div>
      </main>
    </div>
  );
}

// =============================================================================
// DependencyTile — individual service card with brand theming
// =============================================================================

interface DependencyTileProps {
  service: ServiceRegistryEntry;
  connectionState: ReturnType<ReturnType<typeof useDependencyConnect>['getConnectionState']>;
  onConnect: (service: ServiceRegistryEntry) => Promise<void>;
  onFallbackApprove: (service: ServiceRegistryEntry) => void;
  onTierSelect: (service: ServiceRegistryEntry, tier: import('@/lib/api-client').PricingTier) => void;
  onDisconnect: (serviceId: string) => Promise<void>;
  userEmail?: string;
  userName?: string;
  browserAgentState: ReturnType<ReturnType<typeof useDependencyConnect>['getBrowserAgentState']>;
  onSubmitVerificationCode: (code: string, type: 'email' | 'sms') => void;
  onCancelFallback: () => void;
  onRetryFallback: () => void;
  projects: Project[];
  connectedServiceIds: Set<string>;
}

function DependencyTile({
  service,
  connectionState,
  onConnect,
  onFallbackApprove,
  onTierSelect,
  onDisconnect,
  userEmail,
  userName,
  browserAgentState,
  onSubmitVerificationCode,
  onCancelFallback,
  onRetryFallback,
  connectedServiceIds,
}: DependencyTileProps) {
  const tileNavigate = useNavigate();
  const isConnected = connectedServiceIds.has(service.id);
  const freeTier = service.pricing.find(t => t.price === 0);
  const lowestPaidTier = service.pricing
    .filter(t => t.price > 0 && t.price !== -1)
    .sort((a, b) => a.price - b.price)[0];

  const pricingSummary = freeTier
    ? 'Free tier available'
    : lowestPaidTier
      ? `From $${lowestPaidTier.price}/mo`
      : '';

  return (
    <div
      className="group relative rounded-2xl p-4 transition-all duration-300"
      style={{
        background: 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.35) 100%)',
        backdropFilter: 'blur(20px) saturate(150%)',
        WebkitBackdropFilter: 'blur(20px) saturate(150%)',
        border: isConnected
          ? `1px solid ${service.brandColor}30`
          : '1px solid rgba(255,255,255,0.5)',
        boxShadow: isConnected
          ? `0 4px 0 ${service.brandColor}12, 0 8px 24px rgba(0,0,0,0.06), inset 0 1px 2px rgba(255,255,255,0.8), 0 0 0 0 ${service.brandColor}00`
          : '0 4px 0 rgba(200,195,190,0.35), 0 8px 24px rgba(0,0,0,0.05), inset 0 1px 2px rgba(255,255,255,0.9)',
        cursor: isConnected ? 'pointer' : 'default',
      }}
      onClick={() => {
        if (isConnected) tileNavigate(`/dependencies/${service.id}`);
      }}
      onMouseEnter={e => {
        const el = e.currentTarget;
        el.style.transform = 'translateY(-2px)';
        el.style.boxShadow = isConnected
          ? `0 6px 2px ${service.brandColor}12, 0 12px 32px rgba(0,0,0,0.08), inset 0 1px 2px rgba(255,255,255,0.8), 0 0 20px ${service.brandColor}08`
          : '0 6px 2px rgba(200,195,190,0.3), 0 12px 32px rgba(0,0,0,0.08), inset 0 1px 2px rgba(255,255,255,0.9)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget;
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = isConnected
          ? `0 4px 0 ${service.brandColor}12, 0 8px 24px rgba(0,0,0,0.06), inset 0 1px 2px rgba(255,255,255,0.8), 0 0 0 0 ${service.brandColor}00`
          : '0 4px 0 rgba(200,195,190,0.35), 0 8px 24px rgba(0,0,0,0.05), inset 0 1px 2px rgba(255,255,255,0.9)';
      }}
    >
      {/* Top row: logo + status */}
      <div className="flex items-start justify-between mb-3">
        <div
          className="relative rounded-xl p-2.5 transition-all duration-300"
          style={{
            background: `linear-gradient(135deg, ${service.brandColor}12 0%, ${service.brandColor}06 100%)`,
            boxShadow: `inset 0 1px 2px rgba(255,255,255,0.5), 0 2px 8px ${service.brandColor}08`,
          }}
        >
          <BrandIcon
            iconId={service.iconSlug}
            size={28}
            color={service.brandColor}
            ariaLabel={service.name}
          />
          {/* Status dot for connected services */}
          {isConnected && (
            <div
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full"
              style={{
                backgroundColor: '#22c55e',
                border: '2px solid rgba(255,255,255,0.9)',
                boxShadow: '0 0 6px rgba(34,197,94,0.4)',
              }}
            />
          )}
        </div>

        {/* MCP badge */}
        {service.mcp && (
          <span
            className="px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide uppercase"
            style={{
              color: '#6b7280',
              background: 'rgba(107,114,128,0.08)',
              border: '1px solid rgba(107,114,128,0.12)',
            }}
          >
            MCP
          </span>
        )}
      </div>

      {/* Service info */}
      <h3
        className="text-base font-semibold mb-1"
        style={{ color: '#1a1a1a' }}
      >
        {service.name}
      </h3>
      <p
        className="text-xs leading-relaxed mb-3 line-clamp-2"
        style={{ color: '#666', minHeight: '2.5em' }}
      >
        {service.description}
      </p>

      {/* Pricing info */}
      {pricingSummary && (
        <p
          className="text-xs font-medium mb-3"
          style={{ color: '#888' }}
        >
          {pricingSummary}
        </p>
      )}

      {/* Connect button */}
      <ConnectButton
        service={service}
        state={connectionState}
        onConnect={onConnect}
        onFallbackApprove={onFallbackApprove}
        onTierSelect={onTierSelect}
        onDisconnect={onDisconnect}
        userEmail={userEmail}
        userName={userName}
        showTierSelector={true}
        compact={false}
        showLogo={false}
        browserAgentState={browserAgentState}
        onSubmitVerificationCode={onSubmitVerificationCode}
        onCancelFallback={onCancelFallback}
        onRetryFallback={onRetryFallback}
      />
    </div>
  );
}

// =============================================================================
// CategoryTab — filter chip with count badge
// =============================================================================

interface CategoryTabProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

function CategoryTab({ label, count, active, onClick }: CategoryTabProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap"
      style={{
        color: active ? '#fff' : '#555',
        background: active
          ? 'linear-gradient(135deg, #c25a00 0%, #a04800 100%)'
          : 'linear-gradient(145deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.3) 100%)',
        border: active ? '1px solid rgba(194,90,0,0.3)' : '1px solid rgba(255,255,255,0.5)',
        boxShadow: active
          ? '0 2px 8px rgba(194,90,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)'
          : '0 1px 4px rgba(0,0,0,0.03), inset 0 1px 1px rgba(255,255,255,0.8)',
      }}
    >
      {label}
      <span
        className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
        style={{
          color: active ? 'rgba(255,255,255,0.8)' : '#888',
          background: active ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.04)',
        }}
      >
        {count}
      </span>
    </button>
  );
}

// =============================================================================
// SkeletonTile — loading placeholder
// =============================================================================

function SkeletonTile() {
  return (
    <div
      className="rounded-2xl p-4 animate-pulse"
      style={{
        background: 'linear-gradient(145deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.25) 100%)',
        border: '1px solid rgba(255,255,255,0.4)',
        boxShadow: '0 4px 0 rgba(200,195,190,0.25), 0 8px 24px rgba(0,0,0,0.03)',
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-12 h-12 rounded-xl" style={{ background: 'rgba(0,0,0,0.06)' }} />
        <div className="w-10 h-5 rounded-md" style={{ background: 'rgba(0,0,0,0.04)' }} />
      </div>
      <div className="w-24 h-4 rounded mb-2" style={{ background: 'rgba(0,0,0,0.06)' }} />
      <div className="w-full h-3 rounded mb-1" style={{ background: 'rgba(0,0,0,0.04)' }} />
      <div className="w-3/4 h-3 rounded mb-3" style={{ background: 'rgba(0,0,0,0.04)' }} />
      <div className="w-16 h-3 rounded mb-3" style={{ background: 'rgba(0,0,0,0.03)' }} />
      <div className="w-full h-9 rounded-xl" style={{ background: 'rgba(0,0,0,0.04)' }} />
    </div>
  );
}

// =============================================================================
// EmptyState — when no services match filters
// =============================================================================

function EmptyState({ viewMode, searchQuery }: { viewMode: ViewMode; searchQuery: string }) {
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
        <SearchIcon size={24} />
      </div>
      {viewMode === 'my-deps' && !searchQuery ? (
        <>
          <p className="text-base font-medium mb-1" style={{ color: '#1a1a1a' }}>
            No connected services yet
          </p>
          <p className="text-sm" style={{ color: '#666' }}>
            Switch to Browse All to discover and connect services
          </p>
        </>
      ) : (
        <>
          <p className="text-base font-medium mb-1" style={{ color: '#1a1a1a' }}>
            No services found
          </p>
          <p className="text-sm" style={{ color: '#666' }}>
            Try adjusting your search or filters
          </p>
        </>
      )}
    </div>
  );
}
