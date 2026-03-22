/**
 * FixMyAppCard3D — Premium 3D flip card for active build projects.
 *
 * Visual design from old KripTik app. All status data comes from
 * the Brain-driven engine via SSE events — no hardcoded phases,
 * no mechanical state machine. The card shows whatever the agents
 * are actually doing, in real time.
 *
 * Front: Monitor with scrolling agent activity
 * Back: AI consciousness stream with thoughts and progress
 * Uses GSAP for flip animation (Design_References.md)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import './FixMyAppCard3D.css';

interface FixMyAppCard3DProps {
  onClick: () => void;
  projectName: string;
  /** Dynamic status text from SSE build_progress events */
  statusText?: string;
  /** Dynamic status color — derived from event type, not hardcoded phases */
  statusColor?: string;
  /** Progress 0-100 from engine events */
  progress?: number;
  /** Source of the import (e.g., "GitHub", "Bolt.new") */
  importSource?: string;
  /** Latest agent activity lines from SSE events */
  activityLines?: string[];
  /** Latest agent thoughts from SSE agent_thinking events */
  thoughts?: string[];
  /** Errors encountered from SSE agent_error events */
  errors?: string[];
  /** Whether the build is still active */
  isActive?: boolean;
  /** Whether the build completed successfully */
  isComplete?: boolean;
}

// Sample code lines shown during build — these are AGENTIC patterns,
// not mechanical orchestration. They represent what the Brain-driven
// engine actually does.
const ACTIVITY_LINES = [
  'brain.query("current project state");',
  'const intents = brain.getNodesByType("intent");',
  'const constraints = brain.getNodesByType("constraint");',
  '',
  'async function reason(context: BrainState) {',
  '  const discoveries = await agent.think(context);',
  '  for (const insight of discoveries) {',
  '    brain.writeNode("discovery", insight);',
  '  }',
  '}',
  '',
  'const specialist = await lead.spawn({',
  '  role: "auth-and-security",',
  '  domain: context.authRequirements,',
  '});',
  '',
  'specialist.onDiscovery((node) => {',
  '  brain.addEdge(node.id, intent.id, "implements");',
  '});',
  '',
  'const verification = await tools.verifyErrors();',
  'const satisfaction = await tools.evaluateIntent(intent);',
  '',
  'if (satisfaction.passed) {',
  '  brain.writeNode("status", "Intent satisfied");',
  '}',
];

