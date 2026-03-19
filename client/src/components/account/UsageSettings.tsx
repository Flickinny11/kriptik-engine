/**
 * UsageSettings — Usage statistics, project history, credit consumption.
 * Premium warm-glass design with 3D depth cards.
 */

import { useEffect } from 'react';
import {
  ActivityIcon, LayersIcon, CoinsIcon, ClockIcon,
  CheckCircleIcon, ErrorIcon, LoadingIcon,
} from '@/components/ui/icons';
import { useUserStore } from '@/store/useUserStore';
import { useAccountStore } from '@/store/useAccountStore';

const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(145deg, rgba(255,255,255,0.85) 0%, rgba(250,247,244,0.75) 100%)',
  boxShadow: `
    0 4px 16px rgba(0,0,0,0.06),
    0 1px 4px rgba(0,0,0,0.04),
    inset 0 1px 0 rgba(255,255,255,0.8),
    inset 0 -1px 0 rgba(0,0,0,0.02)
  `,
  backdropFilter: 'blur(12px) saturate(150%)',
};

export function UsageSettings() {
  const { user } = useUserStore();
  const { usage, usageLoading, fetchUsage } = useAccountStore();

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const statusColors: Record<string, string> = {
    complete: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    building: 'text-blue-600 bg-blue-50 border-blue-200',
    failed: 'text-red-500 bg-red-50 border-red-200',
    idle: 'text-[#b0a090] bg-[#f5f0eb] border-[#e0d8cf]',
  };

  const statusIcons: Record<string, React.ReactNode> = {
    complete: <CheckCircleIcon size={14} />,
    building: <LoadingIcon size={14} />,
    failed: <ErrorIcon size={14} />,
    idle: <ClockIcon size={14} />,
  };

  if (usageLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-display font-bold text-[#1a1a1a] mb-1">Usage</h2>
          <p className="text-sm text-[#8a7a6b]">Loading usage data...</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 rounded-xl border-2 border-[#c25a00]/40 border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold text-[#1a1a1a] mb-1">Usage</h2>
        <p className="text-sm text-[#8a7a6b]">Your build activity and credit consumption</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          icon={<LayersIcon size={18} />}
          label="Total Projects"
          value={String(usage?.totalProjects ?? 0)}
        />
        <StatCard
          icon={<CoinsIcon size={18} />}
          label="Credits Remaining"
          value={(user?.credits ?? 0).toLocaleString()}
          accent
        />
        <StatCard
          icon={<ActivityIcon size={18} />}
          label="Credits Used"
          value={(usage?.totalCreditsUsed ?? 0).toLocaleString()}
        />
      </div>

      {/* Recent Projects */}
      <div>
        <h3 className="text-sm font-semibold text-[#4a3f35] mb-3">Recent Projects</h3>
        {!usage?.recentProjects?.length ? (
          <div
            className="text-center py-8 rounded-2xl border border-dashed border-[#e0d8cf]"
            style={{ background: 'rgba(255,255,255,0.4)' }}
          >
            <p className="text-sm text-[#b0a090]">No projects yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {usage.recentProjects.map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between p-3 rounded-xl border border-[#e8e0d8]/40 transition-all duration-300 hover:-translate-y-px"
                style={{
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.7), rgba(250,247,244,0.5))',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.6)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${statusColors[project.status] || statusColors.idle}`}>
                    {statusIcons[project.status] || statusIcons.idle}
                  </div>
                  <div>
                    <p className="text-sm text-[#1a1a1a] font-medium">{project.name}</p>
                    <p className="text-xs text-[#b0a090]">
                      {project.createdAt
                        ? new Date(project.createdAt).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })
                        : ''}
                    </p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-lg border font-medium ${statusColors[project.status] || statusColors.idle}`}>
                  {project.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div
      className="p-4 rounded-2xl border border-[#e8e0d8]/60 transition-all duration-500 hover:-translate-y-1"
      style={{
        ...cardStyle,
        ...(accent ? {
          background: 'linear-gradient(145deg, #fef3e8 0%, #fde6d0 100%)',
          boxShadow: `
            0 4px 16px rgba(194,90,0,0.08),
            0 1px 4px rgba(194,90,0,0.04),
            inset 0 1px 0 rgba(255,255,255,0.6),
            inset 0 -1px 0 rgba(194,90,0,0.02)
          `,
        } : {}),
      }}
    >
      <div className={`mb-2 ${accent ? 'text-[#c25a00]' : 'text-[#8a7a6b]'}`}>{icon}</div>
      <p className={`text-xl font-mono font-bold ${accent ? 'text-[#c25a00]' : 'text-[#1a1a1a]'}`}>{value}</p>
      <p className="text-xs text-[#b0a090] mt-0.5 font-medium">{label}</p>
    </div>
  );
}
