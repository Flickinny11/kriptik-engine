/**
 * ConnectionStatusIndicator
 *
 * Shows the connection state for a dependency service with a branded logo
 * and animated status dot. States: connected (green), connecting (amber pulse),
 * error (red), needs_reauth (yellow), disconnected (gray).
 */

import { BrandIcon } from '@/components/ui/BrandIcon';
import type { ConnectFlowState } from '@/hooks/useDependencyConnect';

interface ConnectionStatusIndicatorProps {
  /** Service icon slug for BrandIcon */
  iconSlug: string;
  /** Service brand color for accent */
  brandColor: string;
  /** Service display name */
  serviceName: string;
  /** Current connection state */
  state: ConnectFlowState;
  /** Icon size */
  size?: number;
}

const STATE_CONFIG: Record<ConnectFlowState, { dotColor: string; label: string; animate: boolean }> = {
  connected: { dotColor: '#22c55e', label: 'Connected', animate: false },
  connecting: { dotColor: '#f59e0b', label: 'Connecting...', animate: true },
  error: { dotColor: '#ef4444', label: 'Error', animate: false },
  needs_reauth: { dotColor: '#eab308', label: 'Needs reconnection', animate: false },
  needs_upgrade: { dotColor: '#f97316', label: 'Upgrade needed', animate: false },
  disconnected: { dotColor: '#6b7280', label: 'Not connected', animate: false },
};

export function ConnectionStatusIndicator({
  iconSlug,
  brandColor,
  serviceName,
  state,
  size = 32,
}: ConnectionStatusIndicatorProps) {
  const config = STATE_CONFIG[state];

  return (
    <div className="flex items-center gap-3">
      {/* Branded logo with glow for connected state */}
      <div
        className="relative rounded-lg p-1.5 transition-all duration-300"
        style={{
          background: state === 'connected'
            ? `${brandColor}10`
            : 'rgba(255,255,255,0.03)',
          boxShadow: state === 'connected'
            ? `0 0 12px ${brandColor}20, 0 2px 8px rgba(0,0,0,0.2)`
            : '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        <BrandIcon
          iconId={iconSlug}
          size={size}
          color={state === 'connected' ? brandColor : undefined}
          animation={state === 'connecting' ? 'pulse' : 'none'}
          ariaLabel={serviceName}
        />
        {/* Status dot overlay */}
        <div
          className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-kriptik-charcoal"
          style={{
            width: 10,
            height: 10,
            backgroundColor: config.dotColor,
            animation: config.animate ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
          }}
        />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium text-kriptik-white">{serviceName}</span>
        <span
          className="text-xs transition-colors"
          style={{ color: config.dotColor }}
        >
          {config.label}
        </span>
      </div>
    </div>
  );
}
