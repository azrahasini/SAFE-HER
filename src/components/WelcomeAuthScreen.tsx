import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Shield,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { apiFetch, setAuthToken } from '../lib/api.ts';
import type { UserPublic } from '../types/safeher.ts';

interface WelcomeAuthScreenProps {
  onAuthenticated: (user: UserPublic) => void;
  themeToggleControl?: React.ReactNode;
}

type AuthTab = 'login' | 'register' | 'reset' | 'admin';

export const EMBLEM_SRC = '/src/assets/images/safeher_emblem_1795709450607.jpg';
export const BACKDROP_SRC = '/src/assets/images/safeher_twilight_walkway_1795709450972.jpg';

export function WelcomeAuthScreen({
  onAuthenticated,
  themeToggleControl,
}: WelcomeAuthScreenProps) {
  const [tab, setTab] = useState<AuthTab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Password reset state
  const [resetCode, setResetCode] = useState('');
  const [previewResetCode, setPreviewResetCode] = useState<string | null>(null);
  const [resetRequested, setResetRequested] = useState(false);

  // Admin state
  const [adminRequiresClaim, setAdminRequiresClaim] = useState(false);
  const [adminPasscode, setAdminPasscode] = useState('');
  const [adminName, setAdminName] = useState('SAFEHER Operations Lead');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [heroImgError, setHeroImgError] = useState(false);
  const [emblemError, setEmblemError] = useState(false);

  useEffect(() => {
    apiFetch<{ requiresClaim: boolean }>('/api/admin/status')
      .then((res) => setAdminRequiresClaim(res.requiresClaim))
      .catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: UserPublic }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: UserPublic }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name, phone }),
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoMember = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: UserPublic }>('/api/auth/demo-member', {
        method: 'POST',
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open demo session.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ message: string; previewResetCode?: string }>(
        '/api/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify({ email }),
        }
      );
      setResetRequested(true);
      setPreviewResetCode(res.previewResetCode || null);
      setInfo(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request password reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, code: resetCode, newPassword: password }),
      });
      setInfo(res.message);
      setResetRequested(false);
      setPreviewResetCode(null);
      setResetCode('');
      setPassword('');
      setTab('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const endpoint = adminRequiresClaim ? '/api/admin/claim' : '/api/admin/login';
      const res = await apiFetch<{ token: string; user: UserPublic }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          email: email || 'admin@safeher.app',
          name: adminName,
          passcode: adminPasscode,
        }),
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Administrator authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8FF] dark:bg-[#0D0A14] text-[#1A132B] dark:text-[#F4EFFC] flex flex-col">
      {/* Top Bar */}
      <header className="w-full max-w-7xl mx-auto px-5 py-4 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          {!emblemError ? (
            <img
              src={EMBLEM_SRC}
              alt="SAFEHER Emblem"
              referrerPolicy="no-referrer"
              onError={() => setEmblemError(true)}
              className="w-10 h-10 rounded-xl object-cover border border-purple-200 dark:border-purple-800/60"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-purple-700 text-white flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
          )}
          <span className="font-display text-xl font-bold tracking-tight whitespace-nowrap">
            SAFEHER
          </span>
        </div>
        <div className="flex items-center gap-3">{themeToggleControl}</div>
      </header>

      {/* Main Split Grid */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-5 pb-10 pt-2 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Editorial Hero */}
        <section className="lg:col-span-7 relative rounded-3xl overflow-hidden border border-purple-200/80 dark:border-purple-900/60 bg-[#201436] min-h-[340px] lg:min-h-[600px] flex flex-col justify-end">
          {!heroImgError ? (
            <img
              src={BACKDROP_SRC}
              alt="Well-lit evening pedestrian promenade"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgError(true)}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-purple-950 via-[#2B174D] to-pink-950" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#120A21]/95 via-[#170D2B]/65 to-transparent" />

          <div className="relative z-10 p-7 sm:p-10 space-y-5 text-white">
            <p className="text-xs font-medium tracking-wider text-pink-200">
              Intelligence · Protection · Empowerment
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-bold leading-tight text-balance max-w-xl">
              Personal safety intelligence built for calm, decisive action.
            </h1>
            <p className="text-sm sm:text-base text-purple-100/90 max-w-lg leading-relaxed">
              Access situation-based AI escape planning from both your lock screen and home
              dashboard, trigger One-Tap SOS with trusted contact alerts, navigate CCTV-aware
              routes, and secure emergency audio/video evidence.
            </p>

            <div className="pt-3 border-t border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-purple-100/90">
              <div>
                <p className="font-semibold text-white">Lock & Home AI Agent</p>
                <p className="mt-0.5 text-purple-200/80">Shared history & voice support</p>
              </div>
              <div>
                <p className="font-semibold text-white">Dual-Save Evidence</p>
                <p className="mt-0.5 text-purple-200/80">In-app vault + device gallery export</p>
              </div>
              <div>
                <p className="font-semibold text-white">CCTV-Aware Routing</p>
                <p className="mt-0.5 text-purple-200/80">Verified hubs & lighting insights</p>
              </div>
            </div>
          </div>
        </section>

        {/* Right Authentication Card */}
        <section className="lg:col-span-5 bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 sm:p-8 flex flex-col justify-between shadow-sm">
          <div>
            {/* Segmented Mode Switcher */}
            <div
              role="tablist"
              aria-label="Authentication Mode"
              className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-purple-50 dark:bg-[#221A34] mb-6"
            >
              {(
                [
                  { id: 'login', label: 'Sign In' },
                  { id: 'register', label: 'Register' },
                  { id: 'reset', label: 'Reset' },
                  { id: 'admin', label: 'Admin' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => {
                    setTab(item.id);
                    setError(null);
                    setInfo(null);
                  }}
                  className={`min-h-[40px] px-2 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    tab === item.id
                      ? 'bg-purple-700 text-white shadow-sm'
                      : 'text-purple-900/70 dark:text-purple-200/75 hover:text-purple-950 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {error && (
              <div
                role="alert"
                className="mb-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-sm flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {info && (
              <div className="mb-4 p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-100 text-sm flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-purple-700 dark:text-purple-300" />
                <span>{info}</span>
              </div>
            )}

            {tab === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-bold">Welcome back</h2>
                  <p className="text-sm text-[#574C70] dark:text-[#B9AED2] mt-1">
                    Sign in to access your safety dashboard, trusted contacts, and evidence vault.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-purple-200 dark:border-purple-800/80 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full min-h-[44px] px-3.5 py-2.5 pr-11 rounded-xl border border-purple-200 dark:border-purple-800/80 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm focus:outline-none focus:ring-2 focus:ring-purple-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-[#574C70] dark:text-[#B9AED2]"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => setTab('reset')}
                    className="font-medium text-purple-700 dark:text-purple-300 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                >
                  <span>{loading ? 'Signing in...' : 'Sign In to SAFEHER'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <div className="pt-2 border-t border-purple-100 dark:border-purple-900/60">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleDemoMember}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/70 dark:bg-[#221A34] hover:bg-purple-100 dark:hover:bg-[#2B2142] text-sm font-medium text-purple-900 dark:text-purple-100 transition-colors"
                  >
                    Quick Explore as Demo Member (Maya Lin)
                  </button>
                </div>
              </form>
            )}

            {tab === 'register' && (
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div>
                  <h2 className="font-display text-2xl font-bold">Create your safety profile</h2>
                  <p className="text-sm text-[#574C70] dark:text-[#B9AED2] mt-1">
                    Set up your personal account to manage contacts, routes, and encrypted evidence.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Maya Lin"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-purple-200 dark:border-purple-800/80 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="maya@example.com"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-purple-200 dark:border-purple-800/80 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Phone Number (optional)</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (415) 555-0194"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-purple-200 dark:border-purple-800/80 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Password (minimum 8 characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-purple-200 dark:border-purple-800/80 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{loading ? 'Creating account...' : 'Create SAFEHER Account'}</span>
                </button>
              </form>
            )}

            {tab === 'reset' && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-bold">Reset password</h2>
                  <p className="text-sm text-[#574C70] dark:text-[#B9AED2] mt-1">
                    Request a 6-digit recovery code for your registered SAFEHER email.
                  </p>
                </div>

                {!resetRequested ? (
                  <form onSubmit={handleRequestReset} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1.5">Registered Email</label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-purple-200 dark:border-purple-800/80 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm focus:outline-none focus:ring-2 focus:ring-purple-600"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-semibold text-sm flex items-center justify-center gap-2"
                    >
                      <KeyRound className="w-4 h-4" />
                      <span>{loading ? 'Issuing code...' : 'Send Reset Code'}</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleConfirmReset} className="space-y-3.5">
                    {previewResetCode && (
                      <div className="p-3 rounded-xl bg-pink-50 dark:bg-pink-950/40 border border-pink-200 dark:border-pink-800 text-xs">
                        Preview email delivery code:{' '}
                        <span className="font-mono-tabular font-bold text-sm">
                          {previewResetCode}
                        </span>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-semibold mb-1">6-Digit Reset Code</label>
                      <input
                        type="text"
                        required
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value)}
                        placeholder="123456"
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-purple-200 dark:border-purple-800/80 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm font-mono-tabular"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">New Password</label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimum 8 characters"
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-purple-200 dark:border-purple-800/80 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-semibold text-sm"
                    >
                      {loading ? 'Updating...' : 'Confirm Password Reset'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {tab === 'admin' && (
              <form onSubmit={handleAdminSubmit} className="space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-bold">
                    {adminRequiresClaim ? 'Claim Operations Console' : 'Administrator Sign In'}
                  </h2>
                  <p className="text-sm text-[#574C70] dark:text-[#B9AED2] mt-1">
                    {adminRequiresClaim
                      ? 'Set the initial server-hashed administrator passcode to activate the SAFEHER Operations Console.'
                      : 'Sign in with your administrator passcode to monitor platform operations, incidents, and suggestions.'}
                  </p>
                </div>

                {adminRequiresClaim && (
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Operations Lead Name</label>
                    <input
                      type="text"
                      required
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-purple-200 dark:border-purple-800/80 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold mb-1.5">Administrator Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@safeher.app"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-purple-200 dark:border-purple-800/80 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5">
                    {adminRequiresClaim ? 'Choose Admin Passcode (min 8 chars)' : 'Admin Passcode'}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={adminPasscode}
                    onChange={(e) => setAdminPasscode(e.target.value)}
                    placeholder="Enter administrator passcode"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-purple-200 dark:border-purple-800/80 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#1A132B] hover:bg-[#2D2148] dark:bg-purple-700 dark:hover:bg-purple-800 text-white font-semibold text-sm flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>
                    {loading
                      ? 'Verifying...'
                      : adminRequiresClaim
                        ? 'Claim & Open Admin Console'
                        : 'Open Admin Console'}
                  </span>
                </button>
              </form>
            )}
          </div>

          <p className="mt-6 pt-4 border-t border-purple-100 dark:border-purple-900/50 text-xs text-[#6E6288] dark:text-[#9F93BC] leading-relaxed">
            In immediate life-threatening danger, contact your local emergency services directly
            (such as 911, 112, or 100). SAFEHER assists personal safety planning and does not
            replace official emergency dispatchers.
          </p>
        </section>
      </main>
    </div>
  );
}
