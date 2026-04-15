/**
 * PlanApprovalView — Interactive plan display with approve/reject.
 *
 * Shows the generated PrismPlan: hubs, elements, inferred needs,
 * estimated cost/time. User approves to trigger Modal pipeline dispatch
 * or rejects with feedback to regenerate.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShaderButton } from '@/components/shaders';
import { CheckIcon, CloseIcon } from '@/components/ui/icons';
import { usePrismStore } from '@/store/usePrismStore';
import type { PrismPlan, HubPlan, ElementPlan } from '@kriptik/shared-interfaces';

interface PlanApprovalViewProps {
  plan: PrismPlan;
}

export function PlanApprovalView({ plan }: PlanApprovalViewProps) {
  const { approvePlan, rejectPlan } = usePrismStore();
  const [feedback, setFeedback] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await approvePlan(plan.id);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!feedback.trim()) return;
    setIsRejecting(true);
    try {
      await rejectPlan(plan.id, feedback.trim());
      setFeedback('');
      setShowRejectInput(false);
    } finally {
      setIsRejecting(false);
    }
  };

  const hubs = plan.graph?.hubs || [];
  const totalElements = hubs.reduce((sum: number, h: HubPlan) => sum + (h.elements?.length || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, height: '100%', overflow: 'auto' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Build Plan Ready</div>
          <div style={{ fontSize: 11, color: 'rgba(161,161,170,0.6)', marginTop: 2 }}>
            Review and approve to start generation
          </div>
        </div>
        <div style={{
          padding: '4px 10px', borderRadius: 6,
          background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)',
          fontSize: 10, fontWeight: 600, color: '#fbbf24',
        }}>
          Awaiting Approval
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[
          { label: 'Pages', value: hubs.length },
          { label: 'Elements', value: totalElements },
          { label: 'Est. Cost', value: `$${(plan.estimatedCost ?? 0).toFixed(2)}` },
        ].map((stat) => (
          <div key={stat.label} style={{
            padding: '10px 12px', borderRadius: 10,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)',
          }}>
            <div style={{ fontSize: 10, color: 'rgba(161,161,170,0.5)', marginBottom: 4 }}>{stat.label}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Hub List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, overflow: 'auto' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(161,161,170,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Pages ({hubs.length})
        </div>
        {hubs.map((hub: HubPlan) => (
          <div key={hub.id} style={{
            padding: '10px 12px', borderRadius: 10,
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{hub.name}</div>
              <div style={{ fontSize: 10, color: 'rgba(161,161,170,0.4)', fontFamily: 'JetBrains Mono, monospace' }}>
                {hub.route}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(161,161,170,0.5)', marginTop: 4 }}>
              {hub.elements?.length || 0} elements
              {hub.authRequired && <span style={{ marginLeft: 8, color: '#fbbf24' }}>Auth required</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Inferred Needs */}
      {plan.inferredNeeds && plan.inferredNeeds.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(161,161,170,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Inferred Needs
          </div>
          {plan.inferredNeeds.map((need, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', borderRadius: 8,
              background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.08)',
              fontSize: 11, color: 'rgba(161,161,170,0.6)',
            }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#34d399', flexShrink: 0 }} />
              {need.name}: {need.description}
            </div>
          ))}
        </div>
      )}

      {/* Reject Feedback Input */}
      {showRejectInput && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What should be changed?"
            style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#e2e8f0',
              outline: 'none', resize: 'none', fontFamily: 'inherit', minHeight: 60,
            }}
          />
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {showRejectInput ? (
          <>
            <ShaderButton variant="ghost" size="md" onClick={() => setShowRejectInput(false)} style={{ flex: 1 }}>
              Cancel
            </ShaderButton>
            <ShaderButton
              variant="danger" size="md" style={{ flex: 1 }}
              onClick={handleReject}
              disabled={isRejecting || !feedback.trim()}
            >
              {isRejecting ? 'Rejecting...' : 'Submit Feedback'}
            </ShaderButton>
          </>
        ) : (
          <>
            <ShaderButton
              variant="ghost" size="md" style={{ flex: 1 }}
              onClick={() => setShowRejectInput(true)}
            >
              <CloseIcon size={12} /> Reject
            </ShaderButton>
            <ShaderButton
              variant="accent" size="md" style={{ flex: 2 }}
              onClick={handleApprove}
              disabled={isApproving}
            >
              <CheckIcon size={12} /> {isApproving ? 'Approving...' : 'Approve & Generate'}
            </ShaderButton>
          </>
        )}
      </div>
    </motion.div>
  );
}

export default PlanApprovalView;
