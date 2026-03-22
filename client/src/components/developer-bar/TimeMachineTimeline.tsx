/**
 * Time Machine Timeline - Dial-Based Scrubber with State Preview
 *
 * A frosted-glass overlay with:
 * - Central rotary dial for navigating through checkpoints in time
 * - Visual state preview showing project state at each checkpoint
 * - Phase indicators, quality scores, and file change summaries
 *
 * Integrates with the backend time-machine service via /api/checkpoints/* endpoints.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams } from 'react-router-dom';
import './time-machine-timeline.css';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Checkpoint {
  id: string;
  timestamp: Date;
  trigger: 'manual' | 'auto' | 'phase_complete' | 'error_recovery';
  label?: string;
  qualityScore?: number;
  gitCommit?: string;
  filesCount: number;
  size: number;
  description?: string;
  phase?: string;
}

interface TimeMachineTimelineProps {
  visible: boolean;
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

function formatSize(mb: number): string {
  if (mb < 1) return `${Math.round(mb * 1024)} KB`;
  return `${mb.toFixed(1)} MB`;
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

function getTriggerMeta(trigger: Checkpoint['trigger']): { label: string; color: string; icon: string } {
  switch (trigger) {
    case 'manual': return { label: 'Manual Save', color: '#60a5fa', icon: 'save' };
    case 'auto': return { label: 'Auto-checkpoint', color: '#9ca3af', icon: 'auto' };
    case 'phase_complete': return { label: 'Phase Complete', color: '#22c55e', icon: 'check' };
    case 'error_recovery': return { label: 'Error Recovery', color: '#f59e0b', icon: 'warning' };
  }
}

function getPhaseLabel(phase?: string): string {
  if (!phase) return 'General';
  const labels: Record<string, string> = {
    intent_lock: 'Intent Lock',
    initialization: 'Setup',
    parallel_build: 'Build',
    integration: 'Integration',
    testing: 'Testing',
    intent_satisfaction: 'Verification',
    implementation: 'Implementation',
    demo: 'Demo',
  };
  return labels[phase] || phase.charAt(0).toUpperCase() + phase.slice(1);
}

// ─── Trigger Icons ──────────────────────────────────────────────────────────

function TriggerIcon({ trigger, size = 14 }: { trigger: Checkpoint['trigger']; size?: number }) {
  const { color } = getTriggerMeta(trigger);
  switch (trigger) {
    case 'manual':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.5" fill={color} fillOpacity={0.2} />
          <path d="M8 5v3l2 1.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'auto':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="5.5" stroke={color} strokeWidth="1.2" strokeDasharray="3 2" />
          <circle cx="8" cy="8" r="2" fill={color} fillOpacity={0.5} />
        </svg>
      );
    case 'phase_complete':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" fill={color} fillOpacity={0.2} stroke={color} strokeWidth="1.2" />
          <path d="M5.5 8l2 2 3.5-4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'error_recovery':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <path d="M8 3L14 13H2L8 3z" fill={color} fillOpacity={0.15} stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M8 7v2.5M8 11.5v0" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
  }
}

// ─── Dial Component ─────────────────────────────────────────────────────────

function TimeDial({
  total,
  current,
  onChange,
}: {
  total: number;
  current: number;
  onChange: (index: number) => void;
}) {
  const dialRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const DIAL_RADIUS = 72;
  const NOTCH_RADIUS = 60;

  // Angle range: -135 to +135 degrees (270 degree sweep)
  const SWEEP = 270;
  const START_ANGLE = -135;

  const angleForIndex = useCallback((i: number) => {
    if (total <= 1) return 0;
    return START_ANGLE + (i / (total - 1)) * SWEEP;
  }, [total]);

  const currentAngle = total > 0 ? angleForIndex(current) : 0;

  const indexFromAngle = useCallback((angleDeg: number) => {
    if (total <= 1) return 0;
    const normalized = Math.max(START_ANGLE, Math.min(START_ANGLE + SWEEP, angleDeg));
    const fraction = (normalized - START_ANGLE) / SWEEP;
    return Math.round(fraction * (total - 1));
  }, [total]);

  const getAngleFromPointer = useCallback((clientX: number, clientY: number) => {
    if (!dialRef.current) return 0;
    const rect = dialRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    return Math.atan2(dy, dx) * (180 / Math.PI) + 90; // 0 = top
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const angle = getAngleFromPointer(e.clientX, e.clientY);
    const idx = indexFromAngle(angle);
    onChange(idx);
  }, [getAngleFromPointer, indexFromAngle, onChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const angle = getAngleFromPointer(e.clientX, e.clientY);
    const idx = indexFromAngle(angle);
    onChange(idx);
  }, [getAngleFromPointer, indexFromAngle, onChange]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Notch positions around the dial
  const notches = useMemo(() => {
    if (total === 0) return [];
    return Array.from({ length: total }, (_, i) => {
      const angle = angleForIndex(i);
      const rad = (angle - 90) * (Math.PI / 180);
      return {
        x: Math.cos(rad) * NOTCH_RADIUS,
        y: Math.sin(rad) * NOTCH_RADIUS,
        angle,
        index: i,
      };
    });
  }, [total, angleForIndex]);

  // Indicator knob position
  const knobRad = (currentAngle - 90) * (Math.PI / 180);
  const knobX = Math.cos(knobRad) * NOTCH_RADIUS;
  const knobY = Math.sin(knobRad) * NOTCH_RADIUS;

  return (
    <div
      ref={dialRef}
      className="tm-dial"
      style={{ width: DIAL_RADIUS * 2 + 24, height: DIAL_RADIUS * 2 + 24 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Outer ring */}
      <svg
        width={DIAL_RADIUS * 2 + 24}
        height={DIAL_RADIUS * 2 + 24}
        viewBox={`0 0 ${DIAL_RADIUS * 2 + 24} ${DIAL_RADIUS * 2 + 24}`}
        className="tm-dial__ring"
      >
        {/* Background track */}
        <circle
          cx={DIAL_RADIUS + 12}
          cy={DIAL_RADIUS + 12}
          r={NOTCH_RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="3"
          strokeDasharray="4 6"
        />

        {/* Active arc showing progress from first to current */}
        {total > 1 && (
          <circle
            cx={DIAL_RADIUS + 12}
            cy={DIAL_RADIUS + 12}
            r={NOTCH_RADIUS}
            fill="none"
            stroke="#F5A86C"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${((current / (total - 1)) * SWEEP / 360) * 2 * Math.PI * NOTCH_RADIUS} ${2 * Math.PI * NOTCH_RADIUS}`}
            strokeDashoffset={NOTCH_RADIUS * Math.PI * 2 * (135 / 360)}
            style={{
              filter: 'drop-shadow(0 0 6px rgba(245,168,108,0.4))',
              transform: `rotate(${START_ANGLE - 90}deg)`,
              transformOrigin: `${DIAL_RADIUS + 12}px ${DIAL_RADIUS + 12}px`,
            }}
          />
        )}

        {/* Notch marks */}
        {notches.map((n) => (
          <circle
            key={n.index}
            cx={DIAL_RADIUS + 12 + n.x}
            cy={DIAL_RADIUS + 12 + n.y}
            r={n.index === current ? 5 : 3}
            fill={n.index === current ? '#F5A86C' : n.index < current ? 'rgba(245,168,108,0.5)' : 'rgba(255,255,255,0.15)'}
            style={n.index === current ? { filter: 'drop-shadow(0 0 4px rgba(245,168,108,0.6))' } : undefined}
          />
        ))}
      </svg>

      {/* Central label */}
      <div className="tm-dial__center">
        <span className="tm-dial__index">{total > 0 ? current + 1 : 0}</span>
        <span className="tm-dial__total">of {total}</span>
      </div>

      {/* Draggable knob */}
      {total > 0 && (
        <div
          className="tm-dial__knob"
          style={{
            left: `calc(50% + ${knobX}px)`,
            top: `calc(50% + ${knobY}px)`,
          }}
        />
      )}
    </div>
  );
}

// ─── State Preview Visual ───────────────────────────────────────────────────

function StatePreview({ checkpoint, isNow }: { checkpoint: Checkpoint | null; isNow: boolean }) {
  if (isNow) {
    return (
      <div className="tm-state-preview tm-state-preview--now">
        <div className="tm-state-preview__visual">
          <div className="tm-state-preview__now-pulse" />
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" stroke="#F5A86C" strokeWidth="2" strokeDasharray="4 4">
              <animateTransform attributeName="transform" type="rotate" values="0 24 24;360 24 24" dur="20s" repeatCount="indefinite" />
            </circle>
            <circle cx="24" cy="24" r="8" fill="#F5A86C" fillOpacity="0.3" />
            <circle cx="24" cy="24" r="4" fill="#F5A86C" />
          </svg>
        </div>
        <div className="tm-state-preview__info">
          <span className="tm-state-preview__label">Current State</span>
          <span className="tm-state-preview__sublabel">Live project - all changes are saved</span>
        </div>
      </div>
    );
  }

  if (!checkpoint) {
    return (
      <div className="tm-state-preview tm-state-preview--empty">
        <div className="tm-state-preview__visual">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
            <path d="M24 16v8l5 3" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="tm-state-preview__info">
          <span className="tm-state-preview__label">No checkpoints yet</span>
          <span className="tm-state-preview__sublabel">Checkpoints are created as you build</span>
        </div>
      </div>
    );
  }

  const meta = getTriggerMeta(checkpoint.trigger);
  const scoreColor = checkpoint.qualityScore != null ? getScoreColor(checkpoint.qualityScore) : '#9ca3af';

  return (
    <div className="tm-state-preview">
      {/* Visual state representation */}
      <div className="tm-state-preview__visual">
        {/* Quality score ring */}
        <svg width="80" height="80" viewBox="0 0 80 80" className="tm-state-preview__score-ring">
          <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
          {checkpoint.qualityScore != null && (
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke={scoreColor}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${(checkpoint.qualityScore / 100) * 2 * Math.PI * 34} ${2 * Math.PI * 34}`}
              transform="rotate(-90 40 40)"
              style={{ filter: `drop-shadow(0 0 6px ${scoreColor}40)` }}
            />
          )}
        </svg>

        {/* Center icon */}
        <div className="tm-state-preview__center-icon">
          <TriggerIcon trigger={checkpoint.trigger} size={24} />
        </div>

        {/* Score text */}
        {checkpoint.qualityScore != null && (
          <span className="tm-state-preview__score-text" style={{ color: scoreColor }}>
            {checkpoint.qualityScore}%
          </span>
        )}
      </div>

      {/* State info */}
      <div className="tm-state-preview__info">
        <span className="tm-state-preview__label">{checkpoint.label || 'Checkpoint'}</span>
        <div className="tm-state-preview__meta-row">
          <span className="tm-state-preview__trigger" style={{ color: meta.color }}>{meta.label}</span>
          <span className="tm-state-preview__phase">{getPhaseLabel(checkpoint.phase)}</span>
        </div>
        <div className="tm-state-preview__details">
          <span>{checkpoint.filesCount} files</span>
          <span className="tm-state-preview__separator" />
          <span>{formatSize(checkpoint.size)}</span>
          <span className="tm-state-preview__separator" />
          <span>{formatTimeAgo(checkpoint.timestamp)}</span>
          {checkpoint.gitCommit && (
            <>
              <span className="tm-state-preview__separator" />
              <span className="tm-state-preview__git">{checkpoint.gitCommit.slice(0, 7)}</span>
            </>
          )}
        </div>
        {checkpoint.description && (
          <p className="tm-state-preview__desc">{checkpoint.description}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function TimeMachineTimeline({ visible, onClose }: TimeMachineTimelineProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialIndex, setDialIndex] = useState(0); // 0..sorted.length (last = NOW)
  const [restoring, setRestoring] = useState<string | null>(null);
  const [storageUsed, setStorageUsed] = useState(0);
  const [storageLimit, setStorageLimit] = useState(500);
  const [creating, setCreating] = useState(false);

  // Fetch checkpoints from API
  const fetchCheckpoints = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/checkpoints/list/${projectId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success && data.checkpoints) {
        const mapped = data.checkpoints.map((cp: Record<string, unknown>) => ({
          ...cp,
          timestamp: new Date(cp.timestamp as string || cp.createdAt as string),
        }));
        setCheckpoints(mapped);
        setStorageUsed(data.storageUsedMB || 0);
        setStorageLimit(data.storageLimitMB || 500);
        // Default to NOW position (last index)
        setDialIndex(mapped.length);
      }
    } catch {
      // Fallback demo data for when API is unavailable
      const demo: Checkpoint[] = [
        {
          id: 'demo-1',
          timestamp: new Date(Date.now() - 10800000),
          trigger: 'error_recovery',
          label: 'Error recovery',
          qualityScore: 65,
          filesCount: 20,
          size: 1.0,
          description: 'State preserved after build failure',
          phase: 'parallel_build',
        },
        {
          id: 'demo-2',
          timestamp: new Date(Date.now() - 5400000),
          trigger: 'manual',
          label: 'Before refactor',
          qualityScore: 78,
          filesCount: 18,
          size: 0.9,
          description: 'Manual save before refactoring auth',
          phase: 'implementation',
        },
        {
          id: 'demo-3',
          timestamp: new Date(Date.now() - 1800000),
          trigger: 'phase_complete',
          label: 'Build Phase Done',
          qualityScore: 92,
          gitCommit: 'a1b2c3d',
          filesCount: 22,
          size: 1.1,
          description: 'Completed implementation phase',
          phase: 'integration',
        },
        {
          id: 'demo-4',
          timestamp: new Date(Date.now() - 300000),
          trigger: 'auto',
          label: 'Auto-save',
          qualityScore: 88,
          filesCount: 24,
          size: 1.2,
          description: 'Automatic checkpoint after edit',
          phase: 'testing',
        },
      ];
      setCheckpoints(demo);
      setDialIndex(demo.length); // NOW
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (visible) {
      fetchCheckpoints();
    }
  }, [visible, fetchCheckpoints]);

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        setDialIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        setDialIndex(prev => Math.min(sorted.length, prev + 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sorted checkpoints (oldest → newest)
  const sorted = useMemo(
    () => [...checkpoints].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
    [checkpoints]
  );

  // The total dial positions = checkpoints + 1 (NOW)
  const totalPositions = sorted.length + 1;
  const isNow = dialIndex >= sorted.length;
  const activeCheckpoint = isNow ? null : sorted[dialIndex] ?? null;

  // Restore checkpoint
  const handleRestore = useCallback(
    async (checkpointId: string) => {
      if (!projectId) return;
      setRestoring(checkpointId);
      try {
        const response = await fetch(`/api/checkpoints/${projectId}/${checkpointId}/restore`, {
          method: 'POST',
          credentials: 'include',
        });
        const data = await response.json();
        if (data.success) {
          fetchCheckpoints();
        }
      } catch {
        // Restore failed silently; user can retry
      }
      setRestoring(null);
    },
    [projectId, fetchCheckpoints]
  );

  // Create manual checkpoint
  const handleCreate = useCallback(async () => {
    if (!projectId) return;
    setCreating(true);
    try {
      await fetch('/api/checkpoints/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, trigger: 'manual', label: 'Manual checkpoint' }),
      });
      fetchCheckpoints();
    } catch {
      // Create failed silently
    }
    setCreating(false);
  }, [projectId, fetchCheckpoints]);

  const storagePercent = storageLimit > 0 ? (storageUsed / storageLimit) * 100 : 0;

  if (!visible) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="tm-timeline"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
        >
          {/* Frosted glass container */}
          <div className="tm-timeline__glass">
            {/* Glass layers */}
            <div className="tm-timeline__frost" />
            <div className="tm-timeline__frost-inner" />
            <div className="tm-timeline__specular" />
            <div className="tm-timeline__shadow" />
            <div className="tm-timeline__highlight" />

            {/* Header row */}
            <div className="tm-timeline__header">
              <div className="tm-timeline__title-group">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="tm-timeline__title-icon">
                  <circle cx="8" cy="8" r="6" stroke="#F5A86C" strokeWidth="1.2" />
                  <path d="M8 5v3.5l2.5 1.5" stroke="#F5A86C" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M4 2.5L3 1M12 2.5L13 1" stroke="#F5A86C" strokeWidth="1" strokeLinecap="round" />
                </svg>
                <span className="tm-timeline__title">Time Machine</span>
                <span className="tm-timeline__badge">
                  {loading ? '...' : `${sorted.length} checkpoints`}
                </span>
              </div>

              <div className="tm-timeline__header-right">
                {/* Storage meter */}
                <div className="tm-timeline__storage">
                  <div className="tm-timeline__storage-bar">
                    <div
                      className="tm-timeline__storage-fill"
                      style={{ width: `${Math.min(100, storagePercent)}%` }}
                    />
                  </div>
                  <span className="tm-timeline__storage-label">
                    {formatSize(storageUsed)} / {formatSize(storageLimit)}
                  </span>
                </div>

                {/* Close button */}
                <button className="tm-timeline__close" onClick={onClose} aria-label="Close Time Machine">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Main content: Dial + State Preview */}
            <div className="tm-body">
              {loading ? (
                <div className="tm-body__loading">
                  <svg width="24" height="24" viewBox="0 0 24 24" className="tm-timeline__spinner">
                    <circle cx="12" cy="12" r="10" stroke="rgba(245,168,108,0.2)" strokeWidth="2.5" fill="none" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="#F5A86C" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  </svg>
                </div>
              ) : (
                <>
                  {/* Dial section */}
                  <div className="tm-body__dial-section">
                    <TimeDial
                      total={totalPositions}
                      current={dialIndex}
                      onChange={setDialIndex}
                    />

                    {/* Rewind / Forward labels */}
                    <div className="tm-body__dial-labels">
                      <button
                        className="tm-body__nav-btn"
                        onClick={() => setDialIndex(prev => Math.max(0, prev - 1))}
                        disabled={dialIndex <= 0}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M8 3L3 8l5 5M13 3l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>Rewind</span>
                      </button>
                      <button
                        className="tm-body__nav-btn"
                        onClick={() => setDialIndex(prev => Math.min(sorted.length, prev + 1))}
                        disabled={dialIndex >= sorted.length}
                      >
                        <span>Forward</span>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M8 3l5 5-5 5M3 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* State preview section */}
                  <div className="tm-body__preview-section">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={isNow ? 'now' : activeCheckpoint?.id || 'empty'}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.25 }}
                      >
                        <StatePreview checkpoint={activeCheckpoint} isNow={isNow} />
                      </motion.div>
                    </AnimatePresence>

                    {/* Action buttons */}
                    {!isNow && activeCheckpoint && (
                      <motion.div
                        className="tm-body__actions"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                      >
                        <button
                          className="tm-body__action tm-body__action--restore"
                          onClick={() => handleRestore(activeCheckpoint.id)}
                          disabled={restoring === activeCheckpoint.id}
                        >
                          {restoring === activeCheckpoint.id ? (
                            <svg width="14" height="14" viewBox="0 0 20 20" className="tm-timeline__spinner">
                              <circle cx="10" cy="10" r="8" stroke="rgba(0,0,0,0.15)" strokeWidth="2" fill="none" />
                              <path d="M10 2a8 8 0 0 1 8 8" stroke="#000" strokeWidth="2" strokeLinecap="round" fill="none" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                              <path d="M2 8a6 6 0 1 1 1.76 4.24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                              <path d="M2 4v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                          Restore to this point
                        </button>
                      </motion.div>
                    )}

                    {/* Create checkpoint button (shown at NOW) */}
                    {isNow && (
                      <motion.div
                        className="tm-body__actions"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                      >
                        <button
                          className="tm-body__action tm-body__action--create"
                          onClick={handleCreate}
                          disabled={creating}
                        >
                          {creating ? (
                            <svg width="14" height="14" viewBox="0 0 20 20" className="tm-timeline__spinner">
                              <circle cx="10" cy="10" r="8" stroke="rgba(245,168,108,0.3)" strokeWidth="2" fill="none" />
                              <path d="M10 2a8 8 0 0 1 8 8" stroke="#F5A86C" strokeWidth="2" strokeLinecap="round" fill="none" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          )}
                          Create checkpoint now
                        </button>
                      </motion.div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Bottom checkpoint strip - mini timeline */}
            {!loading && sorted.length > 0 && (
              <div className="tm-strip">
                {sorted.map((cp, i) => {
                  const isActive = i === dialIndex;
                  const meta = getTriggerMeta(cp.trigger);
                  return (
                    <button
                      key={cp.id}
                      className={`tm-strip__item ${isActive ? 'tm-strip__item--active' : ''}`}
                      onClick={() => setDialIndex(i)}
                      title={`${cp.label || 'Checkpoint'} - ${formatTimeAgo(cp.timestamp)}`}
                    >
                      <div
                        className="tm-strip__dot"
                        style={{ background: isActive ? meta.color : 'rgba(255,255,255,0.2)' }}
                      />
                      <span className="tm-strip__label">{formatTimeAgo(cp.timestamp)}</span>
                    </button>
                  );
                })}
                <button
                  className={`tm-strip__item ${isNow ? 'tm-strip__item--active' : ''}`}
                  onClick={() => setDialIndex(sorted.length)}
                  title="Current state"
                >
                  <div
                    className="tm-strip__dot tm-strip__dot--now"
                    style={{ background: isNow ? '#F5A86C' : 'rgba(245,168,108,0.3)' }}
                  />
                  <span className="tm-strip__label">Now</span>
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default TimeMachineTimeline;
