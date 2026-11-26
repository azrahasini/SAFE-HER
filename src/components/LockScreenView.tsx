import React, { useEffect, useState } from 'react';
import {
  Bot,
  MessageSquare,
  Mic,
  PhoneCall,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  X,
} from 'lucide-react';
import { AiSafetyAgentPanel } from './AiSafetyAgentPanel.tsx';
import { EMBLEM_SRC } from './WelcomeAuthScreen.tsx';
import type {
  ChatMessageRecord,
  SosSession,
  TrustedContact,
  UserPublic,
} from '../types/safeher.ts';

interface LockScreenViewProps {
  user: UserPublic;
  primaryContact: TrustedContact | null;
  activeSos: SosSession | null;
  chatMessages: ChatMessageRecord[];
  onChatMessagesChange: (messages: ChatMessageRecord[]) => void;
  onTriggerSos: (via: 'lock_screen') => void;
  onStopSos: (id: string) => void;
  onNotifyTrustedContacts: () => void;
  onUnlock: () => void;
  hasLocation: boolean;
  locationLabel?: string;
}

export function LockScreenView({
  user,
  primaryContact,
  activeSos,
  chatMessages,
  onChatMessagesChange,
  onTriggerSos,
  onStopSos,
  onNotifyTrustedContacts,
  onUnlock,
  hasLocation,
  locationLabel,
}: LockScreenViewProps) {
  const [now, setNow] = useState(() => new Date());
  const [agentOpen, setAgentOpen] = useState(false);
  const [autoStartVoice, setAutoStartVoice] = useState(false);
  const [emblemError, setEmblemError] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateString = now.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const safetyStatus = activeSos
    ? activeSos.testMode
      ? 'SOS Test Mode Active · No real alerts sent'
      : 'Emergency SOS Active · Sharing enabled'
    : user.settings.sos.testMode
      ? 'Protected (SOS Test Mode Enabled)'
      : 'Protected · Ready for instant response';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#170F29] via-[#120C1F] to-[#0B0714] text-white flex flex-col justify-between p-5 sm:p-8">
      {/* Top Status & Unlock */}
      <header className="max-w-3xl w-full mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {!emblemError ? (
            <img
              src={EMBLEM_SRC}
              alt="SAFEHER"
              referrerPolicy="no-referrer"
              onError={() => setEmblemError(true)}
              className="w-9 h-9 rounded-xl object-cover border border-purple-400/30"
            />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-purple-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
          )}
          <div>
            <p className="font-display font-bold text-sm tracking-wide">SAFEHER Lock Screen</p>
            <p className="text-xs text-purple-200/80">{safetyStatus}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onUnlock}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          <Unlock className="w-4 h-4" />
          <span>Unlock App</span>
        </button>
      </header>

      {/* Center Clock + AI Safety Agent Entry */}
      <main className="max-w-xl w-full mx-auto my-8 space-y-7 text-center">
        <div>
          <p className="font-mono-tabular text-5xl sm:text-6xl font-bold tracking-tight text-white">
            {timeString}
          </p>
          <p className="text-sm text-purple-200/80 mt-2">{dateString}</p>
        </div>

        {/* AI Safety Agent Lock Screen Card */}
        <section className="rounded-3xl bg-white/10 backdrop-blur-md border border-purple-300/20 p-6 text-left space-y-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-purple-600/80 border border-purple-300/30 flex items-center justify-center shrink-0">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold">AI Safety Agent</h1>
              <p className="text-xs text-purple-100/80">
                Immediate situation-based escape guidance with shared conversation history.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setAutoStartVoice(false);
                setAgentOpen(true);
              }}
              className="min-h-[48px] px-4 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              <span>AI Chat</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAutoStartVoice(true);
                setAgentOpen(true);
              }}
              className="min-h-[48px] px-4 py-3 rounded-2xl bg-pink-600/90 hover:bg-pink-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <Mic className="w-4 h-4" />
              <span>Voice Input</span>
            </button>
          </div>
        </section>

        {/* Primary Emergency SOS + Quick Emergency Contact */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {!activeSos ? (
            <button
              type="button"
              onClick={() => onTriggerSos('lock_screen')}
              className="min-h-[72px] px-6 py-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-display font-bold text-base flex items-center justify-center gap-3 shadow-lg shadow-red-900/40 transition-colors"
            >
              <ShieldAlert className="w-6 h-6" />
              <span>
                {user.settings.sos.testMode ? 'Trigger Test SOS' : 'Emergency SOS'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStopSos(activeSos.id)}
              className="min-h-[72px] px-6 py-4 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-display font-bold text-base flex items-center justify-center gap-3 transition-colors"
            >
              <ShieldAlert className="w-6 h-6" />
              <span>Stop Active SOS</span>
            </button>
          )}

          {primaryContact ? (
            <a
              href={`tel:${primaryContact.phone}`}
              className="min-h-[72px] px-5 py-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-sm flex items-center justify-center gap-3 transition-colors"
            >
              <PhoneCall className="w-5 h-5 text-pink-300 shrink-0" />
              <div className="text-left">
                <p className="text-xs text-purple-200/80">Quick Contact</p>
                <p className="truncate max-w-[170px]">{primaryContact.name}</p>
              </div>
            </a>
          ) : (
            <a
              href="tel:911"
              className="min-h-[72px] px-5 py-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-sm flex items-center justify-center gap-3 transition-colors"
            >
              <PhoneCall className="w-5 h-5 text-pink-300 shrink-0" />
              <div className="text-left">
                <p className="text-xs text-purple-200/80">Emergency Helpline</p>
                <p>Call 911 / 112</p>
              </div>
            </a>
          )}
        </div>
      </main>

      {/* Footer Note on Native Lock Screen Integration */}
      <footer className="max-w-xl w-full mx-auto text-center text-xs text-purple-200/60 leading-relaxed">
        In-app SAFEHER Lock Screen mode. Native OS hardware lock-screen widgets use official
        Android/iOS Lock Screen extensions without bypassing device passcodes.
      </footer>

      {/* Shared AI Safety Agent Modal from Lock Screen */}
      {agentOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-2xl h-[88vh] sm:h-[82vh] bg-[#FAF8FF] dark:bg-[#130E1F] text-[#1A132B] dark:text-[#F4EFFC] rounded-t-3xl sm:rounded-3xl border border-purple-300/30 flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-purple-200 dark:border-purple-900/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Bot className="w-5 h-5 text-purple-700 dark:text-purple-300" />
                <span className="font-display font-bold text-sm">
                  AI Safety Agent · Lock Screen Access
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAgentOpen(false)}
                aria-label="Close AI Safety Agent"
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center hover:bg-purple-100 dark:hover:bg-purple-900/40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <AiSafetyAgentPanel
                entryPoint="lockscreen"
                user={user}
                messages={chatMessages}
                onMessagesChange={onChatMessagesChange}
                activeSos={activeSos}
                onTriggerSos={() => onTriggerSos('lock_screen')}
                onNotifyContacts={onNotifyTrustedContacts}
                hasLocation={hasLocation}
                locationLabel={locationLabel}
                autoStartVoice={autoStartVoice}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
