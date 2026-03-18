import { ZapIcon, LayersIcon, DatabaseIcon, CodeIcon, LoadingIcon } from '@/components/ui/icons';
import type { Speculation } from '@/hooks/useSpeculation';

interface SpeculativePlanProps {
  speculation: Speculation | null;
  isAnalyzing: boolean;
}

/**
 * Shows the AI's speculative analysis of the user's prompt.
 * Updates in real-time as the user types.
 *
 * This displays REAL AI inference results — not patterns or templates.
 * The AI genuinely reads the partial prompt and reasons about architecture.
 */
export function SpeculativePlan({ speculation, isAnalyzing }: SpeculativePlanProps) {
  if (!speculation && !isAnalyzing) return null;

  return (
    <div className="border-t border-white/5 bg-kriptik-charcoal/50">
      {isAnalyzing && !speculation && (
        <div className="flex items-center gap-2 px-4 py-2">
          <LoadingIcon size={12} className="animate-spin text-kriptik-lime/60" />
          <span className="text-xs text-kriptik-slate">Analyzing your prompt...</span>
        </div>
      )}

      {speculation && (
        <div className="px-4 py-3 space-y-2">
          {/* App type + confidence */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ZapIcon size={12} className="text-kriptik-lime" />
              <span className="text-xs font-medium text-kriptik-white">{speculation.appType}</span>
            </div>
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              speculation.estimatedComplexity === 'simple' ? 'bg-green-500/15 text-green-400' :
              speculation.estimatedComplexity === 'moderate' ? 'bg-yellow-500/15 text-yellow-400' :
              speculation.estimatedComplexity === 'complex' ? 'bg-orange-500/15 text-orange-400' :
              'bg-red-500/15 text-red-400'
            }`}>
              {speculation.estimatedComplexity}
            </span>
            {isAnalyzing && <LoadingIcon size={10} className="animate-spin text-kriptik-lime/40" />}
          </div>

          {/* Suggested stack */}
          <div className="flex flex-wrap gap-1.5">
            {speculation.suggestedStack.framework && (
              <StackTag icon={<CodeIcon size={10} />} label={speculation.suggestedStack.framework} />
            )}
            {speculation.suggestedStack.styling && (
              <StackTag icon={<LayersIcon size={10} />} label={speculation.suggestedStack.styling} />
            )}
            {speculation.suggestedStack.database && (
              <StackTag icon={<DatabaseIcon size={10} />} label={speculation.suggestedStack.database} />
            )}
            {speculation.suggestedStack.apis.slice(0, 3).map((api) => (
              <StackTag key={api} label={api} />
            ))}
          </div>

          {/* Key components */}
          {speculation.estimatedComponents.length > 0 && (
            <div className="text-xs text-kriptik-slate">
              <span className="text-kriptik-silver">Components: </span>
              {speculation.estimatedComponents.slice(0, 5).join(' → ')}
            </div>
          )}

          {/* Considerations */}
          {speculation.keyConsiderations.length > 0 && (
            <div className="text-xs text-kriptik-slate/80 leading-relaxed">
              {speculation.keyConsiderations[0]}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StackTag({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-white/5 text-kriptik-silver rounded border border-white/5">
      {icon}
      {label}
    </span>
  );
}
