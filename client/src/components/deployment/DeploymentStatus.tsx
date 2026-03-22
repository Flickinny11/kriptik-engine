import { useEffect, useMemo, useRef } from 'react';
import { useDeploymentStore } from '../../store/useDeploymentStore';

function typeDot(type: 'info' | 'success' | 'error') {
  switch (type) {
    case 'success':
      return { bg: 'rgba(34,197,94,0.95)', glow: 'rgba(34,197,94,0.25)' };
    case 'error':
      return { bg: 'rgba(239,68,68,0.95)', glow: 'rgba(239,68,68,0.25)' };
    default:
      return { bg: 'rgba(245,168,108,0.95)', glow: 'rgba(245,168,108,0.25)' };
  }
}

export default function DeploymentStatus() {
  const { logs, status, config } = useDeploymentStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const progress = useMemo(() => {
    if (status === 'success') return 100;
    if (status === 'error') return 100;
    return Math.min((logs.length / 6) * 100, 95);
  }, [logs.length, status]);

  const statusLabel =
    status === 'deploying' ? 'Deploying' :
    status === 'error' ? 'Failed' :
    status === 'success' ? 'Live' :
    'Preparing';

  return (
    <div className="space-y-3">
      <div className="deploy-section">
        <div className="flex items-center justify-between">
          <div className="deploy-section__label">Deployment Progress</div>
          <span className="deploy-pill">{Math.round(progress)}%</span>
        </div>

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
                background: 'linear-gradient(90deg, rgba(245,168,108,0.95), rgba(245,158,11,0.85), rgba(34,197,94,0.85))',
                transition: 'width 360ms ease',
              }}
            />
          </div>

          <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
            <div className="deploy-muted">
              Target: <span style={{ color: 'rgba(255,255,255,0.9)' }}>{config.provider.replace('-', ' ')}</span>
            </div>
            <div className="deploy-muted">
              Status: <span style={{ color: 'rgba(255,255,255,0.9)' }}>{statusLabel}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="deploy-terminal">
        <div className="deploy-terminal__head">
          <div className="deploy-terminal__title">Build Log</div>
          <span className="deploy-pill">{statusLabel}</span>
        </div>
        <div className="deploy-terminal__body">
          {logs.map((log) => {
            const dot = typeDot(log.type);
            return (
              <div key={log.id} className="deploy-logrow">
                <div className="deploy-logrow__time">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </div>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: dot.bg,
                    boxShadow: `0 0 0 1px rgba(255,255,255,0.06), 0 0 18px ${dot.glow}`,
                    marginTop: 3,
                  }}
                />
                <div className={['deploy-logrow__msg', log.type === 'error' ? 'deploy-logrow__msg--error' : ''].join(' ')}>
                  {log.message}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="deploy-muted" style={{ textAlign: 'center' }}>
        Estimated time remaining: ~30s
      </div>
    </div>
  );
}

