/**
 * Builder Page — Premium AI Development Environment
 *
 * Layout: Streaming chat (left ~25%, resizable) | Preview/Code (right ~75%)
 * Header: Logo + project name | Preview/Code tabs | Publish + Settings
 *
 * Streaming chat uses AgentStreamView (Unified Feed / Swim Lanes)
 * which was built with custom SDF icons, agent badges, brain connectors.
 * No mechanical patterns — agents emit events, UI renders them dynamically.
 *
 * Styling: Design_References.md driven — photorealistic depth, 3D shadows,
 * GSAP animations, custom GLSL-inspired gradients. No flat CSS.
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import gsap from 'gsap';
import {
  ArrowLeftIcon, SendIcon, SquareIcon, LoadingIcon, SparklesIcon,
  GlobeIcon, CheckIcon, CloseIcon, ExternalLinkIcon,
  CodeIcon, EyeIcon, SettingsIcon,
} from '@/components/ui/icons';
import { useEngineEvents } from '@/hooks/useEngineEvents';
import { useSpeculation } from '@/hooks/useSpeculation';
import { apiClient, type OAuthCatalogEntry } from '@/lib/api-client';
import { useProjectStore } from '@/store/useProjectStore';
import { AgentStreamView } from '@/components/builder/AgentStreamView';
import { SpeculativePlan } from '@/components/builder/SpeculativePlan';
import './builder.css';

type ActiveTab = 'preview' | 'code';

export default function Builder() {
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const initialPrompt = (location.state as any)?.initialPrompt as string | undefined;
  const headerRef = useRef<HTMLElement>(null);

  const [sseReady, setSseReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [userInput, setUserInput] = useState('');
  const [oauthCatalog, setOauthCatalog] = useState<OAuthCatalogEntry[]>([]);
  const [projectStatus, setProjectStatus] = useState<string>('idle');
  const [projectName, setProjectName] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('preview');
  const { updateProjectStatus } = useProjectStore();

  // Publish
  const [showPublish, setShowPublish] = useState(false);
  const [publishSlug, setPublishSlug] = useState('');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Speculative AI
  const { speculation, isAnalyzing } = useSpeculation(
    projectStatus === 'idle' ? userInput : '', projectId || null,
  );

  // ─── EFFECTS ─────────────────────────────────────────────

  useEffect(() => { apiClient.getOAuthCatalog().then(r => setOauthCatalog(r.providers)).catch(() => {}); }, []);

  useEffect(() => {
    if (!projectId) return;
    apiClient.getProject(projectId).then(({ project }) => {
      if (project.appSlug) setPublishSlug(project.appSlug);
      if (project.isPublished) { setIsPublished(true); setPublishedUrl(`https://${project.appSlug}.kriptik.app`); }
    }).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (!publishSlug || publishSlug.length < 3) { setSlugStatus('idle'); return; }
    setSlugStatus('checking');
    const t = setTimeout(async () => {
      try { const r = await apiClient.checkSlug(publishSlug); setSlugStatus(r.available ? 'available' : 'taken'); }
      catch { setSlugStatus('invalid'); }
    }, 500);
    return () => clearTimeout(t);
  }, [publishSlug]);

  // GSAP header entrance
  useEffect(() => {
    if (headerRef.current) {
      gsap.fromTo(headerRef.current, { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' });
    }
  }, []);

  const { events, isConnected, isComplete, disconnect } = useEngineEvents(sseReady ? projectId! : null);

  useEffect(() => {
    if (!projectId) return;
    if (initialPrompt) {
      apiClient.startBuild(projectId, initialPrompt)
        .then(() => { setProjectStatus('building'); updateProjectStatus(projectId, 'building'); setSseReady(true); })
        .catch(() => setProjectStatus('failed'));
    } else {
      apiClient.getProject(projectId)
        .then(({ project }) => { setProjectStatus(project.status); setProjectName(project.name); setSseReady(true); })
        .catch(() => setProjectStatus('failed'));
    }
  }, [projectId]);

  useEffect(() => {
    for (const event of events) {
      if (event.type === 'agent_tool_result' && event.data.toolName === 'start_dev_server') {
        const url = (event.data.result as any)?.url;
        if (url) setPreviewUrl(url);
      }
      if (event.type === 'build_complete') setProjectStatus('complete');
    }
  }, [events]);

  // ─── HANDLERS ────────────────────────────────────────────

  async function handleSubmit() {
    if (!userInput.trim() || !projectId) return;
    if (projectStatus === 'idle') {
      try { await apiClient.startBuild(projectId, userInput.trim()); setProjectStatus('building'); updateProjectStatus(projectId, 'building'); setSseReady(true); setUserInput(''); }
      catch (err) { console.error('Build start failed:', err); }
    } else if (projectStatus === 'building') {
      try { await apiClient.sendDirective(projectId, userInput.trim()); setUserInput(''); }
      catch (err) { console.error('Directive failed:', err); }
    }
  }

  async function handleStop() {
    if (!projectId) return;
    try { await apiClient.stopBuild(projectId); disconnect(); setProjectStatus('idle'); updateProjectStatus(projectId, 'idle'); }
    catch (err) { console.error('Stop failed:', err); }
  }

  async function handlePublish() {
    if (!projectId) return;
    setIsPublishing(true);
    try {
      if (publishSlug && slugStatus === 'available') await apiClient.setSlug(projectId, publishSlug);
      const r = await apiClient.publishProject(projectId);
      setPublishedUrl(r.url); setPublishSlug(r.slug); setIsPublished(true);
    } catch (err) { console.error('Publish failed:', err); }
    finally { setIsPublishing(false); }
  }

  async function handleUnpublish() {
    if (!projectId) return;
    try { await apiClient.unpublishProject(projectId); setIsPublished(false); setPublishedUrl(null); }
    catch (err) { console.error('Unpublish failed:', err); }
  }

  async function handleAnswer(nodeId: string, answer: string) {
    if (!projectId) return;
    try { await apiClient.respondToQuestion(projectId, nodeId, answer); }
    catch (err) { console.error('Answer failed:', err); }
  }

  const isBuilding = projectStatus === 'building' && !isComplete;
  const realEvents = events.filter(e => e.type !== 'connected' && e.type !== 'replay_complete');
  const isIdle = projectStatus === 'idle' && realEvents.length === 0;
  const canSubmit = userInput.trim() && (isBuilding || isIdle);

  // ─── RENDER ──────────────────────────────────────────────

  return (
    <div className="builder-root">

      {/* ═══ HEADER ═══ */}
      <header ref={headerRef} className="builder-header">
        <div className="builder-header__left">
          <button className="action-btn--icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeftIcon size={17} />
          </button>
          <div className="builder-header__divider" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {projectName || initialPrompt?.slice(0, 50) || 'New Project'}
          </span>
          {isBuilding && (
            <span className="build-status">
              <span className="build-status__dot build-status__dot--building" />
              <span style={{ color: '#34d399' }}>Building</span>
            </span>
          )}
          {isComplete && <span style={{ fontSize: 11, fontWeight: 500, color: '#34d399' }}>Complete</span>}
        </div>

        <div className="builder-header__center">
          {(['preview', 'code'] as ActiveTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`tab-btn ${activeTab === tab ? 'tab-btn--active' : ''}`}
            >
              {tab === 'preview' ? <EyeIcon size={14} /> : <CodeIcon size={14} />}
              {tab === 'preview' ? 'Preview' : 'Code'}
            </button>
          ))}
        </div>

        <div className="builder-header__right">
          {isBuilding && (
            <button className="action-btn--stop" onClick={handleStop} title="Stop build">
              <SquareIcon size={14} />
            </button>
          )}
          <button
            onClick={() => setShowPublish(!showPublish)}
            className={isPublished ? 'action-btn action-btn--published' : 'action-btn action-btn--publish'}
          >
            <GlobeIcon size={13} />
            {isPublished ? 'Published' : 'Publish'}
          </button>
          <button className="action-btn--icon" title="Settings">
            <SettingsIcon size={15} />
          </button>
        </div>
      </header>

      {/* ═══ MAIN PANELS ═══ */}
      <PanelGroup direction="horizontal" style={{ flex: 1 }}>

        {/* ─── LEFT: STREAMING CHAT ─── */}
        <Panel defaultSize={25} minSize={18} maxSize={40}>
          <div className="glass-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

            {/* Stream content */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {isIdle ? (
                <div className="empty-state">
                  <div className="empty-state__content">
                    <SparklesIcon size={26} className="empty-state__icon" />
                    <div className="empty-state__title">What do you want to build?</div>
                    <div className="empty-state__text">
                      Describe your app below. The agents will reason about architecture, research APIs, and build it.
                    </div>
                  </div>
                </div>
              ) : (
                <AgentStreamView
                  events={events}
                  projectId={projectId!}
                  oauthCatalog={oauthCatalog}
                  onAnswer={handleAnswer}
                />
              )}
            </div>

            {/* Speculative plan */}
            {isIdle && (speculation || isAnalyzing) && (
              <SpeculativePlan speculation={speculation} isAnalyzing={isAnalyzing} />
            )}

            {/* Input */}
            <div className="chat-input-area">
              <div className="chat-input-row">
                <input
                  className="chat-input"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && canSubmit && handleSubmit()}
                  placeholder={isIdle ? 'Describe your app...' : isBuilding ? 'Send a directive...' : 'Build complete'}
                  disabled={isComplete}
                />
                <button className="chat-send-btn" onClick={handleSubmit} disabled={!canSubmit}>
                  <SendIcon size={14} />
                </button>
              </div>
            </div>
          </div>
        </Panel>

        {/* Resize handle */}
        <PanelResizeHandle className="resize-handle" />

        {/* ─── RIGHT: PREVIEW / CODE ─── */}
        <Panel defaultSize={75} minSize={50}>
          <div className="glass-panel" style={{ height: '100%' }}>
            {activeTab === 'preview' ? (
              previewUrl ? (
                <iframe src={previewUrl} className="preview-iframe" title="App Preview" sandbox="allow-scripts allow-forms allow-popups" />
              ) : (
                <div className="preview-placeholder">
                  <div style={{ textAlign: 'center' }}>
                    <div className="preview-placeholder__text">
                      {isBuilding ? 'Preview will appear when the dev server starts...' :
                       isComplete ? 'Build complete — preview available' :
                       'Live preview appears here during build'}
                    </div>
                    {isBuilding && <LoadingIcon size={18} className="empty-state__icon" style={{ marginTop: 8 }} />}
                  </div>
                </div>
              )
            ) : (
              <div className="code-placeholder">
                <CodeIcon size={28} className="code-placeholder__icon" />
                <div className="code-placeholder__title">Code editor — generated files appear here</div>
                <div className="code-placeholder__sub">Files are written to the sandbox in real-time</div>
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>

      {/* ═══ PUBLISH PANEL ═══ */}
      {showPublish && (
        <div className="publish-backdrop">
          <div className="publish-backdrop__bg" onClick={() => setShowPublish(false)} />
          <div className="publish-panel">
            <div className="publish-panel__header">
              <span className="publish-panel__title"><GlobeIcon size={14} /> Publish App</span>
              <button className="action-btn--icon" onClick={() => setShowPublish(false)}><CloseIcon size={14} /></button>
            </div>
            <div className="publish-panel__body">
              {isPublished && publishedUrl && (
                <div className="live-badge">
                  <span className="live-badge__dot" />
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#34d399' }}>Live</span>
                  <a href={publishedUrl} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: '#fbbf24', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                    {publishedUrl.replace('https://', '')} <ExternalLinkIcon size={10} />
                  </a>
                </div>
              )}

              <div>
                <label style={{ fontSize: 11, fontWeight: 500, color: 'rgba(161,161,170,0.6)', marginBottom: 6, display: 'block' }}>App URL</label>
                <div className="publish-url-input">
                  <span className="publish-url-input__prefix">https://</span>
                  <input
                    value={publishSlug}
                    onChange={(e) => {
                      const allowed = 'abcdefghijklmnopqrstuvwxyz0123456789-';
                      const cleaned = Array.from(e.target.value.toLowerCase()).filter(c => allowed.includes(c)).join('');
                      setPublishSlug(cleaned);
                    }}
                    placeholder="my-app"
                  />
                  <span className="publish-url-input__suffix">.kriptik.app</span>
                </div>
                <div className={`slug-status slug-status--${slugStatus}`}>
                  {slugStatus === 'checking' && <><LoadingIcon size={10} /> Checking...</>}
                  {slugStatus === 'available' && <><CheckIcon size={10} /> Available</>}
                  {slugStatus === 'taken' && 'Already taken'}
                  {slugStatus === 'invalid' && 'Invalid'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {isPublished ? (
                  <>
                    <button className="publish-cta publish-cta--update" onClick={handlePublish}
                      disabled={isPublishing || (slugStatus !== 'available' && slugStatus !== 'idle')}>
                      {isPublishing ? 'Updating...' : 'Update'}
                    </button>
                    <button className="publish-cta publish-cta--unpublish" onClick={handleUnpublish}>Unpublish</button>
                  </>
                ) : (
                  <button className="publish-cta publish-cta--primary" onClick={handlePublish}
                    disabled={isPublishing || slugStatus === 'taken' || slugStatus === 'invalid'}>
                    {isPublishing ? 'Publishing...' : 'Publish to kriptik.app'}
                  </button>
                )}
              </div>

              <p className="publish-note">Your app will be live at this URL. Changing the URL replaces the old one.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
