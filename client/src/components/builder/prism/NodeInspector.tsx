/**
 * NodeInspector — Detailed view of a single graph node.
 *
 * Shows the node's caption, visual spec, behavior spec, code (if generated),
 * verification score, and image. Used alongside GraphVisualization.
 */

import { useState, useCallback } from 'react';
import { usePrismStore } from '@/store/usePrismStore';
import { ShaderButton } from '@/components/shaders';
import { CloseIcon } from '@/components/ui/icons';
import type { GraphNode } from '@kriptik/shared-interfaces';

interface NodeInspectorProps {
  nodeId: string;
  onClose: () => void;
}

export function NodeInspector({ nodeId, onClose }: NodeInspectorProps) {
  const { currentGraph, nodeStatuses, captionVerifyResults, editNode } = usePrismStore();
  const node = currentGraph?.nodes.find((n: GraphNode) => n.id === nodeId);
  const status = nodeStatuses[nodeId];
  const captionResult = captionVerifyResults[nodeId];

  const [isEditing, setIsEditing] = useState(false);
  const [editCaption, setEditCaption] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleStartEdit = useCallback(() => {
    if (node) {
      setEditCaption(node.caption);
      setIsEditing(true);
    }
  }, [node]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditCaption('');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!currentGraph || !node || !editCaption.trim()) return;
    setIsSaving(true);
    try {
      await editNode(currentGraph.id, nodeId, { caption: editCaption });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }, [currentGraph, node, nodeId, editCaption, editNode]);

  if (!node) {
    return (
      <div style={{ padding: 14, color: 'rgba(161,161,170,0.5)', fontSize: 12 }}>
        Node not found
      </div>
    );
  }

  const scorePercent = status?.verificationScore != null
    ? (status.verificationScore * 100).toFixed(0)
    : null;

  const scoreColor = status?.verificationScore != null
    ? status.verificationScore >= 0.85 ? '#34d399'
      : status.verificationScore >= 0.6 ? '#fbbf24'
      : '#f87171'
    : 'rgba(161,161,170,0.4)';

  const isNodeEditing = status?.phase === 'generating';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
            {node.elementType || node.type}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(161,161,170,0.4)', fontFamily: 'JetBrains Mono, monospace' }}>
            {node.id.slice(0, 8)}
          </div>
        </div>
        <ShaderButton variant="ghost" size="sm" onClick={onClose}>
          <CloseIcon size={12} />
        </ShaderButton>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Status + Score */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
            background: 'rgba(255,255,255,0.04)', color: '#e2e8f0',
          }}>
            {isNodeEditing ? 'regenerating' : (status?.phase || node.status)}
          </div>
          {scorePercent && (
            <div style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
              background: `${scoreColor}10`, color: scoreColor,
            }}>
              Score: {scorePercent}%
            </div>
          )}
        </div>

        {/* Image */}
        {node.imageUrl && (
          <div style={{
            borderRadius: 10, overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <img
              src={node.imageUrl}
              alt={node.elementType || 'node'}
              style={{ width: '100%', display: 'block' }}
            />
          </div>
        )}

        {/* Caption — editable */}
        <Section title="Caption">
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <textarea
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value)}
                style={{
                  fontSize: 11, color: '#e2e8f0', lineHeight: 1.6,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6, padding: 8, resize: 'vertical',
                  minHeight: 80, fontFamily: 'inherit', width: '100%',
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <ShaderButton
                  variant="ghost"
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={isSaving || !editCaption.trim()}
                >
                  {isSaving ? 'Saving...' : 'Save & Regenerate'}
                </ShaderButton>
                <ShaderButton variant="ghost" size="sm" onClick={handleCancelEdit}>
                  Cancel
                </ShaderButton>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: 'rgba(161,161,170,0.7)', lineHeight: 1.6 }}>
                {node.caption}
              </div>
              {captionResult && (
                <div style={{
                  marginTop: 6, padding: '4px 8px', borderRadius: 6, fontSize: 10,
                  background: captionResult.passed ? 'rgba(52,211,153,0.06)' : 'rgba(248,113,113,0.06)',
                  color: captionResult.passed ? '#34d399' : '#f87171',
                }}>
                  Caption {captionResult.passed ? 'verified' : 'needs repair'}
                  {captionResult.reason && `: ${captionResult.reason}`}
                </div>
              )}
              <ShaderButton
                variant="ghost"
                size="sm"
                onClick={handleStartEdit}
                disabled={isNodeEditing}
                style={{ marginTop: 6, alignSelf: 'flex-start' }}
              >
                Edit Caption
              </ShaderButton>
            </>
          )}
        </Section>

        {/* Visual Spec */}
        <Section title="Visual Spec">
          <div style={{ fontSize: 10, color: 'rgba(161,161,170,0.5)', lineHeight: 1.5 }}>
            {node.visualSpec.description}
          </div>
          {node.visualSpec.colors.primary && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <span style={{
                width: 12, height: 12, borderRadius: 3,
                background: node.visualSpec.colors.primary,
                border: '1px solid rgba(255,255,255,0.1)',
              }} />
              <span style={{ fontSize: 10, color: 'rgba(161,161,170,0.4)', fontFamily: 'JetBrains Mono, monospace' }}>
                {node.visualSpec.colors.primary}
              </span>
            </div>
          )}
        </Section>

        {/* Behavior */}
        {node.behaviorSpec.interactions.length > 0 && (
          <Section title="Interactions">
            {node.behaviorSpec.interactions.map((inter, i) => (
              <div key={i} style={{
                fontSize: 10, color: 'rgba(161,161,170,0.5)',
                padding: '4px 8px', borderRadius: 4,
                background: 'rgba(255,255,255,0.02)',
                marginBottom: 2,
              }}>
                {inter.event} → {inter.action}
                {inter.targetHubId && <span style={{ color: '#60a5fa' }}> → hub:{inter.targetHubId.slice(0, 8)}</span>}
              </div>
            ))}
          </Section>
        )}

        {/* Hub Memberships */}
        {node.hubMemberships.length > 0 && (
          <Section title="Hub Memberships">
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {node.hubMemberships.map((hubId) => {
                const hub = currentGraph?.hubs.find(h => h.id === hubId);
                return (
                  <span key={hubId} style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 4,
                    background: 'rgba(255,255,255,0.04)', color: 'rgba(161,161,170,0.6)',
                  }}>
                    {hub?.name || hubId.slice(0, 8)}
                  </span>
                );
              })}
            </div>
          </Section>
        )}

        {/* Code Preview (read-only) */}
        {node.code && (
          <Section title="Generated Code">
            <pre style={{
              fontSize: 10, color: 'rgba(161,161,170,0.5)',
              background: 'rgba(0,0,0,0.2)', padding: 8, borderRadius: 6,
              overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap',
              fontFamily: 'JetBrains Mono, monospace',
            }}>
              {node.code.slice(0, 500)}{node.code.length > 500 ? '\n...' : ''}
            </pre>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 600, color: 'rgba(161,161,170,0.4)',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export default NodeInspector;
