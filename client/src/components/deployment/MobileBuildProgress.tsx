/**
 * Mobile Build Progress
 *
 * - No emoji glyphs
 * - No purple
 * - Styled to match deploy popout glass
 */

import type { MobileBuildStatus } from '../../hooks/useMobileDeploy';
import { DeployInterlockIcon3D } from '../ui/InterlockingIcons3D';
import './deploy-popout.css';

interface MobileBuildProgressProps {
  buildId: string | null;
  status: MobileBuildStatus;
  progress: number;
  phase: string;
  error: string | null;
  artifactUrl: string | null;
  qrCodeUrl: string | null;
  onCancel?: () => void;
  onReset?: () => void;
}

const STATUS_LABELS: Record<MobileBuildStatus, string> = {
  idle: 'Ready',
  queued: 'Queued',
  building: 'Building',
  signing: 'Signing',
  uploading: 'Uploading',
  success: 'Complete',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<MobileBuildStatus, string> = {
  idle: '#94a3b8',
  queued: '#f59e0b',
  building: '#06b6d4',
  signing: '#f97316',
  uploading: '#3b82f6',
  success: '#22c55e',
  failed: '#ef4444',
  cancelled: '#94a3b8',
};

export function MobileBuildProgress({
  buildId,
  status,
  progress,
  phase,
  error,
  artifactUrl,
  qrCodeUrl,
  onCancel,
  onReset,
}: MobileBuildProgressProps) {
  const isTerminal = status === 'success' || status === 'failed' || status === 'cancelled';
  const isActive = status === 'queued' || status === 'building' || status === 'signing' || status === 'uploading';
  const color = STATUS_COLORS[status] || '#94a3b8';

  return (
    <div className="space-y-3">
      <div className="deploy-section">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              className={isActive ? 'animate-pulse' : undefined}
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: color,
                boxShadow: isActive ? `0 0 18px ${color}55` : 'none',
              }}
            />
            <div
              style={{
                fontFamily: '"Cabinet Grotesk", "Satoshi", system-ui, sans-serif',
                fontSize: 12,
                fontWeight: 750,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.8)',
              }}
            >
              {STATUS_LABELS[status] || status}
            </div>
          </div>
          {buildId && (
            <div className="deploy-pill" title={buildId}>
              {buildId.slice(0, 8)}
            </div>
          )}
        </div>

        {isActive && (
          <div style={{ marginTop: 10 }}>
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.10)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.max(progress, 6)}%`,
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                  transition: 'width 420ms ease',
                }}
              />
            </div>
            <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
              <div className="deploy-muted">{phase || 'Initializing...'}</div>
              <div className="deploy-muted">{Math.round(progress)}%</div>
            </div>
          </div>
        )}
      </div>

      {isActive && phase && (
        <div className="deploy-section" style={{ borderColor: 'rgba(245,168,108,0.14)' }}>
          <div className="flex items-center gap-3">
            <DeployInterlockIcon3D size={18} tone="crimson" />
            <div>
              <div className="deploy-section__label">Current Phase</div>
              <div className="deploy-muted" style={{ marginTop: 6, color: 'rgba(255,255,255,0.75)' }}>
                {phase}
              </div>
            </div>
          </div>
        </div>
      )}

      {status === 'failed' && error && (
        <div className="deploy-section" style={{ borderColor: 'rgba(239,68,68,0.22)' }}>
          <div className="deploy-section__label">Error</div>
          <div style={{ marginTop: 10, color: 'rgba(255,180,180,0.92)', fontSize: 12, lineHeight: 1.5 }}>
            {error}
          </div>
        </div>
      )}

      {status === 'success' && (
        <div className="space-y-3">
          <div className="deploy-section" style={{ borderColor: 'rgba(34,197,94,0.18)' }}>
            <div className="flex items-center gap-3">
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 14,
                  background: 'linear-gradient(145deg, rgba(34,197,94,0.22), rgba(255,255,255,0.02))',
                  border: '1px solid rgba(34,197,94,0.22)',
                  boxShadow: '0 18px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.10)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <DeployInterlockIcon3D size={18} tone="crimson" />
              </div>
              <div>
                <div className="deploy-provider-card__name">Build Successful</div>
                <div className="deploy-muted">Your app binary is ready for installation.</div>
              </div>
            </div>
          </div>

          {qrCodeUrl && (
            <div className="deploy-section">
              <div className="deploy-section__label">Install QR</div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <img
                  src={qrCodeUrl}
                  alt="Install QR Code"
                  style={{
                    width: 164,
                    height: 164,
                    borderRadius: 14,
                    background: '#fff',
                    padding: 10,
                    boxShadow: '0 18px 32px rgba(0,0,0,0.35)',
                  }}
                />
                <div className="deploy-muted" style={{ textAlign: 'center' }}>
                  Scan to install on a device.
                </div>
              </div>
            </div>
          )}

          {artifactUrl && (
            <a
              className="deploy-btn deploy-btn--primary"
              href={artifactUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none' }}
            >
              Download IPA
            </a>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        {isActive && onCancel && (
          <button
            type="button"
            className="deploy-btn deploy-btn--danger"
            onClick={onCancel}
            style={{
              borderColor: 'rgba(239,68,68,0.25)',
              color: 'rgba(255,200,200,0.92)',
            }}
          >
            Cancel
          </button>
        )}
        {isTerminal && onReset && (
          <button type="button" className="deploy-btn" onClick={onReset}>
            {status === 'failed' ? 'Try Again' : 'New Build'}
          </button>
        )}
      </div>
    </div>
  );
}

