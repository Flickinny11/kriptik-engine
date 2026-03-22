/**
 * FixMyAppFlipCard — Auto-flipping project card for active builds.
 *
 * Visual design from old KripTik app. All status data comes from
 * SSE events — no hardcoded phases, no orchestration phase dots.
 *
 * Front: Monitor with scrolling code + syntax highlighting
 * Back: AI consciousness with typewriter thoughts + neural activity
 * Auto-flips between front/back on a timer.
 * Uses GSAP for flip (Design_References.md).
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import gsap from 'gsap';
import './FixMyAppFlipCard.css';

interface FixMyAppFlipCardProps {
  onClick: () => void;
  projectName: string;
  /** Dynamic status from SSE build_progress events */
  statusText?: string;
  /** Progress 0-100 from engine events */
  progress?: number;
  /** Import source label */
  importSource?: string;
  /** Current agent thought from SSE agent_thinking events */
  currentThought?: string;
  /** Whether there are active errors from SSE agent_error events */
  hasProblems?: boolean;
  /** Problem description from SSE agent_error */
  problemDescription?: string;
  /** Whether build is complete */
  isComplete?: boolean;
  /** Whether build failed */
  isFailed?: boolean;
  /** Active agent names from SSE agent_spawned events */
  activeAgents?: string[];
}

// Agentic code sample — represents Brain-driven reasoning, not mechanical phases
const CODE_LINES = [
  'const brain = await BrainService.connect(projectId);',
  'const state = await brain.query("current project state");',
  '',
  'async function reason(context: BrainState) {',
  '  const intents = brain.getNodesByType("intent");',
  '  const constraints = brain.getNodesByType("constraint");',
  '  const discoveries = await agent.think({',
  '    intents, constraints, context',
  '  });',
  '',
  '  for (const insight of discoveries) {',
  '    await brain.writeNode("discovery", insight);',
  '  }',
  '}',
  '',
  'const result = await tools.verifyErrors();',
  'if (result.errorCount === 0) {',
  '  brain.writeNode("status", "Verification passed");',
  '}',
];

// Dynamic thought rotation
const DEFAULT_THOUGHTS = [
  'Analyzing project structure...',
  'Querying Brain for context...',
  'Reasoning about best approach...',
  'Evaluating code quality...',
  'Checking intent satisfaction...',
  'Verifying component relationships...',
  'Testing API integrations...',
  'Scanning for issues...',
];

