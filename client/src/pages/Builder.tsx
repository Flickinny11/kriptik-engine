/**
 * Builder Page — Premium AI Development Environment
 *
 * Layout: Streaming chat (left ~25%, resizable) | Preview/Code (right ~75%)
 * Header: Logo + project name + status | Preview/Code tabs | Publish + Settings
 *
 * Visual: Glass-morphism panels, 3D animated elements, framer-motion.
 * Uses migrated premium components for rich, reactive builder experience.
 *
 * AgentStreamView is LAZY imported because it pulls in Three.js + OGL
 * through BrainOrb/BrainConnector/WarpBackground. These heavy modules
 * must not block initial Builder render.
 */

import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import {
  ArrowLeftIcon, SendIcon, SparklesIcon,
  GlobeIcon, CheckIcon, CloseIcon, ExternalLinkIcon,
  CodeIcon, EyeIcon, SettingsIcon, LoadingIcon,
} from '@/components/ui/icons';
import { useEngineEvents } from '@/hooks/useEngineEvents';
import { useSpeculation } from '@/hooks/useSpeculation';
import { apiClient, type OAuthCatalogEntry } from '@/lib/api-client';
import { useProjectStore } from '@/store/useProjectStore';
import { useProjectFileStore } from '@/store/useProjectFileStore';
import { SpeculativePlan } from '@/components/builder/SpeculativePlan';
import { AgentStreamView } from '@/components/builder/AgentStreamView';
import { AccountSlideOut } from '@/components/account/AccountSlideOut';
import { FloatingDevToolbar } from '@/components/developer-bar';
import { Glass3DButton } from '@/components/builder/Glass3DButton';
import { Glass3DStatusBadge } from '@/components/builder/Glass3DStatusBadge';
import { AnimatedStopButton } from '@/components/builder/AnimatedStopButton';
import { AnimatedPlaceholder } from '@/components/builder/AnimatedPlaceholder';
import { AnimatedLogo } from '@/components/builder/AnimatedLogo';

