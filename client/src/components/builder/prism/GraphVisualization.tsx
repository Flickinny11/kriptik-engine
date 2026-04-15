/**
 * GraphVisualization — Renders the PrismGraph as an interactive node graph.
 *
 * Uses HTML/CSS positioned nodes (no Canvas/WebGL dependency here).
 * Shows hubs as groups, nodes as positioned rectangles, edges as connections.
 * Clicking a node triggers onSelectNode for the NodeInspector.
 */

import { useMemo } from 'react';
import { usePrismStore, type NodeStatus } from '@/store/usePrismStore';
import type { GraphNode, Hub, GraphEdge } from '@kriptik/shared-interfaces';

interface GraphVisualizationProps {
  onSelectNode?: (nodeId: string) => void;
  selectedNodeId?: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'rgba(161,161,170,0.3)',
  image_ready: '#60a5fa',
  caption_verified: '#a855f7',
  code_generated: '#fbbf24',
  verified: '#34d399',
  failed: '#f87171',
};

export function GraphVisualization({ onSelectNode, selectedNodeId }: GraphVisualizationProps) {
  const { currentGraph, nodeStatuses } = usePrismStore();

  const hubs = currentGraph?.hubs || [];
  const nodes = currentGraph?.nodes || [];

  // Group nodes by hub
  const hubNodeMap = useMemo(() => {
    const map = new Map<string, GraphNode[]>();
    for (const hub of hubs) {
      map.set(hub.id, nodes.filter(n => n.hubMemberships.includes(hub.id)));
    }
    return map;
  }, [hubs, nodes]);

  if (!currentGraph || hubs.length === 0) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(161,161,170,0.4)', fontSize: 12,
      }}>
        Graph visualization will appear after plan approval
      </div>
    );
  }

  return (
    <div style={{
      height: '100%', overflow: 'auto', padding: 16,
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      {/* Hub Cards */}
      {hubs.map((hub) => {
        const hubNodes = hubNodeMap.get(hub.id) || [];
        return (
          <div key={hub.id} style={{
            borderRadius: 12, padding: 12,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {/* Hub Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{hub.name}</div>
                <div style={{ fontSize: 10, color: 'rgba(161,161,170,0.4)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {hub.route}
                </div>
              </div>
              <div style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 4,
                background: 'rgba(255,255,255,0.04)', color: 'rgba(161,161,170,0.5)',
              }}>
                {hub.layoutTemplate}
              </div>
            </div>

            {/* Nodes Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: 6,
            }}>
              {hubNodes.map((node) => {
                const status = nodeStatuses[node.id];
                const statusColor = STATUS_COLORS[status?.phase || node.status] || STATUS_COLORS.pending;
                const isSelected = selectedNodeId === node.id;
                const isShared = node.hubMemberships.length > 1;

                return (
                  <button
                    key={node.id}
                    onClick={() => onSelectNode?.(node.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: isSelected ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.03)',
                      border: isSelected
                        ? '1px solid rgba(251,191,36,0.3)'
                        : '1px solid rgba(255,255,255,0.04)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: 11, fontWeight: 500, color: '#e2e8f0',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {node.elementType || node.type}
                      </span>
                    </div>
                    <div style={{ fontSize: 9, color: 'rgba(161,161,170,0.4)', lineHeight: 1.3 }}>
                      {node.caption.slice(0, 60)}{node.caption.length > 60 ? '...' : ''}
                    </div>
                    {isShared && (
                      <div style={{
                        fontSize: 9, color: '#a855f7', marginTop: 4,
                        padding: '1px 6px', borderRadius: 3,
                        background: 'rgba(168,85,247,0.08)',
                        display: 'inline-block',
                      }}>
                        shared
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default GraphVisualization;
