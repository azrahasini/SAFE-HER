import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  CheckCircle2,
  Eye,
  Flag,
  HelpCircle,
  LayoutDashboard,
  Lock,
  LogOut,
  Map,
  MessageSquare,
  Settings,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import type {
  AuditLogEntry,
  CommunityReport,
  FeatureSuggestion,
  SuggestionStatus,
  SupportTicket,
  UserFeedbackRecord,
  UserPublic,
} from '../types/safeher.ts';

interface AdminDashboardProps {
  adminUser: UserPublic;
  onLogout: () => void;
}

type AdminSectionId =
  | 'overview'
  | 'users'
  | 'sos'
  | 'emergency'
  | 'incidents'
  | 'community_map'
  | 'suggestions'
  | 'feedback'
  | 'features'
  | 'ai'
  | 'notifications'
  | 'analytics'
  | 'security'
  | 'support'
  | 'settings';

interface AdminOverviewPayload {
  stats: {
    totalUsers: number;
    activeSos: number;
    testSosCount: number;
    communityReports: number;
    pendingSuggestions: number;
    openSupportTickets: number;
    evidenceVaultCount: number;
  };
  users: Array<{
    id: string;
    name: string;
    email: string;
    phoneVerified: boolean;
    suspended: boolean;
    createdAt: string;
    contactsCount: number;
  }>;
  sosAlerts: Array<{
    id: string;
    userId: string;
    userName: string;
    status: string;
    testMode: boolean;
    triggeredVia: string;
    startedAt: string;
    endedAt: string | null;
    hasLocation: boolean;
    locationRedacted: boolean;
    deliveryCount: number;
  }>;
  reports: CommunityReport[];
  suggestions: FeatureSuggestion[];
  feedback: UserFeedbackRecord[];
  supportTickets: SupportTicket[];
  auditLogs: AuditLogEntry[];
  adminConfig: {
    aiSafetyMode: string;
    featureFlags: Record<string, boolean>;
  };
}

const ADMIN_AVATAR_SRC = '/src/assets/images/avatar_admin_portrait_1795709451977.jpg';

const NAV_ITEMS: Array<{ id: AdminSectionId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: '1. Dashboard Overview', icon: LayoutDashboard },
  { id: 'users', label: '2. User Management', icon: Users },
  { id: 'sos', label: '3. SOS Monitoring', icon: AlertTriangle },
  { id: 'emergency', label: '4. Emergency Management', icon: Shield },
  { id: 'incidents', label: '5. Incident Management', icon: Flag },
  { id: 'community_map', label: '6. Community Map', icon: Map },
  { id: 'suggestions', label: '7. Suggestions', icon: Sparkles },
  { id: 'feedback', label: '8. Feedback', icon: MessageSquare },
  { id: 'features', label: '9. Feature Flags', icon: Activity },
  { id: 'ai', label: '10. AI Management', icon: Bot },
  { id: 'notifications', label: '11. Notifications', icon: Bell },
  { id: 'analytics', label: '12. Analytics', icon: BarChart3 },
  { id: 'security', label: '13. Security Audit', icon: Lock },
  { id: 'support', label: '14. Support Tickets', icon: HelpCircle },
  { id: 'settings', label: '15. Admin Settings', icon: Settings },
];

