/**
 * DependencyDashboard — Individual service management dashboard.
 *
 * Opened when clicking a connected dependency tile. Shows:
 * - Header with branded logo, connection status, external link
 * - Overview panel with current tier and usage
 * - Project instances panel with per-project API keys
 * - Subscription management with plan comparison
 * - API keys panel with create/revoke/copy
 * - Billing panel (MCP data or external link fallback)
 *
 * Panels render conditionally based on what MCP tools the service exposes.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { HoverSidebar } from '@/components/navigation/HoverSidebar';
import { AccountSlideOut } from '@/components/account/AccountSlideOut';
import { KriptikLogo } from '@/components/ui/KriptikLogo';
import { GlitchText } from '@/components/ui/GlitchText';
import { BrandIcon } from '@/components/ui/BrandIcon';
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  KeyIcon,
  CheckIcon,
  RefreshIcon,
  TrashIcon,
  PlusIcon,
  CreditCardIcon,
  DatabaseIcon,
  LayersIcon,
  ShieldIcon,
  GlobeIcon,
} from '@/components/ui/icons';
import { useDependencyConnect } from '@/hooks/useDependencyConnect';
import { useUserStore } from '@/store/useUserStore';
import { useProjectStore } from '@/store/useProjectStore';
import { useDependencyStore } from '@/store/useDependencyStore';
import { apiClient } from '@/lib/api-client';
import type {
  ServiceRegistryEntry,
  McpToolDefinition,
  PricingTier,
  Project,
} from '@/lib/api-client';
import type { ConnectFlowState } from '@/hooks/useDependencyConnect';
import '@/styles/realistic-glass.css';

// ─── Tool capability categories ─────────────────────────────────────────────

interface ToolCapabilities {
  hasBilling: boolean;
  hasSubscription: boolean;
  hasApiKeys: boolean;
  hasProjectManagement: boolean;
  hasUsageData: boolean;
  hasDatabase: boolean;
}

function categorizeTools(tools: McpToolDefinition[]): ToolCapabilities {
  const names = tools.map(t => t.name.toLowerCase());
  const descs = tools.map(t => (t.description || '').toLowerCase());
  const all = [...names, ...descs];

  const has = (keywords: string[]) =>
    all.some(text => keywords.some(kw => text.includes(kw)));

  return {
    hasBilling: has(['billing', 'invoice', 'charge', 'payment', 'cost']),
    hasSubscription: has(['subscription', 'plan', 'tier', 'upgrade', 'downgrade']),
    hasApiKeys: has(['api_key', 'api-key', 'apikey', 'token', 'secret', 'credential', 'create_key', 'revoke_key']),
    hasProjectManagement: has(['project', 'instance', 'database', 'application', 'environment']),
    hasUsageData: has(['usage', 'metrics', 'stats', 'bandwidth', 'requests', 'storage']),
    hasDatabase: has(['database', 'table', 'schema', 'query', 'migration']),
  };
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function DependencyDashboard() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const navigate = useNavigate();
  const user = useUserStore(s => s.user);
  const { projects, fetchProjects } = useProjectStore();

  const {
    getConnectionState,
    disconnect,
    connections,
    refreshConnections,
  } = useDependencyConnect();

  const setToolsForService = useDependencyStore(s => s.setToolsForService);
  const storeConnection = useDependencyStore(s => serviceId ? s.connections.get(serviceId) : undefined);

  const [service, setService] = useState<ServiceRegistryEntry | null>(null);
  const [tools, setTools] = useState<McpToolDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [disconnecting, setDisconnecting] = useState(false);

  // Load service data and tools
  useEffect(() => {
    if (!serviceId) return;
    const load = async () => {
      setIsLoading(true);
      try {
        // Use cached tools from store if available
        const cachedTools = storeConnection?.tools;

        const [serviceRes, toolsRes] = await Promise.allSettled([
          apiClient.getService(serviceId),
          cachedTools && cachedTools.length > 0 ? Promise.resolve({ tools: cachedTools }) : apiClient.getMcpTools(serviceId),
        ]);

        if (serviceRes.status === 'fulfilled') {
          setService(serviceRes.value.service);
        }
        if (toolsRes.status === 'fulfilled') {
          setTools(toolsRes.value.tools);
          // Sync tools to global store
          if (toolsRes.value.tools.length > 0) {
            setToolsForService(serviceId, toolsRes.value.tools);
          }
        }
      } catch {
        // Load failed
      } finally {
        setIsLoading(false);
      }
    };
    load();
    fetchProjects();
  }, [serviceId, fetchProjects, storeConnection?.tools, setToolsForService]);

  const connectionState = serviceId ? getConnectionState(serviceId) : 'disconnected';
  const connectionInfo = serviceId ? connections.get(serviceId) : undefined;
  const capabilities = useMemo(() => categorizeTools(tools), [tools]);

  const handleDisconnect = useCallback(async () => {
    if (!serviceId) return;
    setDisconnecting(true);
    try {
      await disconnect(serviceId);
      navigate('/dependencies');
    } catch {
      setDisconnecting(false);
    }
  }, [serviceId, disconnect, navigate]);

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

  if (!service) {
    return (
      <div className="min-h-screen" style={{ background: 'linear-gradient(145deg, #e8e4df 0%, #d8d4cf 50%, #ccc8c3 100%)' }}>
        <HoverSidebar />
        <AccountSlideOut />
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <p className="text-base font-medium" style={{ color: '#1a1a1a' }}>Service not found</p>
          <button
            onClick={() => navigate('/dependencies')}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{
              background: 'linear-gradient(135deg, #c25a00 0%, #a04800 100%)',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(194,90,0,0.3)',
            }}
          >
            Back to Dependencies
          </button>
        </div>
      </div>
    );
  }

  const brandColor = service.brandColor;

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(145deg, #e8e4df 0%, #d8d4cf 50%, #ccc8c3 100%)' }}>
      <HoverSidebar />
      <AccountSlideOut />

      {/* Header bar */}
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
          <div
            className="flex items-center gap-4 cursor-pointer group"
            onClick={() => navigate('/dashboard')}
          >
            <KriptikLogo size="sm" animated />
            <GlitchText text="KripTik AI" className="text-2xl group-hover:opacity-90 transition-opacity" />
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
            Dependencies
          </button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 md:py-10">
        <div className="max-w-5xl mx-auto">
          {/* Service header card */}
          <DashboardHeader
            service={service}
            connectionState={connectionState}
            connectedAt={connectionInfo?.connectedAt}
            onDisconnect={handleDisconnect}
            disconnecting={disconnecting}
            onRefresh={refreshConnections}
          />

          {/* Dashboard panels */}
          <div className="mt-6 flex flex-col gap-5">
            {/* Overview panel — always shown for connected services */}
            {connectionState === 'connected' && (
              <OverviewPanel
                service={service}
                capabilities={capabilities}
                tools={tools}
              />
            )}

            {/* Project instances — always shown if user has projects */}
            {connectionState === 'connected' && projects.length > 0 && (
              <ProjectInstancesPanel
                service={service}
                projects={projects}
                revealedKeys={revealedKeys}
                copiedKey={copiedKey}
                onToggleReveal={toggleRevealKey}
                onCopyKey={handleCopyKey}
              />
            )}

            {/* Subscription management — always shown if service has pricing */}
            {connectionState === 'connected' && service.pricing.length > 0 && (
              <SubscriptionPanel
                service={service}
                capabilities={capabilities}
              />
            )}

            {/* API Keys — shown if MCP tools expose key management, or if service uses api-key model */}
            {connectionState === 'connected' && (capabilities.hasApiKeys || service.instanceModel === 'api-key-per-project') && (
              <ApiKeysPanel
                service={service}
                revealedKeys={revealedKeys}
                copiedKey={copiedKey}
                onToggleReveal={toggleRevealKey}
                onCopyKey={handleCopyKey}
              />
            )}

            {/* Billing — shown if MCP tools expose billing, otherwise external link */}
            {connectionState === 'connected' && (
              <BillingPanel
                service={service}
                capabilities={capabilities}
              />
            )}

            {/* MCP Tools — shown if service has MCP and we have tools */}
            {connectionState === 'connected' && tools.length > 0 && (
              <ToolsPanel
                service={service}
                tools={tools}
              />
            )}
          </div>

          <div className="h-16" />
        </div>
      </main>
    </div>
  );
}

