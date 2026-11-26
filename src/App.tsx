import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  Bot,
  CheckCheck,
  Clock,
  Compass,
  FileAudio,
  Home,
  Languages,
  Lock,
  Map as MapIcon,
  MapPin,
  Mic,
  Moon,
  Navigation,
  PhoneCall,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  ThumbsUp,
  User as UserIcon,
  Users,
  Video,
  WifiOff,
} from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { AiSafetyAgentPanel } from './components/AiSafetyAgentPanel.tsx';
import { EvidenceGalleryView } from './components/EvidenceGalleryView.tsx';
import { LockScreenView } from './components/LockScreenView.tsx';
import { SafeMapView } from './components/SafeMapView.tsx';
import { SafetyToolsHub, type ToolSectionId } from './components/SafetyToolsHub.tsx';
import { SettingsProfileView } from './components/SettingsProfileView.tsx';
import { EMBLEM_SRC, WelcomeAuthScreen } from './components/WelcomeAuthScreen.tsx';
import { apiFetch, saveOfflineVault, setAuthToken } from './lib/api.ts';
import { t } from './lib/i18n.ts';
import type {
  ChatMessageRecord,
  CommunityReport,
  EvidenceRecord,
  FeatureSuggestion,
  JourneySession,
  NotificationItem,
  SosSession,
  ThemeMode,
  TrustedContact,
  UserPublic,
} from './types/safeher.ts';

type MainTab = 'home' | 'map' | 'ai' | 'evidence' | 'profile';

