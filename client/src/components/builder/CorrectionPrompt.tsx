import { useState } from 'react';
import { SendIcon, XIcon, CheckIcon } from '@/components/ui/icons';
import type { AgentInfo, EventGroup } from '@/hooks/useAgentTracker';
import { apiClient } from '@/lib/api-client';

/**
 * Inline correction input anchored to a response box.
 *
 * User types a correction → it flows to the Brain as a richly contextual directive.
 * No agent stops. The Lead Agent reasons about the correction and decides how to handle it.
 * If it's a persistent rule, the Lead writes a constraint node so all future agents follow it.
 */
export function CorrectionPrompt({
  group,
  agent,
  projectId,
  onClose,
}: {
  group: EventGroup;
  agent: AgentInfo;
  projectId: string;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);

    try {
      // Build event context from the group
      const fileEvent = group.events.find(e => e.type === 'agent_file_write');
      const toolEvent = group.events.find(e => e.type === 'agent_tool_call');
      const textEvent = group.events.find(e => e.type === 'agent_text');

      const eventContext = {
        sessionId: agent.sessionId,
        agentRole: agent.role,
        eventType: fileEvent?.type || toolEvent?.type || textEvent?.type || group.events[0]?.type || 'unknown',
        file: fileEvent ? extractFilePath(fileEvent) : undefined,
        contentPreview: textEvent
          ? String(textEvent.data.text || '').slice(0, 200)
          : toolEvent
          ? `Using ${String(toolEvent.data.tool || 'tool')}`
          : undefined,
      };

      await apiClient.sendCorrection(projectId, text.trim(), eventContext);
      setSent(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      console.error('Failed to send correction:', err);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/5 border border-green-500/20 text-xs text-green-400">
        <CheckIcon size={12} />
        Correction sent — agents will adapt
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-kriptik-amber/20 bg-kriptik-amber/5 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-kriptik-amber font-medium">
          Correcting {agent.role}'s work
        </span>
        <button onClick={onClose} className="text-kriptik-slate hover:text-kriptik-white">
          <XIcon size={14} />
        </button>
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Describe what should change..."
          autoFocus
          className="flex-1 bg-kriptik-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-kriptik-white placeholder:text-kriptik-slate focus:outline-none focus:border-kriptik-amber/30"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="px-3 py-2 bg-kriptik-amber/15 text-kriptik-amber rounded-lg hover:bg-kriptik-amber/25 disabled:opacity-30 transition-colors"
        >
          <SendIcon size={14} />
        </button>
      </div>
    </div>
  );
}

function extractFilePath(event: { data: Record<string, unknown> }): string {
  const input = event.data.input as Record<string, unknown> | undefined;
  return String(input?.path || input?.filePath || event.data.path || event.data.filePath || '');
}
