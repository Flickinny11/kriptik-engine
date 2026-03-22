/**
 * Mobile Deploy Modal
 *
 * Redesigned to match the Feature Agent popout aesthetic:
 * - Slate glass, edge light, noise layer
 * - High-performance motion (transform/opacity only)
 * - No emoji icons
 * - No purple
 * - Brand marks via simple-icons, wrapped in a 3D glass puck
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dialog, DialogContent } from '../ui/dialog';
import type { DeploymentTier } from '../../hooks/useMobileDeploy';
import { useMobileDeploy } from '../../hooks/useMobileDeploy';
import { AppleCredentialForm } from './AppleCredentialForm';
import { MobileBuildProgress } from './MobileBuildProgress';
import {
  CloseInterlockIcon3D,
  MobileDeployInterlockIcon3D,
  DeployInterlockIcon3D,
} from '../ui/InterlockingIcons3D';
const SiApple = ({ size = 20 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>;
import './deploy-popout.css';

interface MobileDeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  webAppFiles?: Record<string, string>;
  appIconBase64?: string;
  /** Hide specific deployment tiers (e.g. ['native'] on mobile browser) */
  hiddenTiers?: DeploymentTier[];
}

type ModalView =
  | 'tiers'
  | 'pwa-config'
  | 'player-config'
  | 'player-success'
  | 'native-credentials'
  | 'native-config'
  | 'building';

const KOMPANION_APP_STORE_URL =
  import.meta.env.VITE_KOMPANION_APP_STORE_URL ||
  'https://apps.apple.com/app/kriptik-kompanion/id6758965689';

function BrandPuck({ children, glow }: { children: React.ReactNode; glow?: string }) {
  return (
    <div
      style={{
        width: 38,
        height: 38,
        borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(245,168,108,0.2) 0%, rgba(245,168,108,0.08) 100%)',
        border: '1px solid rgba(245,168,108,0.25)',
        boxShadow: glow
          ? `0 4px 12px rgba(0,0,0,0.25), 0 0 16px ${glow}`
          : '0 4px 12px rgba(0,0,0,0.25)',
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

function TierChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        padding: '3px 8px',
        borderRadius: 4,
        border: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.2)',
        color: 'rgba(255,255,255,0.5)',
        fontWeight: 600,
        letterSpacing: '0.02em',
        fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {children}
    </span>
  );
}

