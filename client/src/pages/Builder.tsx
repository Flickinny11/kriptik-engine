/**
 * Builder Page — Primary AI development environment
 *
 * Layout: Chat (left ~25%) | Preview/Code (right ~75%)
 * Header: Logo + project name | View tabs (Preview/Code) | Publish + Settings
 *
 * Streams agent events via SSE from the Brain-driven engine.
 * No mechanical patterns — agents emit events, UI renders them.
 */

import { useState, useEffect } from 'react';
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
import { AgentStreamView } from '@/components/builder/AgentStreamView';
import { SpeculativePlan } from '@/components/builder/SpeculativePlan';

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

  // Publish state
  const [showPublish, setShowPublish] = useState(false);
  const [publishSlug, setPublishSlug] = useState('');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Speculative AI analysis while typing
  const { speculation, isAnalyzing } = useSpeculation(
    projectStatus === 'idle' ? userInput : '',
    projectId || null,
  );

  // Fetch OAuth catalog
  useEffect(() => {
    apiClient.getOAuthCatalog().then(r => setOauthCatalog(r.providers)).catch(() => {});
  }, []);

  // Load publish state
  useEffect(() => {
    if (!projectId) return;
    apiClient.getProject(projectId).then(({ project }) => {
      if (project.appSlug) setPublishSlug(project.appSlug);
      if (project.isPublished) {
        setIsPublished(true);
        setPublishedUrl(`https://${project.appSlug}.kriptik.app`);
      }
    }).catch(() => {});
  }, [projectId]);

  // Slug availability check
  useEffect(() => {
    if (!publishSlug || publishSlug.length < 3) { setSlugStatus('idle'); return; }
    setSlugStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const result = await apiClient.checkSlug(publishSlug);
        setSlugStatus(result.available ? 'available' : 'taken');
      } catch { setSlugStatus('invalid'); }
    }, 500);
    return () => clearTimeout(timer);
  }, [publishSlug]);

  // SSE
  const { events, isConnected, isComplete, disconnect } = useEngineEvents(
    sseReady ? projectId! : null
  );

  // Mount: handle Flow A (with prompt) and Flow B (no prompt)
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

  // Watch events for dev server URL and completion
  useEffect(() => {
    for (const event of events) {
      if (event.type === 'agent_tool_result' && event.data.toolName === 'start_dev_server') {
        const url = (event.data.result as any)?.url;
        if (url) setPreviewUrl(url);
      }
      if (event.type === 'build_complete') setProjectStatus('complete');
    }
  }, [events]);

  // Input handlers
  async function handleSubmit() {
    if (!userInput.trim() || !projectId) return;
    if (projectStatus === 'idle') {
      try {
        await apiClient.startBuild(projectId, userInput.trim());
        setProjectStatus('building'); updateProjectStatus(projectId, 'building'); setSseReady(true); setUserInput('');
      } catch (err) { console.error('Failed to start build:', err); }
    } else if (projectStatus === 'building') {
      try { await apiClient.sendDirective(projectId, userInput.trim()); setUserInput(''); }
      catch (err) { console.error('Failed to send directive:', err); }
    }
  }

  async function handleStop() {
    if (!projectId) return;
    try { await apiClient.stopBuild(projectId); disconnect(); setProjectStatus('idle'); updateProjectStatus(projectId, 'idle'); }
    catch (err) { console.error('Failed to stop build:', err); }
  }

  async function handlePublish() {
    if (!projectId) return;
    setIsPublishing(true);
    try {
      if (publishSlug && slugStatus === 'available') await apiClient.setSlug(projectId, publishSlug);
      const result = await apiClient.publishProject(projectId);
      setPublishedUrl(result.url); setPublishSlug(result.slug); setIsPublished(true);
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
    catch (err) { console.error('Failed to send answer:', err); }
  }

  const isBuilding = projectStatus === 'building' && !isComplete;
  const realEvents = events.filter(e => e.type !== 'connected' && e.type !== 'replay_complete');
  const isIdle = projectStatus === 'idle' && realEvents.length === 0;
  const canSubmit = userInput.trim() && (isBuilding || isIdle);

  // ─── RENDER ────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col" style={{ background: 'linear-gradient(180deg, #0a0a0a 0%, #111111 50%, #0d0d0d 100%)' }}>

      {/* ═══ HEADER ═══ */}
      <header
        className="h-14 px-4 flex items-center justify-between shrink-0 z-10"
        style={{
          background: 'linear-gradient(145deg, rgba(20,20,25,0.98) 0%, rgba(15,15,20,0.99) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 4px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {/* Left: nav + project name */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-zinc-500 hover:text-white transition-colors">
            <ArrowLeftIcon size={18} />
          </button>
          <div className="w-px h-6 bg-white/10" />
          <span className="text-sm font-semibold text-white truncate max-w-[240px]">
            {projectName || initialPrompt?.slice(0, 50) || 'New Project'}
          </span>
          {isBuilding && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              Building
            </span>
          )}
          {isComplete && <span className="text-xs text-emerald-400 font-medium">Complete</span>}
        </div>

        {/* Center: view tabs */}
        <div className="flex items-center gap-1">
          {(['preview', 'code'] as ActiveTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === tab
                  ? 'bg-amber-500/15 text-amber-200 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab === 'preview' ? <EyeIcon size={14} /> : <CodeIcon size={14} />}
              {tab === 'preview' ? 'Preview' : 'Code'}
            </button>
          ))}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {isBuilding && (
            <button onClick={handleStop} className="text-zinc-500 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10" title="Stop build">
              <SquareIcon size={15} />
            </button>
          )}
          <button
            onClick={() => setShowPublish(!showPublish)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              isPublished
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                : 'bg-white/5 text-zinc-300 border border-white/10 hover:bg-white/10 hover:text-white'
            }`}
          >
            <GlobeIcon size={13} />
            {isPublished ? 'Published' : 'Publish'}
          </button>
          <button className="text-zinc-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5" title="Settings">
            <SettingsIcon size={16} />
          </button>
        </div>
      </header>

      {/* ═══ MAIN CONTENT ═══ */}
      <PanelGroup direction="horizontal" className="flex-1">

        {/* ─── LEFT: STREAMING CHAT (25%) ─── */}
        <Panel defaultSize={25} minSize={18} maxSize={40}>
          <div className="h-full flex flex-col m-1.5 rounded-2xl overflow-hidden" style={{
            background: 'linear-gradient(145deg, rgba(18,18,22,0.95) 0%, rgba(14,14,18,0.98) 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
          }}>
            {/* Chat content */}
            <div className="flex-1 overflow-y-auto">
              {isIdle ? (
                <div className="flex-1 flex items-center justify-center p-6 h-full">
                  <div className="text-center max-w-xs">
                    <SparklesIcon size={28} className="text-amber-500/40 mx-auto mb-3" />
                    <h3 className="text-base font-semibold text-white mb-1.5">What do you want to build?</h3>
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      Describe your app below. The agents will reason about architecture, research APIs, and build it.
                    </p>
                  </div>
                </div>
              ) : (
                <AgentStreamView events={events} projectId={projectId!} oauthCatalog={oauthCatalog} onAnswer={handleAnswer} />
              )}
            </div>

            {/* Speculative plan */}
            {isIdle && (speculation || isAnalyzing) && (
              <SpeculativePlan speculation={speculation} isAnalyzing={isAnalyzing} />
            )}

            {/* Input */}
            <div className="p-3 border-t border-white/5">
              <div className="flex gap-2">
                <input
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && canSubmit && handleSubmit()}
                  placeholder={isIdle ? 'Describe your app...' : isBuilding ? 'Send a directive...' : 'Build complete'}
                  disabled={isComplete}
                  className="flex-1 bg-white/5 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/30 focus:ring-1 focus:ring-amber-500/10 disabled:opacity-40 transition-all"
                />
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="bg-amber-500/15 text-amber-300 px-3 py-2.5 rounded-xl hover:bg-amber-500/25 disabled:opacity-20 transition-all border border-amber-500/20"
                >
                  <SendIcon size={15} />
                </button>
              </div>
            </div>
          </div>
        </Panel>

        {/* Resize handle */}
        <PanelResizeHandle className="w-[3px] hover:bg-amber-500/30 transition-colors" />

        {/* ─── RIGHT: PREVIEW / CODE (75%) ─── */}
        <Panel defaultSize={75} minSize={50}>
          <div className="h-full m-1.5 rounded-2xl overflow-hidden" style={{
            background: 'linear-gradient(145deg, rgba(18,18,22,0.95) 0%, rgba(14,14,18,0.98) 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
          }}>
            {activeTab === 'preview' ? (
              /* Live Preview */
              previewUrl ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-full border-0"
                  title="App Preview"
                  sandbox="allow-scripts allow-forms allow-popups"
                />
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-zinc-600 text-sm mb-2">
                      {isBuilding ? 'Preview will appear when the dev server starts...' :
                       isComplete ? 'Build complete — preview available' :
                       'Live preview appears here during build'}
                    </div>
                    {isBuilding && <LoadingIcon size={20} className="animate-spin text-amber-500/40 mx-auto" />}
                  </div>
                </div>
              )
            ) : (
              /* Code Editor placeholder — will be replaced with Monaco */
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <CodeIcon size={32} className="text-zinc-700 mx-auto mb-3" />
                  <div className="text-zinc-500 text-sm">Code editor will show generated files here</div>
                  <div className="text-zinc-700 text-xs mt-1">Files are written to the project sandbox in real-time</div>
                </div>
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>

      {/* ═══ PUBLISH DIALOG ═══ */}
      <AnimatePresence>
        {showPublish && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-end p-4 pt-16"
          >
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowPublish(false)} />
            <motion.div
              initial={{ opacity: 0, x: 20, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.97 }}
              className="relative w-96 rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(145deg, rgba(22,22,28,0.98) 0%, rgba(16,16,20,0.99) 100%)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.3)',
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/5">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <GlobeIcon size={15} /> Publish App
                </h3>
                <button onClick={() => setShowPublish(false)} className="text-zinc-600 hover:text-white transition-colors">
                  <CloseIcon size={15} />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {isPublished && publishedUrl && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckIcon size={13} className="text-emerald-400" />
                      <span className="text-xs font-medium text-emerald-400">Live</span>
                    </div>
                    <a href={publishedUrl} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-amber-300 hover:underline flex items-center gap-1">
                      {publishedUrl.replace('https://', '')} <ExternalLinkIcon size={11} />
                    </a>
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-1.5 block">App URL</label>
                  <div className="flex items-center bg-black/30 border border-white/8 rounded-xl overflow-hidden focus-within:border-amber-500/30">
                    <span className="text-xs text-zinc-600 px-3 py-2.5 bg-white/3 border-r border-white/8 select-none">https://</span>
                    <input
                      value={publishSlug}
                      onChange={(e) => setPublishSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="my-app"
                      className="flex-1 bg-transparent px-2 py-2.5 text-sm text-white placeholder:text-zinc-700 focus:outline-none min-w-0"
                    />
                    <span className="text-xs text-zinc-600 px-3 py-2.5 bg-white/3 border-l border-white/8 select-none">.kriptik.app</span>
                  </div>
                  <div className="mt-1.5 h-4">
                    {slugStatus === 'checking' && <span className="text-xs text-zinc-500 flex items-center gap-1"><LoadingIcon size={10} className="animate-spin" /> Checking...</span>}
                    {slugStatus === 'available' && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckIcon size={10} /> Available</span>}
                    {slugStatus === 'taken' && <span className="text-xs text-red-400">Already taken</span>}
                    {slugStatus === 'invalid' && <span className="text-xs text-red-400">Invalid</span>}
                  </div>
                </div>

                <div className="flex gap-2">
                  {isPublished ? (
                    <>
                      <button onClick={handlePublish} disabled={isPublishing || (slugStatus !== 'available' && slugStatus !== 'idle')}
                        className="flex-1 bg-amber-500/15 text-amber-300 text-sm font-medium py-2.5 rounded-xl hover:bg-amber-500/25 disabled:opacity-30 transition-all border border-amber-500/20">
                        {isPublishing ? 'Updating...' : 'Update'}
                      </button>
                      <button onClick={handleUnpublish}
                        className="px-4 text-red-400 text-sm font-medium py-2.5 rounded-xl hover:bg-red-500/10 transition-all">
                        Unpublish
                      </button>
                    </>
                  ) : (
                    <button onClick={handlePublish} disabled={isPublishing || slugStatus === 'taken' || slugStatus === 'invalid'}
                      className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-black text-sm font-semibold py-2.5 rounded-xl hover:from-amber-400 hover:to-orange-400 disabled:opacity-30 transition-all">
                      {isPublishing ? 'Publishing...' : 'Publish to kriptik.app'}
                    </button>
                  )}
                </div>

                <p className="text-xs text-zinc-600 leading-relaxed">
                  Your app will be accessible at the URL above. Changing the URL replaces the old one.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
