import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { ArrowLeftIcon, SendIcon, SquareIcon, LoadingIcon, SparklesIcon, GlobeIcon, CheckIcon, CloseIcon, ExternalLinkIcon } from '@/components/ui/icons';
import { useEngineEvents } from '@/hooks/useEngineEvents';
import { apiClient, type OAuthCatalogEntry } from '@/lib/api-client';
import { useProjectStore } from '@/store/useProjectStore';
import { AgentStreamView } from '@/components/builder/AgentStreamView';
import { useSpeculation } from '@/hooks/useSpeculation';
import { SpeculativePlan } from '@/components/builder/SpeculativePlan';

type BuildMode = 'plan' | 'iterate' | 'chat';

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
  const [mode, setMode] = useState<BuildMode>('plan');
  const [showPublish, setShowPublish] = useState(false);
  const [publishSlug, setPublishSlug] = useState('');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const { updateProjectStatus } = useProjectStore();

  // Speculative AI analysis — runs while user types (debounced, real AI inference)
  const { speculation, isAnalyzing } = useSpeculation(
    projectStatus === 'idle' ? userInput : '',  // Only speculate when idle (not building)
    projectId || null,
  );

  // Fetch OAuth catalog once on mount
  useEffect(() => {
    apiClient.getOAuthCatalog().then(r => setOauthCatalog(r.providers)).catch(() => {});
  }, []);

  // Load publish state when project loads
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

  // Debounced slug availability check
  useEffect(() => {
    if (!publishSlug || publishSlug.length < 3) {
      setSlugStatus('idle');
      return;
    }
    setSlugStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const result = await apiClient.checkSlug(publishSlug);
        setSlugStatus(result.available ? 'available' : 'taken');
      } catch {
        setSlugStatus('invalid');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [publishSlug]);

  async function handlePublish() {
    if (!projectId) return;
    setIsPublishing(true);
    try {
      // Set slug first if custom
      if (publishSlug && slugStatus === 'available') {
        await apiClient.setSlug(projectId, publishSlug);
      }
      const result = await apiClient.publishProject(projectId);
      setPublishedUrl(result.url);
      setPublishSlug(result.slug);
      setIsPublished(true);
    } catch (err) {
      console.error('Publish failed:', err);
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleUnpublish() {
    if (!projectId) return;
    try {
      await apiClient.unpublishProject(projectId);
      setIsPublished(false);
      setPublishedUrl(null);
    } catch (err) {
      console.error('Unpublish failed:', err);
    }
  }

  // SSE connects when sseReady is true
  const { events, isConnected, isComplete, disconnect } = useEngineEvents(
    sseReady ? projectId! : null
  );

  // On mount: handle both Flow A (initialPrompt) and Flow B (no prompt, user enters in chat)
  useEffect(() => {
    if (!projectId) return;

    if (initialPrompt) {
      // Flow A: Dashboard NLP → Generate → auto-start build
      apiClient.startBuild(projectId, initialPrompt)
        .then(() => {
          setProjectStatus('building');
          updateProjectStatus(projectId, 'building');
          setSseReady(true);
        })
        .catch(err => {
          console.error('Failed to start build:', err);
          setProjectStatus('failed');
        });
    } else {
      // Flow B: "Create New Project" wizard or returning to existing project
      // Load project info, connect SSE for replay if there's history
      apiClient.getProject(projectId)
        .then(({ project }) => {
          setProjectStatus(project.status);
          setProjectName(project.name);
          // Connect SSE — replays history if any, streams live if building
          setSseReady(true);
        })
        .catch(err => {
          console.error('Failed to load project:', err);
          setProjectStatus('failed');
        });
    }
  }, [projectId]);

  // Watch for dev server URL in events
  useEffect(() => {
    for (const event of events) {
      if (event.type === 'agent_tool_result' && event.data.toolName === 'start_dev_server') {
        const url = (event.data.result as any)?.url;
        if (url) setPreviewUrl(url);
      }
      if (event.type === 'build_complete') {
        setProjectStatus('complete');
      }
    }
  }, [events]);

  // Handle input submission — either start a build (Flow B first prompt) or send a directive
  async function handleSubmit() {
    if (!userInput.trim() || !projectId) return;

    if (projectStatus === 'idle' && mode !== 'chat') {
      // Flow B: First prompt in builder — start the build
      try {
        await apiClient.startBuild(projectId, userInput.trim());
        setProjectStatus('building');
        updateProjectStatus(projectId, 'building');
        setSseReady(true);
        setUserInput('');
      } catch (err) {
        console.error('Failed to start build:', err);
      }
    } else if (projectStatus === 'building') {
      // Build is running — send directive
      try {
        await apiClient.sendDirective(projectId, userInput.trim());
        setUserInput('');
      } catch (err) {
        console.error('Failed to send directive:', err);
      }
    }
  }

  async function handleStop() {
    if (!projectId) return;
    try {
      await apiClient.stopBuild(projectId);
      disconnect();
      setProjectStatus('idle');
      updateProjectStatus(projectId, 'idle');
    } catch (err) {
      console.error('Failed to stop build:', err);
    }
  }

  const isBuilding = projectStatus === 'building' && !isComplete;
  // Filter out system events (connected, replay_complete) when checking if idle
  const realEvents = events.filter(e => e.type !== 'connected' && e.type !== 'replay_complete');
  const isIdle = projectStatus === 'idle' && realEvents.length === 0;
  const canSubmit = userInput.trim() && (isBuilding || (isIdle && mode !== 'chat'));

  async function handleAnswer(nodeId: string, answer: string) {
    if (!projectId) return;
    try {
      await apiClient.respondToQuestion(projectId, nodeId, answer);
    } catch (err) {
      console.error('Failed to send answer:', err);
    }
  }

  return (
    <div className="h-screen bg-kriptik-black flex flex-col">
      {/* Top bar */}
      <header className="h-12 border-b border-white/5 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-kriptik-silver hover:text-kriptik-white transition-colors">
            <ArrowLeftIcon size={18} />
          </button>
          <span className="text-sm font-medium text-kriptik-white truncate max-w-[300px]">
            {projectName || initialPrompt?.slice(0, 60) || 'New Project'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isBuilding && (
            <>
              <span className="flex items-center gap-2 text-xs text-kriptik-lime">
                <span className="w-1.5 h-1.5 bg-kriptik-lime rounded-full animate-pulse" />
                Building
              </span>
              <button onClick={handleStop} className="text-kriptik-silver hover:text-red-400 transition-colors" title="Stop build">
                <SquareIcon size={16} />
              </button>
            </>
          )}
          {isComplete && (
            <span className="text-xs text-green-400 font-medium">Build Complete</span>
          )}
          <button
            onClick={() => setShowPublish(!showPublish)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              isPublished
                ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                : 'bg-kriptik-lime/10 text-kriptik-lime border border-kriptik-lime/20 hover:bg-kriptik-lime/20'
            }`}
          >
            <GlobeIcon size={14} />
            {isPublished ? 'Published' : 'Publish'}
          </button>
        </div>
      </header>

      {/* Main panels */}
      <PanelGroup direction="horizontal" className="flex-1">
        {/* Chat panel */}
        <Panel defaultSize={50} minSize={30}>
          <div className="h-full flex flex-col">
            {/* Agent stream or empty state for Flow B */}
            {isIdle ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-md">
                  <SparklesIcon size={32} className="text-kriptik-lime/40 mx-auto mb-4" />
                  <h3 className="text-lg font-display font-semibold text-kriptik-white mb-2">
                    What do you want to build?
                  </h3>
                  <p className="text-sm text-kriptik-silver">
                    Describe your app below and the agents will start building it.
                  </p>
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

            {/* Speculative plan — shows AI analysis while user types */}
            {isIdle && (speculation || isAnalyzing) && (
              <SpeculativePlan speculation={speculation} isAnalyzing={isAnalyzing} />
            )}

            {/* Input area with mode toggle */}
            <div className="border-t border-white/5 p-3">
              {/* Mode toggle */}
              <div className="flex items-center gap-1 mb-2">
                {(['plan', 'iterate', 'chat'] as BuildMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    disabled={m === 'chat'} // Chat mode not yet implemented
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                      mode === m
                        ? 'bg-kriptik-lime/15 text-kriptik-lime border border-kriptik-lime/30'
                        : m === 'chat'
                        ? 'text-kriptik-slate/50 cursor-not-allowed'
                        : 'text-kriptik-silver hover:text-kriptik-white hover:bg-white/5'
                    }`}
                  >
                    {m === 'plan' ? 'Plan' : m === 'iterate' ? 'Iterate' : 'Chat'}
                  </button>
                ))}
                {mode === 'chat' && (
                  <span className="text-xs text-kriptik-slate ml-2">Coming soon</span>
                )}
              </div>

              {/* Text input */}
              <div className="flex gap-2">
                <input
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleSubmit()}
                  placeholder={
                    isIdle ? 'Describe the app you want to build...' :
                    isBuilding ? 'Send a directive to the agents...' :
                    isComplete ? 'Build complete' :
                    'Enter a prompt...'
                  }
                  disabled={isComplete || mode === 'chat'}
                  className="flex-1 bg-kriptik-charcoal border border-white/10 rounded-lg px-3 py-2 text-sm text-kriptik-white placeholder:text-kriptik-slate focus:outline-none focus:border-kriptik-lime/30 disabled:opacity-50"
                />
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="bg-kriptik-lime/10 text-kriptik-lime px-3 py-2 rounded-lg hover:bg-kriptik-lime/20 disabled:opacity-30 transition-colors"
                >
                  <SendIcon size={16} />
                </button>
              </div>
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-white/5 hover:bg-kriptik-lime/20 transition-colors" />

        {/* Preview panel */}
        <Panel defaultSize={50} minSize={20}>
          <div className="h-full bg-kriptik-charcoal flex items-center justify-center">
            {previewUrl ? (
              <iframe
                src={previewUrl}
                className="w-full h-full border-0"
                title="App Preview"
                sandbox="allow-scripts allow-forms allow-popups"
              />
            ) : (
              <div className="text-center">
                <div className="text-kriptik-slate text-sm mb-2">
                  {isBuilding ? 'Preview will appear when the dev server starts...' :
                   isComplete ? 'Build complete' :
                   'Live preview will appear here during build'}
                </div>
                {isBuilding && <LoadingIcon size={24} className="animate-spin text-kriptik-lime/50 mx-auto" />}
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>

      {/* Publish dialog overlay */}
      {showPublish && (
        <div className="fixed inset-0 z-50 flex items-start justify-end p-4 pt-14">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPublish(false)} />
          <div className="relative w-96 bg-kriptik-charcoal border border-white/10 rounded-xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <h3 className="text-sm font-semibold text-kriptik-white flex items-center gap-2">
                <GlobeIcon size={16} />
                Publish App
              </h3>
              <button onClick={() => setShowPublish(false)} className="text-kriptik-slate hover:text-kriptik-white">
                <CloseIcon size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Current status */}
              {isPublished && publishedUrl && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckIcon size={14} className="text-green-400" />
                    <span className="text-xs font-medium text-green-400">Live</span>
                  </div>
                  <a
                    href={publishedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-kriptik-lime hover:underline flex items-center gap-1"
                  >
                    {publishedUrl.replace('https://', '')}
                    <ExternalLinkIcon size={12} />
                  </a>
                </div>
              )}

              {/* Custom URL input */}
              <div>
                <label className="text-xs font-medium text-kriptik-silver mb-1.5 block">
                  App URL
                </label>
                <div className="flex items-center bg-kriptik-black border border-white/10 rounded-lg overflow-hidden focus-within:border-kriptik-lime/30">
                  <span className="text-xs text-kriptik-slate px-3 py-2 bg-white/5 border-r border-white/10 select-none whitespace-nowrap">
                    https://
                  </span>
                  <input
                    value={publishSlug}
                    onChange={(e) => setPublishSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="my-app"
                    className="flex-1 bg-transparent px-2 py-2 text-sm text-kriptik-white placeholder:text-kriptik-slate focus:outline-none min-w-0"
                  />
                  <span className="text-xs text-kriptik-slate px-3 py-2 bg-white/5 border-l border-white/10 select-none whitespace-nowrap">
                    .kriptik.app
                  </span>
                </div>
                {/* Availability indicator */}
                <div className="mt-1.5 h-4">
                  {slugStatus === 'checking' && (
                    <span className="text-xs text-kriptik-slate flex items-center gap-1">
                      <LoadingIcon size={10} className="animate-spin" /> Checking...
                    </span>
                  )}
                  {slugStatus === 'available' && (
                    <span className="text-xs text-green-400 flex items-center gap-1">
                      <CheckIcon size={10} /> Available
                    </span>
                  )}
                  {slugStatus === 'taken' && (
                    <span className="text-xs text-red-400">Already taken — try another name</span>
                  )}
                  {slugStatus === 'invalid' && (
                    <span className="text-xs text-red-400">Invalid — use lowercase letters, numbers, hyphens</span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                {isPublished ? (
                  <>
                    <button
                      onClick={handlePublish}
                      disabled={isPublishing || (slugStatus !== 'available' && slugStatus !== 'idle')}
                      className="flex-1 bg-kriptik-lime/15 text-kriptik-lime text-sm font-medium py-2 rounded-lg hover:bg-kriptik-lime/25 disabled:opacity-30 transition-colors"
                    >
                      {isPublishing ? 'Updating...' : 'Update'}
                    </button>
                    <button
                      onClick={handleUnpublish}
                      className="px-4 text-red-400 text-sm font-medium py-2 rounded-lg hover:bg-red-500/10 transition-colors"
                    >
                      Unpublish
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handlePublish}
                    disabled={isPublishing || slugStatus === 'taken' || slugStatus === 'invalid'}
                    className="w-full bg-kriptik-lime text-kriptik-black text-sm font-semibold py-2.5 rounded-lg hover:bg-kriptik-lime/90 disabled:opacity-30 transition-colors"
                  >
                    {isPublishing ? 'Publishing...' : 'Publish to kriptik.app'}
                  </button>
                )}
              </div>

              {/* Info */}
              <p className="text-xs text-kriptik-slate leading-relaxed">
                Publishing makes your app accessible at the URL above. You can change the URL anytime — your app will only be available at the latest URL.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

