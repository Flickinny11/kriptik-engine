import { useState, useRef, useEffect, useMemo } from 'react';
import './ProjectCard3D.css';

interface ProjectCard3DProps {
  onClick?: () => void;
  thumbnail?: string;
  projectName: string;
  description?: string;
  status: 'idle' | 'building' | 'complete' | 'failed';
  /** Live activity lines from engine SSE events (shown when building) */
  activityLines?: string[];
  createdAt?: string;
  lastModified?: string;
  onDelete?: () => void;
}

const BADGE_MAP = {
  idle:     { label: 'IDLE',     color: '#8a8a8a', glow: 'none' },
  building: { label: 'BUILDING', color: '#c8ff64', glow: '0 0 8px rgba(200,255,100,0.6)' },
  complete: { label: 'COMPLETE', color: '#22c55e', glow: '0 0 8px rgba(34,197,94,0.4)' },
  failed:   { label: 'FAILED',   color: '#ef4444', glow: '0 0 8px rgba(239,68,68,0.4)' },
};

/**
 * Premium 3D project card with photorealistic depth, edges, and responsive design.
 *
 * Status-driven, not phase-driven. The card only knows:
 * - idle: default state, flip on hover to show details
 * - building: lime glow pulse, auto-flips to back showing live activity
 * - complete: green badge, subtle glow
 * - failed: red badge
 *
 * No phases, no waves, no swarms, no mechanical progress bars.
 * Activity text comes from the engine's SSE events, not fake messages.
 */