export function MobileDeployModal({
  isOpen,
  onClose,
  projectId,
  projectName,
  webAppFiles,
  appIconBase64,
  hiddenTiers,
}: MobileDeployModalProps) {
  const [view, setView] = useState<ModalView>('tiers');
  const [appName, setAppName] = useState(projectName || '');
  const [bundleId, setBundleId] = useState(
    `com.kriptik.${(projectName || 'app').toLowerCase().replace(/[^a-z0-9]/g, '')}`
  );
  const [playerDeployResult, setPlayerDeployResult] = useState<{ deepLink: string; webUrl: string } | null>(
    null
  );

  const deploy = useMobileDeploy(projectId);

  const tiers = useMemo(() => {
    const defs: Array<{
      id: DeploymentTier;
      name: string;
      tagline: string;
      time: string;
      features: string[];
      accent: { border: string; glow: string };
      icon: React.ReactNode;
    }> = [
      {
        id: 'pwa',
        name: 'Quick Install',
        tagline: 'PWA: add to Home Screen',
        time: 'Instant',
        features: ['No App Store', 'Any device', 'Offline-ready', 'Auto-updates'],
        accent: {
          border: 'rgba(96,165,250,0.18)',
          glow: 'rgba(96,165,250,0.12)',
        },
        icon: (
          <BrandPuck glow="rgba(96,165,250,0.12)">
            <DeployInterlockIcon3D size={20} tone="crimson" />
          </BrandPuck>
        ),
      },
      {
        id: 'player',
        name: 'KripTik Player',
        tagline: 'Runs inside Kompanion',
        time: '< 1 min',
        features: ['Native feel', 'Push-ready', 'Camera + haptics', 'No review'],
        accent: {
          border: 'rgba(245,168,108,0.2)',
          glow: 'rgba(245,168,108,0.15)',
        },
        icon: (
          <BrandPuck glow="rgba(245,168,108,0.15)">
            <MobileDeployInterlockIcon3D size={20} tone="crimson" />
          </BrandPuck>
        ),
      },
      {
        id: 'native',
        name: 'App Store Build',
        tagline: 'Standalone native binary',
        time: '~10 min',
        features: ['Full listing', 'All device APIs', 'IAP-ready', 'Custom bundle ID'],
        accent: {
          border: 'rgba(148,163,184,0.15)',
          glow: 'rgba(148,163,184,0.1)',
        },
        icon: (
          <BrandPuck glow="rgba(148,163,184,0.1)">
            <SiApple size={18} color="#94A3B8" title="Apple" />
          </BrandPuck>
        ),
      },
    ];

    return defs.filter((t) => !hiddenTiers?.includes(t.id));
  }, [hiddenTiers]);

  // Load tiers and credential status when modal opens
  useEffect(() => {
    if (!isOpen) return;
    deploy.loadTiers();
    deploy.checkAppleCredentials();
    setView('tiers');
    setPlayerDeployResult(null);
    setAppName(projectName || '');
    setBundleId(`com.kriptik.${(projectName || 'app').toLowerCase().replace(/[^a-z0-9]/g, '')}`);
    deploy.resetBuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const title = useMemo(() => {
    switch (view) {
      case 'tiers':
        return 'Deploy to Mobile';
      case 'pwa-config':
        return 'Quick Install (PWA)';
      case 'player-config':
        return 'KripTik Player';
      case 'player-success':
        return 'Player Deploy Complete';
      case 'native-credentials':
        return 'Apple Developer Setup';
      case 'native-config':
        return 'Native App Build';
      case 'building':
        return 'Building App';
    }
  }, [view]);

  const subtitle = useMemo(() => {
    switch (view) {
      case 'tiers':
        return 'Choose a shipping path. You can switch later without losing anything.';
      case 'pwa-config':
        return 'Fastest path. Install from the browser, no store review.';
      case 'player-config':
        return 'A native shell with deep links and device features.';
      case 'player-success':
        return 'Share the deep link and fallback URL with your users.';
      case 'native-credentials':
        return 'Connect your Apple Developer credentials for signing and distribution.';
      case 'native-config':
        return 'Configure metadata and start the build pipeline.';
      case 'building':
        return 'Build events stream in real time.';
    }
  }, [view]);

  const handleTierSelect = useCallback(
    (tier: DeploymentTier) => {
      switch (tier) {
        case 'pwa':
          setView('pwa-config');
          break;
        case 'player':
          setView('player-config');
          break;
        case 'native':
          if (deploy.appleCredentials.hasCredentials) setView('native-config');
          else setView('native-credentials');
          break;
      }
    },
    [deploy.appleCredentials.hasCredentials]
  );

  const handleGeneratePWA = useCallback(async () => {
    const html = webAppFiles?.['index.html'] || '<html><body><h1>My App</h1></body></html>';
    try {
      await deploy.generatePWA({ appName, html });
    } catch {
      // handled in hook
    }
  }, [appName, webAppFiles, deploy]);

  const handleStartNativeBuild = useCallback(async () => {
    setView('building');
    try {
      await deploy.startNativeBuild({
        appName,
        bundleIdentifier: bundleId,
        webAppFiles,
        appIconBase64,
      });
    } catch {
      // handled in hook
    }
  }, [appName, bundleId, webAppFiles, appIconBase64, deploy]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-[720px] p-0 border-0 bg-transparent shadow-none [&>button]:hidden"
        aria-label={title}
      >
        <div className="deploy-popout">
          <div className="deploy-popout__edge" />
          <div className="deploy-popout__noise" />

          <div className="deploy-popout__header">
            <div className="deploy-popout__titlewrap">
              <div className="flex items-center gap-2 min-w-0">
                <MobileDeployInterlockIcon3D size={18} tone="crimson" />
                <div className="deploy-popout__title">{title}</div>
              </div>
              <div className="deploy-popout__subtitle">{subtitle}</div>
            </div>

            <div className="deploy-popout__actions">
              <button
                className="deploy-popout__iconbtn"
                onClick={onClose}
                aria-label="Close mobile deploy dialog"
                type="button"
              >
                <CloseInterlockIcon3D size={16} />
              </button>
            </div>
          </div>

          <div className="deploy-popout__body">
            <div className="deploy-popout__scroll">
              <AnimatePresence mode="wait">
                <motion.div
                  key={view}
                  initial={{ opacity: 0, y: 10, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.99 }}
                  transition={{ duration: 0.16 }}
                >
                  {/* Tier Selection — centered matte slate 3D tiles */}
                  {view === 'tiers' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                      {tiers.map((tier, idx) => (
                        <motion.button
                          key={tier.id}
                          type="button"
                          className="deploy-provider-card"
                          onClick={() => handleTierSelect(tier.id)}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.06, duration: 0.3 }}
                          whileHover={{ y: -3 }}
                          whileTap={{ scale: 0.99 }}
                          style={{
                            borderColor: tier.accent.border,
                            position: 'relative',
                          }}
                        >
                          {/* Subtle glow behind tile on hover */}
                          <div
                            style={{
                              position: 'absolute',
                              inset: -2,
                              borderRadius: 18,
                              background: `radial-gradient(ellipse at center, ${tier.accent.glow}, transparent 70%)`,
                              zIndex: -1,
                              filter: 'blur(15px)',
                              pointerEvents: 'none',
                            }}
                          />
                          <div className="deploy-provider-card__top">
                            <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
                              {tier.icon}
                              <div style={{ minWidth: 0 }}>
                                <div className="deploy-provider-card__name">{tier.name}</div>
                                <div className="deploy-provider-card__meta">{tier.tagline}</div>
                              </div>
                            </div>
                            <span className="deploy-pill">{tier.time}</span>
                          </div>
                          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {tier.features.map((f) => (
                              <TierChip key={f}>{f}</TierChip>
                            ))}
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  )}

                  {/* PWA Config */}
                  {view === 'pwa-config' && (
                    <div className="space-y-3">
                      <div className="deploy-section">
                        <div className="deploy-section__label">Configuration</div>
                        <div className="deploy-field" style={{ marginTop: 10 }}>
                          <label className="deploy-label">App Name</label>
                          <input
                            className="deploy-input"
                            value={appName}
                            onChange={(e) => setAppName(e.target.value)}
                            placeholder="My App"
                          />
                        </div>
                      </div>

                      {deploy.pwaUrl && (
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
                            <div style={{ minWidth: 0 }}>
                              <div className="deploy-provider-card__name">PWA Generated</div>
                              <div className="deploy-muted">Open the install URL, then add to Home Screen.</div>
                            </div>
                          </div>
                          <a
                            href={deploy.pwaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'block',
                              marginTop: 10,
                              padding: '10px 12px',
                              borderRadius: 14,
                              border: '1px solid rgba(255,255,255,0.10)',
                              background: 'rgba(0,0,0,0.35)',
                              color: 'rgba(180,215,255,0.92)',
                              textDecoration: 'none',
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                              fontSize: 12,
                              wordBreak: 'break-all',
                            }}
                          >
                            {deploy.pwaUrl}
                          </a>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button type="button" className="deploy-btn" onClick={() => setView('tiers')}>
                          Back
                        </button>
                        <button
                          type="button"
                          className="deploy-btn deploy-btn--primary"
                          onClick={handleGeneratePWA}
                          disabled={deploy.pwaGenerating || !appName.trim()}
                          style={{ opacity: deploy.pwaGenerating || !appName.trim() ? 0.6 : 1 }}
                        >
                          {deploy.pwaGenerating ? 'Generating' : 'Generate'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Player Config */}
                  {view === 'player-config' && (
                    <div className="space-y-3">
                      <div className="deploy-section" style={{ borderColor: 'rgba(245,168,108,0.18)' }}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="deploy-section__label">Kompanion</div>
                            <div className="deploy-muted" style={{ marginTop: 6 }}>
                              Your app runs inside Kompanion for native feel without store review.
                            </div>
                          </div>
                          <a
                            className="deploy-btn"
                            href={KOMPANION_APP_STORE_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ textDecoration: 'none' }}
                          >
                            Get Kompanion
                          </a>
                        </div>
                      </div>

                      <div className="deploy-section">
                        <div className="deploy-section__label">Configuration</div>
                        <div className="deploy-field" style={{ marginTop: 10 }}>
                          <label className="deploy-label">App Name</label>
                          <input
                            className="deploy-input"
                            value={appName}
                            onChange={(e) => setAppName(e.target.value)}
                            placeholder="My App"
                          />
                        </div>
                        <div style={{ marginTop: 10 }} className="deploy-muted">
                          Deep link: <span style={{ color: 'rgba(180,215,255,0.92)' }}>kriptik://player/{projectId}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button type="button" className="deploy-btn" onClick={() => setView('tiers')}>
                          Back
                        </button>
                        <button
                          type="button"
                          className="deploy-btn deploy-btn--primary"
                          disabled={deploy.playerDeploying || !appName.trim()}
                          style={{ opacity: deploy.playerDeploying || !appName.trim() ? 0.6 : 1 }}
                          onClick={async () => {
                            if (!appName.trim()) return;
                            try {
                              const result = await deploy.deployToPlayer({ appName });
                              if (result.success) {
                                setPlayerDeployResult({ deepLink: result.deepLink, webUrl: result.webUrl });
                                setView('player-success');
                              }
                            } catch {
                              // handled in hook
                            }
                          }}
                        >
                          {deploy.playerDeploying ? 'Deploying' : 'Deploy'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Player Success */}
                  {view === 'player-success' && playerDeployResult && (
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
                            <div className="deploy-provider-card__name">Deployed to Player</div>
                            <div className="deploy-muted">Share these links with your users.</div>
                          </div>
                        </div>
                      </div>

                      <div className="deploy-section">
                        <div className="deploy-section__label">Deep Link</div>
                        <div
                          style={{
                            marginTop: 10,
                            padding: '10px 12px',
                            borderRadius: 14,
                            border: '1px solid rgba(255,255,255,0.10)',
                            background: 'rgba(0,0,0,0.35)',
                            color: 'rgba(180,215,255,0.92)',
                            fontFamily:
                              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                            fontSize: 12,
                            wordBreak: 'break-all',
                          }}
                        >
                          {playerDeployResult.deepLink}
                        </div>
                      </div>

                      <div className="deploy-section">
                        <div className="deploy-section__label">Web Fallback</div>
                        <a
                          href={playerDeployResult.webUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'block',
                            marginTop: 10,
                            padding: '10px 12px',
                            borderRadius: 14,
                            border: '1px solid rgba(255,255,255,0.10)',
                            background: 'rgba(0,0,0,0.35)',
                            color: 'rgba(180,215,255,0.92)',
                            textDecoration: 'none',
                            fontFamily:
                              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                            fontSize: 12,
                            wordBreak: 'break-all',
                          }}
                        >
                          {playerDeployResult.webUrl}
                        </a>
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          className="deploy-btn"
                          href={KOMPANION_APP_STORE_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ textDecoration: 'none' }}
                        >
                          Get Kompanion
                        </a>
                        <button type="button" className="deploy-btn deploy-btn--primary" onClick={onClose}>
                          Done
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Native Credentials */}
                  {view === 'native-credentials' && (
                    <AppleCredentialForm
                      onSubmit={deploy.storeAppleCredentials}
                      onValidate={deploy.validateAppleCredentials}
                      hasExistingCredentials={deploy.appleCredentials.hasCredentials}
                      existingTeamId={deploy.appleCredentials.teamId}
                      validatedAt={deploy.appleCredentials.validatedAt}
                      onBack={() => {
                        if (deploy.appleCredentials.hasCredentials) setView('native-config');
                        else setView('tiers');
                      }}
                    />
                  )}

                  {/* Native Build Config */}
                  {view === 'native-config' && (
                    <div className="space-y-3">
                      {deploy.appleCredentials.hasCredentials && (
                        <div className="deploy-section" style={{ borderColor: 'rgba(34,197,94,0.18)' }}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="deploy-muted" style={{ color: 'rgba(255,255,255,0.75)' }}>
                              Apple Developer connected ({deploy.appleCredentials.teamId || 'Team'})
                            </div>
                            <button type="button" className="deploy-btn" onClick={() => setView('native-credentials')}>
                              Change
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="deploy-section">
                        <div className="deploy-section__label">Configuration</div>
                        <div className="deploy-fieldgrid" style={{ marginTop: 10 }}>
                          <div className="deploy-field">
                            <label className="deploy-label">App Name</label>
                            <input
                              className="deploy-input"
                              value={appName}
                              onChange={(e) => setAppName(e.target.value)}
                              placeholder="My App"
                            />
                          </div>
                          <div className="deploy-field">
                            <label className="deploy-label">Bundle Identifier</label>
                            <input
                              className="deploy-input"
                              value={bundleId}
                              onChange={(e) => setBundleId(e.target.value)}
                              placeholder="com.yourcompany.app"
                              style={{
                                fontFamily:
                                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button type="button" className="deploy-btn" onClick={() => setView('tiers')}>
                          Back
                        </button>
                        <button
                          type="button"
                          className="deploy-btn deploy-btn--primary"
                          onClick={handleStartNativeBuild}
                          disabled={!appName.trim() || !bundleId.trim()}
                          style={{ opacity: !appName.trim() || !bundleId.trim() ? 0.6 : 1 }}
                        >
                          Start Build
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Build Progress */}
                  {view === 'building' && (
                    <MobileBuildProgress
                      buildId={deploy.buildId}
                      status={deploy.buildStatus}
                      progress={deploy.buildProgress}
                      phase={deploy.buildStatus}
                      error={deploy.buildError}
                      artifactUrl={deploy.artifactUrl}
                      qrCodeUrl={deploy.qrCodeUrl}
                      onCancel={deploy.cancelBuild}
                      onReset={() => {
                        deploy.resetBuild();
                        setView('native-config');
                      }}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

