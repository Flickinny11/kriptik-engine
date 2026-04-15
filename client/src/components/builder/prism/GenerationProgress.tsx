/**
 * GenerationProgress — Pipeline progress with phase indicators.
 *
 * Shows which pipeline phase is active, overall progress bar,
 * and the current phase description. All state from usePrismStore.
 */

import { motion } from 'framer-motion';
import { usePrismStore, type PipelinePhase } from '@/store/usePrismStore';
import { LoadingIcon } from '@/components/ui/icons';

const PHASE_CONFIG: Array<{ phase: PipelinePhase; label: string; icon: string }> = [
  { phase: 'planning', label: 'Planning', icon: '1' },
  { phase: 'awaiting_approval', label: 'Approval', icon: '2' },
  { phase: 'deps', label: 'Dependencies', icon: '3' },
  { phase: 'generating', label: 'Image Gen', icon: '4' },
  { phase: 'caption_verifying', label: 'Caption Verify', icon: '5' },
  { phase: 'codegen', label: 'Code Gen', icon: '6' },
  { phase: 'verifying', label: 'Verification', icon: '7' },
  { phase: 'repairing', label: 'Repair', icon: '8' },
  { phase: 'assembling', label: 'Assembly', icon: '9' },
  { phase: 'backend', label: 'Backend', icon: '10' },
  { phase: 'deploying', label: 'Deploy', icon: '11' },
  { phase: 'complete', label: 'Complete', icon: '12' },
];

function getPhaseIndex(phase: PipelinePhase): number {
  const idx = PHASE_CONFIG.findIndex(p => p.phase === phase);
  return idx >= 0 ? idx : 0;
}

export function GenerationProgress() {
  const { pipelinePhase, progress, buildError } = usePrismStore();

  if (pipelinePhase === 'idle' || pipelinePhase === 'awaiting_approval') return null;

  const currentIdx = getPhaseIndex(pipelinePhase);
  const isFailed = pipelinePhase === 'failed';
  const isComplete = pipelinePhase === 'complete';

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Progress Bar */}
      <div style={{ position: 'relative', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <motion.div
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{
            height: '100%', borderRadius: 2,
            background: isFailed
              ? 'linear-gradient(90deg, #f87171, #ef4444)'
              : isComplete
                ? 'linear-gradient(90deg, #34d399, #10b981)'
                : 'linear-gradient(90deg, #fbbf24, #f59e0b)',
            boxShadow: isFailed
              ? '0 0 8px rgba(248,113,113,0.4)'
              : isComplete
                ? '0 0 8px rgba(52,211,153,0.4)'
                : '0 0 8px rgba(251,191,36,0.4)',
          }}
        />
      </div>

      {/* Current Phase Info */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isComplete && !isFailed && <LoadingIcon size={12} style={{ color: '#fbbf24' }} />}
          {isComplete && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399' }} />}
          {isFailed && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171' }} />}
          <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
            {PHASE_CONFIG[currentIdx]?.label || pipelinePhase}
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'rgba(161,161,170,0.5)', fontFamily: 'JetBrains Mono, monospace' }}>
          {progress}%
        </span>
      </div>

      {/* Phase Steps */}
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {PHASE_CONFIG.map((cfg, i) => {
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div
              key={cfg.phase}
              style={{
                flex: 1, minWidth: 20, height: 3, borderRadius: 1.5,
                background: isDone
                  ? 'rgba(52,211,153,0.6)'
                  : isCurrent
                    ? isFailed ? 'rgba(248,113,113,0.6)' : 'rgba(251,191,36,0.6)'
                    : 'rgba(255,255,255,0.06)',
                transition: 'background 0.3s',
              }}
              title={cfg.label}
            />
          );
        })}
      </div>

      {/* Error Display */}
      {isFailed && buildError && (
        <div style={{
          padding: '10px 12px', borderRadius: 10,
          background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#f87171', marginBottom: 4 }}>
            Error in {buildError.phase}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(248,113,113,0.8)', lineHeight: 1.5 }}>
            {buildError.message}
          </div>
          {buildError.suggestion && (
            <div style={{ fontSize: 11, color: 'rgba(161,161,170,0.5)', marginTop: 6 }}>
              {buildError.suggestion}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default GenerationProgress;
