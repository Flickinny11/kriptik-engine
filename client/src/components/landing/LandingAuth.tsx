/**
 * Landing page auth section — social + credential login.
 * Reuses existing auth-client functions from the app.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStore } from '@/store/useUserStore'
import { signInWithGoogle, signInWithGitHub } from '@/lib/auth-client'
import { toast } from 'sonner'
import { GitHubIcon, GoogleIcon } from '@/components/ui/icons'

export default function LandingAuth() {
  const navigate = useNavigate()
  const { login, signup, isLoading } = useUserStore()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [socialLoading, setSocialLoading] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      if (mode === 'signup') {
        await signup(email, password, name)
        toast.success('Account created!')
      } else {
        await login(email, password)
        toast.success('Welcome back!')
      }
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
    }
  }

  const handleGoogle = async () => {
    setSocialLoading('google')
    try {
      await signInWithGoogle()
    } catch (err: any) {
      toast.error(err.message || 'Google sign-in failed')
      setSocialLoading(null)
    }
  }

  const handleGitHub = async () => {
    setSocialLoading('github')
    try {
      await signInWithGitHub()
    } catch (err: any) {
      toast.error(err.message || 'GitHub sign-in failed')
      setSocialLoading(null)
    }
  }

  const inputCls =
    'w-full h-12 px-4 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder:text-zinc-500 focus:border-kriptik-lime/40 focus:ring-1 focus:ring-kriptik-lime/20 outline-none transition-all duration-300'

  return (
    <section id="auth" className="auth-section relative py-32 px-6">
      <div className="max-w-md mx-auto">
        <h2 className="font-display text-display-sm md:text-display-md font-bold text-center mb-4 tracking-tight">
          Start Building Today
        </h2>
        <p className="text-zinc-500 text-center mb-10">
          One prompt away from your next production app.
        </p>

        <div className="auth-card bg-white/[0.03] backdrop-blur-2xl border border-white/[0.06] rounded-3xl p-8 shadow-glass">
          {/* Social buttons */}
          <button
            onClick={handleGoogle}
            disabled={!!socialLoading}
            className="w-full h-12 flex items-center justify-center gap-3 bg-white text-zinc-900 rounded-xl font-semibold hover:bg-zinc-100 transition-all duration-200 mb-3"
          >
            {socialLoading === 'google' ? (
              <span className="w-5 h-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <GoogleIcon size={20} />
                <span>Continue with Google</span>
              </>
            )}
          </button>

          <button
            onClick={handleGitHub}
            disabled={!!socialLoading}
            className="w-full h-12 flex items-center justify-center gap-3 bg-zinc-900 text-white border border-zinc-700 rounded-xl font-semibold hover:bg-zinc-800 transition-all duration-200 mb-6"
          >
            {socialLoading === 'github' ? (
              <span className="w-5 h-5 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <div className="brightness-0 invert">
                  <GitHubIcon size={20} />
                </div>
                <span>Continue with GitHub</span>
              </>
            )}
          </button>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/[0.06]" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-4 text-zinc-600 text-xs uppercase tracking-widest" style={{ backgroundColor: 'rgba(10,10,10,0.95)' }}>
                or
              </span>
            </div>
          </div>

          {/* Credential form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className={inputCls}
                required
              />
            )}
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Email address"
              className={inputCls}
              required
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Password"
              className={inputCls}
              required
              minLength={8}
            />
            {error && <p className="text-red-400 text-sm px-1">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-kriptik-lime text-kriptik-black rounded-xl font-bold text-sm hover:brightness-110 transition-all duration-200 mt-1"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-kriptik-black/40 border-t-transparent rounded-full animate-spin" />
                  {mode === 'signup' ? 'Creating...' : 'Signing in...'}
                </span>
              ) : mode === 'signup' ? (
                'Create Account'
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <p className="text-center text-sm text-zinc-500 mt-5">
            {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}
            <button
              onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError('') }}
              className="text-kriptik-lime/80 hover:text-kriptik-lime ml-1.5 font-medium transition-colors"
            >
              {mode === 'signup' ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>

        <p className="text-xs text-zinc-600 text-center mt-6 leading-relaxed max-w-sm mx-auto">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </section>
  )
}
