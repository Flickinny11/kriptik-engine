/**
 * BillingSettings — Credit balance, purchase credits, transaction history.
 * Premium warm-glass design with 3D depth buttons, realistic shadows.
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CoinsIcon, CreditCardIcon, ExternalLinkIcon,
  CheckCircleIcon, DollarSignIcon,
} from '@/components/ui/icons';
import { useUserStore } from '@/store/useUserStore';
import { useAccountStore } from '@/store/useAccountStore';
import { apiClient, type CreditPackage } from '@/lib/api-client';
import { toast } from 'sonner';

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

export function BillingSettings() {
  const { user, refreshCredits } = useUserStore();
  const { packages, transactions, billingLoading, fetchPackages, fetchBillingHistory } = useAccountStore();
  const [searchParams] = useSearchParams();
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    fetchPackages();
    fetchBillingHistory();
    refreshCredits();
  }, [fetchPackages, fetchBillingHistory, refreshCredits]);

  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (checkout === 'success') {
      toast.success('Credits purchased successfully!');
      refreshCredits();
      fetchBillingHistory();
    } else if (checkout === 'cancelled') {
      toast.error('Purchase cancelled');
    }
  }, [searchParams, refreshCredits, fetchBillingHistory]);

  const handlePurchase = async (pkg: CreditPackage) => {
    if (purchasingId) return;
    setPurchasingId(pkg.id);
    try {
      const { url } = await apiClient.createCheckout(pkg.id);
      if (url) window.location.href = url;
    } catch (err: any) {
      toast.error(err.message || 'Failed to start checkout');
    } finally {
      setPurchasingId(null);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { url } = await apiClient.createPortalSession();
      if (url) window.location.href = url;
    } catch (err: any) {
      toast.error(err.message || 'Failed to open billing portal');
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold text-[#1a1a1a] mb-1">Billing & Credits</h2>
        <p className="text-sm text-[#8a7a6b]">Manage your credits and payment methods</p>
      </div>

      {/* Credit Balance */}
      <div
        className="p-5 sm:p-6 rounded-2xl border border-[#e8e0d8]/60 transition-all duration-500 hover:-translate-y-0.5"
        style={cardStyle}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #fef3e8 0%, #fde6d0 100%)',
                boxShadow: '0 4px 12px rgba(194,90,0,0.12), inset 0 1px 0 rgba(255,255,255,0.6)',
              }}
            >
              <CoinsIcon size={22} className="text-[#c25a00]" />
            </div>
            <div>
              <p className="text-sm text-[#8a7a6b] font-medium">Credit Balance</p>
              <p className="text-2xl font-mono font-bold text-[#c25a00]">
                {(user?.credits ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#b0a090]">Current Plan</p>
            <span
              className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-lg text-[#c25a00]"
              style={{
                background: 'linear-gradient(135deg, #fef3e8 0%, #fde6d0 100%)',
                boxShadow: '0 1px 4px rgba(194,90,0,0.08)',
              }}
            >
              {user?.tier || 'free'}
            </span>
          </div>
        </div>
        <p className="text-xs text-[#b0a090]">
          Credits are consumed per build based on AI model usage. Cost varies by complexity.
        </p>
      </div>

      {/* Purchase Credits */}
      <div>
        <h3 className="text-sm font-semibold text-[#4a3f35] mb-3">Purchase Credits</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {packages.filter(p => p.available).map((pkg) => (
            <motion.button
              key={pkg.id}
              onClick={() => handlePurchase(pkg)}
              disabled={!!purchasingId}
              whileHover={{ y: -3, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className={`relative p-4 rounded-2xl border text-left transition-all duration-300 cursor-pointer ${
                purchasingId === pkg.id
                  ? 'border-[#c25a00]/40'
                  : 'border-[#e8e0d8]/60 hover:border-[#c25a00]/30'
              } disabled:opacity-60 disabled:cursor-not-allowed`}
              style={{
                background: purchasingId === pkg.id
                  ? 'linear-gradient(145deg, #fef3e8, #fde6d0)'
                  : 'linear-gradient(145deg, rgba(255,255,255,0.85), rgba(250,247,244,0.75))',
                boxShadow: `
                  0 4px 12px rgba(0,0,0,0.05),
                  0 1px 3px rgba(0,0,0,0.03),
                  inset 0 1px 0 rgba(255,255,255,0.7),
                  inset 0 -1px 0 rgba(0,0,0,0.02)
                `,
              }}
            >
              <p className="text-lg font-mono font-bold text-[#1a1a1a]">{pkg.credits.toLocaleString()}</p>
              <p className="text-xs text-[#b0a090] mt-0.5 font-medium">credits</p>
              {purchasingId === pkg.id && (
                <div className="absolute top-3 right-3 w-4 h-4 border-2 border-[#c25a00] border-t-transparent rounded-full animate-spin" />
              )}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Payment Management */}
      <div
        className="p-4 rounded-2xl border border-[#e8e0d8]/60 transition-all duration-500 hover:-translate-y-0.5"
        style={cardStyle}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#4a3f35]">Payment Methods</p>
            <p className="text-xs text-[#b0a090] mt-0.5">Manage cards and billing info via Stripe</p>
          </div>
          <motion.button
            onClick={handlePortal}
            disabled={portalLoading}
            whileHover={{ y: -1, scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-[#1a1a1a] rounded-xl border border-[#e0d8cf] hover:border-[#c25a00]/30 transition-all duration-300 disabled:opacity-50 w-full sm:w-auto cursor-pointer"
            style={{
              background: 'linear-gradient(145deg, #ffffff 0%, #f5f0eb 100%)',
              boxShadow: `
                0 2px 8px rgba(0,0,0,0.05),
                0 1px 2px rgba(0,0,0,0.03),
                inset 0 1px 0 rgba(255,255,255,0.8)
              `,
            }}
          >
            <CreditCardIcon size={14} />
            <span>{portalLoading ? 'Opening...' : 'Manage'}</span>
            <ExternalLinkIcon size={12} />
          </motion.button>
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <h3 className="text-sm font-semibold text-[#4a3f35] mb-3">Transaction History</h3>
        {billingLoading ? (
          <div className="text-sm text-[#b0a090] p-4">Loading...</div>
        ) : transactions.length === 0 ? (
          <div
            className="text-center py-8 rounded-2xl border border-dashed border-[#e0d8cf]"
            style={{ background: 'rgba(255,255,255,0.4)' }}
          >
            <p className="text-sm text-[#b0a090]">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3 rounded-xl border border-[#e8e0d8]/40 transition-all duration-300 hover:-translate-y-px"
                style={{
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.7), rgba(250,247,244,0.5))',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.6)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    tx.amount > 0
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      : 'bg-red-50 text-red-500 border border-red-200'
                  }`}>
                    {tx.amount > 0 ? <CoinsIcon size={14} /> : <DollarSignIcon size={14} />}
                  </div>
                  <div>
                    <p className="text-sm text-[#1a1a1a] font-medium">{tx.description || tx.type}</p>
                    <p className="text-xs text-[#b0a090]">
                      {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      }) : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-mono font-semibold ${tx.amount > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                  </p>
                  <p className="text-xs text-[#b0a090] font-mono">bal: {tx.balance.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