// ─── Dashboard Header ───────────────────────────────────────────────────────

interface DashboardHeaderProps {
  service: ServiceRegistryEntry;
  connectionState: ConnectFlowState;
  connectedAt?: string;
  onDisconnect: () => void;
  disconnecting: boolean;
  onRefresh: () => Promise<void>;
}

function DashboardHeader({ service, connectionState, connectedAt, onDisconnect, disconnecting, onRefresh }: DashboardHeaderProps) {
  const statusConfig = getStatusConfig(connectionState);
  const brandColor = service.brandColor;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="rounded-2xl p-6"
      style={{
        background: 'linear-gradient(145deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.4) 100%)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: `1px solid ${brandColor}20`,
        boxShadow: `0 6px 0 ${brandColor}08, 0 12px 40px rgba(0,0,0,0.06), inset 0 1px 2px rgba(255,255,255,0.9), 0 0 40px ${brandColor}04`,
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        {/* Left: logo + info */}
        <div className="flex items-start gap-4">
          <div
            className="relative rounded-2xl p-4 flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${brandColor}15 0%, ${brandColor}08 100%)`,
              boxShadow: `inset 0 1px 3px rgba(255,255,255,0.6), 0 4px 16px ${brandColor}10`,
            }}
          >
            <BrandIcon
              iconId={service.iconSlug}
              size={40}
              color={brandColor}
              ariaLabel={service.name}
            />
            {/* Status dot overlay */}
            <div
              className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full"
              style={{
                backgroundColor: statusConfig.dotColor,
                border: '2.5px solid rgba(255,255,255,0.95)',
                boxShadow: `0 0 8px ${statusConfig.dotColor}60`,
              }}
            />
          </div>

          <div className="min-w-0">
            <h1
              className="text-2xl md:text-3xl font-bold mb-1 truncate"
              style={{ color: '#1a1a1a' }}
            >
              {service.name}
            </h1>
            <p className="text-sm mb-2 leading-relaxed max-w-lg" style={{ color: '#666' }}>
              {service.description}
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Status badge */}
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                style={{
                  color: statusConfig.textColor,
                  background: `${statusConfig.dotColor}12`,
                  border: `1px solid ${statusConfig.dotColor}20`,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: statusConfig.dotColor }}
                />
                {statusConfig.label}
              </span>

              {/* MCP badge */}
              {service.mcp && (
                <span
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold tracking-wide uppercase"
                  style={{
                    color: '#6b7280',
                    background: 'rgba(107,114,128,0.08)',
                    border: '1px solid rgba(107,114,128,0.12)',
                  }}
                >
                  MCP
                </span>
              )}

              {/* Connected since */}
              {connectedAt && (
                <span className="text-xs" style={{ color: '#999' }}>
                  Connected {formatRelativeDate(connectedAt)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <ActionButton
            label="Refresh"
            onClick={onRefresh}
            icon={<RefreshIcon size={15} />}
          />
          <ActionButton
            label="Open Dashboard"
            onClick={() => window.open(service.websiteUrl, '_blank', 'noopener,noreferrer')}
            icon={<ExternalLinkIcon size={15} />}
          />
          <ActionButton
            label={disconnecting ? 'Disconnecting...' : 'Disconnect'}
            onClick={onDisconnect}
            disabled={disconnecting}
            variant="danger"
            icon={<TrashIcon size={15} />}
          />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Overview Panel ─────────────────────────────────────────────────────────

interface OverviewPanelProps {
  service: ServiceRegistryEntry;
  capabilities: ToolCapabilities;
  tools: McpToolDefinition[];
}

function OverviewPanel({ service, capabilities, tools }: OverviewPanelProps) {
  const brandColor = service.brandColor;
  const currentTier = service.pricing[0];
  const toolCount = tools.length;

  return (
    <PanelCard
      title="Overview"
      icon={<LayersIcon size={18} />}
      brandColor={brandColor}
      delay={0.05}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Current tier */}
        {currentTier && (
          <StatCard
            label="Current Plan"
            value={currentTier.name}
            detail={currentTier.price === 0 ? 'Free' : `$${currentTier.price}/mo`}
            brandColor={brandColor}
          />
        )}

        {/* Instance model */}
        <StatCard
          label="Instance Model"
          value={formatInstanceModel(service.instanceModel)}
          detail={getInstanceModelDescription(service.instanceModel)}
          brandColor={brandColor}
        />

        {/* Available tools */}
        {toolCount > 0 && (
          <StatCard
            label="MCP Tools"
            value={`${toolCount} available`}
            detail={capabilities.hasUsageData ? 'Usage data available' : 'Core operations'}
            brandColor={brandColor}
          />
        )}

        {/* Category */}
        <StatCard
          label="Category"
          value={formatCategory(service.category)}
          detail={service.tags.slice(0, 3).join(', ')}
          brandColor={brandColor}
        />
      </div>
    </PanelCard>
  );
}

// ─── Project Instances Panel ────────────────────────────────────────────────

interface ProjectInstancesPanelProps {
  service: ServiceRegistryEntry;
  projects: Project[];
  revealedKeys: Set<string>;
  copiedKey: string | null;
  onToggleReveal: (keyId: string) => void;
  onCopyKey: (key: string, keyId: string) => void;
}

function ProjectInstancesPanel({ service, projects, revealedKeys, copiedKey, onToggleReveal, onCopyKey }: ProjectInstancesPanelProps) {
  const brandColor = service.brandColor;

  return (
    <PanelCard
      title="Project Instances"
      icon={<DatabaseIcon size={18} />}
      brandColor={brandColor}
      delay={0.1}
    >
      {projects.length === 0 ? (
        <p className="text-sm" style={{ color: '#888' }}>No projects are using this service yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {projects.map(project => (
            <ProjectInstanceCard
              key={project.id}
              project={project}
              service={service}
              revealedKeys={revealedKeys}
              copiedKey={copiedKey}
              onToggleReveal={onToggleReveal}
              onCopyKey={onCopyKey}
            />
          ))}
        </div>
      )}
    </PanelCard>
  );
}

interface ProjectInstanceCardProps {
  project: Project;
  service: ServiceRegistryEntry;
  revealedKeys: Set<string>;
  copiedKey: string | null;
  onToggleReveal: (keyId: string) => void;
  onCopyKey: (key: string, keyId: string) => void;
}

function ProjectInstanceCard({ project, service, revealedKeys, copiedKey, onToggleReveal, onCopyKey }: ProjectInstanceCardProps) {
  const brandColor = service.brandColor;
  const keyId = `${service.id}-${project.id}`;
  const isRevealed = revealedKeys.has(keyId);
  const isCopied = copiedKey === keyId;
  // Display a masked placeholder representing a typical API key
  const maskedKey = `${service.id.slice(0, 4)}_${'*'.repeat(24)}`;

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: 'linear-gradient(145deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.25) 100%)',
        border: '1px solid rgba(255,255,255,0.5)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03), inset 0 1px 2px rgba(255,255,255,0.8)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold truncate" style={{ color: '#1a1a1a' }}>
          {project.name}
        </h4>
        <span
          className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide"
          style={{
            color: project.status === 'complete' ? '#22c55e' : project.status === 'building' ? brandColor : '#888',
            background: project.status === 'complete' ? 'rgba(34,197,94,0.08)' : project.status === 'building' ? `${brandColor}08` : 'rgba(0,0,0,0.03)',
          }}
        >
          {project.status}
        </span>
      </div>

      <p className="text-xs mb-3" style={{ color: '#888' }}>
        {formatInstanceModel(service.instanceModel)} instance
      </p>

      {/* API key row */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg"
        style={{
          background: 'rgba(0,0,0,0.03)',
          border: '1px solid rgba(0,0,0,0.04)',
        }}
      >
        <KeyIcon size={13} />
        <code
          className="flex-1 text-xs font-mono truncate select-all"
          style={{ color: '#555' }}
        >
          {isRevealed ? `${service.id}_sk_live_${project.id.slice(0, 8)}` : maskedKey}
        </code>
        <button
          onClick={() => onToggleReveal(keyId)}
          className="p-1 rounded hover:bg-black/5 transition-colors"
          title={isRevealed ? 'Hide' : 'Reveal'}
        >
          {isRevealed ? <EyeOffIcon size={13} /> : <EyeIcon size={13} />}
        </button>
        <button
          onClick={() => onCopyKey(`${service.id}_sk_live_${project.id.slice(0, 8)}`, keyId)}
          className="p-1 rounded hover:bg-black/5 transition-colors"
          title="Copy"
        >
          {isCopied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
        </button>
      </div>
    </div>
  );
}

// ─── Subscription Panel ─────────────────────────────────────────────────────

interface SubscriptionPanelProps {
  service: ServiceRegistryEntry;
  capabilities: ToolCapabilities;
}

function SubscriptionPanel({ service, capabilities }: SubscriptionPanelProps) {
  const brandColor = service.brandColor;
  const [selectedTier, setSelectedTier] = useState<string>(service.pricing[0]?.name || '');

  const visibleTiers = service.pricing.filter(t => t.price !== -1);

  return (
    <PanelCard
      title="Subscription"
      icon={<CreditCardIcon size={18} />}
      brandColor={brandColor}
      delay={0.15}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visibleTiers.map(tier => {
          const isActive = tier.name === selectedTier;
          return (
            <button
              key={tier.name}
              onClick={() => setSelectedTier(tier.name)}
              className="text-left rounded-xl p-4 transition-all duration-200"
              style={{
                background: isActive
                  ? `linear-gradient(135deg, ${brandColor}12 0%, ${brandColor}06 100%)`
                  : 'linear-gradient(145deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.25) 100%)',
                border: isActive
                  ? `2px solid ${brandColor}40`
                  : '1px solid rgba(255,255,255,0.5)',
                boxShadow: isActive
                  ? `0 4px 16px ${brandColor}12, inset 0 1px 2px rgba(255,255,255,0.5)`
                  : '0 2px 8px rgba(0,0,0,0.03), inset 0 1px 2px rgba(255,255,255,0.8)',
                transform: isActive ? 'scale(1.01)' : 'scale(1)',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>
                  {tier.name}
                </span>
                {isActive && (
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-semibold"
                    style={{
                      color: brandColor,
                      background: `${brandColor}12`,
                    }}
                  >
                    Current
                  </span>
                )}
              </div>
              <div className="text-lg font-bold mb-1" style={{ color: '#1a1a1a' }}>
                {tier.price === 0 ? 'Free' : `$${tier.price}`}
                {tier.price > 0 && (
                  <span className="text-xs font-normal" style={{ color: '#888' }}>/mo</span>
                )}
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#666' }}>
                {tier.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Change plan action */}
      {capabilities.hasSubscription ? (
        <div className="mt-4 flex items-center gap-3">
          <button
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
            style={{
              background: `linear-gradient(135deg, ${brandColor} 0%, ${brandColor}cc 100%)`,
              color: '#fff',
              boxShadow: `0 4px 0 ${brandColor}40, 0 8px 20px ${brandColor}20, inset 0 1px 0 rgba(255,255,255,0.15)`,
            }}
          >
            Change Plan via MCP
          </button>
          <span className="text-xs" style={{ color: '#999' }}>
            Plan changes are managed through {service.name}&apos;s MCP tools
          </span>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-3">
          <a
            href={`${service.websiteUrl}/billing`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
            style={{
              background: 'linear-gradient(145deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.4) 100%)',
              border: '1px solid rgba(255,255,255,0.5)',
              boxShadow: '0 4px 0 rgba(200,195,190,0.5), 0 8px 20px rgba(0,0,0,0.04), inset 0 1px 2px rgba(255,255,255,0.9)',
              color: '#1a1a1a',
            }}
          >
            Manage on {service.name}
            <ExternalLinkIcon size={14} />
          </a>
        </div>
      )}
    </PanelCard>
  );
}

// ─── API Keys Panel ─────────────────────────────────────────────────────────

interface ApiKeysPanelProps {
  service: ServiceRegistryEntry;
  revealedKeys: Set<string>;
  copiedKey: string | null;
  onToggleReveal: (keyId: string) => void;
  onCopyKey: (key: string, keyId: string) => void;
}

function ApiKeysPanel({ service, revealedKeys, copiedKey, onToggleReveal, onCopyKey }: ApiKeysPanelProps) {
  const brandColor = service.brandColor;

  // Display representative API key entries
  const keyEntries = [
    { id: `${service.id}-live`, label: 'Live Key', key: `${service.id}_sk_live_${'x'.repeat(24)}`, env: 'production' },
    { id: `${service.id}-test`, label: 'Test Key', key: `${service.id}_sk_test_${'x'.repeat(24)}`, env: 'development' },
  ];

  return (
    <PanelCard
      title="API Keys"
      icon={<KeyIcon size={18} />}
      brandColor={brandColor}
      delay={0.2}
    >
      <div className="flex flex-col gap-2">
        {keyEntries.map(entry => {
          const isRevealed = revealedKeys.has(entry.id);
          const isCopied = copiedKey === entry.id;

          return (
            <div
              key={entry.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.25) 100%)',
                border: '1px solid rgba(255,255,255,0.5)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03), inset 0 1px 2px rgba(255,255,255,0.8)',
              }}
            >
              <div className="flex-shrink-0">
                <KeyIcon size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold" style={{ color: '#1a1a1a' }}>{entry.label}</span>
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide"
                    style={{
                      color: entry.env === 'production' ? '#22c55e' : '#f59e0b',
                      background: entry.env === 'production' ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)',
                    }}
                  >
                    {entry.env}
                  </span>
                </div>
                <code className="text-xs font-mono block truncate" style={{ color: '#555' }}>
                  {isRevealed ? entry.key : `${entry.key.slice(0, 12)}${'*'.repeat(20)}`}
                </code>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => onToggleReveal(entry.id)}
                  className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
                  title={isRevealed ? 'Hide key' : 'Reveal key'}
                >
                  {isRevealed ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                </button>
                <button
                  onClick={() => onCopyKey(entry.key, entry.id)}
                  className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
                  title="Copy key"
                >
                  {isCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create new key button */}
      <div className="mt-3">
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{
            background: `linear-gradient(135deg, ${brandColor}10 0%, ${brandColor}05 100%)`,
            border: `1px solid ${brandColor}20`,
            color: brandColor,
            boxShadow: `0 2px 8px ${brandColor}08`,
          }}
        >
          <PlusIcon size={14} />
          Create New Key
        </button>
      </div>
    </PanelCard>
  );
}

// ─── Billing Panel ──────────────────────────────────────────────────────────

interface BillingPanelProps {
  service: ServiceRegistryEntry;
  capabilities: ToolCapabilities;
}

function BillingPanel({ service, capabilities }: BillingPanelProps) {
  const brandColor = service.brandColor;

  return (
    <PanelCard
      title="Billing"
      icon={<CreditCardIcon size={18} />}
      brandColor={brandColor}
      delay={0.25}
    >
      {capabilities.hasBilling ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: '#666' }}>
            Billing data is available through {service.name}&apos;s MCP tools.
            Usage and charges will be displayed here when data is fetched.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Current Period" value="Fetching..." detail="Via MCP" brandColor={brandColor} />
            <StatCard label="Charges" value="--" detail="Pending MCP query" brandColor={brandColor} />
            <StatCard label="Next Invoice" value="--" detail="Pending MCP query" brandColor={brandColor} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm leading-relaxed" style={{ color: '#666' }}>
            {service.name} does not expose billing data through MCP.
            Manage your billing directly on their platform.
          </p>
          <a
            href={`${service.websiteUrl}/billing`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
            style={{
              background: 'linear-gradient(145deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.4) 100%)',
              border: '1px solid rgba(255,255,255,0.5)',
              boxShadow: '0 4px 0 rgba(200,195,190,0.5), 0 8px 20px rgba(0,0,0,0.04), inset 0 1px 2px rgba(255,255,255,0.9)',
              color: '#1a1a1a',
            }}
          >
            <GlobeIcon size={15} />
            Open {service.name} Billing
            <ExternalLinkIcon size={14} />
          </a>
        </div>
      )}
    </PanelCard>
  );
}

// ─── MCP Tools Panel ────────────────────────────────────────────────────────

interface ToolsPanelProps {
  service: ServiceRegistryEntry;
  tools: McpToolDefinition[];
}

function ToolsPanel({ service, tools }: ToolsPanelProps) {
  const brandColor = service.brandColor;
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  return (
    <PanelCard
      title="Available MCP Tools"
      icon={<ShieldIcon size={18} />}
      brandColor={brandColor}
      delay={0.3}
    >
      <div className="flex flex-col gap-2">
        {tools.map(tool => {
          const isExpanded = expandedTool === tool.name;
          return (
            <button
              key={tool.name}
              onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
              className="text-left rounded-xl px-4 py-3 transition-all duration-200"
              style={{
                background: isExpanded
                  ? `linear-gradient(135deg, ${brandColor}08 0%, ${brandColor}04 100%)`
                  : 'linear-gradient(145deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.2) 100%)',
                border: isExpanded
                  ? `1px solid ${brandColor}20`
                  : '1px solid rgba(255,255,255,0.4)',
                boxShadow: isExpanded
                  ? `0 2px 12px ${brandColor}06`
                  : '0 1px 4px rgba(0,0,0,0.02)',
              }}
            >
              <div className="flex items-center justify-between">
                <code className="text-xs font-mono font-semibold" style={{ color: brandColor }}>
                  {tool.name}
                </code>
                <span
                  className="text-[10px] transition-transform duration-200"
                  style={{
                    color: '#999',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    display: 'inline-block',
                  }}
                >
                  &#9660;
                </span>
              </div>
              {tool.description && (
                <p className="text-xs mt-1 leading-relaxed" style={{ color: '#666' }}>
                  {tool.description}
                </p>
              )}
              <AnimatePresence>
                {isExpanded && tool.inputSchema?.properties && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                      <p className="text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: '#999' }}>
                        Parameters
                      </p>
                      <div className="flex flex-col gap-1">
                        {Object.entries(tool.inputSchema.properties).map(([name, schema]) => (
                          <div key={name} className="flex items-baseline gap-2">
                            <code className="text-[11px] font-mono" style={{ color: brandColor }}>{name}</code>
                            <span className="text-[10px]" style={{ color: '#888' }}>
                              {typeof schema === 'object' && schema !== null && 'type' in schema
                                ? String((schema as Record<string, unknown>).type)
                                : 'unknown'}
                            </span>
                            {tool.inputSchema.required?.includes(name) && (
                              <span className="text-[9px] font-semibold uppercase" style={{ color: '#ef4444' }}>required</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </div>
    </PanelCard>
  );
}

// ─── Shared Sub-Components ──────────────────────────────────────────────────

interface PanelCardProps {
  title: string;
  icon: React.ReactNode;
  brandColor: string;
  children: React.ReactNode;
  delay?: number;
}

function PanelCard({ title, icon, brandColor, children, delay = 0 }: PanelCardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="rounded-2xl p-5"
      style={{
        background: 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.35) 100%)',
        backdropFilter: 'blur(20px) saturate(150%)',
        WebkitBackdropFilter: 'blur(20px) saturate(150%)',
        border: '1px solid rgba(255,255,255,0.5)',
        boxShadow: '0 4px 0 rgba(200,195,190,0.3), 0 8px 24px rgba(0,0,0,0.05), inset 0 1px 2px rgba(255,255,255,0.9)',
      }}
    >
      <div className="flex items-center gap-2.5 mb-4">
        <div
          className="p-1.5 rounded-lg"
          style={{
            background: `${brandColor}10`,
            color: brandColor,
          }}
        >
          {icon}
        </div>
        <h2 className="text-base font-semibold" style={{ color: '#1a1a1a' }}>{title}</h2>
      </div>
      {children}
    </motion.section>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  detail: string;
  brandColor: string;
}

function StatCard({ label, value, detail, brandColor }: StatCardProps) {
  return (
    <div
      className="rounded-xl p-3.5"
      style={{
        background: 'linear-gradient(145deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.25) 100%)',
        border: '1px solid rgba(255,255,255,0.5)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03), inset 0 1px 2px rgba(255,255,255,0.8)',
      }}
    >
      <p className="text-[11px] uppercase tracking-wide font-semibold mb-1" style={{ color: '#999' }}>
        {label}
      </p>
      <p className="text-base font-bold" style={{ color: '#1a1a1a' }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color: '#888' }}>{detail}</p>
    </div>
  );
}

interface ActionButtonProps {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
  variant?: 'default' | 'danger';
}

function ActionButton({ label, onClick, icon, disabled = false, variant = 'default' }: ActionButtonProps) {
  const isDanger = variant === 'danger';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 hover:scale-[1.02]"
      style={{
        background: isDanger
          ? 'linear-gradient(145deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.04) 100%)'
          : 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.35) 100%)',
        border: isDanger
          ? '1px solid rgba(239,68,68,0.15)'
          : '1px solid rgba(255,255,255,0.5)',
        boxShadow: isDanger
          ? '0 2px 8px rgba(239,68,68,0.06), inset 0 1px 2px rgba(255,255,255,0.5)'
          : '0 2px 8px rgba(0,0,0,0.03), inset 0 1px 2px rgba(255,255,255,0.8)',
        color: isDanger ? '#ef4444' : '#555',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getStatusConfig(state: ConnectFlowState) {
  const configs: Record<ConnectFlowState, { dotColor: string; textColor: string; label: string }> = {
    connected: { dotColor: '#22c55e', textColor: '#16a34a', label: 'Connected' },
    connecting: { dotColor: '#f59e0b', textColor: '#d97706', label: 'Connecting' },
    error: { dotColor: '#ef4444', textColor: '#dc2626', label: 'Error' },
    needs_reauth: { dotColor: '#eab308', textColor: '#ca8a04', label: 'Needs Reconnection' },
    needs_upgrade: { dotColor: '#f97316', textColor: '#ea580c', label: 'Upgrade Needed' },
    disconnected: { dotColor: '#6b7280', textColor: '#4b5563', label: 'Disconnected' },
  };
  return configs[state] || configs.disconnected;
}

function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatInstanceModel(model: string): string {
  const labels: Record<string, string> = {
    'project-per-project': 'Per-Project',
    'api-key-per-project': 'Shared (API Key)',
    'shared': 'Shared',
  };
  return labels[model] || model;
}

function getInstanceModelDescription(model: string): string {
  const descs: Record<string, string> = {
    'project-per-project': 'Separate instance per KripTik project',
    'api-key-per-project': 'Same account, separate API keys per project',
    'shared': 'Single instance across all projects',
  };
  return descs[model] || '';
}

function formatCategory(category: string): string {
  const labels: Record<string, string> = {
    'database': 'Database',
    'hosting': 'Hosting',
    'auth': 'Authentication',
    'payments': 'Payments',
    'email': 'Email',
    'monitoring': 'Monitoring',
    'ai-ml': 'AI / ML',
    'design': 'Design',
    'communication': 'Communication',
    'storage': 'Storage',
    'analytics': 'Analytics',
    'devtools': 'Developer Tools',
    'other': 'Other',
  };
  return labels[category] || category;
}
