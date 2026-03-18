import { useState, useRef } from 'react';
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
  onDelete?: () => void;
}

/**
 * Premium 3D project card with monitor aesthetic.
 *
 * Status-driven, not phase-driven. The card only knows:
 * - idle: default state, flip on hover
 * - building: lime glow pulse, shows live activity lines from engine
 * - complete: green badge
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
  onDelete,
}: ProjectCard3DProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [glowPosition, setGlowPosition] = useState({ x: 50, y: 50 });
  const cardRef = useRef<HTMLDivElement>(null);

  const isBuilding = status === 'building';

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setGlowPosition({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  const badge = {
    idle:     { label: 'IDLE',     color: '#8a8a8a' },
    building: { label: 'BUILDING', color: '#c8ff64' },
    complete: { label: 'COMPLETE', color: '#22c55e' },
    failed:   { label: 'FAILED',   color: '#ef4444' },
  }[status];

  return (
    <div
      ref={cardRef}
      className={`project-card-container ${isBuilding ? 'is-building' : ''}`}
      onClick={() => onClick?.()}
      onMouseEnter={() => !isBuilding && setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
      onMouseMove={handleMouseMove}
    >
      {/* Pulsing glow when building */}
      {isBuilding && (
        <div
          style={{
            position: 'absolute', inset: -4, borderRadius: 20, zIndex: -1,
            background: 'linear-gradient(45deg, rgba(200,255,100,0.2), rgba(163,230,53,0.2))',
            animation: 'build-glow-pulse 2s ease-in-out infinite',
          }}
        />
      )}

      <div className={`project-card ${isFlipped ? 'flipped' : ''}`}>
        {/* ── FRONT FACE ── */}
        <div className="project-card-face project-card-front">
          <div className="monitor-frame">
            <div className="monitor-screen">
              <div
                className="cursor-glow"
                style={{
                  background: `radial-gradient(circle at ${glowPosition.x}% ${glowPosition.y}%, rgba(200,255,100,0.1) 0%, transparent 50%)`,
                }}
              />

              {/* Header */}
              <div className="screen-header">
                <div className="header-dots">
                  <span className="dot" style={{ background: '#ef4444' }} />
                  <span className="dot" style={{ background: '#eab308' }} />
                  <span className="dot" style={{ background: '#22c55e' }} />
                </div>
                <span className="header-title">{projectName}</span>
                <div className="header-badge" style={{ background: badge.color, color: status === 'building' ? '#0a0a0a' : '#fff' }}>
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
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={i}
                          className="particle"
                          style={{
                            left: `${15 + Math.random() * 70}%`,
                            top: `${10 + Math.random() * 80}%`,
                            animationDelay: `${i * 0.5}s`,
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
                  <span>{createdAt ? new Date(createdAt).toLocaleDateString() : 'Today'}</span>
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
            <div className="monitor-screen back-screen">
              <div className="screen-header">
                <div className="header-dots">
                  <span className="dot" style={{ background: '#c8ff64' }} />
                  <span className="dot" style={{ background: '#c8ff64', opacity: 0.6 }} />
                  <span className="dot" style={{ background: '#c8ff64', opacity: 0.3 }} />
                </div>
                <span className="header-title">Project Details</span>
              </div>

              {description && (
                <div className="project-description">
                  <span className="desc-label">Description</span>
                  <p>{description}</p>
                </div>
              )}

              <div style={{ flex: 1 }} />

              <div className="action-hint">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
                <span>Click to open project</span>
              </div>

              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: 8, background: 'rgba(239,68,68,0.08)', borderTop: '1px solid rgba(239,68,68,0.15)',
                    color: '#ef4444', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 500,
                    border: 'none', cursor: 'pointer', width: '100%',
                  }}
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
