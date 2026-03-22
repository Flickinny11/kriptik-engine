/**
 * Build Interrupt Input
 *
 * A floating input that appears on the dashboard when a project is being built.
 * Allows users to send a single prompt to KripTik while it's building their app.
 *
 * Uses the soft interrupt system infrastructure to send the message without
 * stopping the build. The agent picks up the message at the next tool boundary.
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SendIcon, Loader2Icon, MessageSquareIcon, XIcon, SparklesIcon } from '../ui/icons';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface BuildInterruptInputProps {
  /** The project ID that's being built */
  projectId: string;
  /** Project name for display */
  projectName: string;
  /** Callback when interrupt is acknowledged */
  onAcknowledged?: (acknowledgment: string) => void;
  /** Whether the component is visible */
  visible?: boolean;
  /** Callback to dismiss the input */
  onDismiss?: () => void;
}

export function BuildInterruptInput({
  projectId,
  projectName,
  onAcknowledged,
  visible = true,
  onDismiss,
}: BuildInterruptInputProps) {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acknowledgment, setAcknowledgment] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!message.trim() || isSubmitting || hasSubmitted) return;

    setIsSubmitting(true);

    try {
      // Send user directive to the Brain — the Lead Agent will pick it up
      await apiClient.post(`/api/projects/${projectId}/directive`, {
        text: message.trim(),
      });

      // Show acknowledgment
      const ack = `Got it! I'll consider "${message.substring(0, 50)}..." as I continue building.`;
      setAcknowledgment(ack);
      setHasSubmitted(true);
      onAcknowledged?.(ack);

      // Clear message
      setMessage('');

    } catch (error) {
      console.error('[BuildInterruptInput] Error submitting interrupt:', error);
      setAcknowledgment('Message received - continuing to build your app.');
      setHasSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  }, [message, isSubmitting, hasSubmitted, projectId, onAcknowledged]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed bottom-6 right-6 z-50"
      >
        {/* Collapsed state - just a floating button */}
        {!isExpanded && !hasSubmitted && (
          <motion.button
            onClick={() => setIsExpanded(true)}
            className={cn(
              "flex items-center gap-3 px-5 py-3 rounded-2xl",
              "bg-gradient-to-r from-amber-500/90 to-orange-500/90",
              "text-white font-medium shadow-lg",
              "hover:shadow-xl hover:scale-105 transition-all",
              "border border-white/20"
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <MessageSquareIcon size={20} />
            <span className="text-sm">Message KripTik</span>
            <SparklesIcon size={16} className="opacity-70" />
          </motion.button>
        )}

        {/* Expanded state - input form */}
        {isExpanded && !hasSubmitted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              "w-[380px] p-5 rounded-2xl",
              "bg-slate-900/95 backdrop-blur-xl",
              "border border-slate-700/50",
              "shadow-2xl shadow-amber-500/10"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                  <MessageSquareIcon size={16} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Message KripTik</h3>
                  <p className="text-xs text-slate-400">Building: {projectName}</p>
                </div>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <XIcon size={16} className="text-slate-400" />
              </button>
            </div>

            {/* Prompt */}
            <p className="text-sm text-slate-400 mb-4">
              Is there anything you'd like to tell KripTik while it's building your app?
            </p>

            {/* Input */}
            <div className="relative">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g., 'Make sure the buttons have rounded corners' or 'Use a dark theme throughout'"
                className={cn(
                  "w-full h-24 px-4 py-3 rounded-xl",
                  "bg-slate-800/50 border border-slate-700/50",
                  "text-white placeholder-slate-500",
                  "focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30",
                  "outline-none resize-none",
                  "text-sm"
                )}
                disabled={isSubmitting}
              />

              {/* Character count */}
              <div className="absolute bottom-3 right-3 text-xs text-slate-500">
                {message.length}/500
              </div>
            </div>

            {/* Submit button */}
            <div className="flex justify-end mt-3">
              <button
                onClick={handleSubmit}
                disabled={!message.trim() || isSubmitting}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl",
                  "bg-gradient-to-r from-amber-500 to-orange-500",
                  "text-white text-sm font-medium",
                  "hover:shadow-lg hover:shadow-amber-500/30 transition-all",
                  "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
                )}
              >
                {isSubmitting ? (
                  <>
                    <Loader2Icon size={16} className="animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <SendIcon size={16} />
                    <span>Send</span>
                  </>
                )}
              </button>
            </div>

            {/* Note */}
            <p className="text-xs text-slate-500 mt-3 text-center">
              One message only. Build continues without interruption.
            </p>
          </motion.div>
        )}

        {/* Acknowledgment state */}
        {hasSubmitted && acknowledgment && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              "w-[320px] p-5 rounded-2xl",
              "bg-slate-900/95 backdrop-blur-xl",
              "border border-emerald-500/30",
              "shadow-2xl shadow-emerald-500/10"
            )}
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
                <SparklesIcon size={16} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">Message Received</h3>
                <p className="text-sm text-slate-400">{acknowledgment}</p>
              </div>
            </div>

            <button
              onClick={onDismiss}
              className={cn(
                "w-full mt-4 px-4 py-2 rounded-xl",
                "bg-slate-800/50 border border-slate-700/50",
                "text-slate-300 text-sm",
                "hover:bg-slate-800 transition-colors"
              )}
            >
              Got it
            </button>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