// Lazy-load heavier components that aren't needed on first paint
const CodeEditor = lazy(() => import('@/components/builder/CodeEditor'));
const ProjectFileExplorer = lazy(() => import('@/components/builder/ProjectFileExplorer'));
const CommandPalette = lazy(() => import('@/components/builder/CommandPalette'));
const FloatingSoftInterrupt = lazy(() => import('@/components/builder/FloatingSoftInterrupt').then(m => ({ default: m.FloatingSoftInterrupt })));

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
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [oauthCatalog, setOauthCatalog] = useState<OAuthCatalogEntry[]>([]);
  const [projectStatus, setProjectStatus] = useState<string>('idle');
  const [projectName, setProjectName] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('preview');
  const { updateProjectStatus } = useProjectStore();
  const upsertFile = useProjectFileStore(s => s.upsertFile);

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

  // Feed file_write events into the project file store — reactive, live updates
  useEffect(() => {
    for (const event of events) {
      if (event.type === 'agent_tool_result' && event.data.toolName === 'start_dev_server') {
        const url = (event.data.result as any)?.url;
        if (url) setPreviewUrl(url);
      }
      if (event.type === 'agent_file_write') {
        const filePath = event.data.path as string;
        const content = event.data.content as string;
        if (filePath && content != null) {
          upsertFile(filePath, content);
        }
      }
      if (event.type === 'build_complete') setProjectStatus('complete');
    }
  }, [events, upsertFile]);

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

  // Map project status to Glass3DStatusBadge status format
  const badgeStatus = isIdle ? 'idle' : isBuilding ? 'building' : isComplete ? 'complete' : 'idle';
  const badgeLabel = isIdle ? 'Ready' : isBuilding ? 'Building' : isComplete ? 'Complete' : projectName || 'Project';

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Inter', -apple-system, sans-serif",
        background: 'linear-gradient(145deg, #0f0e17 0%, #1a1a2e 40%, #16213e 100%)',
      }}
    >
      <AccountSlideOut />

      {/* Command Palette — keyboard-accessible */}
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>

      {/* HEADER */}
      <div
        ref={headerRef}
        style={{
          height: 56,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          zIndex: 10,
          position: 'relative',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(12px)',
          background: 'rgba(15,14,23,0.6)',
        }}
      >
        {/* Left: Back + Project Name + Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
              color: 'rgba(200,200,210,0.7)', cursor: 'pointer',
            }}
          >
            <ArrowLeftIcon size={16} />
          </button>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.06)' }} />
          <span style={{
            fontSize: 14, fontWeight: 600, color: '#e2e8f0',
            maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
          }}>
            {projectName || initialPrompt?.slice(0, 50) || 'New Project'}
          </span>
          <Glass3DStatusBadge status={badgeStatus} label={badgeLabel} />
        </div>

        {/* Center: Tab Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {(['preview', 'code'] as ActiveTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                background: activeTab === tab ? 'rgba(245,158,11,0.12)' : 'transparent',
                border: activeTab === tab ? '1px solid rgba(245,158,11,0.25)' : '1px solid transparent',
                color: activeTab === tab ? '#fbbf24' : 'rgba(200,200,210,0.6)',
                cursor: 'pointer', transition: 'all 0.15s ease',
              }}
            >
              {tab === 'preview' ? <EyeIcon size={13} /> : <CodeIcon size={13} />}
              {tab === 'preview' ? 'Preview' : 'Code'}
            </button>
          ))}
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isBuilding && <AnimatedStopButton onClick={handleStop} size="sm" />}
          <Glass3DButton
            variant={isPublished ? 'amber' : 'default'}
            size="sm"
            onClick={() => setShowPublish(!showPublish)}
          >
            <GlobeIcon size={12} />
            {isPublished ? 'Published' : 'Publish'}
          </Glass3DButton>
          <button
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
              color: 'rgba(200,200,210,0.7)', cursor: 'pointer',
            }}
            title="Settings"
          >
            <SettingsIcon size={14} />
          </button>
        </div>
      </div>

      {/* MAIN PANELS */}
      <PanelGroup direction="horizontal" style={{ flex: 1, position: 'relative', zIndex: 1 }}>
        {/* Left: Chat / Agent Stream */}
        <Panel defaultSize={25} minSize={18} maxSize={40}>
          <div style={{
            height: '100%', margin: 5, display: 'flex', flexDirection: 'column',
            borderRadius: 14, overflow: 'hidden', position: 'relative',
            background: 'linear-gradient(165deg, rgba(15,14,23,0.95) 0%, rgba(26,26,46,0.9) 55%, rgba(22,33,62,0.85) 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
            backdropFilter: 'blur(20px)',
          }}>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {isIdle ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, height: '100%' }}>
                  <div style={{ textAlign: 'center', maxWidth: 280 }}>
                    <AnimatedLogo size={40} isActive={false} showStatus={false} />
                    <div style={{ height: 16 }} />
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 8, fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                      What do you want to build?
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.7)', lineHeight: 1.7 }}>
                      Describe your app below. Our agents will reason about architecture, research APIs, and build it intelligently.
                    </div>
                  </div>
                </div>
              ) : (
                <AgentStreamView events={events} projectId={projectId!} oauthCatalog={oauthCatalog} onAnswer={handleAnswer} />
              )}
            </div>
            {isIdle && (speculation || isAnalyzing) && <SpeculativePlan speculation={speculation} isAnalyzing={isAnalyzing} />}

            {/* Input Area */}
            <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && canSubmit && handleSubmit()}
                    placeholder=""
                    disabled={isComplete}
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 12,
                      padding: '12px 16px',
                      fontSize: 12,
                      color: '#e2e8f0',
                      outline: 'none',
                      fontFamily: "'Space Grotesk', system-ui, sans-serif",
                      opacity: isComplete ? 0.3 : 1,
                      transition: 'border-color 0.2s ease',
                    }}
                  />
                  {isIdle && (
                    <AnimatedPlaceholder isInputFocused={isInputFocused} hasValue={!!userInput} />
                  )}
                </div>
                <Glass3DButton variant="amber" size="sm" onClick={handleSubmit} disabled={!canSubmit}>
                  <SendIcon size={13} />
                </Glass3DButton>
              </div>
            </div>
          </div>
        </Panel>

        <PanelResizeHandle style={{ width: 3, cursor: 'col-resize', background: 'rgba(255,255,255,0.03)' }} />

        {/* Right: Preview / Code */}
        <Panel defaultSize={75} minSize={50}>
          <div style={{
            height: '100%', margin: 5,
            borderRadius: 14, overflow: 'hidden', position: 'relative',
            background: 'linear-gradient(165deg, rgba(15,14,23,0.9) 0%, rgba(22,26,46,0.85) 55%, rgba(18,30,55,0.8) 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
            backdropFilter: 'blur(20px)',
          }}>
            {activeTab === 'preview' ? (
              previewUrl ? (
                <iframe src={previewUrl} style={{ width: '100%', height: '100%', border: 0, borderRadius: 14 }} title="App Preview" sandbox="allow-scripts allow-forms allow-popups" />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    {isBuilding ? (
                      <>
                        <AnimatedLogo size={32} isActive={true} status="building" showStatus={true} />
                        <div style={{ color: 'rgba(148,163,184,0.6)', fontSize: 13, marginTop: 12 }}>
                          Preview will appear when the dev server starts...
                        </div>
                      </>
                    ) : isComplete ? (
                      <div style={{ color: 'rgba(52,211,153,0.8)', fontSize: 14, fontWeight: 600 }}>Build complete</div>
                    ) : (
                      <>
                        <EyeIcon size={28} style={{ color: 'rgba(100,116,139,0.4)' }} />
                        <div style={{ color: 'rgba(148,163,184,0.5)', fontSize: 13, marginTop: 8 }}>
                          Live preview appears here during build
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            ) : (
              /* Code Tab — File Explorer + Monaco Editor side by side */
              <Suspense fallback={
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LoadingIcon size={20} style={{ color: 'rgba(245,158,11,0.4)' }} />
                </div>
              }>
                <PanelGroup direction="horizontal" style={{ height: '100%' }}>
                  <Panel defaultSize={22} minSize={15} maxSize={35}>
                    <ProjectFileExplorer />
                  </Panel>
                  <PanelResizeHandle style={{ width: 2, cursor: 'col-resize', background: 'rgba(255,255,255,0.03)' }} />
                  <Panel defaultSize={78}>
                    <CodeEditor />
                  </Panel>
                </PanelGroup>
              </Suspense>
            )}
          </div>
        </Panel>
      </PanelGroup>

      {/* FLOATING SOFT INTERRUPT — allows mid-build agent communication */}
      <AnimatePresence>
        {isBuilding && projectId && (
          <Suspense fallback={null}>
            <FloatingSoftInterrupt
              sessionId={projectId}
              isAgentRunning={isBuilding}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* PUBLISH PANEL */}
      {showPublish && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '64px 16px 16px' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setShowPublish(false)} />
          <motion.div
            ref={publishRef}
            initial={{ x: 30, opacity: 0, scale: 0.96 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
          >
            <div style={{
              width: 380, borderRadius: 16, overflow: 'hidden',
              background: 'linear-gradient(165deg, rgba(15,14,23,0.97) 0%, rgba(26,26,46,0.95) 55%, rgba(22,33,62,0.9) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)',
              backdropFilter: 'blur(24px)',
            }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                  <GlobeIcon size={14} /> Publish App
                </span>
                <button onClick={() => setShowPublish(false)} style={{ color: 'rgba(200,200,210,0.5)', cursor: 'pointer', background: 'none', border: 'none' }}>
                  <CloseIcon size={13} />
                </button>
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {isPublished && publishedUrl && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: 10 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px rgba(52,211,153,0.4)' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#34d399' }}>Live</span>
                    <a href={publishedUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#fbbf24', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                      {publishedUrl.replace('https://', '')} <ExternalLinkIcon size={10} />
                    </a>
                  </div>
                )}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(148,163,184,0.6)', marginBottom: 6, display: 'block' }}>App URL</label>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'hidden' }}>
                    <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', padding: '9px 10px', background: 'rgba(255,255,255,0.02)', borderRight: '1px solid rgba(255,255,255,0.05)', whiteSpace: 'nowrap', userSelect: 'none' }}>https://</span>
                    <input value={publishSlug} onChange={(e) => setPublishSlug(Array.from(e.target.value.toLowerCase()).filter(c => slugAllowed.includes(c)).join(''))} placeholder="my-app"
                      style={{ flex: 1, background: 'transparent', border: 'none', padding: '9px 8px', fontSize: 13, color: '#e2e8f0', outline: 'none', minWidth: 0, fontFamily: 'inherit' }} />
                    <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', padding: '9px 10px', background: 'rgba(255,255,255,0.02)', borderLeft: '1px solid rgba(255,255,255,0.05)', whiteSpace: 'nowrap', userSelect: 'none' }}>.kriptik.app</span>
                  </div>
                  <div style={{ height: 16, marginTop: 4, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {slugStatus === 'checking' && <span style={{ color: 'rgba(148,163,184,0.5)' }}><LoadingIcon size={10} /> Checking...</span>}
                    {slugStatus === 'available' && <span style={{ color: '#34d399' }}><CheckIcon size={10} /> Available</span>}
                    {slugStatus === 'taken' && <span style={{ color: '#f87171' }}>Already taken</span>}
                    {slugStatus === 'invalid' && <span style={{ color: '#f87171' }}>Invalid</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {isPublished ? (
                    <>
                      <Glass3DButton variant="amber" size="md" onClick={handlePublish} disabled={isPublishing || (slugStatus !== 'available' && slugStatus !== 'idle')}>
                        {isPublishing ? 'Updating...' : 'Update'}
                      </Glass3DButton>
                      <Glass3DButton variant="default" size="md" onClick={handleUnpublish}>Unpublish</Glass3DButton>
                    </>
                  ) : (
                    <Glass3DButton variant="primary" size="lg" onClick={handlePublish} disabled={isPublishing || slugStatus === 'taken' || slugStatus === 'invalid'}>
                      {isPublishing ? 'Publishing...' : 'Publish to kriptik.app'}
                    </Glass3DButton>
                  )}
                </div>
                <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', lineHeight: 1.5 }}>Your app will be live at this URL. Changing the URL replaces the old one.</p>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* DEVELOPER TOOLBAR — floating over preview */}
      <FloatingDevToolbar />
    </div>
  );
}