export function FixMyAppCard3D({
  onClick,
  projectName,
  statusText = 'Building',
  statusColor = '#f59e0b',
  progress = 0,
  importSource,
  activityLines,
  thoughts = [],
  errors = [],
  isActive = true,
  isComplete = false,
}: FixMyAppCard3DProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [codeOffset, setCodeOffset] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  // Use provided activity lines or default sample
  const displayLines = activityLines && activityLines.length > 0
    ? activityLines
    : ACTIVITY_LINES;

  // Auto-scroll the code using requestAnimationFrame (Design_References.md perf pattern)
  useEffect(() => {
    if (isComplete || !isActive) return;

    let offset = 0;
    let animFrame: number;
    const maxOffset = displayLines.length * 24;

    function tick() {
      offset = (offset + 0.5) % maxOffset;
      setCodeOffset(offset);
      animFrame = requestAnimationFrame(tick);
    }
    animFrame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animFrame);
  }, [isActive, isComplete, displayLines.length]);

  // GSAP flip animation (Design_References.md: use GSAP, not CSS transitions)
  const handleFlip = useCallback(() => {
    if (!cardRef.current) return;
    const inner = cardRef.current.querySelector('.fix-card') as HTMLElement;
    if (!inner) return;

    const newFlipped = !isFlipped;
    setIsFlipped(newFlipped);

    gsap.to(inner, {
      rotateY: newFlipped ? 180 : 0,
      duration: 0.7,
      ease: 'power3.inOut',
    });
  }, [isFlipped]);

  const label = isComplete ? 'COMPLETE' : statusText.toUpperCase();
  const color = isComplete ? '#22c55e' : statusColor;

  return (
    <div
      ref={cardRef}
      className="fix-card-container"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        if (isFlipped) {
          onClick();
        } else {
          handleFlip();
        }
      }}
    >
      <div className={`fix-card ${isHovered && !isFlipped ? 'hovered' : ''}`}>
        {/* FRONT — Monitor with scrolling code */}
        <div className="fix-card-face fix-card-front">
          <div className="monitor-frame">
            <div className="monitor-bezel-top">
              <div className="monitor-camera" />
            </div>

            <div className="monitor-screen">
              <div className="screen-scanlines" />
              <div className="screen-glow" style={{ '--glow-color': color } as React.CSSProperties} />

              {/* Status bar — dynamic from SSE, not hardcoded */}
              <div className="screen-status-bar">
                <div className="status-dot" style={{ background: color }} />
                <span className="status-text">{label}</span>
                <span className="status-progress">{Math.round(progress)}%</span>
              </div>

              {/* Scrolling code */}
              <div className="code-container">
                <div
                  className="code-scroll"
                  style={{ transform: `translateY(-${codeOffset}px)` }}
                >
                  {displayLines.concat(displayLines).map((line, i) => (
                    <div key={i} className="code-line">
                      <span className="line-number">{(i % displayLines.length) + 1}</span>
                      <span className="line-content">{line}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom info */}
              <div className="screen-info-bar">
                <span className="project-name">{projectName}</span>
                {importSource && <span className="import-source">from {importSource}</span>}
              </div>

              {/* Progress bar */}
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${progress}%`,
                    background: `linear-gradient(90deg, ${color}, ${color}88)`,
                    boxShadow: `0 0 20px ${color}66`,
                  }}
                />
              </div>
            </div>

            <div className="monitor-bezel-bottom">
              <div className="monitor-logo">KRIPTIK</div>
            </div>
          </div>

          <div className="flip-hint">
            <span>Click to see AI thoughts</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 1l4 4-4 4" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <path d="M7 23l-4-4 4-4" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </div>
        </div>

        {/* BACK — AI Consciousness Stream */}
        <div className="fix-card-face fix-card-back">
          <div className="consciousness-container">
            <div className="consciousness-header">
              <div className="ai-avatar">
                <div className="ai-core" />
                <div className="ai-ring" />
                <div className="ai-ring ai-ring-2" />
              </div>
              <div className="ai-info">
                <span className="ai-name">KripTik AI</span>
                <span className="ai-status" style={{ color }}>
                  {isActive ? 'Active' : isComplete ? 'Complete' : 'Stopped'}
                </span>
              </div>
            </div>

            {/* Current status — from SSE events, not phases */}
            <div className="phase-display">
              <div className="phase-label">CURRENT ACTIVITY</div>
              <div className="phase-value" style={{ color }}>
                {statusText}
              </div>
            </div>

            {/* Thought Stream — from SSE agent_thinking events */}
            <div className="thought-stream">
              <div className="stream-label">THOUGHT STREAM</div>
              <div className="stream-content">
                {(thoughts.length > 0 ? thoughts : [
                  'Analyzing project structure...',
                  'Querying Brain for context...',
                  'Reasoning about approach...',
                ]).slice(-4).map((thought, i) => (
                  <div key={i} className="thought-item" style={{ animationDelay: `${i * 0.1}s` }}>
                    <span className="thought-dot" />
                    <span className="thought-text">{thought}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Errors from SSE agent_error events */}
            {errors.length > 0 && (
              <div className="error-stream">
                <div className="stream-label error-label">ISSUES FOUND</div>
                <div className="stream-content">
                  {errors.slice(-2).map((error, i) => (
                    <div key={i} className="error-item">
                      <span className="error-icon">!</span>
                      <span className="error-text">{error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Progress footer */}
            <div className="consciousness-footer">
              <div className="progress-info">
                <span className="progress-label">Overall Progress</span>
                <span className="progress-value" style={{ color }}>{Math.round(progress)}%</span>
              </div>
              <div className="progress-bar-mini">
                <div
                  className="progress-fill-mini"
                  style={{ width: `${progress}%`, background: color }}
                />
              </div>
            </div>

            <button className="open-project-btn" onClick={(e) => { e.stopPropagation(); onClick(); }}>
              Open Project
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className={`fix-card-shadow ${isFlipped ? 'flipped' : ''}`} />
    </div>
  );
}

export default FixMyAppCard3D;
