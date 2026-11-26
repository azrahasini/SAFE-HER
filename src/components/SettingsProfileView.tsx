import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  HelpCircle,
  KeyRound,
  LogOut,
  Phone,
  Plus,
  Send,
  Shield,
  Smartphone,
  Star,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { LANGUAGE_LABELS } from '../lib/i18n.ts';
import type {
  SupportedLanguage,
  SupportTicket,
  ThemeMode,
  TrustedContact,
  UserPublic,
  UserSettings,
} from '../types/safeher.ts';

interface SettingsProfileViewProps {
  user: UserPublic;
  onUserChange: (u: UserPublic) => void;
  contacts: TrustedContact[];
  onContactsChange: (c: TrustedContact[]) => void;
  evidenceBytes: number;
  onEvidenceCleared: () => void;
  onLogout: () => void;
  onAccountDeleted: () => void;
}

const MEMBER_AVATAR_SRC = '/src/assets/images/avatar_member_portrait_1795709451777.jpg';

export function SettingsProfileView({
  user,
  onUserChange,
  contacts,
  onContactsChange,
  evidenceBytes,
  onEvidenceCleared,
  onLogout,
  onAccountDeleted,
}: SettingsProfileViewProps) {
  const [sectionGroup, setSectionGroup] = useState<'contacts' | 'general' | 'safeher'>('contacts');
  const [avatarError, setAvatarError] = useState(false);

  // Profile & Phone Verification
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone);
  const [emergencyMsg, setEmergencyMsg] = useState(user.emergencyMessage);
  const [phoneCodeSent, setPhoneCodeSent] = useState<string | null>(null);
  const [phoneCodeInput, setPhoneCodeInput] = useState('');

  // Password Change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Contacts Form
  const [cName, setCName] = useState('');
  const [cRel, setCRel] = useState('Family');
  const [cPhone, setCPhone] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cPrimary, setCPrimary] = useState(contacts.length === 0);

  // Permissions & Sessions
  const [permState, setPermState] = useState<Record<string, string>>({});
  const [sessions, setSessions] = useState<
    Array<{ id: string; deviceLabel: string; createdAt: string; isCurrent: boolean }>
  >([]);

  // Support Tickets
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [tktSubject, setTktSubject] = useState('');
  const [tktMessage, setTktMessage] = useState('');

  // Delete confirmation
  const [confirmDeleteAcct, setConfirmDeleteAcct] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Query browser permissions status safely
    if (navigator.permissions) {
      Promise.allSettled([
        navigator.permissions.query({ name: 'geolocation' as PermissionName }),
        navigator.permissions.query({ name: 'camera' as PermissionName }),
        navigator.permissions.query({ name: 'microphone' as PermissionName }),
      ]).then((results) => {
        const names = ['Location', 'Camera', 'Microphone'];
        const next: Record<string, string> = {};
        results.forEach((r, idx) => {
          next[names[idx]] = r.status === 'fulfilled' ? r.value.state : 'prompt';
        });
        setPermState(next);
      });
    }

    apiFetch<{ sessions: typeof sessions }>('/api/account/sessions')
      .then((res) => setSessions(res.sessions))
      .catch(() => {});
    apiFetch<{ tickets: SupportTicket[] }>('/api/support/tickets')
      .then((res) => setTickets(res.tickets))
      .catch(() => {});
  }, []);

  const saveSettings = async (patch: Partial<UserSettings>) => {
    setError(null);
    const merged: UserSettings = {
      ...user.settings,
      ...patch,
      accessibility: { ...user.settings.accessibility, ...(patch.accessibility || {}) },
      notifications: { ...user.settings.notifications, ...(patch.notifications || {}) },
      sos: { ...user.settings.sos, ...(patch.sos || {}) },
      aiAgent: { ...user.settings.aiAgent, ...(patch.aiAgent || {}) },
      media: { ...user.settings.media, ...(patch.media || {}) },
      location: { ...user.settings.location, ...(patch.location || {}) },
      journey: { ...user.settings.journey, ...(patch.journey || {}) },
      community: { ...user.settings.community, ...(patch.community || {}) },
    };
    try {
      const res = await apiFetch<{ user: UserPublic }>('/api/account/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: merged }),
      });
      onUserChange(res.user);
      setNotice('Settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ user: UserPublic }>('/api/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name, email, phone, emergencyMessage: emergencyMsg }),
      });
      onUserChange(res.user);
      setNotice('Profile updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile.');
    }
  };

  const handleRequestPhoneCode = async () => {
    setError(null);
    try {
      const res = await apiFetch<{ previewVerificationCode: string }>(
        '/api/auth/phone/request-code',
        {
          method: 'POST',
          body: JSON.stringify({ phone }),
        }
      );
      setPhoneCodeSent(res.previewVerificationCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to issue code.');
    }
  };

  const handleVerifyPhone = async () => {
    setError(null);
    try {
      const res = await apiFetch<{ user: UserPublic }>('/api/auth/phone/verify-code', {
        method: 'POST',
        body: JSON.stringify({ code: phoneCodeInput }),
      });
      onUserChange(res.user);
      setPhoneCodeSent(null);
      setPhoneCodeInput('');
      setNotice('Phone number verified.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/account/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setNotice('Password changed successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed.');
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ contact: TrustedContact }>('/api/contacts', {
        method: 'POST',
        body: JSON.stringify({
          name: cName,
          relationship: cRel,
          phone: cPhone,
          email: cEmail,
          isPrimary: cPrimary,
        }),
      });
      const updated = cPrimary
        ? [res.contact, ...contacts.map((c) => ({ ...c, isPrimary: false }))]
        : [...contacts, res.contact];
      onContactsChange(updated);
      setCName('');
      setCPhone('');
      setCEmail('');
      setCPrimary(false);
      setNotice('Trusted contact added.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add contact.');
    }
  };

  const handleTestContact = async (id: string) => {
    try {
      const res = await apiFetch<{ contact: TrustedContact; deliveryNote: string }>(
        `/api/contacts/${id}/test`,
        { method: 'POST' }
      );
      onContactsChange(contacts.map((c) => (c.id === id ? res.contact : c)));
      setNotice(res.deliveryNote);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test alert failed.');
    }
  };

  const handleSetPrimary = async (id: string) => {
    const res = await apiFetch<{ contact: TrustedContact }>(`/api/contacts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isPrimary: true }),
    });
    onContactsChange(
      contacts.map((c) => ({ ...c, isPrimary: c.id === res.contact.id }))
    );
  };

  const handleDeleteContact = async (id: string) => {
    await apiFetch(`/api/contacts/${id}`, { method: 'DELETE' });
    onContactsChange(contacts.filter((c) => c.id !== id));
  };

  const handleExportPersonalData = async () => {
    const data = await apiFetch<Record<string, unknown>>('/api/account/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'safeher-personal-data.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const handleClearRecordings = async () => {
    await apiFetch('/api/evidence', { method: 'DELETE' });
    onEvidenceCleared();
    setNotice('All stored recordings deleted from SAFEHER Vault.');
  };

  const handleDeleteAccount = async () => {
    await apiFetch('/api/account', { method: 'DELETE' });
    onAccountDeleted();
  };

  const handleSupportTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch<{ ticket: SupportTicket }>('/api/support/tickets', {
      method: 'POST',
      body: JSON.stringify({ subject: tktSubject, message: tktMessage }),
    });
    setTickets([res.ticket, ...tickets]);
    setTktSubject('');
    setTktMessage('');
    setNotice('Support ticket submitted.');
  };

  const ToggleRow = ({
    label,
    desc,
    checked,
    onChange,
  }: {
    label: string;
    desc?: string;
    checked: boolean;
    onChange: (val: boolean) => void;
  }) => (
    <label className="flex items-center justify-between gap-4 py-2.5 cursor-pointer">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {desc && <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">{desc}</p>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-5 h-5 accent-purple-700 rounded cursor-pointer shrink-0"
      />
    </label>
  );

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {!avatarError ? (
            <img
              src={MEMBER_AVATAR_SRC}
              alt={user.name}
              referrerPolicy="no-referrer"
              onError={() => setAvatarError(true)}
              className="w-16 h-16 rounded-2xl object-cover border border-purple-200 dark:border-purple-800"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-purple-700 text-white flex items-center justify-center font-display font-bold text-xl">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="font-display text-xl font-bold">{user.name}</h2>
            <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
              {user.email} · {user.phone || 'No phone set'}{' '}
              {user.phoneVerified ? '(Verified)' : ''}
            </p>
            <p className="text-xs text-purple-700 dark:text-purple-300 mt-1 font-mono-tabular">
              {contacts.length} Trusted Contacts · {user.activeSessionsCount} Active Session(s)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-[#231B36] text-xs font-semibold flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </section>

      {/* Section Switcher */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'contacts', label: 'Trusted Emergency Contacts', icon: Users },
            { id: 'general', label: 'A. General Settings', icon: Smartphone },
            { id: 'safeher', label: 'B. SAFEHER Settings', icon: Shield },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSectionGroup(tab.id)}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors ${
                sectionGroup === tab.id
                  ? 'bg-purple-700 text-white'
                  : 'bg-white dark:bg-[#161122] border border-purple-200/80 dark:border-purple-900/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {notice && (
        <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 text-xs text-purple-900 dark:text-purple-100">
          {notice}
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {/* TRUSTED CONTACTS */}
      {sectionGroup === 'contacts' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-5 bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-4 h-fit">
            <h3 className="font-display text-lg font-bold flex items-center gap-2">
              <Plus className="w-4 h-4 text-purple-700 dark:text-purple-300" />
              <span>Add Trusted Contact</span>
            </h3>
            <form onSubmit={handleAddContact} className="space-y-3">
              <input
                type="text"
                required
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder="Full Name (e.g., Priya Lin)"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm"
              />
              <input
                type="text"
                value={cRel}
                onChange={(e) => setCRel(e.target.value)}
                placeholder="Relationship (Parent, Sister, Friend...)"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm"
              />
              <input
                type="tel"
                required
                value={cPhone}
                onChange={(e) => setCPhone(e.target.value)}
                placeholder="Phone Number"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm"
              />
              <input
                type="email"
                value={cEmail}
                onChange={(e) => setCEmail(e.target.value)}
                placeholder="Email (optional)"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm"
              />
              <ToggleRow
                label="Set as Primary Emergency Contact"
                checked={cPrimary}
                onChange={setCPrimary}
              />
              <button
                type="submit"
                className="w-full min-h-[44px] rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold"
              >
                Save Trusted Contact
              </button>
            </form>
          </section>

          <section className="lg:col-span-7 space-y-3">
            {contacts.length === 0 ? (
              <div className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-8 text-center text-sm text-[#574C70] dark:text-[#B9AED2]">
                Add family members or trusted friends to enable One-Tap SOS alerts and live
                location sharing.
              </div>
            ) : (
              contacts.map((c) => (
                <article
                  key={c.id}
                  className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm flex items-center gap-2">
                        <span>{c.name}</span>
                        {c.isPrimary && (
                          <span className="text-xs font-medium text-purple-700 dark:text-purple-300 inline-flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 fill-current" /> Primary
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-[#574C70] dark:text-[#B9AED2] font-mono-tabular">
                        {c.relationship} · {c.phone} {c.email ? `· ${c.email}` : ''}
                      </p>
                      <p className="text-[11px] text-[#6E6288] dark:text-[#9F93BC] mt-1">
                        Test Status:{' '}
                        {c.lastTestStatus === 'confirmed_delivered'
                          ? `Verified (${new Date(c.lastTestedAt!).toLocaleDateString()})`
                          : 'Not yet tested'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`tel:${c.phone}`}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-purple-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => void handleTestContact(c.id)}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-800 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Test Alert</span>
                      </button>
                      {!c.isPrimary && (
                        <button
                          type="button"
                          onClick={() => void handleSetPrimary(c.id)}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-800 text-xs font-semibold"
                        >
                          Make Primary
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleDeleteContact(c.id)}
                        aria-label="Remove contact"
                        className="min-h-[36px] min-w-[36px] rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </section>
        </div>
      )}

      {/* A. GENERAL SETTINGS */}
      {sectionGroup === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 1. Account Settings */}
          <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-4">
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-purple-700 dark:text-purple-300" />
              <span>1. Account & Phone Verification</span>
            </h3>
            <form onSubmit={handleSaveProfile} className="space-y-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full Name"
                className="w-full min-h-[42px] px-3.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full min-h-[42px] px-3.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm"
              />
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone Number"
                  className="flex-1 min-h-[42px] px-3.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm"
                />
                {!user.phoneVerified && phone && (
                  <button
                    type="button"
                    onClick={() => void handleRequestPhoneCode()}
                    className="min-h-[42px] px-3 rounded-xl bg-purple-100 dark:bg-[#231B36] text-xs font-semibold"
                  >
                    Verify Phone
                  </button>
                )}
              </div>
              {phoneCodeSent && (
                <div className="p-3 rounded-xl bg-purple-50 dark:bg-[#221A34] space-y-2 text-xs">
                  <p>
                    Preview Verification Code:{' '}
                    <span className="font-mono-tabular font-bold">{phoneCodeSent}</span>
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={phoneCodeInput}
                      onChange={(e) => setPhoneCodeInput(e.target.value)}
                      placeholder="Enter 6-digit code"
                      className="flex-1 min-h-[38px] px-3 rounded-lg border border-purple-200 dark:border-purple-800 bg-white dark:bg-[#161122]"
                    />
                    <button
                      type="button"
                      onClick={() => void handleVerifyPhone()}
                      className="px-3 rounded-lg bg-purple-700 text-white font-semibold"
                    >
                      Verify
                    </button>
                  </div>
                </div>
              )}
              <button
                type="submit"
                className="min-h-[42px] px-4 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold"
              >
                Save Account Profile
              </button>
            </form>

            <form
              onSubmit={handleChangePassword}
              className="pt-4 border-t border-purple-100 dark:border-purple-900/50 space-y-2.5"
            >
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" /> Change Password
              </p>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current Password"
                className="w-full min-h-[40px] px-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-xs"
              />
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New Password (min 8 chars)"
                className="w-full min-h-[40px] px-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-xs"
              />
              <button
                type="submit"
                className="min-h-[38px] px-4 rounded-xl border border-purple-300 dark:border-purple-700 text-xs font-semibold"
              >
                Update Password
              </button>
            </form>
          </section>

          {/* 2, 3, 4, 5: Appearance, Notifications, Language, Accessibility */}
          <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-5">
            <div>
              <h3 className="font-display font-bold text-base mb-2">2. Appearance</h3>
              <div className="grid grid-cols-3 gap-2">
                {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => void saveSettings({ appearance: mode })}
                    className={`min-h-[42px] px-3 rounded-xl text-xs font-semibold capitalize border transition-colors ${
                      user.settings.appearance === mode
                        ? 'bg-purple-700 text-white border-purple-700'
                        : 'border-purple-200 dark:border-purple-800'
                    }`}
                  >
                    {mode === 'system' ? 'System Default' : `${mode} Mode`}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-purple-100 dark:border-purple-900/50">
              <h3 className="font-display font-bold text-base mb-1">3. Notifications</h3>
              <ToggleRow
                label="Push Notifications"
                checked={user.settings.notifications.push}
                onChange={(v) =>
                  void saveSettings({ notifications: { ...user.settings.notifications, push: v } })
                }
              />
              <ToggleRow
                label="Alert Sound & Vibration"
                checked={user.settings.notifications.sound}
                onChange={(v) =>
                  void saveSettings({
                    notifications: {
                      ...user.settings.notifications,
                      sound: v,
                      vibration: v,
                    },
                  })
                }
              />
              <ToggleRow
                label="Journey Reminders"
                checked={user.settings.notifications.journeyReminders}
                onChange={(v) =>
                  void saveSettings({
                    notifications: { ...user.settings.notifications, journeyReminders: v },
                  })
                }
              />
            </div>

            <div className="pt-3 border-t border-purple-100 dark:border-purple-900/50 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <h3 className="font-display font-bold text-sm mb-1.5">4. Language</h3>
                <select
                  value={user.settings.language}
                  onChange={(e) =>
                    void saveSettings({ language: e.target.value as SupportedLanguage })
                  }
                  className="w-full min-h-[42px] px-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-xs"
                >
                  {(Object.keys(LANGUAGE_LABELS) as SupportedLanguage[]).map((code) => (
                    <option key={code} value={code}>
                      {LANGUAGE_LABELS[code]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <h3 className="font-display font-bold text-sm mb-1.5">5. Text Size</h3>
                <select
                  value={user.settings.accessibility.textSize}
                  onChange={(e) =>
                    void saveSettings({
                      accessibility: {
                        ...user.settings.accessibility,
                        textSize: e.target.value as 'standard' | 'large' | 'xl',
                      },
                    })
                  }
                  className="w-full min-h-[42px] px-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-xs"
                >
                  <option value="standard">Standard</option>
                  <option value="large">Large</option>
                  <option value="xl">Extra Large</option>
                </select>
              </div>
            </div>

            <ToggleRow
              label="High Contrast Mode & Screen Reader Labels"
              checked={user.settings.accessibility.highContrast}
              onChange={(v) =>
                void saveSettings({
                  accessibility: {
                    ...user.settings.accessibility,
                    highContrast: v,
                    screenReaderLabels: true,
                  },
                })
              }
            />
          </section>

          {/* 6. Privacy & Security */}
          <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-4">
            <h3 className="font-display font-bold text-base">6. Privacy & Security</h3>
            <div className="space-y-1.5 text-xs">
              <p className="font-semibold">Device Permissions Status</p>
              {Object.entries(permState).map(([k, v]) => (
                <div key={k} className="flex justify-between py-1 border-b border-purple-100 dark:border-purple-900/40">
                  <span>{k} Access</span>
                  <span className="font-mono-tabular capitalize">{v}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Active Sessions ({sessions.length})</p>
                <button
                  type="button"
                  onClick={() =>
                    void apiFetch('/api/auth/logout-all', { method: 'POST' }).then(() =>
                      setNotice('Signed out of all other sessions.')
                    )
                  }
                  className="text-purple-700 dark:text-purple-300 font-semibold hover:underline"
                >
                  Revoke Other Sessions
                </button>
              </div>
              {sessions.slice(0, 4).map((s) => (
                <div key={s.id} className="text-[#574C70] dark:text-[#B9AED2] font-mono-tabular">
                  {s.deviceLabel} {s.isCurrent ? '(Current)' : ''}
                </div>
              ))}
            </div>
          </section>

          {/* 7. Help & Support */}
          <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-4">
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-purple-700 dark:text-purple-300" />
              <span>7. Help, FAQ & Contact Support</span>
            </h3>
            <div className="text-xs text-[#574C70] dark:text-[#B9AED2] space-y-1.5">
              <p>
                <strong>Does SOS Test Mode alert contacts?</strong> No. Test Mode logs drills
                privately without notifying trusted contacts.
              </p>
              <p>
                <strong>Can admins view my recordings?</strong> No. Private recordings and GPS
                locations are protected and inaccessible by default.
              </p>
            </div>
            <form onSubmit={handleSupportTicket} className="space-y-2.5 pt-2">
              <input
                type="text"
                required
                value={tktSubject}
                onChange={(e) => setTktSubject(e.target.value)}
                placeholder="Support subject or problem summary"
                className="w-full min-h-[40px] px-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-xs"
              />
              <textarea
                rows={2}
                required
                value={tktMessage}
                onChange={(e) => setTktMessage(e.target.value)}
                placeholder="Describe your question or issue..."
                className="w-full px-3 py-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-xs"
              />
              <button
                type="submit"
                className="min-h-[40px] px-4 rounded-xl bg-purple-700 text-white text-xs font-semibold"
              >
                Contact SAFEHER Support
              </button>
            </form>
            {tickets.length > 0 && (
              <div className="pt-2 space-y-1.5 text-xs">
                {tickets.map((t) => (
                  <div key={t.id} className="p-2.5 rounded-xl bg-[#FAF8FF] dark:bg-[#1E172E]">
                    <p className="font-semibold">
                      {t.subject} · {t.status}
                    </p>
                    {t.reply && <p className="text-purple-700 dark:text-purple-300">Reply: {t.reply}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* B. SAFEHER-SPECIFIC SETTINGS */}
      {sectionGroup === 'safeher' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-4">
            <h3 className="font-display font-bold text-base">1. SOS & Alert Preferences</h3>
            <ToggleRow
              label="SOS Test Mode (Practice Without Real Alerts)"
              checked={user.settings.sos.testMode}
              onChange={(v) => void saveSettings({ sos: { ...user.settings.sos, testMode: v } })}
            />
            <ToggleRow
              label="Silent SOS Mode (Discreet, No Audible Siren)"
              checked={user.settings.sos.silentMode}
              onChange={(v) => void saveSettings({ sos: { ...user.settings.sos, silentMode: v } })}
            />
            <ToggleRow
              label="Auto-Record Audio Upon Authorized SOS"
              checked={user.settings.sos.autoRecordAudio}
              onChange={(v) =>
                void saveSettings({ sos: { ...user.settings.sos, autoRecordAudio: v } })
              }
            />
            <ToggleRow
              label="Enable Silent Gesture SOS (3-Tap Pad)"
              checked={user.settings.sos.gestureTrigger}
              onChange={(v) =>
                void saveSettings({ sos: { ...user.settings.sos, gestureTrigger: v } })
              }
            />
            <div className="pt-2">
              <label className="block text-xs font-semibold mb-1">Custom Emergency Message</label>
              <textarea
                rows={2}
                value={emergencyMsg}
                onChange={(e) => setEmergencyMsg(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-xs"
              />
              <button
                type="button"
                onClick={handleSaveProfile}
                className="mt-2 min-h-[38px] px-4 rounded-xl bg-purple-700 text-white text-xs font-semibold"
              >
                Save SOS Message
              </button>
            </div>
          </section>

          <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-4">
            <h3 className="font-display font-bold text-base">
              2 & 3. AI Safety Agent & Audio/Video Vault
            </h3>
            <ToggleRow
              label="Enable Voice Input on Lock Screen & Home"
              checked={user.settings.aiAgent.voiceInput}
              onChange={(v) =>
                void saveSettings({ aiAgent: { ...user.settings.aiAgent, voiceInput: v } })
              }
            />
            <ToggleRow
              label="Maintain Shared AI Chat History"
              checked={user.settings.aiAgent.saveHistory}
              onChange={(v) =>
                void saveSettings({ aiAgent: { ...user.settings.aiAgent, saveHistory: v } })
              }
            />
            <ToggleRow
              label="Automatic Dual-Save to Phone/Device Gallery"
              desc="Exports completed recordings to device downloads alongside SAFEHER Vault"
              checked={user.settings.media.autoSaveGallery}
              onChange={(v) =>
                void saveSettings({ media: { ...user.settings.media, autoSaveGallery: v } })
              }
            />
            <div className="flex items-center justify-between pt-2 text-xs">
              <span>Recording Retention Policy</span>
              <select
                value={user.settings.media.retentionDays}
                onChange={(e) =>
                  void saveSettings({
                    media: { ...user.settings.media, retentionDays: Number(e.target.value) },
                  })
                }
                className="min-h-[38px] px-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E]"
              >
                <option value={30}>30 Days</option>
                <option value={90}>90 Days</option>
                <option value={365}>1 Year</option>
              </select>
            </div>
          </section>

          <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-3">
            <h3 className="font-display font-bold text-base">
              4, 5, 6 & 7. Location, Journey & Community
            </h3>
            <ToggleRow
              label="Live Location Sharing During Emergencies"
              checked={user.settings.location.liveSharing}
              onChange={(v) =>
                void saveSettings({ location: { ...user.settings.location, liveSharing: v } })
              }
            />
            <ToggleRow
              label="Journey Guardian Arrival Notifications"
              checked={user.settings.journey.arrivalNotifications}
              onChange={(v) =>
                void saveSettings({
                  journey: { ...user.settings.journey, arrivalNotifications: v },
                })
              }
            />
            <ToggleRow
              label="Show Community Safety Reports on Map"
              checked={user.settings.community.showReports}
              onChange={(v) =>
                void saveSettings({ community: { ...user.settings.community, showReports: v } })
              }
            />
          </section>

          <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-4">
            <h3 className="font-display font-bold text-base">8. Data Management</h3>
            <p className="text-xs text-[#574C70] dark:text-[#B9AED2] font-mono-tabular">
              Evidence Vault Storage Used: {(evidenceBytes / (1024 * 1024)).toFixed(2)} MB
            </p>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => void handleExportPersonalData()}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-purple-200 dark:border-purple-800 text-xs font-semibold flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Export Personal Data (JSON)</span>
              </button>
              <button
                type="button"
                onClick={() => void handleClearRecordings()}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs font-semibold"
              >
                Delete All Recordings
              </button>
            </div>

            <div className="pt-3 border-t border-purple-100 dark:border-purple-900/50">
              {!confirmDeleteAcct ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteAcct(true)}
                  className="text-xs font-semibold text-red-600 hover:underline"
                >
                  Delete SAFEHER Account Permanently
                </button>
              ) : (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 space-y-2 text-xs">
                  <p>This permanently deletes your profile, contacts, chats, and recordings.</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDeleteAccount()}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold"
                    >
                      Confirm Account Deletion
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAcct(false)}
                      className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
