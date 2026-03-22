/**
 * My Account Page
 *
 * Now redirects to /settings - all account management is unified there.
 * Legacy section components are kept as named exports for backward compatibility.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    CheckIcon, PlusIcon,
} from '../components/ui/icons';
import { useCostStore } from '../store/useCostStore';
import { cn } from '@/lib/utils';
import '../styles/realistic-glass.css';

// Subscription plans
const PLANS = [
    { id: 'free', name: 'Free', price: 0, credits: 100, features: ['5 projects', 'Community support'] },
    { id: 'pro', name: 'Pro', price: 29, credits: 1000, features: ['Unlimited projects', 'Priority support', 'Advanced AI models'] },
    { id: 'enterprise', name: 'Enterprise', price: 99, credits: 5000, features: ['Everything in Pro', 'Custom integrations', 'Dedicated support'] },
];

// Deployment options
const DEPLOY_OPTIONS = [
    { id: 'vercel', name: 'Vercel', description: 'Serverless deployment', symbol: 'V' },
    { id: 'netlify', name: 'Netlify', description: 'JAMstack hosting', symbol: 'N' },
    { id: 'cloudflare', name: 'Cloudflare Pages', description: 'Edge deployment', symbol: 'CF' },
    { id: 'aws', name: 'AWS', description: 'Full cloud services', symbol: 'AWS' },
    { id: 'gcp', name: 'Google Cloud', description: 'GCP deployment', symbol: 'GC' },
    { id: 'kriptik', name: 'KripTik Hosting', description: 'Managed hosting', symbol: 'K' },
];

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("glass-panel p-6", className)}>
            {children}
        </div>
    );
}

// Exported for backward compatibility with ProjectSettings
export function SubscriptionSection() {
    const [currentPlan] = useState('free');

    return (
        <SectionCard>
            <h3 className="text-lg font-semibold mb-4" style={{ color: '#1a1a1a', fontFamily: 'Syne, sans-serif' }}>Subscription</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PLANS.map((plan) => (
                    <div
                        key={plan.id}
                        className={cn("p-4 rounded-xl border-2 transition-all", currentPlan === plan.id ? "border-[#c25a00]" : "border-transparent")}
                        style={{ background: currentPlan === plan.id ? 'rgba(255,180,140,0.15)' : 'rgba(0,0,0,0.03)' }}
                    >
                        {currentPlan === plan.id && <span className="text-xs font-medium mb-2 block" style={{ color: '#c25a00' }}>CURRENT PLAN</span>}
                        <h4 className="text-lg font-semibold" style={{ color: '#1a1a1a' }}>{plan.name}</h4>
                        <p className="text-2xl font-bold mt-1" style={{ color: '#1a1a1a' }}>${plan.price}<span className="text-sm" style={{ color: '#666' }}>/mo</span></p>
                        <p className="text-sm mt-1" style={{ color: '#c25a00' }}>{plan.credits.toLocaleString()} credits/mo</p>
                        <ul className="mt-4 space-y-2">
                            {plan.features.map((feature) => (
                                <li key={feature} className="flex items-center gap-2 text-sm" style={{ color: '#666' }}>
                                    <CheckIcon size={16} style={{ color: '#16a34a' }} />
                                    {feature}
                                </li>
                            ))}
                        </ul>
                        {currentPlan !== plan.id && (
                            <button className={cn("w-full mt-4", plan.id === 'pro' ? "glass-button glass-button--glow" : "glass-button")}>
                                {plan.price > 0 ? 'Upgrade' : 'Downgrade'}
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </SectionCard>
    );
}

export function CreditsSection() {
    const { balance } = useCostStore();

    return (
        <SectionCard>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold" style={{ color: '#1a1a1a', fontFamily: 'Syne, sans-serif' }}>Credits & Usage</h3>
                <button className="glass-button glass-button--glow">
                    <PlusIcon size={16} className="mr-2" style={{ color: '#1a1a1a' }} />
                    Top Up
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-xl" style={{ background: 'rgba(255,180,140,0.1)' }}>
                    <p className="text-sm" style={{ color: '#666' }}>Available Credits</p>
                    <p className="text-3xl font-bold" style={{ color: '#c25a00' }}>{balance.available.toLocaleString()}</p>
                </div>
                <div className="p-4 rounded-xl" style={{ background: 'rgba(0,0,0,0.03)' }}>
                    <p className="text-sm" style={{ color: '#666' }}>Used This Month</p>
                    <p className="text-3xl font-bold" style={{ color: '#1a1a1a' }}>{balance.totalUsedThisMonth.toLocaleString()}</p>
                </div>
                <div className="p-4 rounded-xl" style={{ background: 'rgba(0,0,0,0.03)' }}>
                    <p className="text-sm" style={{ color: '#666' }}>Monthly Limit</p>
                    <p className="text-3xl font-bold" style={{ color: '#999' }}>{balance.limit.toLocaleString()}</p>
                </div>
            </div>
            <div className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                    <span style={{ color: '#666' }}>Monthly Usage</span>
                    <span style={{ color: '#666' }}>{Math.round((balance.totalUsedThisMonth / balance.limit) * 100)}%</span>
                </div>
                <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
                    <div
                        className="h-full rounded-full transition-all"
                        style={{
                            width: `${Math.min(100, (balance.totalUsedThisMonth / balance.limit) * 100)}%`,
                            background: 'linear-gradient(90deg, #c25a00, #d97706)',
                            boxShadow: '0 0 10px rgba(194, 90, 0, 0.4)',
                        }}
                    />
                </div>
            </div>
            <p className="text-xs" style={{ color: '#999' }}>Resets on {new Date(balance.resetDate).toLocaleDateString()}</p>
        </SectionCard>
    );
}

export function DeploymentSection() {
    const [defaultDeploy, setDefaultDeploy] = useState('vercel');

    return (
        <SectionCard>
            <h3 className="text-lg font-semibold mb-4" style={{ color: '#1a1a1a', fontFamily: 'Syne, sans-serif' }}>Deployment Preferences</h3>
            <p className="text-sm mb-6" style={{ color: '#666' }}>Choose your default deployment target for new projects</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {DEPLOY_OPTIONS.map((option) => (
                    <button
                        key={option.id}
                        onClick={() => setDefaultDeploy(option.id)}
                        className={cn("p-4 rounded-xl border-2 text-left transition-all hover:scale-105", defaultDeploy === option.id ? "border-[#c25a00]" : "border-transparent")}
                        style={{ background: defaultDeploy === option.id ? 'rgba(255,180,140,0.15)' : 'rgba(0,0,0,0.03)' }}
                    >
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold mb-2" style={{ background: 'rgba(255,180,140,0.2)', color: '#c25a00' }}>
                            {option.symbol}
                        </div>
                        <p className="font-medium" style={{ color: '#1a1a1a' }}>{option.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#666' }}>{option.description}</p>
                        {defaultDeploy === option.id && (
                            <div className="mt-2 flex items-center gap-1" style={{ color: '#c25a00' }}>
                                <CheckIcon size={14} />
                                <span className="text-xs">Default</span>
                            </div>
                        )}
                    </button>
                ))}
            </div>
        </SectionCard>
    );
}

/**
 * My Account page now redirects to /settings where all account management is unified.
 */
export default function MyAccount() {
    const navigate = useNavigate();

    useEffect(() => {
        navigate('/settings', { replace: true });
    }, [navigate]);

    return null;
}
