import { useMemo, useState, useEffect, useCallback } from 'react';
import { useDeploymentStore, type DeploymentProvider, type DeploymentTarget } from '../../store/useDeploymentStore';
import {
  SiGooglecloud,
  SiGooglecloudHex,
  SiVercel,
  SiVercelHex,
  SiNetlify,
  SiNetlifyHex,
} from '../ui/icons/BrandIcons';
import { DeployInterlockIcon3D } from '../ui/InterlockingIcons3D';
import { API_URL } from '../../lib/api-config';

function BrandMark({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 12,
        background: 'linear-gradient(145deg, rgba(255,255,255,0.92), rgba(248,250,252,0.82))',
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow:
          '0 10px 18px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.8), 0 0 0 1px rgba(255,255,255,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

// Platforms that require user API tokens
const PLATFORMS_NEEDING_TOKEN: DeploymentProvider[] = ['vercel', 'netlify'];

export default function DeploymentConfig() {
  const { config, setConfig, startDeployment } = useDeploymentStore();

  // API key management state
  const [apiToken, setApiToken] = useState('');
  const [savedCredentials, setSavedCredentials] = useState<Record<string, { saved: boolean; masked: string }>>({});
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationSuccess, setValidationSuccess] = useState(false);

  const providers = useMemo(() => {
    return [
      {
        id: 'cloud-run' as const,
        name: 'Cloud Run',
        meta: 'Recommended',
        icon: (
          <BrandMark>
            <SiGooglecloud size={18} color={SiGooglecloudHex} title="Google Cloud" />
          </BrandMark>
        ),
      },
      {
        id: 'vercel' as const,
        name: 'Vercel',
        meta: 'Static',
        icon: (
          <BrandMark>
            <SiVercel size={18} color={SiVercelHex} title="Vercel" />
          </BrandMark>
        ),
      },
      {
        id: 'netlify' as const,
        name: 'Netlify',
        meta: 'Jamstack',
        icon: (
          <BrandMark>
            <SiNetlify size={18} color={SiNetlifyHex} title="Netlify" />
          </BrandMark>
        ),
      },
    ];
  }, []);

  // Fetch saved credentials on mount
  useEffect(() => {
    fetch(`${API_URL}/api/settings/deploy-credentials`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.credentials) setSavedCredentials(data.credentials);
      })
      .catch(() => { /* endpoint may not exist yet */ });
  }, []);

  const handleProviderSelect = (provider: DeploymentProvider) => {
    setConfig({ provider });
    setApiToken('');
    setValidationError(null);
    setValidationSuccess(false);
  };

  const needsToken = PLATFORMS_NEEDING_TOKEN.includes(config.provider);
  const hasSavedToken = savedCredentials[config.provider]?.saved;

  // Validate and save API token
  const handleValidateAndSave = useCallback(async () => {
    if (!apiToken.trim()) return;
    setValidating(true);
    setValidationError(null);
    setValidationSuccess(false);

    try {
      // Validate via backend (which proxies to Vercel/Netlify APIs)
      const response = await fetch(`${API_URL}/api/settings/deploy-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          platform: config.provider,
          token: apiToken,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Validation failed');
      }

      setSavedCredentials(prev => ({
        ...prev,
        [config.provider]: { saved: true, masked: data.masked || `...${apiToken.slice(-4)}` },
      }));
      setApiToken('');
      setValidationSuccess(true);
      setTimeout(() => setValidationSuccess(false), 3000);
    } catch (error: any) {
      setValidationError(error.message || 'Failed to validate token');
    } finally {
      setValidating(false);
    }
  }, [apiToken, config.provider]);

  // Check if deploy is allowed
  const canDeploy = !needsToken || hasSavedToken;

  return (
    <div className="space-y-3">
      {/* Provider */}
      <div className="deploy-section">
        <div className="flex items-center justify-between">
          <div className="deploy-section__label">Deployment Target</div>
          <span className="deploy-pill">{config.provider.replace('-', ' ')}</span>
        </div>

        <div className="deploy-provider-grid">
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleProviderSelect(p.id)}
              className={[
                'deploy-provider-card',
                config.provider === p.id ? 'deploy-provider-card--active' : '',
              ].join(' ')}
            >
              <div className="deploy-provider-card__top">
                <div className="flex items-center gap-3">
                  {p.icon}
                  <div style={{ minWidth: 0 }}>
                    <div className="deploy-provider-card__name">{p.name}</div>
                    <div className="deploy-provider-card__meta">{p.meta}</div>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Project */}
      <div className="deploy-section">
        <div className="deploy-section__label">Project</div>
        <div className="deploy-fieldgrid" style={{ marginTop: 10 }}>
          <div className="deploy-field">
            <label className="deploy-label">Project Name</label>
            <input
              className="deploy-input"
              value={config.projectName}
              onChange={(e) => setConfig({ projectName: e.target.value })}
              placeholder="my-awesome-app"
            />
          </div>
          <div className="deploy-field">
            <label className="deploy-label">Region</label>
            <input
              className="deploy-input"
              value={config.region}
              onChange={(e) => setConfig({ region: e.target.value })}
              placeholder="us-central1"
            />
          </div>
        </div>
      </div>

      {/* Environment Target (Vercel/Netlify) */}
      {config.provider !== 'cloud-run' && (
        <div className="deploy-section">
          <div className="deploy-section__label">Deploy Target</div>
          <div className="deploy-fieldgrid" style={{ marginTop: 10, gridTemplateColumns: '1fr 1fr' }}>
            {(['production', 'preview'] as DeploymentTarget[]).map((target) => (
              <button
                key={target}
                type="button"
                className={`deploy-btn ${config.target === target ? 'deploy-btn--primary' : ''}`}
                onClick={() => setConfig({ target })}
                style={{ textTransform: 'capitalize', width: '100%' }}
              >
                {target}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom Domain */}
      <div className="deploy-section">
        <div className="deploy-section__label">Custom Domain (optional)</div>
        <div style={{ marginTop: 10 }}>
          <input
            className="deploy-input"
            value={config.customDomain}
            onChange={(e) => setConfig({ customDomain: e.target.value })}
            placeholder="app.yourdomain.com"
          />
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
            Point your domain's CNAME to the deployment URL after deploying
          </div>
        </div>
      </div>

      {/* API Key — only for Vercel / Netlify */}
      {needsToken && (
        <div className="deploy-section">
          <div className="deploy-section__label">
            {config.provider === 'vercel' ? 'Vercel' : 'Netlify'} API Token
          </div>

          {hasSavedToken ? (
            <div style={{ marginTop: 10 }}>
              <div className="deploy-kvrow" style={{ alignItems: 'center' }}>
                <div className="deploy-input" style={{ flex: 1, opacity: 0.7, cursor: 'default' }}>
                  {savedCredentials[config.provider]?.masked}
                </div>
                <button
                  type="button"
                  className="deploy-btn"
                  onClick={() => setSavedCredentials(prev => {
                    const next = { ...prev };
                    delete next[config.provider];
                    return next;
                  })}
                  style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                >
                  Update
                </button>
              </div>
              {validationSuccess && (
                <div style={{ color: '#10b981', fontSize: 11, marginTop: 6 }}>
                  Token saved and validated
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <input
                className="deploy-input"
                type="password"
                value={apiToken}
                onChange={(e) => { setApiToken(e.target.value); setValidationError(null); }}
                placeholder={config.provider === 'vercel' ? 'Vercel personal access token' : 'Netlify personal access token'}
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                {config.provider === 'vercel'
                  ? 'Generate at vercel.com/account/tokens'
                  : 'Generate at app.netlify.com/user/applications#personal-access-tokens'}
              </div>
              {validationError && (
                <div style={{ color: '#ef4444', fontSize: 11, marginTop: 6 }}>
                  {validationError}
                </div>
              )}
              <button
                type="button"
                className="deploy-btn"
                onClick={handleValidateAndSave}
                disabled={!apiToken.trim() || validating}
                style={{ marginTop: 8, width: '100%', opacity: (!apiToken.trim() || validating) ? 0.5 : 1 }}
              >
                {validating ? 'Validating...' : 'Validate & Save'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Deploy button */}
      <div className="deploy-section">
        <div className="deploy-btnrow">
          <div className="deploy-muted">
            {!canDeploy
              ? 'Add your API token above to enable deployment'
              : config.provider === 'cloud-run'
                ? 'Deployed via KripTik managed infrastructure'
                : `Deploying to ${config.provider}`}
          </div>
          <button
            type="button"
            className="deploy-btn deploy-btn--primary"
            onClick={startDeployment}
            disabled={!canDeploy}
            style={{ opacity: canDeploy ? 1 : 0.5, cursor: canDeploy ? 'pointer' : 'not-allowed' }}
          >
            <DeployInterlockIcon3D size={16} tone="crimson" />
            Deploy Now
          </button>
        </div>
      </div>
    </div>
  );
}
