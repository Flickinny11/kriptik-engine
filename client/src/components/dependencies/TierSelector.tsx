/**
 * TierSelector
 *
 * Shown after connecting to a service. Displays available subscription tiers
 * so the user can confirm which plan works for their build. The first tier
 * (usually Free) is pre-selected. The agent can recommend a specific tier.
 */

import { useState } from 'react';
import { BrandIcon } from '@/components/ui/BrandIcon';
import { CheckIcon } from '@/components/ui/icons';
import type { ServiceRegistryEntry, PricingTier } from '@/lib/api-client';

interface TierSelectorProps {
  /** The connected service */
  service: ServiceRegistryEntry;
  /** Agent's recommended tier name (optional) */
  recommendedTier?: string;
  /** Called when user confirms a tier */
  onSelect: (tier: PricingTier) => void;
  /** Called when user dismisses */
  onDismiss: () => void;
}

export function TierSelector({
  service,
  recommendedTier,
  onSelect,
  onDismiss,
}: TierSelectorProps) {
  const tiers = service.pricing.filter(t => t.price >= 0); // Exclude custom/enterprise
  const [selectedTier, setSelectedTier] = useState<string>(
    recommendedTier || tiers[0]?.name || ''
  );

  if (tiers.length === 0) return null;

  return (
    <div
      className="rounded-xl border border-white/10 overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, rgba(30,30,30,0.95), rgba(20,20,20,0.95))',
        boxShadow: `0 8px 24px rgba(0,0,0,0.3), 0 0 0 1px ${service.brandColor}10`,
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center gap-3 border-b border-white/5"
        style={{ background: `${service.brandColor}08` }}
      >
        <BrandIcon
          iconId={service.iconSlug}
          size={24}
          color={service.brandColor}
          ariaLabel={service.name}
        />
        <div>
          <p className="text-sm font-medium text-kriptik-white">
            Connected to {service.name}
          </p>
          <p className="text-xs text-kriptik-silver">
            Choose a plan for your project
          </p>
        </div>
      </div>

      {/* Tier cards */}
      <div className="p-3 space-y-2">
        {tiers.map((tier) => {
          const isSelected = selectedTier === tier.name;
          const isRecommended = recommendedTier === tier.name;

          return (
            <button
              key={tier.name}
              onClick={() => setSelectedTier(tier.name)}
              className="w-full text-left p-3 rounded-lg border transition-all duration-200"
              style={{
                borderColor: isSelected ? `${service.brandColor}60` : 'rgba(255,255,255,0.05)',
                background: isSelected
                  ? `${service.brandColor}08`
                  : 'rgba(255,255,255,0.02)',
                boxShadow: isSelected
                  ? `0 0 12px ${service.brandColor}10, inset 0 1px 0 ${service.brandColor}15`
                  : 'inset 0 1px 0 rgba(255,255,255,0.03)',
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-kriptik-white">{tier.name}</span>
                  {isRecommended && (
                    <span
                      className="px-1.5 py-0.5 text-[10px] font-semibold rounded-md"
                      style={{
                        color: service.brandColor,
                        background: `${service.brandColor}15`,
                      }}
                    >
                      Recommended
                    </span>
                  )}
                </div>
                <span className="text-sm font-semibold" style={{ color: service.brandColor }}>
                  {tier.price === 0 ? 'Free' : `$${tier.price}/mo`}
                </span>
              </div>
              <p className="text-xs text-kriptik-silver leading-relaxed">
                {tier.description}
              </p>
              {isSelected && (
                <div className="flex items-center gap-1.5 mt-2" style={{ color: service.brandColor }}>
                  <CheckIcon size={12} />
                  <span className="text-xs font-medium">Selected</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="px-3 pb-3 flex gap-2">
        <button
          onClick={onDismiss}
          className="flex-1 py-2 rounded-lg text-xs font-medium text-kriptik-silver border border-white/10 hover:border-white/20 transition-all"
        >
          Skip for now
        </button>
        <button
          onClick={() => {
            const tier = tiers.find(t => t.name === selectedTier);
            if (tier) onSelect(tier);
          }}
          className="flex-1 py-2 rounded-lg text-xs font-semibold text-kriptik-black transition-all"
          style={{
            background: `linear-gradient(135deg, ${service.brandColor}, ${service.brandColor}cc)`,
            boxShadow: `0 2px 8px ${service.brandColor}25`,
          }}
        >
          Confirm Plan
        </button>
      </div>
    </div>
  );
}
