/**
 * NodeStatusGrid — Grid of nodes showing verification status.
 *
 * Each cell shows a node's current phase (pending, generating,
 * verifying, verified, repairing, failed) with color coding.
 * Clicking a node opens NodeInspector.
 */

import { usePrismStore, type NodeStatus } from '@/store/usePrismStore';

interface NodeStatusGridProps {
  onSelectNode?: (nodeId: string) => void;
  selectedNodeId?: string | null;
}

const STATUS_COLORS: Record<NodeStatus['phase'], { bg: string; border: string; dot: string }> = {
  pending: { bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.06)', dot: 'rgba(161,161,170,0.4)' },
  image_ready: { bg: 'rgba(96,165,250,0.04)', border: 'rgba(96,165,250,0.12)', dot: '#60a5fa' },
  caption_verified: { bg: 'rgba(168,85,247,0.04)', border: 'rgba(168,85,247,0.12)', dot: '#a855f7' },
  generating: { bg: 'rgba(251,191,36,0.04)', border: 'rgba(251,191,36,0.12)', dot: '#fbbf24' },
  verifying: { bg: 'rgba(251,191,36,0.04)', border: 'rgba(251,191,36,0.12)', dot: '#f59e0b' },
  verified: { bg: 'rgba(52,211,153,0.04)', border: 'rgba(52,211,153,0.12)', dot: '#34d399' },
  repairing: { bg: 'rgba(251,146,60,0.04)', border: 'rgba(251,146,60,0.12)', dot: '#fb923c' },
  failed: { bg: 'rgba(248,113,113,0.04)', border: 'rgba(248,113,113,0.12)', dot: '#f87171' },
};

export function NodeStatusGrid({ onSelectNode, selectedNodeId }: NodeStatusGridProps) {
  const { nodeStatuses, currentGraph } = usePrismStore();

  const nodes = currentGraph?.nodes || [];
  const statuses = Object.values(nodeStatuses);

  if (statuses.length === 0) return null;

  const counts = statuses.reduce<Record<string, number>>((acc, s) => {
    acc[s.phase] = (acc[s.phase] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 14px' }}>
      {/* Summary */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {Object.entries(counts).map(([phase, count]) => {
          const colors = STATUS_COLORS[phase as NodeStatus['phase']] || STATUS_COLORS.pending;
          return (
            <div key={phase} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(161,161,170,0.6)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.dot }} />
              {count} {phase}
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(32px, 1fr))',
        gap: 4,
      }}>
        {nodes.map((node) => {
          const status = nodeStatuses[node.id];
          const phase = status?.phase || 'pending';
          const colors = STATUS_COLORS[phase];
          const isSelected = selectedNodeId === node.id;

          return (
            <button
              key={node.id}
              onClick={() => onSelectNode?.(node.id)}
              title={`${node.elementType || node.type} — ${phase}${status?.verificationScore != null ? ` (${(status.verificationScore * 100).toFixed(0)}%)` : ''}`}
              style={{
                width: '100%', aspectRatio: '1',
                borderRadius: 6,
                background: colors.bg,
                border: isSelected ? '2px solid #fbbf24' : `1px solid ${colors.border}`,
                cursor: 'pointer',
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: colors.dot,
                boxShadow: phase === 'generating' || phase === 'verifying'
                  ? `0 0 6px ${colors.dot}` : 'none',
              }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default NodeStatusGrid;
