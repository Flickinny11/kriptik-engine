/**
 * ConnectButton
 *
 * The primary connect experience for dependency services. Handles both
 * MCP OAuth (one-click popup) and browser agent fallback flows.
 *
 * States:
 * - disconnected: Shows "Connect" with service brand color
 * - connecting: Shows spinner with "Connecting..."
 * - connected: Shows green check with "Connected"
 * - error: Shows red state with "Retry"
 * - needs_reauth: Shows yellow state with "Reconnect"
 * - needs_upgrade: Shows orange state with "Upgrade"
 *
 * After connection, can optionally show the TierSelector.
 */

import { useState, useCallback, useEffect } from 'react';
import { BrandIcon } from '@/components/ui/BrandIcon';
import { CheckIcon, RefreshIcon, ZapIcon, LinkIcon } from '@/components/ui/icons';
import { FallbackApprovalDialog } from './FallbackApprovalDialog';
import { TierSelector } from './TierSelector';
import type { ConnectFlowState, BrowserAgentState } from '@/hooks/useDependencyConnect';
import type { ServiceRegistryEntry, PricingTier, BrowserAgentProgressMessage } from '@/lib/api-client';

interface ConnectButtonProps {
  /** Service to connect to */
  service: ServiceRegistryEntry;
  /** Current connection state */
  state: ConnectFlowState;
  /** Called to initiate MCP OAuth flow */
  onConnect: (service: ServiceRegistryEntry) => Promise<void>;
  /** Called for non-MCP fallback approval */
  onFallbackApprove?: (service: ServiceRegistryEntry) => void;
  /** Called when user selects a tier */
  onTierSelect?: (service: ServiceRegistryEntry, tier: PricingTier) => void;
  /** Called to disconnect */
  onDisconnect?: (serviceId: string) => Promise<void>;
  /** User's email for fallback dialog */
  userEmail?: string;
  /** User's display name for fallback */
  userName?: string;
  /** Whether to show tier selector after connection */
  showTierSelector?: boolean;
  /** Agent's recommended tier */
  recommendedTier?: string;
  /** Whether this is rendered in compact mode (e.g., inside a planning tile) */
  compact?: boolean;
  /** Whether to show the service logo */
  showLogo?: boolean;
  /** Browser agent state (for progress/verification) */
  browserAgentState?: BrowserAgentState | null;
  /** Called to submit verification code */
  onSubmitVerificationCode?: (code: string, type: 'email' | 'sms') => void;
  /** Called to cancel browser agent */
  onCancelFallback?: () => void;
  /** Called to retry browser agent */
  onRetryFallback?: () => void;
}

export function ConnectButton({
  service,
  state,
  onConnect,
  onFallbackApprove,
  onTierSelect,
  onDisconnect,
  userEmail = '',
  userName = '',
  showTierSelector = false,
  recommendedTier,
  compact = false,
  showLogo = true,
  browserAgentState,
  onSubmitVerificationCode,
  onCancelFallback,
  onRetryFallback,
}: ConnectButtonProps) {
  const [showFallbackDialog, setShowFallbackDialog] = useState(false);
  const [showTiers, setShowTiers] = useState(false);
  const [justConnected, setJustConnected] = useState(false);

  const handleClick = useCallback(async () => {
    if (state === 'connected') {
      return;
    }

    if (state === 'connecting') {
      return;
    }

    if (service.mcp && service.mcp.authMethod === 'oauth') {
      await onConnect(service);
    } else if (service.browserFallbackAvailable) {
      setShowFallbackDialog(true);
    }
  }, [service, state, onConnect]);

  const handleFallbackApprove = useCallback(() => {
    onFallbackApprove?.(service);
  }, [service, onFallbackApprove]);

  const handleFallbackCancel = useCallback(() => {
    setShowFallbackDialog(false);
    onCancelFallback?.();
  }, [onCancelFallback]);

  // Show tier selector when transitioning to connected
  useEffect(() => {
    if (state === 'connected' && !justConnected && showTierSelector && service.pricing.length > 0) {
      setJustConnected(true);
      setShowTiers(true);
    }
  }, [state, justConnected, showTierSelector, service.pricing.length]);

  // Render compact version for planning tiles
  if (compact) {
    return (
      <>
        <button
          onClick={handleClick}
          disabled={state === 'connecting'}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200"
          style={getCompactStyle(state, service.brandColor)}
        >
          {showLogo && (
            <BrandIcon
              iconId={service.iconSlug}
              size={14}
              color={state === 'connected' ? '#22c55e' : service.brandColor}
              ariaLabel={service.name}
            />
          )}
          {!showLogo && getIcon(state)}
          {getLabel(state, service.name)}
        </button>
        {showFallbackDialog && (
          <FallbackApprovalDialog
            service={service}
            userEmail={userEmail}
            onApprove={handleFallbackApprove}
            onCancel={handleFallbackCancel}
            isRunning={state === 'connecting'}
            progressMessages={browserAgentState?.progressMessages}
            waitingFor={browserAgentState?.waitingFor}
            onSubmitCode={onSubmitVerificationCode}
            isComplete={browserAgentState?.status === 'completed'}
            error={browserAgentState?.error}
            onRetry={onRetryFallback}
          />
        )}
      </>
    );
  }

  // Full version for catalog and dependency management
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleClick}
        disabled={state === 'connecting'}
        className="group relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-300 overflow-hidden"
        style={getFullStyle(state, service.brandColor)}
        aria-label={`${getAriaLabel(state)} ${service.name}`}
      >
        {/* Subtle gradient overlay on hover */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: state === 'disconnected'
              ? `linear-gradient(135deg, ${service.brandColor}15, transparent)`
              : 'none',
          }}
        />

        <div className="relative flex items-center gap-2.5">
          {showLogo && (
            <BrandIcon
              iconId={service.iconSlug}
              size={18}
              color={getIconColor(state, service.brandColor)}
              animation={state === 'connecting' ? 'pulse' : 'none'}
              ariaLabel={service.name}
            />
          )}
          {!showLogo && getIcon(state)}
          <span>{getLabel(state, service.name)}</span>
        </div>

        {/* Loading spinner for connecting state */}
        {state === 'connecting' && (
          <div
            className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin ml-auto"
            style={{ borderColor: `${service.brandColor} transparent ${service.brandColor} ${service.brandColor}` }}
          />
        )}
      </button>

      {/* Tier selector shown after connection */}
      {showTiers && state === 'connected' && (
        <TierSelector
          service={service}
          recommendedTier={recommendedTier}
          onSelect={(tier) => {
            setShowTiers(false);
            onTierSelect?.(service, tier);
          }}
          onDismiss={() => setShowTiers(false)}
        />
      )}

      {/* Connected actions */}
      {state === 'connected' && !showTiers && onDisconnect && (
        <button
          onClick={() => onDisconnect(service.id)}
          className="text-xs text-kriptik-silver hover:text-red-400 transition-colors self-end"
        >
          Disconnect
        </button>
      )}

      {/* Fallback dialog */}
      {showFallbackDialog && (
        <FallbackApprovalDialog
          service={service}
          userEmail={userEmail}
          onApprove={handleFallbackApprove}
          onCancel={handleFallbackCancel}
          isRunning={state === 'connecting'}
          progressMessages={browserAgentState?.progressMessages}
          waitingFor={browserAgentState?.waitingFor}
          onSubmitCode={onSubmitVerificationCode}
          isComplete={browserAgentState?.status === 'completed'}
          error={browserAgentState?.error}
          onRetry={onRetryFallback}
        />
      )}
    </div>
  );
}

