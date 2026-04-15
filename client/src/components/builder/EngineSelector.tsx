/**
 * EngineSelector — Select between Cortex (multi-agent AI) and Prism (diffusion pipeline).
 *
 * Uses Radix Select + glass styling to match SpeedDialSelector.
 * Locked once a build starts — engine type is immutable after first build.
 */

import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@/components/ui/select';

export type EngineType = 'cortex' | 'prism';

interface EngineSelectorProps {
  value: EngineType;
  onChange: (engine: EngineType) => void;
  disabled?: boolean;
}

const ENGINE_OPTIONS: Array<{ value: EngineType; label: string; description: string }> = [
  { value: 'cortex', label: 'Cortex', description: 'Multi-agent AI engine' },
  { value: 'prism', label: 'Prism', description: 'Diffusion pipeline engine' },
];

export function EngineSelector({ value, onChange, disabled = false }: EngineSelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as EngineType)} disabled={disabled}>
      <SelectTrigger
        className="w-[130px] h-8 text-xs"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          color: '#e2e8f0',
          fontSize: 12,
          fontWeight: 500,
          padding: '0 10px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <SelectValue placeholder="Engine" />
      </SelectTrigger>
      <SelectContent
        style={{
          background: 'rgba(15,15,20,0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        }}
      >
        {ENGINE_OPTIONS.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            style={{
              fontSize: 12,
              color: '#e2e8f0',
              cursor: 'pointer',
              borderRadius: 6,
              padding: '8px 10px 8px 28px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontWeight: 600 }}>{opt.label}</span>
              <span style={{ fontSize: 10, color: 'rgba(161,161,170,0.6)' }}>{opt.description}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default EngineSelector;
