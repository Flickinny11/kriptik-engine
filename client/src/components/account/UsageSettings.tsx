/**
 * UsageSettings — Usage statistics, project history, credit consumption
 */

import { useEffect } from 'react';
import {
  ActivityIcon, LayersIcon, CoinsIcon, ClockIcon,
  CheckCircleIcon, ErrorIcon, LoadingIcon,
} from '@/components/ui/icons';
import { useUserStore } from '@/store/useUserStore';
import { useAccountStore } from '@/store/useAccountStore';

export function UsageSettings() {
  const { user } = useUserStore();
  const { usage, usageLoading, fetchUsage } = useAccountStore();

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const statusColors: Record<string, string> = {
    complete: 'text-green-400 bg-green-500/10 border-green-500/20',
    building: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    failed: 'text-red-400 bg-red-500/10 border-red-500/20',
    idle: 'text-kriptik-slate bg-white/5 border-white/10',
  };

  const statusIcons: Record<string, React.ReactNode> = {
    complete: <CheckCircleIcon size={14} />,
    building: <LoadingIcon size={14} />,
    failed: <ErrorIcon size={14} />,
    idle: <ClockIcon size={14} />,
  };

  if (usageLoading) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-display font-bold text-kriptik-white mb-1">Usage</h2>
          <p className="text-sm text-kriptik-slate">Loading usage data...</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-kriptik-lime border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-display font-bold text-kriptik-white mb-1">Usage</h2>
        <p className="text-sm text-kriptik-slate">Your build activity and credit consumption</p>
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

      {/* Recent Projects / Build History */}
      <div>
        <h3 className="text-sm font-semibold text-kriptik-silver mb-3">Recent Projects</h3>
        {!usage?.recentProjects?.length ? (
          <div className="text-center py-8 border border-dashed border-white/10 rounded-xl">
            <p className="text-sm text-kriptik-slate">No projects yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {usage.recentProjects.map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between p-3 rounded-lg bg-kriptik-charcoal border border-white/5"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${statusColors[project.status] || statusColors.idle}`}>
                    {statusIcons[project.status] || statusIcons.idle}
                  </div>
                  <div>
                    <p className="text-sm text-kriptik-white">{project.name}</p>
                    <p className="text-xs text-kriptik-slate">
                      {project.createdAt
                        ? new Date(project.createdAt).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })
                        : ''}
                    </p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded border ${statusColors[project.status] || statusColors.idle}`}>
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
    <div className="p-4 rounded-xl bg-kriptik-charcoal border border-white/5">
      <div className={`mb-2 ${accent ? 'text-kriptik-lime' : 'text-kriptik-silver'}`}>{icon}</div>
      <p className={`text-xl font-mono font-bold ${accent ? 'text-kriptik-lime' : 'text-kriptik-white'}`}>{value}</p>
      <p className="text-xs text-kriptik-slate mt-0.5">{label}</p>
    </div>
  );
}