export default function App() {
  // Top-level Demo Key Quota Defense (persists even if map child unmounts)
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  // Public runtime config
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );

  // Auth & Lock Screen
  const [user, setUser] = useState<UserPublic | null>(null);
  const [guestTheme, setGuestTheme] = useState<ThemeMode>('system');
  const [isLocked, setIsLocked] = useState(false);

  // Navigation
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [homeMode, setHomeMode] = useState<'dashboard' | 'tools'>('dashboard');
  const [toolsSection, setToolsSection] = useState<ToolSectionId>('journey');
  const [aiEntryPoint, setAiEntryPoint] = useState<'home' | 'ai_tab'>('ai_tab');
  const [notifOpen, setNotifOpen] = useState(false);
  const [emblemError, setEmblemError] = useState(false);

  // Member Domain Data
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [sosHistory, setSosHistory] = useState<SosSession[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [evidenceBytes, setEvidenceBytes] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessageRecord[]>([]);
  const [journeys, setJourneys] = useState<JourneySession[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [suggestions, setSuggestions] = useState<FeatureSuggestion[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Device Geolocation & Connectivity
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
    accuracyMeters?: number;
    label: string;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [sosBusy, setSosBusy] = useState(false);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  // Quota banner listener
  useEffect(() => {
    const onQuota = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Online / Offline listener
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Fetch public Maps key fallback from server
  useEffect(() => {
    apiFetch<{ mapsApiKey?: string }>('/api/config/public')
      .then((cfg) => {
        if (cfg.mapsApiKey && !mapsApiKey) {
          setMapsApiKey(cfg.mapsApiKey);
        }
      })
      .catch(() => {});
  }, [mapsApiKey]);

  // Apply Light / Dark / System Theme + Accessibility classes globally
  const effectiveTheme: ThemeMode = user?.settings.appearance ?? guestTheme;

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const useDark =
        effectiveTheme === 'dark' || (effectiveTheme === 'system' && media.matches);
      root.classList.toggle('dark', useDark);
    };

    applyTheme();
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [effectiveTheme]);

  useEffect(() => {
    const root = document.documentElement;
    const a11y = user?.settings.accessibility;
    root.classList.toggle('a11y-large', a11y?.textSize === 'large');
    root.classList.toggle('a11y-xl', a11y?.textSize === 'xl');
    root.classList.toggle('a11y-contrast', Boolean(a11y?.highContrast));
  }, [user?.settings.accessibility]);

  const showToast = useCallback((msg: string) => {
    setStatusToast(msg);
    setTimeout(() => setStatusToast((prev) => (prev === msg ? null : prev)), 4000);
  }, []);

  const refreshLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyMeters: Math.round(pos.coords.accuracy),
          label: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
        });
        setLocating(false);
      },
      () => {
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 }
    );
  }, []);

  const refreshEvidence = useCallback(async () => {
    try {
      const res = await apiFetch<{ items: EvidenceRecord[]; totalBytes: number }>('/api/evidence');
      setEvidence(res.items);
      setEvidenceBytes(res.totalBytes);
    } catch {
      // Ignore background refresh error
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const res = await apiFetch<{ notifications: NotificationItem[] }>('/api/notifications');
      setNotifications(res.notifications);
    } catch {
      // Ignore
    }
  }, []);

  const loadMemberWorkspace = useCallback(async () => {
    try {
      const [cRes, sRes, eRes, chatRes, jRes, repRes, sugRes, notRes] = await Promise.all([
        apiFetch<{ contacts: TrustedContact[] }>('/api/contacts'),
        apiFetch<{ sessions: SosSession[] }>('/api/sos'),
        apiFetch<{ items: EvidenceRecord[]; totalBytes: number }>('/api/evidence'),
        apiFetch<{ messages: ChatMessageRecord[] }>('/api/ai/chat'),
        apiFetch<{ journeys: JourneySession[] }>('/api/journeys'),
        apiFetch<{ reports: CommunityReport[] }>('/api/community/reports'),
        apiFetch<{ suggestions: FeatureSuggestion[] }>('/api/suggestions'),
        apiFetch<{ notifications: NotificationItem[] }>('/api/notifications'),
      ]);
      setContacts(cRes.contacts);
      setSosHistory(sRes.sessions);
      setEvidence(eRes.items);
      setEvidenceBytes(eRes.totalBytes);
      setChatMessages(chatRes.messages);
      setJourneys(jRes.journeys);
      setReports(repRes.reports);
      setSuggestions(sugRes.suggestions);
      setNotifications(notRes.notifications);
    } catch {
      // Partial errors handled cleanly
    }
  }, []);

  const handleAuthenticated = (authedUser: UserPublic) => {
    setUser(authedUser);
    setIsLocked(false);
    setActiveTab('home');
    setHomeMode('dashboard');
    if (authedUser.role === 'user') {
      void loadMemberWorkspace();
      refreshLocation();
    }
  };

  // Sync non-sensitive offline emergency snapshot
  useEffect(() => {
    if (!user || user.role !== 'user') return;
    saveOfflineVault({
      updatedAt: new Date().toISOString(),
      userName: user.name,
      emergencyMessage: user.emergencyMessage,
      contacts: contacts.map((c) => ({
        name: c.name,
        phone: c.phone,
        relationship: c.relationship,
      })),
      lastLocation: currentLocation
        ? { lat: currentLocation.lat, lng: currentLocation.lng, label: currentLocation.label }
        : null,
    });
  }, [user, contacts, currentLocation]);

  const activeSos = useMemo(
    () => sosHistory.find((s) => s.status === 'active' || s.status === 'test') || null,
    [sosHistory]
  );

  const primaryContact = useMemo(
    () => contacts.find((c) => c.isPrimary) || contacts[0] || null,
    [contacts]
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const handleTriggerSos = async (
    via: 'home_button' | 'lock_screen' | 'silent_gesture' | 'voice_distress' | 'ai_agent',
    testOverride?: boolean
  ) => {
    if (!user || sosBusy) return;
    setSosBusy(true);
    try {
      // Quick non-blocking attempt to refresh GPS (max 1.8s) so emergency response is never delayed
      let locToSend = currentLocation;
      if (!locToSend && navigator.geolocation) {
        locToSend = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(null), 1800);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              clearTimeout(timer);
              const fresh = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracyMeters: Math.round(pos.coords.accuracy),
                label: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
              };
              setCurrentLocation(fresh);
              resolve(fresh);
            },
            () => {
              clearTimeout(timer);
              resolve(null);
            },
            { timeout: 1600 }
          );
        });
      }

      const res = await apiFetch<{ session: SosSession }>('/api/sos/trigger', {
        method: 'POST',
        body: JSON.stringify({
          triggeredVia: via,
          testMode: testOverride ?? user.settings.sos.testMode,
          location: locToSend,
        }),
      });
      setSosHistory((prev) => [res.session, ...prev]);
      void refreshNotifications();
      showToast(
        res.session.testMode
          ? 'SOS Test Mode started safely (zero real alerts sent).'
          : 'Emergency SOS active. Trusted contact alert workflow initiated.'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to activate SOS.');
    } finally {
      setSosBusy(false);
    }
  };

  const handleStopSos = async (id: string) => {
    try {
      const res = await apiFetch<{ session: SosSession }>(`/api/sos/${id}/stop`, {
        method: 'POST',
      });
      setSosHistory((prev) => prev.map((s) => (s.id === id ? res.session : s)));
      showToast('SOS session stopped and archived to Digital Emergency Timeline.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to stop SOS session.');
    }
  };

  const handleNotifyContactsQuick = async () => {
    if (!primaryContact) {
      showToast('Add a trusted contact in Profile first.');
      setActiveTab('profile');
      return;
    }
    try {
      await apiFetch(`/api/contacts/${primaryContact.id}/test`, { method: 'POST' });
      void refreshNotifications();
      showToast(`Alert notification logged for ${primaryContact.name}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not notify contact.');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // Ignore
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore
    }
    setAuthToken(null);
    setUser(null);
    setIsLocked(false);
    setContacts([]);
    setSosHistory([]);
    setEvidence([]);
    setChatMessages([]);
    setJourneys([]);
    setNotifications([]);
  };

  const cycleTheme = async () => {
    const order: ThemeMode[] = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(effectiveTheme) + 1) % order.length];
    if (!user) {
      setGuestTheme(next);
      return;
    }
    const updatedSettings = { ...user.settings, appearance: next };
    try {
      const res = await apiFetch<{ user: UserPublic }>('/api/account/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: updatedSettings }),
      });
      setUser(res.user);
    } catch {
      setUser({ ...user, settings: updatedSettings });
    }
  };

  const openToolsSection = (section: ToolSectionId) => {
    setToolsSection(section);
    setHomeMode('tools');
    setActiveTab('home');
  };

  const openAiFromHome = () => {
    setAiEntryPoint('home');
    setActiveTab('ai');
  };

  const themeToggleBtn = (
    <button
      type="button"
      onClick={() => void cycleTheme()}
      title={`Appearance: ${effectiveTheme}`}
      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-purple-100/80 dark:bg-[#231B36] border border-purple-200 dark:border-purple-800 text-xs font-semibold flex items-center gap-1.5 text-purple-950 dark:text-purple-100 whitespace-nowrap shrink-0"
    >
      {effectiveTheme === 'dark' ? (
        <Moon className="w-3.5 h-3.5" />
      ) : effectiveTheme === 'light' ? (
        <Sun className="w-3.5 h-3.5" />
      ) : (
        <Sparkles className="w-3.5 h-3.5" />
      )}
      <span className="capitalize">{effectiveTheme}</span>
    </button>
  );

  // Quota Banner rendered above all views when Demo Key quota is exceeded
  const quotaBanner = mapsQuotaExceeded ? (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
      <span>
        Google Maps Platform quota reached. If you are the app owner, visit{' '}
        <a
          href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-semibold text-amber-950 hover:text-amber-800"
        >
          maps developer site
        </a>{' '}
        for instructions to update your account.
      </span>
    </div>
  ) : null;

  // 1. Unauthenticated -> Welcome / Login / Register / Reset / Admin Portal
  if (!user) {
    return (
      <>
        {quotaBanner}
        <WelcomeAuthScreen
          onAuthenticated={handleAuthenticated}
          themeToggleControl={themeToggleBtn}
        />
      </>
    );
  }

  // 2. Administrator -> Separate Operations Console
  if (user.role === 'admin') {
    return (
      <>
        {quotaBanner}
        <AdminDashboard adminUser={user} onLogout={() => void handleLogout()} />
      </>
    );
  }

  // 3. Dedicated SAFEHER Lock Screen (Entry Point A for AI Safety Agent)
  if (isLocked) {
    return (
      <>
        {quotaBanner}
        <LockScreenView
          user={user}
          primaryContact={primaryContact}
          activeSos={activeSos}
          chatMessages={chatMessages}
          onChatMessagesChange={setChatMessages}
          onTriggerSos={(via) => void handleTriggerSos(via)}
          onStopSos={(id) => void handleStopSos(id)}
          onNotifyTrustedContacts={() => void handleNotifyContactsQuick()}
          onUnlock={() => setIsLocked(false)}
          hasLocation={Boolean(currentLocation)}
          locationLabel={currentLocation?.label}
        />
      </>
    );
  }

  const copy = t(user.settings.language);
  const activeJourney = journeys.find((j) => j.status === 'active') || null;

  return (
    <div className="min-h-screen bg-[#FAF8FF] dark:bg-[#0F0B18] text-[#1A102B] dark:text-[#F4EFFC] flex flex-col">
      {quotaBanner}

      {/* Compact Sticky Top Header */}
      <header className="sticky top-0 z-40 h-14 bg-white/90 dark:bg-[#161122]/90 backdrop-blur-md border-b border-purple-200/70 dark:border-purple-900/60 px-4">
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between gap-3">
          {/* Brand + Desktop Primary Nav */}
          <div className="flex items-center gap-6 min-w-0">
            <button
              type="button"
              onClick={() => {
                setActiveTab('home');
                setHomeMode('dashboard');
              }}
              className="flex items-center gap-2.5 text-left shrink-0"
            >
              {!emblemError ? (
                <img
                  src={EMBLEM_SRC}
                  alt="SAFEHER"
                  referrerPolicy="no-referrer"
                  onError={() => setEmblemError(true)}
                  className="w-8 h-8 rounded-xl object-cover border border-purple-300 dark:border-purple-700"
                />
              ) : (
                <div className="w-8 h-8 rounded-xl bg-purple-700 text-white flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
              )}
              <span className="font-display font-extrabold text-base tracking-tight">SAFEHER</span>
            </button>

            {/* Desktop Top Navigation */}
            <nav className="hidden md:flex items-center gap-1" aria-label="Primary navigation">
              {(
                [
                  { id: 'home', label: copy.navHome, icon: Home },
                  { id: 'map', label: copy.navMap, icon: MapIcon },
                  { id: 'ai', label: copy.navAi, icon: Bot },
                  { id: 'evidence', label: copy.navEvidence, icon: Video },
                  { id: 'profile', label: copy.navProfile, icon: UserIcon },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      if (item.id === 'home') setHomeMode('dashboard');
                      if (item.id === 'ai') setAiEntryPoint('ai_tab');
                    }}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-purple-700 text-white'
                        : 'text-[#574C70] dark:text-[#C5B9DF] hover:bg-purple-100/70 dark:hover:bg-[#231B36]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {!isOnline && (
              <button
                type="button"
                onClick={() => openToolsSection('offline_practice')}
                className="min-h-[36px] px-2.5 py-1 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <WifiOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Offline Mode</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsLocked(true)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-purple-100 dark:bg-[#231B36] hover:bg-purple-200 dark:hover:bg-[#2E2346] text-purple-900 dark:text-purple-100 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{copy.lockScreenBtn}</span>
            </button>

            <div className="hidden sm:block">{themeToggleBtn}</div>

            {/* Notification Centre Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                aria-label="Notification Centre"
                className="min-h-[38px] min-w-[38px] rounded-xl bg-purple-100/80 dark:bg-[#231B36] flex items-center justify-center relative text-purple-900 dark:text-purple-100"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-pink-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[70vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#191228] border border-purple-200 dark:border-purple-800 shadow-xl p-4 z-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-bold text-sm">Notification Centre</h3>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleMarkAllRead()}
                        className="text-xs font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-1"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Mark all read</span>
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-xs text-[#6E6288] dark:text-[#9F93BC] py-4 text-center">
                      No notifications yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-purple-100 dark:divide-purple-900/50">
                      {notifications.slice(0, 12).map((n) => (
                        <div
                          key={n.id}
                          className={`py-2.5 text-xs space-y-0.5 ${
                            n.read ? 'opacity-75' : 'font-medium'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#1A102B] dark:text-white">
                              {n.title}
                            </span>
                            <span className="text-[10px] text-[#6E6288] dark:text-[#9F93BC]">
                              {new Date(n.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="text-[#574C70] dark:text-[#B9AED2]">{n.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              aria-label="Open profile and settings"
              className="min-h-[38px] min-w-[38px] px-2.5 rounded-xl bg-purple-700 text-white text-xs font-bold flex items-center justify-center shrink-0"
            >
              {user.name
                .split(' ')
                .map((p) => p[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 pb-24 md:pb-10 space-y-6">
        {statusToast && (
          <div className="px-4 py-3 rounded-2xl bg-purple-900 dark:bg-purple-800 text-white text-xs sm:text-sm font-medium flex items-center justify-between gap-3">
            <span>{statusToast}</span>
            <button
              type="button"
              onClick={() => setStatusToast(null)}
              className="text-xs underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Active SOS Live Control Panel (Visible Across Tabs When Triggered) */}
        {activeSos && (
          <section className="rounded-3xl bg-gradient-to-r from-[#581C87] via-[#7E22CE] to-[#BE185D] text-white p-5 sm:p-6 shadow-lg space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center relative">
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-400 animate-ping" />
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-base sm:text-lg">
                    {activeSos.testMode
                      ? 'SOS Test Mode Active (Practice Drill)'
                      : 'Emergency SOS Active'}
                  </h2>
                  <p className="text-xs text-purple-100">
                    Started {new Date(activeSos.startedAt).toLocaleTimeString()} ·{' '}
                    {activeSos.location
                      ? `Location logged (${activeSos.location.label})`
                      : 'Location unavailable (enable GPS if safe)'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="tel:911"
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-white text-purple-950 text-xs font-bold flex items-center gap-1.5"
                >
                  <PhoneCall className="w-4 h-4" />
                  <span>Call 911</span>
                </a>
                {primaryContact && (
                  <a
                    href={`tel:${primaryContact.phone}`}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <PhoneCall className="w-4 h-4" />
                    <span>Call {primaryContact.name.split(' ')[0]}</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab('evidence')}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Video className="w-4 h-4" />
                  <span>Record Evidence</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleStopSos(activeSos.id)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-black/35 hover:bg-black/50 text-white text-xs font-bold"
                >
                  Stop SOS
                </button>
              </div>
            </div>

            {activeSos.deliveryLogs.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                {activeSos.deliveryLogs.map((log) => (
                  <div
                    key={log.contactId}
                    className="px-3 py-2 rounded-xl bg-white/10 flex items-center justify-between gap-2"
                  >
                    <span className="truncate font-medium">{log.contactName}</span>
                    <span className="text-[11px] text-purple-100 shrink-0">
                      {log.status === 'test_simulated'
                        ? 'Simulated (Test)'
                        : 'Notified via SAFEHER'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 1: HOME DASHBOARD OR SAFETY TOOLS HUB */}
        {activeTab === 'home' && homeMode === 'tools' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setHomeMode('dashboard')}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#161122] border border-purple-200 dark:border-purple-900/60 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Home Dashboard</span>
            </button>
            <SafetyToolsHub
              initialSection={toolsSection}
              user={user}
              contacts={contacts}
              journeys={journeys}
              onJourneysChange={setJourneys}
              sosHistory={sosHistory}
              suggestions={suggestions}
              onSuggestionsChange={setSuggestions}
              onTriggerSos={(via, testOverride) => void handleTriggerSos(via, testOverride)}
              onOpenAiAgent={openAiFromHome}
            />
          </div>
        )}

        {activeTab === 'home' && homeMode === 'dashboard' && (
          <div className="space-y-6">
            {/* Welcome & Safety Status + One-Tap SOS Hero */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
              {/* Primary SOS Control Card */}
              <div className="lg:col-span-7 bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 sm:p-7 flex flex-col justify-between gap-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                      {activeSos
                        ? copy.safetyStatusActive
                        : user.settings.sos.testMode
                          ? copy.safetyStatusTest
                          : copy.safetyStatusProtected}
                    </p>
                    <h1 className="font-display text-2xl sm:text-3xl font-extrabold mt-1 tracking-tight">
                      Stay safe, {user.name.split(' ')[0]}
                    </h1>
                    <p className="text-xs sm:text-sm text-[#574C70] dark:text-[#B9AED2] mt-1">
                      {currentLocation
                        ? `GPS ready (${currentLocation.label})`
                        : 'Tap Refresh GPS to attach your current coordinates to routes & SOS.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={refreshLocation}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-purple-100 dark:bg-[#231B36] text-purple-900 dark:text-purple-100 text-xs font-semibold flex items-center gap-1.5 shrink-0"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{locating ? 'Locating...' : currentLocation ? 'GPS Ready' : 'Enable GPS'}</span>
                  </button>
                </div>

                {/* Prominent One-Tap SOS Button */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                  <button
                    type="button"
                    disabled={sosBusy}
                    onClick={() => void handleTriggerSos('home_button')}
                    className="flex-1 min-h-[84px] px-6 py-4 rounded-2xl bg-gradient-to-r from-[#6D28D9] via-[#9333EA] to-[#DB2777] hover:brightness-110 active:scale-[0.99] text-white shadow-lg shadow-purple-900/20 flex items-center justify-between gap-4 transition-all text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                        <ShieldAlert className="w-8 h-8 text-white" />
                      </div>
                      <div>
                        <span className="font-display font-extrabold text-xl block">
                          {sosBusy ? 'Activating SOS...' : copy.sosButton}
                        </span>
                        <span className="text-xs text-purple-100 block mt-0.5">
                          {user.settings.sos.testMode
                            ? 'SOS Test Mode is ON — zero real alerts will be sent'
                            : copy.sosSubtitle}
                        </span>
                      </div>
                    </div>
                  </button>

                  <div className="flex sm:flex-col gap-2">
                    <a
                      href="tel:911"
                      className="flex-1 min-h-[40px] px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>Call 911</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleNotifyContactsQuick()}
                      className="flex-1 min-h-[40px] px-4 py-2 rounded-xl bg-purple-100 dark:bg-[#231B36] text-purple-950 dark:text-purple-100 text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Alert Contact</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* AI Safety Agent Home Card (Entry Point B) */}
              <div className="lg:col-span-5 bg-gradient-to-br from-[#2B174D] via-[#4C1D95] to-[#6D28D9] text-white rounded-3xl p-6 sm:p-7 flex flex-col justify-between gap-5">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
                      <Bot className="w-6 h-6 text-pink-200" />
                    </div>
                    <span className="text-xs text-purple-200 font-medium">
                      Shared Lock & Home History
                    </span>
                  </div>
                  <h2 className="font-display text-xl font-bold">{copy.aiCardTitle}</h2>
                  <p className="text-xs sm:text-sm text-purple-100 leading-relaxed">
                    {copy.aiCardDesc}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={openAiFromHome}
                    className="min-h-[46px] px-4 py-2.5 rounded-xl bg-white text-purple-950 hover:bg-purple-50 text-xs font-bold flex items-center justify-center gap-2"
                  >
                    <Bot className="w-4 h-4" />
                    <span>Open AI Agent</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsLocked(true)}
                    className="min-h-[46px] px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center justify-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Lock Screen</span>
                  </button>
                </div>
              </div>
            </section>

            {/* Core Dashboard Shortcuts */}
            <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className="bg-white dark:bg-[#161122] hover:border-purple-400 dark:hover:border-purple-600 rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4 text-left space-y-2 transition-colors"
              >
                <Users className="w-5 h-5 text-purple-700 dark:text-purple-300" />
                <p className="font-display font-bold text-sm">Emergency Contacts</p>
                <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
                  {contacts.length > 0
                    ? `${contacts.length} trusted contact${contacts.length > 1 ? 's' : ''}`
                    : 'Add your first contact'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('map')}
                className="bg-white dark:bg-[#161122] hover:border-purple-400 dark:hover:border-purple-600 rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4 text-left space-y-2 transition-colors"
              >
                <Navigation className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                <p className="font-display font-bold text-sm">Safe Route & Map</p>
                <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
                  CCTV-aware routing & nearby staffed help
                </p>
              </button>

              <button
                type="button"
                onClick={() => openToolsSection('journey')}
                className="bg-white dark:bg-[#161122] hover:border-purple-400 dark:hover:border-purple-600 rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4 text-left space-y-2 transition-colors"
              >
                <Compass className="w-5 h-5 text-purple-700 dark:text-purple-300" />
                <p className="font-display font-bold text-sm">Journey Guardian</p>
                <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
                  {activeJourney
                    ? `Active to ${activeJourney.destinationLabel}`
                    : 'Track trips & check-in timers'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('evidence')}
                className="bg-white dark:bg-[#161122] hover:border-purple-400 dark:hover:border-purple-600 rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4 text-left space-y-2 transition-colors"
              >
                <FileAudio className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                <p className="font-display font-bold text-sm">Evidence Gallery</p>
                <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
                  {evidence.length} audio/video file{evidence.length === 1 ? '' : 's'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => openToolsSection('ai_features')}
                className="bg-white dark:bg-[#161122] hover:border-purple-400 dark:hover:border-purple-600 rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4 text-left space-y-2 transition-colors"
              >
                <Sparkles className="w-5 h-5 text-purple-700 dark:text-purple-300" />
                <p className="font-display font-bold text-sm">6 AI Safety Features</p>
                <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
                  Distress voice, silent gesture & brief
                </p>
              </button>

              <button
                type="button"
                onClick={() => openToolsSection('translator')}
                className="bg-white dark:bg-[#161122] hover:border-purple-400 dark:hover:border-purple-600 rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4 text-left space-y-2 transition-colors"
              >
                <Languages className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                <p className="font-display font-bold text-sm">Emergency Translator</p>
                <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
                  Instant local help phrases & TTS
                </p>
              </button>

              <button
                type="button"
                onClick={() => openToolsSection('timeline')}
                className="bg-white dark:bg-[#161122] hover:border-purple-400 dark:hover:border-purple-600 rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4 text-left space-y-2 transition-colors"
              >
                <Clock className="w-5 h-5 text-purple-700 dark:text-purple-300" />
                <p className="font-display font-bold text-sm">Emergency Timeline</p>
                <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
                  {sosHistory.length} recorded SOS event{sosHistory.length === 1 ? '' : 's'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => openToolsSection('offline_practice')}
                className="bg-white dark:bg-[#161122] hover:border-purple-400 dark:hover:border-purple-600 rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4 text-left space-y-2 transition-colors"
              >
                <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <p className="font-display font-bold text-sm">Practice, Tips & Offline</p>
                <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
                  Drills, BLE wearable & offline vault
                </p>
              </button>
            </section>

            {/* Bottom Row: Nearby Help Summary + Safety Suggestions */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-5 sm:p-6 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display font-bold text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-700 dark:text-purple-300" />
                    <span>Live Safety Snapshot</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('map')}
                    className="text-xs font-semibold text-purple-700 dark:text-purple-300 hover:underline"
                  >
                    Open Map
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-2xl bg-[#FAF8FF] dark:bg-[#1E172E] border border-purple-200/60 dark:border-purple-900/50 space-y-1">
                    <p className="font-semibold">Primary Trusted Contact</p>
                    <p className="text-[#574C70] dark:text-[#B9AED2]">
                      {primaryContact
                        ? `${primaryContact.name} · ${primaryContact.phone}`
                        : 'Not configured yet'}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-[#FAF8FF] dark:bg-[#1E172E] border border-purple-200/60 dark:border-purple-900/50 space-y-1">
                    <p className="font-semibold">Community Map Advisories</p>
                    <p className="text-[#574C70] dark:text-[#B9AED2]">
                      {reports.length} active safety pins near your area
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-5 sm:p-6 flex flex-col justify-between gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display font-bold text-base flex items-center gap-2">
                    <ThumbsUp className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                    <span>User Suggestions & Roadmap</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => openToolsSection('suggestions')}
                    className="text-xs font-semibold text-purple-700 dark:text-purple-300 hover:underline"
                  >
                    View All ({suggestions.length})
                  </button>
                </div>
                <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
                  Propose new women&apos;s safety capabilities, upvote community requests, and track
                  every suggestion from Submitted through Implemented.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openToolsSection('suggestions')}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold"
                  >
                    Submit Safety Idea or Feedback
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: GOOGLE MAPS SAFE ROUTE & COMMUNITY SAFETY MAP */}
        {activeTab === 'map' && (
          <SafeMapView
            mapsApiKey={mapsApiKey}
            user={user}
            currentLocation={currentLocation}
            onRefreshLocation={refreshLocation}
            reports={reports}
            onReportsChange={setReports}
          />
        )}

        {/* TAB 3: AI SAFETY AGENT (SHARED CHAT HISTORY WITH LOCK SCREEN) */}
        {activeTab === 'ai' && (
          <div className="max-w-4xl mx-auto">
            <AiSafetyAgentPanel
              entryPoint={aiEntryPoint}
              user={user}
              messages={chatMessages}
              onMessagesChange={setChatMessages}
              activeSos={activeSos}
              onTriggerSos={(via) => void handleTriggerSos(via)}
              onNotifyContacts={() => void handleNotifyContactsQuick()}
              hasLocation={Boolean(currentLocation)}
              locationLabel={currentLocation?.label}
            />
          </div>
        )}

        {/* TAB 4: EVIDENCE GALLERY (AUDIO & VIDEO RECORDING) */}
        {activeTab === 'evidence' && (
          <EvidenceGalleryView
            user={user}
            evidence={evidence}
            totalBytes={evidenceBytes}
            activeSos={activeSos}
            onEvidenceUpdated={() => void refreshEvidence()}
          />
        )}

        {/* TAB 5: PROFILE, CONTACTS & SETTINGS */}
        {activeTab === 'profile' && (
          <SettingsProfileView
            user={user}
            onUserChange={setUser}
            contacts={contacts}
            onContactsChange={setContacts}
            evidenceBytes={evidenceBytes}
            onEvidenceCleared={() => void refreshEvidence()}
            onLogout={() => void handleLogout()}
            onAccountDeleted={() => {
              setAuthToken(null);
              setUser(null);
            }}
          />
        )}
      </main>

      {/* Fixed 5-Item Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile bottom navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#161122]/95 backdrop-blur-md border-t border-purple-200 dark:border-purple-900/60 pb-safe"
      >
        <div className="grid grid-cols-5 h-16">
          {(
            [
              { id: 'home', label: copy.navHome, icon: Home },
              { id: 'map', label: copy.navMap, icon: MapIcon },
              { id: 'ai', label: copy.navAi, icon: Mic },
              { id: 'evidence', label: copy.navEvidence, icon: Video },
              { id: 'profile', label: copy.navProfile, icon: UserIcon },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id === 'home') setHomeMode('dashboard');
                  if (item.id === 'ai') setAiEntryPoint('ai_tab');
                }}
                className={`flex flex-col items-center justify-center gap-1 min-h-[44px] text-[11px] font-semibold transition-colors ${
                  active
                    ? 'text-purple-700 dark:text-purple-300'
                    : 'text-[#6E6288] dark:text-[#9F93BC]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="truncate max-w-full px-1">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