function highlightSyntax(line: string): React.ReactNode {
  if (!line) return <span>&nbsp;</span>;

  const tokens: React.ReactNode[] = [];
  let remaining = line;
  let key = 0;

  while (remaining.length > 0) {
    // Check for comments first
    const commentMatch = remaining.match(/^(\/\/.*)/);
    if (commentMatch) {
      tokens.push(<span key={key++} style={{ color: '#546e7a' }}>{commentMatch[1]}</span>);
      remaining = remaining.slice(commentMatch[1].length);
      continue;
    }

    // Check for strings
    const strMatch = remaining.match(/^(".*?")/);
    if (strMatch) {
      tokens.push(<span key={key++} style={{ color: '#c3e88d' }}>{strMatch[1]}</span>);
      remaining = remaining.slice(strMatch[1].length);
      continue;
    }

    // Check for keywords
    const kwMatch = remaining.match(/^(const|let|var|async|function|await|for|of|if|return|import|from)\b/);
    if (kwMatch) {
      tokens.push(<span key={key++} style={{ color: '#c792ea' }}>{kwMatch[1]}</span>);
      remaining = remaining.slice(kwMatch[1].length);
      continue;
    }

    // Plain text — consume until next special token
    const nextSpecial = remaining.search(/(\/\/|"|(?:const|let|var|async|function|await|for|of|if|return|import|from)\b)/);
    if (nextSpecial > 0) {
      tokens.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    } else {
      tokens.push(remaining);
      break;
    }
  }

  return <>{tokens}</>;
}

export function FixMyAppFlipCard({
  onClick,
  projectName,
  statusText = 'Building',
  progress = 0,
  importSource,
  currentThought,
  hasProblems = false,
  problemDescription,
  isComplete = false,
  isFailed = false,
  activeAgents = [],
}: FixMyAppFlipCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [thoughtIndex, setThoughtIndex] = useState(0);
  const [displayedThought, setDisplayedThought] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);

  const statusColor = useMemo(() => {
    if (hasProblems || isFailed) return '#ef4444';
    if (isComplete) return '#22c55e';
    return '#f97316';
  }, [hasProblems, isFailed, isComplete]);

  // Auto-scroll code — requestAnimationFrame (Design_References.md perf)
  useEffect(() => {
    let offset = 0;
    let animFrame: number;
    const maxScroll = CODE_LINES.length * 20 - 200;

    function tick() {
      offset = offset >= maxScroll ? 0 : offset + 0.6;
      setScrollOffset(offset);
      animFrame = requestAnimationFrame(tick);
    }
    animFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame);
  }, []);

  // Typewriter effect for thoughts
  useEffect(() => {
    const thought = currentThought || DEFAULT_THOUGHTS[thoughtIndex];
    let charIndex = 0;
    setDisplayedThought('');

    const typeInterval = setInterval(() => {
      if (charIndex < thought.length) {
        setDisplayedThought(thought.slice(0, charIndex + 1));
        charIndex++;
      } else {
        clearInterval(typeInterval);
        setTimeout(() => {
          setThoughtIndex(prev => (prev + 1) % DEFAULT_THOUGHTS.length);
        }, 2000);
      }
    }, 30);

    return () => clearInterval(typeInterval);
  }, [thoughtIndex, currentThought]);

  // Auto-flip cycle using GSAP (Design_References.md)
  useEffect(() => {
    if (!cardRef.current) return;
    const inner = cardRef.current.querySelector('.fix-card') as HTMLElement;
    if (!inner) return;

    const flipToBack = () => {
      setIsFlipped(true);
      gsap.to(inner, { rotateY: 180, duration: 0.7, ease: 'power3.inOut' });
    };
    const flipToFront = () => {
      setIsFlipped(false);
      gsap.to(inner, { rotateY: 0, duration: 0.7, ease: 'power3.inOut' });
    };

    const initialTimeout = setTimeout(flipToBack, 4000);
    const cycleInterval = setInterval(() => {
      flipToBack();
      setTimeout(flipToFront, 15000);
    }, 19000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(cycleInterval);
    };
  }, []);

  return (
    <div
      ref={cardRef}
      className="fix-card-container"
      onClick={onClick}
      onMouseEnter={() => {
        setIsFlipped(true);
        const inner = cardRef.current?.querySelector('.fix-card') as HTMLElement;
        if (inner) gsap.to(inner, { rotateY: 180, duration: 0.5, ease: 'power2.out' });
      }}
      onMouseLeave={() => {
        setIsFlipped(false);
        const inner = cardRef.current?.querySelector('.fix-card') as HTMLElement;
        if (inner) gsap.to(inner, { rotateY: 0, duration: 0.5, ease: 'power2.out' });
      }}
    >
      <div className="fix-card">
        {/* FRONT — Code Screen */}
        <div className="fix-card-face fix-card-front">
          <div className="monitor-frame">
            <div className="monitor-screen">
              <div className="screen-header">
                <div className="header-dots">
                  <span className="dot red" />
                  <span className="dot yellow" />
                  <span className="dot green" />
                </div>
                <span className="header-title">{projectName}.tsx</span>
                <div className="header-status">
                  <span className="status-dot" style={{ background: statusColor }} />
                  <span>{statusText}</span>
                </div>
              </div>

              <div className="code-viewport">
                <div className="code-content" style={{ transform: `translateY(-${scrollOffset}px)` }}>
                  {CODE_LINES.map((line, i) => (
                    <div key={i} className="code-line">
                      <span className="line-number">{i + 1}</span>
                      <span className="line-content">{highlightSyntax(line)}</span>
                    </div>
                  ))}
                </div>
                <div className="scan-line" />
              </div>

              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
                <span className="progress-text">{Math.round(progress)}%</span>
              </div>
            </div>

            <div className="monitor-chin">
              <div className="chin-logo">K</div>
            </div>
          </div>

          <div className="floating-element elem-1">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div className="floating-element elem-2">
            <code>&lt;Fix /&gt;</code>
          </div>
        </div>

        {/* BACK — AI Consciousness */}
        <div className="fix-card-face fix-card-back">
          <div className="monitor-frame">
            <div className="monitor-screen consciousness-screen">
              <div className="screen-header">
                <div className="header-dots">
                  <span className="dot" style={{ background: statusColor }} />
                  <span className="dot" style={{ background: statusColor, opacity: 0.6 }} />
                  <span className="dot" style={{ background: statusColor, opacity: 0.3 }} />
                </div>
                <span className="header-title">KripTik AI Consciousness</span>
              </div>

              <div className="thought-stream">
                <div className="thought-bubble">
                  <span className="thought-label">Current Thought</span>
                  <p className="thought-text">
                    {displayedThought}
                    <span className="cursor">|</span>
                  </p>
                </div>

                <div className="neural-activity">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div
                      key={i}
                      className="neural-bar"
                      style={{
                        animationDelay: `${i * 0.1}s`,
                        height: `${20 + Math.random() * 60}%`,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Agent activity — from SSE agent_spawned events, not hardcoded phases */}
              <div className="orchestration-status">
                <div className="phase-indicator">
                  <span className="phase-label">
                    {activeAgents.length > 0
                      ? `${activeAgents.length} agent${activeAgents.length > 1 ? 's' : ''} active`
                      : statusText}
                  </span>
                  <span className="phase-name">
                    {activeAgents.length > 0
                      ? activeAgents.slice(0, 3).join(', ')
                      : 'Reasoning...'}
                  </span>
                </div>

                {/* Dynamic agent dots — from SSE, not hardcoded phase count */}
                {activeAgents.length > 0 && (
                  <div className="phase-dots">
                    {activeAgents.map((_, i) => (
                      <div key={i} className="phase-dot active" />
                    ))}
                  </div>
                )}

                {hasProblems && (
                  <div className="problem-indicator">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span>{problemDescription || 'Issue detected — agents resolving...'}</span>
                  </div>
                )}
              </div>

              {importSource && (
                <div className="import-badge">
                  <span>Imported from</span>
                  <strong>{importSource}</strong>
                </div>
              )}
            </div>

            <div className="monitor-chin">
              <div className="chin-logo">K</div>
            </div>
          </div>
        </div>
      </div>

      <div className={`fix-card-shadow ${isFlipped ? 'flipped' : ''}`} />
    </div>
  );
}

export default FixMyAppFlipCard;