function getIcon(state: ConnectFlowState) {
  switch (state) {
    case 'connected':
      return <CheckIcon size={14} />;
    case 'error':
    case 'needs_reauth':
      return <RefreshIcon size={14} />;
    case 'needs_upgrade':
      return <ZapIcon size={14} />;
    default:
      return <LinkIcon size={14} />;
  }
}

function getLabel(state: ConnectFlowState, serviceName: string): string {
  switch (state) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting...';
    case 'error':
      return 'Retry';
    case 'needs_reauth':
      return 'Reconnect';
    case 'needs_upgrade':
      return 'Upgrade';
    default:
      return 'Connect';
  }
}

function getAriaLabel(state: ConnectFlowState): string {
  switch (state) {
    case 'connected':
      return 'Connected to';
    case 'connecting':
      return 'Connecting to';
    case 'error':
      return 'Retry connection to';
    case 'needs_reauth':
      return 'Reconnect to';
    default:
      return 'Connect to';
  }
}

function getIconColor(state: ConnectFlowState, brandColor: string): string {
  switch (state) {
    case 'connected':
      return '#22c55e';
    case 'error':
      return '#ef4444';
    case 'needs_reauth':
      return '#eab308';
    case 'needs_upgrade':
      return '#f97316';
    default:
      return brandColor;
  }
}

function getCompactStyle(state: ConnectFlowState, brandColor: string): React.CSSProperties {
  switch (state) {
    case 'connected':
      return {
        color: '#22c55e',
        background: 'rgba(34, 197, 94, 0.1)',
      };
    case 'connecting':
      return {
        color: brandColor,
        background: `${brandColor}10`,
        opacity: 0.8,
      };
    case 'error':
      return {
        color: '#ef4444',
        background: 'rgba(239, 68, 68, 0.1)',
      };
    case 'needs_reauth':
      return {
        color: '#eab308',
        background: 'rgba(234, 179, 8, 0.1)',
      };
    default:
      return {
        color: brandColor,
        background: `${brandColor}10`,
      };
  }
}

function getFullStyle(state: ConnectFlowState, brandColor: string): React.CSSProperties {
  switch (state) {
    case 'connected':
      return {
        color: '#22c55e',
        background: 'rgba(34, 197, 94, 0.08)',
        border: '1px solid rgba(34, 197, 94, 0.2)',
        boxShadow: '0 2px 8px rgba(34, 197, 94, 0.1), inset 0 1px 0 rgba(34, 197, 94, 0.1)',
      };
    case 'connecting':
      return {
        color: brandColor,
        background: `${brandColor}08`,
        border: `1px solid ${brandColor}30`,
        boxShadow: `0 2px 8px ${brandColor}10`,
        cursor: 'wait',
      };
    case 'error':
      return {
        color: '#ef4444',
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
      };
    case 'needs_reauth':
      return {
        color: '#eab308',
        background: 'rgba(234, 179, 8, 0.08)',
        border: '1px solid rgba(234, 179, 8, 0.2)',
      };
    case 'needs_upgrade':
      return {
        color: '#f97316',
        background: 'rgba(249, 115, 22, 0.08)',
        border: '1px solid rgba(249, 115, 22, 0.2)',
      };
    default:
      return {
        color: brandColor,
        background: `${brandColor}05`,
        border: `1px solid ${brandColor}25`,
        boxShadow: `0 2px 8px ${brandColor}08, inset 0 1px 0 rgba(255,255,255,0.05)`,
      };
  }
}
