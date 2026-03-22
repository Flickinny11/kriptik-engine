/**
 * Builder Page — Premium AI Development Environment
 *
 * Layout: Streaming chat (left ~25%, resizable) | Preview/Code (right ~75%)
 * Header: Glass header with logo + project name | Preview/Code tabs | Publish + Settings
 *
 * Visual: Premium liquid glass design system migrated from old KripTik app.
 * Matches Dashboard's frosted glass panels, warm gradients, Framer Motion animations.
 *
 * AgentStreamView is LAZY imported because it pulls in Three.js + OGL
 * through BrainOrb/BrainConnector/WarpBackground. These heavy modules
 * must not block initial Builder render.
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeftIcon, SendIcon, SquareIcon, LoadingIcon, SparklesIcon,
  GlobeIcon, CheckIcon, CloseIcon, ExternalLinkIcon,
  CodeIcon, EyeIcon, SettingsIcon,
} from '@/components/ui/icons';
import { useEngineEvents } from '@/hooks/useEngineEvents';
import { useSpeculation } from '@/hooks/useSpeculation';
import { apiClient, type OAuthCatalogEntry } from '@/lib/api-client';
import { useProjectStore } from '@/store/useProjectStore';
import { SpeculativePlan } from '@/components/builder/SpeculativePlan';
import { AgentStreamView } from '@/components/builder/AgentStreamView';
import { AccountSlideOut } from '@/components/account/AccountSlideOut';
import { FloatingDevToolbar } from '@/components/developer-bar';
import { KriptikLogo } from '@/components/ui/KriptikLogo';
import '@/styles/realistic-glass.css';

type ActiveTab = 'preview' | 'code';

export default function Builder() {
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const initialPrompt = (location.state as any)?.initialPrompt as string | undefined;

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
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
        background: 'linear-gradient(145deg, #e8e4df 0%, #d8d4cf 50%, #ccc8c3 100%)',
      }}
    >
      <AccountSlideOut />

      {/* GLASS HEADER */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        style={{
          height: 56,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          zIndex: 10,
          position: 'relative',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.45) 100%)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(0,0,0,0.04), inset 0 1px 1px rgba(255,255,255,0.9)',
        }}
      >
        {/* Bottom edge — glass thickness */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(200,200,205,0.4), transparent)', transform: 'translateY(100%)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => navigate('/dashboard')}
            className="glass-button"
            style={{ padding: '6px 8px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowLeftIcon size={14} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <KriptikLogo size="sm" />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {projectName || initialPrompt?.slice(0, 50) || 'New Project'}
            </span>
          </div>
          {isBuilding && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#16a34a' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', boxShadow: '0 0 8px rgba(22,163,74,0.5)', animation: 'glass-glow-pulse 2s ease-in-out infinite' }} />
              Building
            </span>
          )}
          {isComplete && <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a' }}>Complete</span>}
        </div>

        {/* Tab toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,0,0,0.04)', borderRadius: 10, padding: 2 }}>
          {(['preview', 'code'] as ActiveTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.23, 1, 0.32, 1)',
                background: activeTab === tab
                  ? 'linear-gradient(145deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.7) 100%)'
                  : 'transparent',
                color: activeTab === tab ? '#1a1a1a' : '#666',
                boxShadow: activeTab === tab
                  ? '0 2px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)'
                  : 'none',
              }}
            >
              {tab === 'preview' ? <EyeIcon size={12} /> : <CodeIcon size={12} />}
              {tab === 'preview' ? 'Preview' : 'Code'}
            </button>
          ))}
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isBuilding && (
            <button
              onClick={handleStop}
              title="Stop build"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                background: 'rgba(220, 38, 38, 0.1)',
                color: '#dc2626',
                transition: 'all 0.2s',
              }}
            >
              <SquareIcon size={11} /> Stop
            </button>
          )}
          <button
            className="glass-button"
            onClick={() => setShowPublish(!showPublish)}
            style={{
              padding: '6px 12px',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              color: isPublished ? '#16a34a' : '#1a1a1a',
            }}
          >
            <GlobeIcon size={12} />
            {isPublished ? 'Published' : 'Publish'}
          </button>
          <button
            className="glass-button"
            style={{ padding: 6, borderRadius: 10 }}
            title="Settings"
          >
            <SettingsIcon size={14} />
          </button>
        </div>
      </motion.header>

      {/* MAIN PANELS */}
      <PanelGroup direction="horizontal" style={{ flex: 1, position: 'relative', zIndex: 1, padding: 8 }}>
        {/* Chat panel — agent streaming */}
        <Panel defaultSize={25} minSize={18} maxSize={40}>
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 20,
              overflow: 'hidden',
              background: 'linear-gradient(145deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.35) 50%, rgba(248,248,250,0.4) 100%)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -1px 1px rgba(0,0,0,0.02), 0 0 0 1px rgba(255,255,255,0.5)',
            }}
          >
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {isIdle ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, height: '100%' }}>
                  <div style={{ textAlign: 'center', maxWidth: 260 }}>
                    <SparklesIcon size={28} style={{ color: '#c25a00', opacity: 0.4, marginBottom: 12 }} />
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>What do you want to build?</div>
                    <div style={{ fontSize: 12, color: '#666', lineHeight: 1.7 }}>Describe your app below. The agents will reason about architecture, research APIs, and build it.</div>
                  </div>
                </div>
              ) : (
                <AgentStreamView events={events} projectId={projectId!} oauthCatalog={oauthCatalog} onAnswer={handleAnswer} />
              )}
            </div>

            {isIdle && (speculation || isAnalyzing) && <SpeculativePlan speculation={speculation} isAnalyzing={isAnalyzing} />}

            {/* Input bar */}
            <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && canSubmit && handleSubmit()}
                  placeholder={isIdle ? 'Describe your app...' : isBuilding ? 'Send a directive...' : 'Build complete'}
                  disabled={isComplete}
                  style={{
                    flex: 1,
                    background: 'rgba(0,0,0,0.04)',
                    border: '1px solid rgba(0,0,0,0.06)',
                    borderRadius: 12,
                    padding: '10px 14px',
                    fontSize: 13,
                    color: '#1a1a1a',
                    outline: 'none',
                    fontFamily: 'inherit',
                    opacity: isComplete ? 0.3 : 1,
                  }}
                />
                <button
                  className="glass-button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 12,
                    opacity: canSubmit ? 1 : 0.3,
                    cursor: canSubmit ? 'pointer' : 'default',
                    background: canSubmit
                      ? 'linear-gradient(135deg, #c25a00 0%, #a04800 100%)'
                      : undefined,
                    color: canSubmit ? '#fff' : '#1a1a1a',
                    boxShadow: canSubmit ? '0 4px 16px rgba(194, 90, 0, 0.3)' : undefined,
                  }}
                >
                  <SendIcon size={13} />
                </button>
              </div>
            </div>
          </div>
        </Panel>

        <PanelResizeHandle
          style={{
            width: 6,
            cursor: 'col-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: 3, height: 40, borderRadius: 3, background: 'rgba(0,0,0,0.08)', transition: 'background 0.2s' }} />
        </PanelResizeHandle>

        {/* Preview / Code panel */}
        <Panel defaultSize={75} minSize={50}>
          <div
            style={{
              height: '100%',
              borderRadius: 20,
              overflow: 'hidden',
              position: 'relative',
              background: 'linear-gradient(145deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.35) 50%, rgba(248,248,250,0.4) 100%)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -1px 1px rgba(0,0,0,0.02), 0 0 0 1px rgba(255,255,255,0.5)',
            }}
          >
            {activeTab === 'preview' ? (
              previewUrl ? (
                <iframe
                  src={previewUrl}
                  style={{ width: '100%', height: '100%', border: 0, borderRadius: 20 }}
                  title="App Preview"
                  sandbox="allow-scripts allow-forms allow-popups"
                />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    {isBuilding ? (
                      <>
                        <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        <div style={{ color: '#666', fontSize: 13 }}>Preview will appear when the dev server starts...</div>
                      </>
                    ) : isComplete ? (
                      <>
                        <CheckIcon size={24} style={{ color: '#16a34a', marginBottom: 8 }} />
                        <div style={{ color: '#1a1a1a', fontSize: 14, fontWeight: 600 }}>Build complete</div>
                      </>
                    ) : (
                      <>
                        <EyeIcon size={28} style={{ color: '#999', marginBottom: 8 }} />
                        <div style={{ color: '#666', fontSize: 13 }}>Live preview appears here during build</div>
                      </>
                    )}
                  </div>
                </div>
              )
            ) : (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <CodeIcon size={28} style={{ color: '#999' }} />
                <div style={{ color: '#666', fontSize: 13, fontWeight: 500 }}>Code editor — generated files appear here</div>
                <div style={{ color: '#999', fontSize: 11 }}>Files are written to the sandbox in real-time</div>
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>

      {/* PUBLISH PANEL */}
      <AnimatePresence>
        {showPublish && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPublish(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.15)' }}
            />
            <motion.div
              initial={{ opacity: 0, x: 20, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.98 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              style={{
                position: 'fixed',
                top: 72,
                right: 16,
                width: 380,
                zIndex: 51,
                borderRadius: 24,
                overflow: 'hidden',
                background: 'linear-gradient(145deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.55) 50%, rgba(248,248,250,0.6) 100%)',
                backdropFilter: 'blur(40px) saturate(200%)',
                WebkitBackdropFilter: 'blur(40px) saturate(200%)',
                boxShadow: '0 30px 80px rgba(0,0,0,0.12), 0 15px 40px rgba(0,0,0,0.08), inset 0 2px 4px rgba(255,255,255,0.9), inset 0 -1px 2px rgba(0,0,0,0.02), 0 0 0 1px rgba(255,255,255,0.5)',
              }}
            >
              {/* Top highlight */}
              <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }} />

              <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <GlobeIcon size={14} /> Publish App
                </span>
                <button
                  onClick={() => setShowPublish(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#666' }}
                >
                  <CloseIcon size={14} />
                </button>
              </div>

              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {isPublished && publishedUrl && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                    background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.15)', borderRadius: 12,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', boxShadow: '0 0 6px rgba(22,163,74,0.4)' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a' }}>Live</span>
                    <a href={publishedUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#c25a00', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none', fontWeight: 500 }}>
                      {publishedUrl.replace('https://', '')} <ExternalLinkIcon size={10} />
                    </a>
                  </div>
                )}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: '#666', marginBottom: 6, display: 'block' }}>App URL</label>
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: 12, overflow: 'hidden',
                  }}>
                    <span style={{ fontSize: 11, color: '#999', padding: '9px 10px', background: 'rgba(0,0,0,0.02)', borderRight: '1px solid rgba(0,0,0,0.06)', whiteSpace: 'nowrap', userSelect: 'none' }}>https://</span>
                    <input
                      value={publishSlug}
                      onChange={(e) => setPublishSlug(Array.from(e.target.value.toLowerCase()).filter(c => slugAllowed.includes(c)).join(''))}
                      placeholder="my-app"
                      style={{ flex: 1, background: 'transparent', border: 'none', padding: '9px 8px', fontSize: 13, color: '#1a1a1a', outline: 'none', minWidth: 0, fontFamily: 'inherit' }}
                    />
                    <span style={{ fontSize: 11, color: '#999', padding: '9px 10px', background: 'rgba(0,0,0,0.02)', borderLeft: '1px solid rgba(0,0,0,0.06)', whiteSpace: 'nowrap', userSelect: 'none' }}>.kriptik.app</span>
                  </div>
                  <div style={{ height: 16, marginTop: 4, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {slugStatus === 'checking' && <span style={{ color: '#999' }}><LoadingIcon size={10} /> Checking...</span>}
                    {slugStatus === 'available' && <span style={{ color: '#16a34a' }}><CheckIcon size={10} /> Available</span>}
                    {slugStatus === 'taken' && <span style={{ color: '#dc2626' }}>Already taken</span>}
                    {slugStatus === 'invalid' && <span style={{ color: '#dc2626' }}>Invalid</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {isPublished ? (
                    <>
                      <button
                        className="glass-button"
                        onClick={handlePublish}
                        disabled={isPublishing || (slugStatus !== 'available' && slugStatus !== 'idle')}
                        style={{
                          flex: 1,
                          padding: '10px 20px',
                          borderRadius: 12,
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#1a1a1a',
                          opacity: (isPublishing || (slugStatus !== 'available' && slugStatus !== 'idle')) ? 0.4 : 1,
                        }}
                      >
                        {isPublishing ? 'Updating...' : 'Update'}
                      </button>
                      <button
                        onClick={handleUnpublish}
                        style={{
                          padding: '10px 16px',
                          borderRadius: 12,
                          fontSize: 13,
                          fontWeight: 600,
                          border: 'none',
                          cursor: 'pointer',
                          background: 'rgba(220, 38, 38, 0.08)',
                          color: '#dc2626',
                        }}
                      >
                        Unpublish
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handlePublish}
                      disabled={isPublishing || slugStatus === 'taken' || slugStatus === 'invalid'}
                      style={{
                        width: '100%',
                        padding: '12px 20px',
                        borderRadius: 12,
                        fontSize: 13,
                        fontWeight: 600,
                        border: 'none',
                        cursor: (isPublishing || slugStatus === 'taken' || slugStatus === 'invalid') ? 'default' : 'pointer',
                        background: 'linear-gradient(135deg, #c25a00 0%, #a04800 100%)',
                        color: '#fff',
                        boxShadow: '0 4px 16px rgba(194, 90, 0, 0.3), inset 0 1px 2px rgba(255,255,255,0.2)',
                        opacity: (isPublishing || slugStatus === 'taken' || slugStatus === 'invalid') ? 0.4 : 1,
                        transition: 'all 0.3s cubic-bezier(0.23, 1, 0.32, 1)',
                      }}
                    >
                      {isPublishing ? 'Publishing...' : 'Publish to kriptik.app'}
                    </button>
                  )}
                </div>
                <p style={{ fontSize: 11, color: '#999', lineHeight: 1.5 }}>
                  Your app will be live at this URL. Changing the URL replaces the old one.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* DEVELOPER TOOLBAR — floating over preview, 2 buttons: Feature Agents + Open Source Studio */}
      <FloatingDevToolbar />
    </div>
  );
}
