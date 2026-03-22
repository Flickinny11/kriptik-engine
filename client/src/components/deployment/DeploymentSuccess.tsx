import { useDeploymentStore } from '../../store/useDeploymentStore';
import { useToast } from '../ui/use-toast';
import { DeployInterlockIcon3D } from '../ui/InterlockingIcons3D';

export default function DeploymentSuccess() {
  const { currentUrl, reset } = useDeploymentStore();
  const { toast } = useToast();

  const copyUrl = async () => {
    if (!currentUrl) return;
    try {
      await navigator.clipboard.writeText(currentUrl);
      toast({ title: 'Copied', description: 'URL copied to clipboard.' });
    } catch {
      toast({ title: 'Copy failed', description: 'Your browser blocked clipboard access.' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="deploy-section">
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 16,
              background: 'linear-gradient(145deg, rgba(34,197,94,0.25), rgba(245,168,108,0.12))',
              border: '1px solid rgba(255,255,255,0.10)',
              boxShadow: '0 18px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.10)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <DeployInterlockIcon3D size={20} tone="crimson" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: '"Clash Display", "Cabinet Grotesk", system-ui, sans-serif',
                fontSize: 16,
                fontWeight: 720,
                color: 'rgba(255,255,255,0.92)',
                letterSpacing: '-0.02em',
              }}
            >
              Deployment Complete
            </div>
            <div className="deploy-muted">Your app is live and ready to share.</div>
          </div>
        </div>
      </div>

      <div className="deploy-section">
        <div className="deploy-section__label">Live URL</div>
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <code
            style={{
              flex: 1,
              minWidth: 220,
              padding: '10px 12px',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(0,0,0,0.35)',
              color: 'rgba(245,245,245,0.92)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={currentUrl || ''}
          >
            {currentUrl || '—'}
          </code>

          <button type="button" className="deploy-btn" onClick={copyUrl} disabled={!currentUrl}>
            Copy
          </button>

          <a
            className="deploy-btn deploy-btn--primary"
            href={currentUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!currentUrl}
            style={{ pointerEvents: currentUrl ? 'auto' : 'none', textDecoration: 'none' }}
          >
            Open
          </a>
        </div>

        <div className="deploy-btnrow">
          <div className="deploy-muted">Build time: ~2m</div>
          <button type="button" className="deploy-btn" onClick={reset}>
            Redeploy
          </button>
        </div>
      </div>
    </div>
  );
}