export function ProjectCard3D({
  onClick,
  thumbnail,
  projectName,
  description,
  status,
  activityLines = [],
  createdAt,
  lastModified,
  onDelete,
}: ProjectCard3DProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [glowPosition, setGlowPosition] = useState({ x: 50, y: 50 });
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  const isBuilding = status === 'building';
  const badge = BADGE_MAP[status] || BADGE_MAP.idle;

  // Auto-flip to back face when building to show live activity
  useEffect(() => {
    if (isBuilding && activityLines.length > 0) {
      setIsFlipped(true);
    }
  }, [isBuilding, activityLines.length]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setGlowPosition({ x, y });
    // Subtle tilt based on mouse position for photorealistic depth
    setTilt({
      x: ((y - 50) / 50) * -4,
      y: ((x - 50) / 50) * 6,
    });
  };

  const handleMouseLeave = () => {
    if (!isBuilding) setIsFlipped(false);
    setTilt({ x: 0, y: 0 });
  };

  // Stable particle positions
  const particles = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => ({
      left: `${12 + ((i * 37 + 13) % 76)}%`,
      top: `${8 + ((i * 41 + 7) % 82)}%`,
      delay: `${i * 0.4}s`,
      size: 2 + (i % 3),
    })),
  []);

  const displayDate = lastModified || (createdAt ? new Date(createdAt).toLocaleDateString() : 'Today');

  return (
    <div
      ref={cardRef}
      className={`project-card-container ${isBuilding ? 'is-building' : ''} status-${status}`}
      onClick={() => onClick?.()}
      onMouseEnter={() => !isBuilding && setIsFlipped(true)}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {/* Ambient glow layer — status-driven */}
      <div
        className="card-ambient-glow"
        style={{
          background: isBuilding
            ? 'linear-gradient(45deg, rgba(200,255,100,0.15), rgba(163,230,53,0.12))'
            : status === 'complete'
              ? 'linear-gradient(45deg, rgba(34,197,94,0.08), rgba(16,185,129,0.06))'
              : status === 'failed'
                ? 'linear-gradient(45deg, rgba(239,68,68,0.08), rgba(220,38,38,0.06))'
                : 'transparent',
        }}
      />

      <div
        className={`project-card ${isFlipped ? 'flipped' : ''}`}
        style={{
          transform: isFlipped
            ? undefined // CSS handles flipped transform
            : `rotateY(${-12 + tilt.y * 0.5}deg) rotateX(${6 + tilt.x * 0.5}deg) skewY(-1.5deg)`,
        }}
      >
        {/* ── FRONT FACE ── */}
        <div className="project-card-face project-card-front">
          <div className="monitor-frame">
            {/* Realistic top edge highlight */}
            <div className="frame-edge-top" />
            {/* Left edge for depth */}
            <div className="frame-edge-left" />

            <div className="monitor-screen">
              <div
                className="cursor-glow"
                style={{
                  background: `radial-gradient(circle at ${glowPosition.x}% ${glowPosition.y}%, rgba(200,255,100,0.12) 0%, transparent 50%)`,
                }}
              />

              {/* Header */}
              <div className="screen-header">
                <div className="header-dots">
                  <span className="dot dot-red" />
                  <span className="dot dot-yellow" />
                  <span className="dot dot-green" />
                </div>
                <span className="header-title">{projectName}</span>
                <div
                  className="header-badge"
                  style={{
                    background: badge.color,
                    color: status === 'building' ? '#0a0a0a' : '#fff',
                    boxShadow: badge.glow,
                  }}
                >
                  {isBuilding && <span className="badge-pulse" />}
                  {badge.label}
                </div>
              </div>

              {/* Content */}
              <div className="screen-content">
                {thumbnail ? (
                  <div className="thumbnail-preview" style={{ backgroundImage: `url(${thumbnail})` }} />
                ) : (
                  <div className="placeholder-content">
                    <div className="floating-ui">
                      <div className="ui-element nav-bar">
                        <div className="nav-logo" />
                        <div className="nav-links"><span /><span /><span /></div>
                      </div>
                      <div className="ui-element hero-section">
                        <div className="hero-title" />
                        <div className="hero-subtitle" />
                        <div className="hero-button" />
                      </div>
                      <div className="ui-element card-grid">
                        <div className="mini-card" />
                        <div className="mini-card" />
                        <div className="mini-card" />
                      </div>
                    </div>
                    <div className="ambient-particles">
                      {particles.map((p, i) => (
                        <div
                          key={i}
                          className="particle"
                          style={{
                            left: p.left,
                            top: p.top,
                            animationDelay: p.delay,
                            width: p.size,
                            height: p.size,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Building overlay — shows REAL engine activity, not fake messages */}
                {isBuilding && activityLines.length > 0 && (
                  <div className="building-overlay">
                    {activityLines.slice(-6).map((line, idx) => (
                      <div key={idx} className="building-activity-line">{line}</div>
                    ))}
                    <div className="building-status-label">Engine is building...</div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="screen-footer">
                <div className="footer-framework">
                  <span className="framework-dot" style={{ background: '#c8ff64' }} />
                  <span>React</span>
                </div>
                <div className="footer-modified">
                  <span>{displayDate}</span>
                </div>
              </div>
            </div>

            <div className="monitor-chin">
              <div className="chin-logo">K</div>
            </div>
          </div>
        </div>

        {/* ── BACK FACE ── */}
        <div className="project-card-face project-card-back">
          <div className="monitor-frame">
            <div className="frame-edge-top" />
            <div className="frame-edge-left" />

            <div className="monitor-screen back-screen">
              <div className="screen-header">
                <div className="header-dots">
                  <span className="dot" style={{ background: '#c8ff64' }} />
                  <span className="dot" style={{ background: '#c8ff64', opacity: 0.6 }} />
                  <span className="dot" style={{ background: '#c8ff64', opacity: 0.3 }} />
                </div>
                <span className="header-title">
                  {isBuilding ? 'Live Build Activity' : 'Project Details'}
                </span>
              </div>

              {/* When building: show real-time animated activity */}
              {isBuilding ? (
                <div className="back-build-activity">
                  <div className="build-activity-header">
                    <div className="build-pulse-dot" />
                    <span>Engine Active</span>
                  </div>
                  <div className="build-activity-scroll">
                    {activityLines.slice(-10).map((line, idx) => (
                      <div
                        key={idx}
                        className="build-activity-entry"
                        style={{ opacity: 0.4 + (idx / 10) * 0.6 }}
                      >
                        <span className="build-entry-marker">&gt;</span>
                        <span className="build-entry-text">{line}</span>
                      </div>
                    ))}
                    {activityLines.length === 0 && (
                      <div className="build-activity-waiting">
                        <div className="typing-dots">
                          <span /><span /><span />
                        </div>
                        <span>Waiting for engine events...</span>
                      </div>
                    )}
                  </div>
                  <div className="build-activity-footer">
                    <div className="build-progress-bar">
                      <div className="build-progress-fill" />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {description && (
                    <div className="project-description">
                      <span className="desc-label">Description</span>
                      <p>{description}</p>
                    </div>
                  )}

                  <div className="back-meta">
                    <div className="meta-row">
                      <span className="meta-label">Status</span>
                      <span className="meta-value" style={{ color: badge.color }}>{badge.label}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-label">Last Modified</span>
                      <span className="meta-value">{displayDate}</span>
                    </div>
                  </div>

                  <div style={{ flex: 1 }} />

                  <div className="action-hint">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                    <span>Click to open project</span>
                  </div>
                </>
              )}

              {onDelete && !isBuilding && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="back-delete-btn"
                >
                  Delete Project
                </button>
              )}
            </div>

            <div className="monitor-chin">
              <div className="chin-pulse" />
            </div>
          </div>
        </div>
      </div>

      <div className="card-shadow" />
    </div>
  );
}

export default ProjectCard3D;