export function AdminDashboard({ adminUser, onLogout }: AdminDashboardProps) {
  const [section, setSection] = useState<AdminSectionId>('overview');
  const [data, setData] = useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [avatarErr, setAvatarErr] = useState(false);

  // Logged location reveal modal state
  const [revealSosId, setRevealSosId] = useState<string | null>(null);
  const [revealReason, setRevealReason] = useState('');
  const [revealedLocation, setRevealedLocation] = useState<{
    id: string;
    location: { lat: number; lng: number; label: string } | null;
  } | null>(null);

  // Broadcast notification state
  const [bcTitle, setBcTitle] = useState('');
  const [bcBody, setBcBody] = useState('');

  // Support reply draft
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const loadOverview = async () => {
    setError(null);
    try {
      const res = await apiFetch<AdminOverviewPayload>('/api/admin/overview');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  const handleToggleSuspend = async (id: string) => {
    await apiFetch(`/api/admin/users/${id}/toggle-suspend`, { method: 'POST' });
    await loadOverview();
  };

  const handleRevealSosLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revealSosId) return;
    setError(null);
    try {
      const res = await apiFetch<{ location: { lat: number; lng: number; label: string } | null }>(
        `/api/admin/sos/${revealSosId}/reveal-location`,
        {
          method: 'POST',
          body: JSON.stringify({ justification: revealReason }),
        }
      );
      setRevealedLocation({ id: revealSosId, location: res.location });
      setRevealSosId(null);
      setRevealReason('');
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authorization failed.');
    }
  };

  const handleResolveSos = async (id: string) => {
    await apiFetch(`/api/admin/sos/${id}/resolve`, { method: 'POST' });
    await loadOverview();
  };

  const handleUpdateReport = async (
    id: string,
    patch: { verified?: boolean; status?: 'active' | 'resolved' | 'flagged' }
  ) => {
    await apiFetch(`/api/admin/reports/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    await loadOverview();
  };

  const handleUpdateSuggestion = async (id: string, status: SuggestionStatus) => {
    await apiFetch(`/api/admin/suggestions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadOverview();
  };

  const handleUpdateFeedback = async (id: string, status: 'new' | 'reviewed' | 'resolved') => {
    await apiFetch(`/api/admin/feedback/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadOverview();
  };

  const handleToggleFlag = async (flagKey: string, currentVal: boolean) => {
    await apiFetch('/api/admin/config', {
      method: 'PATCH',
      body: JSON.stringify({ featureFlags: { [flagKey]: !currentVal } }),
    });
    await loadOverview();
  };

  const handleAiMode = async (mode: string) => {
    await apiFetch('/api/admin/config', {
      method: 'PATCH',
      body: JSON.stringify({ aiSafetyMode: mode }),
    });
    setNotice('AI Safety Mode updated.');
    await loadOverview();
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch<{ sentCount: number }>('/api/admin/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify({ title: bcTitle, body: bcBody }),
    });
    setBcTitle('');
    setBcBody('');
    setNotice(`Safety advisory delivered to ${res.sentCount} member account(s).`);
  };

  const handleReplySupport = async (id: string) => {
    await apiFetch(`/api/admin/support/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved', reply: replyDrafts[id] || '' }),
    });
    await loadOverview();
  };

  return (
    <div className="min-h-screen bg-[#FAF8FF] dark:bg-[#0D0A14] text-[#1A132B] dark:text-[#F4EFFC] flex flex-col lg:flex-row">
      {/* Left Sidebar */}
      <aside className="lg:w-64 shrink-0 bg-white dark:bg-[#140F20] border-b lg:border-b-0 lg:border-r border-purple-200/80 dark:border-purple-900/60 p-4 flex flex-col">
        <div className="flex items-center justify-between lg:justify-start gap-3 pb-4 border-b border-purple-100 dark:border-purple-900/50">
          <div className="flex items-center gap-2.5">
            {!avatarErr ? (
              <img
                src={ADMIN_AVATAR_SRC}
                alt={adminUser.name}
                referrerPolicy="no-referrer"
                onError={() => setAvatarErr(true)}
                className="w-9 h-9 rounded-xl object-cover border border-purple-200 dark:border-purple-800"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-purple-700 text-white flex items-center justify-center font-bold">
                A
              </div>
            )}
            <div>
              <p className="font-display font-bold text-sm">SAFEHER Admin</p>
              <p className="text-[11px] text-[#6E6288] dark:text-[#9F93BC]">Operations Console</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="lg:hidden min-h-[38px] px-3 rounded-lg border border-purple-200 dark:border-purple-800 text-xs font-semibold"
          >
            Sign Out
          </button>
        </div>

        <nav className="mt-3 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-y-auto flex-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`min-h-[38px] px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2.5 whitespace-nowrap transition-colors text-left ${
                  section === item.id
                    ? 'bg-purple-700 text-white font-semibold'
                    : 'text-[#4C4166] dark:text-[#C8BEE3] hover:bg-purple-50 dark:hover:bg-[#201833]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={onLogout}
          className="hidden lg:flex mt-4 min-h-[42px] px-3 py-2 rounded-xl border border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-[#201833] text-xs font-semibold items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out of Admin</span>
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-5 sm:p-8 max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-purple-200/70 dark:border-purple-900/50">
          <div>
            <p className="text-xs text-[#6E6288] dark:text-[#9F93BC]">
              Operations / {NAV_ITEMS.find((n) => n.id === section)?.label}
            </p>
            <h1 className="font-display text-2xl font-bold mt-0.5">
              {NAV_ITEMS.find((n) => n.id === section)?.label}
            </h1>
          </div>
          <span className="text-xs text-[#574C70] dark:text-[#B9AED2]">
            Signed in as {adminUser.email}
          </span>
        </header>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-200">
            {error}
          </div>
        )}
        {notice && (
          <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 text-xs text-purple-900 dark:text-purple-100">
            {notice}
          </div>
        )}

        {loading || !data ? (
          <p className="text-sm text-[#574C70] dark:text-[#B9AED2]">Loading console metrics...</p>
        ) : (
          <>
            {/* 1. OVERVIEW */}
            {section === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Registered Members', val: data.stats.totalUsers },
                    { label: 'Active Live SOS', val: data.stats.activeSos },
                    { label: 'Community Reports', val: data.stats.communityReports },
                    { label: 'Pending Suggestions', val: data.stats.pendingSuggestions },
                  ].map((kpi) => (
                    <div
                      key={kpi.label}
                      className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4"
                    >
                      <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">{kpi.label}</p>
                      <p className="font-mono-tabular text-2xl font-bold mt-1">{kpi.val}</p>
                    </div>
                  ))}
                </div>

                <div className="p-4 rounded-2xl bg-purple-50 dark:bg-[#221A34] border border-purple-200 dark:border-purple-800 text-xs text-[#4C4166] dark:text-[#D5CBEB]">
                  <strong>Privacy-by-Default Enforcement:</strong> Private user audio/video
                  recordings are never exposed to administrators. SOS GPS coordinates remain
                  redacted unless explicitly accessed with a logged emergency justification.
                </div>
              </div>
            )}

            {/* 2. USER MANAGEMENT */}
            {section === 'users' && (
              <div className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-purple-100 dark:border-purple-900/60 text-[#6E6288] dark:text-[#9F93BC]">
                    <tr>
                      <th className="py-3 px-4">Member</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4 text-right">Contacts</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-100 dark:divide-purple-900/50">
                    {data.users.map((u) => (
                      <tr key={u.id}>
                        <td className="py-3 px-4 font-semibold">{u.name}</td>
                        <td className="py-3 px-4">{u.email}</td>
                        <td className="py-3 px-4 text-right font-mono-tabular">{u.contactsCount}</td>
                        <td className="py-3 px-4">{u.suspended ? 'Suspended' : 'Active'}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => void handleToggleSuspend(u.id)}
                            className="px-3 py-1.5 rounded-lg border border-purple-200 dark:border-purple-800 font-semibold"
                          >
                            {u.suspended ? 'Restore' : 'Suspend'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 3. SOS MONITORING & 4. EMERGENCY MANAGEMENT */}
            {(section === 'sos' || section === 'emergency') && (
              <div className="space-y-4">
                {revealedLocation && (
                  <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs space-y-1">
                    <p className="font-bold">
                      Authorized Location Record (Logged in Security Audit)
                    </p>
                    <p className="font-mono-tabular">
                      {revealedLocation.location
                        ? `${revealedLocation.location.lat}, ${revealedLocation.location.lng} (${revealedLocation.location.label})`
                        : 'User did not grant GPS coordinates during this SOS session.'}
                    </p>
                  </div>
                )}

                {revealSosId && (
                  <form
                    onSubmit={handleRevealSosLocation}
                    className="p-4 rounded-2xl bg-white dark:bg-[#161122] border border-purple-300 dark:border-purple-700 space-y-3 text-xs"
                  >
                    <p className="font-bold">
                      Authorization Required: Log Justification to View Coordinates
                    </p>
                    <input
                      type="text"
                      required
                      minLength={10}
                      value={revealReason}
                      onChange={(e) => setRevealReason(e.target.value)}
                      placeholder="State emergency coordination reason (min 10 characters)..."
                      className="w-full min-h-[40px] px-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E]"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-purple-700 text-white font-semibold"
                      >
                        Log & Reveal
                      </button>
                      <button
                        type="button"
                        onClick={() => setRevealSosId(null)}
                        className="px-4 py-2 rounded-xl border border-purple-200 dark:border-purple-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                <div className="space-y-3">
                  {data.sosAlerts.length === 0 ? (
                    <p className="text-sm text-[#574C70] dark:text-[#B9AED2]">
                      No SOS sessions logged yet.
                    </p>
                  ) : (
                    data.sosAlerts.map((s) => (
                      <div
                        key={s.id}
                        className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-sm">
                            {s.userName} · {s.testMode ? 'Test Mode' : 'Live SOS'} ·{' '}
                            <span className="capitalize">{s.status}</span>
                          </p>
                          <p className="text-[#574C70] dark:text-[#B9AED2] font-mono-tabular">
                            Triggered via {s.triggeredVia} ·{' '}
                            {new Date(s.startedAt).toLocaleString()} · Location:{' '}
                            {s.hasLocation ? 'Protected (Redacted)' : 'Unavailable'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {s.hasLocation && (
                            <button
                              type="button"
                              onClick={() => setRevealSosId(s.id)}
                              className="min-h-[36px] px-3 rounded-xl border border-purple-200 dark:border-purple-800 font-semibold flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Authorized Access</span>
                            </button>
                          )}
                          {s.status === 'active' && (
                            <button
                              type="button"
                              onClick={() => void handleResolveSos(s.id)}
                              className="min-h-[36px] px-3 rounded-xl bg-emerald-600 text-white font-semibold"
                            >
                              Mark Resolved
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 5 & 6. INCIDENT & COMMUNITY MAP MANAGEMENT */}
            {(section === 'incidents' || section === 'community_map') && (
              <div className="space-y-3">
                {data.reports.map((r) => (
                  <div
                    key={r.id}
                    className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-sm">{r.title}</p>
                      <p className="text-[#574C70] dark:text-[#B9AED2]">
                        {r.category} · {r.address} · Status: {r.status} ·{' '}
                        {r.verified ? 'Verified' : 'Unverified'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleUpdateReport(r.id, { verified: !r.verified })}
                        className="min-h-[36px] px-3 rounded-xl bg-purple-700 text-white font-semibold"
                      >
                        {r.verified ? 'Unverify' : 'Verify Pin'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handleUpdateReport(r.id, {
                            status: r.status === 'resolved' ? 'active' : 'resolved',
                          })
                        }
                        className="min-h-[36px] px-3 rounded-xl border border-purple-200 dark:border-purple-800 font-semibold"
                      >
                        {r.status === 'resolved' ? 'Reopen' : 'Resolve'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 7. SUGGESTIONS MANAGEMENT */}
            {section === 'suggestions' && (
              <div className="space-y-3">
                {data.suggestions.map((s) => (
                  <div
                    key={s.id}
                    className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="max-w-xl">
                      <p className="font-semibold text-sm">{s.title}</p>
                      <p className="text-[#574C70] dark:text-[#B9AED2]">
                        Theme: {s.clusterGroup} · Upvotes: {s.upvotes.length}
                      </p>
                      <p className="mt-1">{s.description}</p>
                    </div>
                    <select
                      value={s.status}
                      onChange={(e) =>
                        void handleUpdateSuggestion(s.id, e.target.value as SuggestionStatus)
                      }
                      className="min-h-[38px] px-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] font-semibold"
                    >
                      {(
                        [
                          'Submitted',
                          'Under Review',
                          'Accepted',
                          'In Development',
                          'Testing',
                          'Implemented',
                          'Not Planned',
                        ] as SuggestionStatus[]
                      ).map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {/* 8. FEEDBACK MANAGEMENT */}
            {section === 'feedback' && (
              <div className="space-y-3">
                {data.feedback.map((f) => (
                  <div
                    key={f.id}
                    className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-sm">
                        {f.authorName} · Rating {f.rating}/5 · {f.category}
                      </p>
                      <p className="mt-1 text-[#4C4166] dark:text-[#C8BEE3]">{f.message}</p>
                    </div>
                    <select
                      value={f.status}
                      onChange={(e) =>
                        void handleUpdateFeedback(
                          f.id,
                          e.target.value as 'new' | 'reviewed' | 'resolved'
                        )
                      }
                      className="min-h-[38px] px-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E]"
                    >
                      <option value="new">New</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>
                ))}
              </div>
            )}

            {/* 9. FEATURE MANAGEMENT */}
            {section === 'features' && (
              <div className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-5 space-y-3">
                {Object.entries(data.adminConfig.featureFlags).map(([key, val]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-2 border-b last:border-b-0 border-purple-100 dark:border-purple-900/50 text-sm"
                  >
                    <span className="font-mono-tabular text-xs">{key}</span>
                    <button
                      type="button"
                      onClick={() => void handleToggleFlag(key, val)}
                      className={`min-h-[36px] px-4 rounded-xl text-xs font-semibold ${
                        val
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {val ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 10. AI MANAGEMENT */}
            {section === 'ai' && (
              <div className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-4 max-w-xl">
                <h3 className="font-display font-bold text-base">
                  AI Safety Guardrail Policy Mode
                </h3>
                <div className="space-y-2 text-xs">
                  {(
                    [
                      {
                        id: 'strict_non_confrontational',
                        label: 'Strict Non-Confrontational Escape Guidance (Recommended)',
                      },
                      {
                        id: 'rapid_escalation',
                        label: 'Rapid SOS Escalation Priority',
                      },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => void handleAiMode(m.id)}
                      className={`w-full text-left p-3.5 rounded-xl border font-semibold ${
                        data.adminConfig.aiSafetyMode === m.id
                          ? 'bg-purple-700 text-white border-purple-700'
                          : 'border-purple-200 dark:border-purple-800'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 11. NOTIFICATION MANAGEMENT */}
            {section === 'notifications' && (
              <form
                onSubmit={handleBroadcast}
                className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-3 max-w-xl"
              >
                <h3 className="font-display font-bold text-base">Broadcast Safety Advisory</h3>
                <input
                  type="text"
                  required
                  value={bcTitle}
                  onChange={(e) => setBcTitle(e.target.value)}
                  placeholder="Advisory Title"
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm"
                />
                <textarea
                  rows={3}
                  required
                  value={bcBody}
                  onChange={(e) => setBcBody(e.target.value)}
                  placeholder="Message to all registered members..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm"
                />
                <button
                  type="submit"
                  className="min-h-[42px] px-5 rounded-xl bg-purple-700 text-white text-xs font-semibold"
                >
                  Send Platform Notification
                </button>
              </form>
            )}

            {/* 12. ANALYTICS */}
            {section === 'analytics' && (
              <div className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-3 text-xs">
                <h3 className="font-display font-bold text-base">Platform Operations Breakdown</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 font-mono-tabular">
                  <div>
                    <p className="text-[#574C70] dark:text-[#B9AED2]">Total SOS Drills / Tests</p>
                    <p className="text-xl font-bold mt-1">{data.stats.testSosCount}</p>
                  </div>
                  <div>
                    <p className="text-[#574C70] dark:text-[#B9AED2]">Evidence Files Secured</p>
                    <p className="text-xl font-bold mt-1">{data.stats.evidenceVaultCount}</p>
                  </div>
                  <div>
                    <p className="text-[#574C70] dark:text-[#B9AED2]">Open Support Tickets</p>
                    <p className="text-xl font-bold mt-1">{data.stats.openSupportTickets}</p>
                  </div>
                </div>
              </div>
            )}

            {/* 13. SECURITY MANAGEMENT (AUDIT LOG) */}
            {section === 'security' && (
              <div className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-5 space-y-3 text-xs">
                <h3 className="font-display font-bold text-base">
                  Immutable Privacy & Security Audit Log
                </h3>
                {data.auditLogs.length === 0 ? (
                  <p className="text-[#574C70] dark:text-[#B9AED2]">No sensitive actions logged yet.</p>
                ) : (
                  <div className="space-y-2">
                    {data.auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-3 rounded-xl bg-[#FAF8FF] dark:bg-[#1E172E] font-mono-tabular"
                      >
                        <p className="font-semibold">
                          {log.action} · {log.actorEmail}
                        </p>
                        <p className="text-[#574C70] dark:text-[#B9AED2]">
                          Target: {log.targetId} · Reason: {log.justification} ·{' '}
                          {new Date(log.timestamp).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 14. SUPPORT MANAGEMENT */}
            {section === 'support' && (
              <div className="space-y-3">
                {data.supportTickets.length === 0 ? (
                  <p className="text-sm text-[#574C70] dark:text-[#B9AED2]">
                    No support tickets submitted.
                  </p>
                ) : (
                  data.supportTickets.map((t) => (
                    <div
                      key={t.id}
                      className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4 space-y-2 text-xs"
                    >
                      <p className="font-semibold text-sm">
                        {t.subject} ({t.email}) · {t.status}
                      </p>
                      <p>{t.message}</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={replyDrafts[t.id] ?? t.reply ?? ''}
                          onChange={(e) =>
                            setReplyDrafts({ ...replyDrafts, [t.id]: e.target.value })
                          }
                          placeholder="Write reply to user..."
                          className="flex-1 min-h-[38px] px-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E]"
                        />
                        <button
                          type="button"
                          onClick={() => void handleReplySupport(t.id)}
                          className="px-4 rounded-xl bg-purple-700 text-white font-semibold"
                        >
                          Reply & Resolve
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 15. ADMIN SETTINGS */}
            {section === 'settings' && (
              <div className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-3 text-xs max-w-xl">
                <h3 className="font-display font-bold text-base flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Operations Console Policy</span>
                </h3>
                <p className="text-[#574C70] dark:text-[#B9AED2] leading-relaxed">
                  Role-based administrator verification is active. Private user media remains
                  isolated from admin APIs, and every authorized emergency location inspection is
                  permanently written to the Security Audit log.
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
