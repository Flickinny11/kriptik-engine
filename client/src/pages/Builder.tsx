/**
 * Builder Page — Premium AI Development Environment
 *
 * Layout: Streaming chat (left ~25%, resizable) | Preview/Code (right ~75%)
 * Header: Logo + project name | Preview/Code tabs | Publish + Settings
 *
 * Visual: OGL WebGL shaders for panels, GSAP for animations. 
 * Design_References.md driven.
 *
 * AgentStreamView is LAZY imported because it pulls in Three.js + OGL
 * through BrainOrb/BrainConnector/WarpBackground. These heavy modules
 * must not block initial Builder render.
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
import { ShaderPanel, ShaderBackground, ShaderButton } from '@/components/shaders';
import { useEngineEvents } from '@/hooks/useEngineEvents';
import { useSpeculation } from '@/hooks/useSpeculation';
import { apiClient, type OAuthCatalogEntry } from '@/lib/api-client';
import { useProjectStore } from '@/store/useProjectStore';
import { useDependencyStore } from '@/store/useDependencyStore';
import { SpeculativePlan } from '@/components/builder/SpeculativePlan';
import { AgentStreamView } from '@/components/builder/AgentStreamView';
import { AccountSlideOut } from '@/components/account/AccountSlideOut';
import { FloatingDevToolbar } from '@/components/developer-bar';

type ActiveTab = 'preview' | 'code';

export default function Builder() {
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const initialPrompt = (location.state as any)?.initialPrompt as string | undefined;
  const headerRef = useRef<HTMLDivElement>(null);
  const publishRef = useRef<HTMLDivElement>(null);

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

  // Load dependency store data for MCP-aware planning tiles
  const { loadRegistry, loadConnections, startHealthChecks, stopHealthChecks, setConnectionState, setToolsForService } = useDependencyStore();

  useEffect(() => {
    apiClient.getOAuthCatalog().then(r => setOauthCatalog(r.providers)).catch(() => {});
    loadRegistry();
    loadConnections();
    startHealthChecks();
    return () => stopHealthChecks();
  }, [loadRegistry, loadConnections, startHealthChecks, stopHealthChecks]);

  // Listen for MCP OAuth popup completion to update global dependency store
  // and auto-create project instance when connecting during a build
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;
      if (event.data?.type === 'mcp_oauth_complete') {
        const { success, serviceId: connectedServiceId } = event.data;
        if (success && connectedServiceId) {
          setConnectionState(connectedServiceId, 'connected', { connectedAt: new Date().toISOString() });
          // Fetch tools in background
          apiClient.getMcpTools(connectedServiceId).then(({ tools }) => {
            setToolsForService(connectedServiceId, tools);
          }).catch(() => {});
          // Auto-create project instance if we have a project context
          if (projectId) {
            apiClient.createServiceInstance(connectedServiceId, projectId).catch(() => {
              // Instance creation is best-effort during builds
            });
          }
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [setConnectionState, setToolsForService, projectId]);

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

  useEffect(() => {
    if (headerRef.current) gsap.fromTo(headerRef.current, { y: -24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' });
  }, []);

  useEffect(() => {
    if (showPublish && publishRef.current) gsap.fromTo(publishRef.current, { x: 30, opacity: 0, scale: 0.96 }, { x: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'power3.out' });
  }, [showPublish]);

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
  const slugAllowed = 'abcdefghijklmnopqrstuvwxyz0123456789-';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', fontFamily: "'Inter', -apple-system, sans-serif" }}>

      <AccountSlideOut />
      <ShaderBackground />

      {/* HEADER */}
      <div ref={headerRef} style={{ height: 52, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, zIndex: 10, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShaderButton variant="ghost" size="sm" onClick={() => navigate('/dashboard')}><ArrowLeftIcon size={16} /></ShaderButton>
          <div style={{ width: 1, height: 18, background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.06), transparent)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {projectName || initialPrompt?.slice(0, 50) || 'New Project'}
          </span>
          {isBuilding && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, color: '#34d399' }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px rgba(52,211,153,0.5)' }} />Building</span>}
          {isComplete && <span style={{ fontSize: 11, fontWeight: 500, color: '#34d399' }}>Complete</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {(['preview', 'code'] as ActiveTab[]).map(tab => (
            <ShaderButton key={tab} variant={activeTab === tab ? 'accent' : 'ghost'} size="sm" onClick={() => setActiveTab(tab)}>
              {tab === 'preview' ? <EyeIcon size={13} /> : <CodeIcon size={13} />}
              {tab === 'preview' ? 'Preview' : 'Code'}
            </ShaderButton>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isBuilding && <ShaderButton variant="danger" size="sm" onClick={handleStop} title="Stop build"><SquareIcon size={13} /></ShaderButton>}
          <ShaderButton variant={isPublished ? 'accent' : 'default'} size="sm" onClick={() => setShowPublish(!showPublish)}>
            <GlobeIcon size={12} />{isPublished ? 'Published' : 'Publish'}
          </ShaderButton>
          <ShaderButton variant="ghost" size="sm" title="Settings"><SettingsIcon size={14} /></ShaderButton>
        </div>
      </div>

      {/* MAIN PANELS */}
      <PanelGroup direction="horizontal" style={{ flex: 1, position: 'relative', zIndex: 1 }}>
        <Panel defaultSize={25} minSize={18} maxSize={40}>
          <ShaderPanel style={{ height: '100%', margin: 5, display: 'flex', flexDirection: 'column' }} colorA={[0.035, 0.033, 0.045]} colorB={[0.065, 0.06, 0.075]} noiseScale={2.5} warpStrength={0.6}>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {isIdle ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, height: '100%' }}>
                  <div style={{ textAlign: 'center', maxWidth: 260 }}>
                    <SparklesIcon size={24} style={{ color: 'rgba(251,191,36,0.3)', marginBottom: 10 }} />
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 6 }}>What do you want to build?</div>
                    <div style={{ fontSize: 11, color: 'rgba(113,113,122,0.6)', lineHeight: 1.6 }}>Describe your app below. The agents will reason about architecture, research APIs, and build it.</div>
                  </div>
                </div>
              ) : (
                <AgentStreamView events={events} projectId={projectId!} oauthCatalog={oauthCatalog} onAnswer={handleAnswer} />
              )}
            </div>
            {isIdle && (speculation || isAnalyzing) && <SpeculativePlan speculation={speculation} isAnalyzing={isAnalyzing} />}
            <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && canSubmit && handleSubmit()}
                  placeholder={isIdle ? 'Describe your app...' : isBuilding ? 'Send a directive...' : 'Build complete'} disabled={isComplete}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#e2e8f0', outline: 'none', fontFamily: 'inherit', opacity: isComplete ? 0.3 : 1 }} />
                <ShaderButton variant="accent" size="md" onClick={handleSubmit} disabled={!canSubmit}><SendIcon size={13} /></ShaderButton>
              </div>
            </div>
          </ShaderPanel>
        </Panel>

        <PanelResizeHandle style={{ width: 3, cursor: 'col-resize' }} />

        <Panel defaultSize={75} minSize={50}>
          <ShaderPanel style={{ height: '100%', margin: 5 }} colorA={[0.03, 0.03, 0.04]} colorB={[0.055, 0.05, 0.065]} noiseScale={2.0} warpStrength={0.5}>
            {activeTab === 'preview' ? (
              previewUrl ? (
                <iframe src={previewUrl} style={{ width: '100%', height: '100%', border: 0, borderRadius: 14 }} title="App Preview" sandbox="allow-scripts allow-forms allow-popups" />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'rgba(113,113,122,0.4)', fontSize: 13 }}>{isBuilding ? 'Preview will appear when the dev server starts...' : isComplete ? 'Build complete' : 'Live preview appears here during build'}</div>
                    {isBuilding && <LoadingIcon size={16} style={{ color: 'rgba(251,191,36,0.3)', marginTop: 10 }} />}
                  </div>
                </div>
              )
            ) : (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <CodeIcon size={26} style={{ color: 'rgba(63,63,70,0.5)' }} />
                <div style={{ color: 'rgba(113,113,122,0.4)', fontSize: 13 }}>Code editor — generated files appear here</div>
                <div style={{ color: 'rgba(63,63,70,0.4)', fontSize: 11 }}>Files are written to the sandbox in real-time</div>
              </div>
            )}
          </ShaderPanel>
        </Panel>
      </PanelGroup>

      {/* PUBLISH PANEL */}
      {showPublish && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '60px 16px 16px' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowPublish(false)} />
          <div ref={publishRef}>
            <ShaderPanel style={{ width: 380 }} colorA={[0.055, 0.05, 0.065]} colorB={[0.08, 0.075, 0.09]} noiseScale={4.0} warpStrength={1.0}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}><GlobeIcon size={14} /> Publish App</span>
                <ShaderButton variant="ghost" size="sm" onClick={() => setShowPublish(false)}><CloseIcon size={13} /></ShaderButton>
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {isPublished && publishedUrl && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.12)', borderRadius: 10 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px rgba(52,211,153,0.4)' }} />
                    <span style={{ fontSize: 11, fontWeight: 500, color: '#34d399' }}>Live</span>
                    <a href={publishedUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#fbbf24', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                      {publishedUrl.replace('https://', '')} <ExternalLinkIcon size={10} />
                    </a>
                  </div>
                )}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'rgba(161,161,170,0.5)', marginBottom: 6, display: 'block' }}>App URL</label>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, overflow: 'hidden' }}>
                    <span style={{ fontSize: 11, color: 'rgba(113,113,122,0.4)', padding: '9px 10px', background: 'rgba(255,255,255,0.02)', borderRight: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap', userSelect: 'none' }}>https://</span>
                    <input value={publishSlug} onChange={(e) => setPublishSlug(Array.from(e.target.value.toLowerCase()).filter(c => slugAllowed.includes(c)).join(''))} placeholder="my-app"
                      style={{ flex: 1, background: 'transparent', border: 'none', padding: '9px 8px', fontSize: 13, color: '#e2e8f0', outline: 'none', minWidth: 0, fontFamily: 'inherit' }} />
                    <span style={{ fontSize: 11, color: 'rgba(113,113,122,0.4)', padding: '9px 10px', background: 'rgba(255,255,255,0.02)', borderLeft: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap', userSelect: 'none' }}>.kriptik.app</span>
                  </div>
                  <div style={{ height: 16, marginTop: 4, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {slugStatus === 'checking' && <span style={{ color: 'rgba(161,161,170,0.5)' }}><LoadingIcon size={10} /> Checking...</span>}
                    {slugStatus === 'available' && <span style={{ color: '#34d399' }}><CheckIcon size={10} /> Available</span>}
                    {slugStatus === 'taken' && <span style={{ color: '#f87171' }}>Already taken</span>}
                    {slugStatus === 'invalid' && <span style={{ color: '#f87171' }}>Invalid</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {isPublished ? (
                    <>
                      <ShaderButton variant="accent" size="lg" style={{ flex: 1 }} onClick={handlePublish} disabled={isPublishing || (slugStatus !== 'available' && slugStatus !== 'idle')}>
                        {isPublishing ? 'Updating...' : 'Update'}
                      </ShaderButton>
                      <ShaderButton variant="danger" size="lg" onClick={handleUnpublish}>Unpublish</ShaderButton>
                    </>
                  ) : (
                    <ShaderButton variant="primary" size="lg" style={{ width: '100%' }} onClick={handlePublish} disabled={isPublishing || slugStatus === 'taken' || slugStatus === 'invalid'}>
                      {isPublishing ? 'Publishing...' : 'Publish to kriptik.app'}
                    </ShaderButton>
                  )}
                </div>
                <p style={{ fontSize: 11, color: 'rgba(113,113,122,0.35)', lineHeight: 1.5 }}>Your app will be live at this URL. Changing the URL replaces the old one.</p>
              </div>
            </ShaderPanel>
          </div>
        </div>
      )}

      {/* DEVELOPER TOOLBAR — floating over preview, 2 buttons: Feature Agents + Open Source Studio */}
      <FloatingDevToolbar />
    </div>
  );
}
