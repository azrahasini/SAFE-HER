import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Compass,
  Mic,
  MicOff,
  PhoneCall,
  Send,
  ShieldAlert,
  Trash2,
  Users,
  VolumeX,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import type { ChatMessageRecord, SosSession, UserPublic } from '../types/safeher.ts';

interface AiSafetyAgentPanelProps {
  entryPoint: 'lockscreen' | 'home' | 'ai_tab';
  user: UserPublic;
  messages: ChatMessageRecord[];
  onMessagesChange: (messages: ChatMessageRecord[]) => void;
  activeSos: SosSession | null;
  onTriggerSos: (via: 'ai_agent') => void;
  onNotifyContacts: () => void;
  hasLocation: boolean;
  locationLabel?: string;
  autoStartVoice?: boolean;
}

const QUICK_SITUATIONS = [
  'Someone is following me',
  'I feel unsafe while travelling',
  'I am lost',
  'I cannot speak freely',
  'Immediate danger — help now',
];

export function AiSafetyAgentPanel({
  entryPoint,
  user,
  messages,
  onMessagesChange,
  activeSos,
  onTriggerSos,
  onNotifyContacts,
  hasLocation,
  locationLabel,
  autoStartVoice = false,
}: AiSafetyAgentPanelProps) {
  const [input, setInput] = useState('');
  const [silentMode, setSilentMode] = useState(user.settings.sos.silentMode);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    if (autoStartVoice && user.settings.aiAgent.voiceInput) {
      startVoiceInput();
    }
    return () => {
      recognitionRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartVoice]);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || sending) return;

    setError(null);
    setSending(true);
    setInput('');

    try {
      const res = await apiFetch<{
        userMessage: ChatMessageRecord;
        assistantMessage: ChatMessageRecord;
      }>('/api/ai/safety-chat', {
        method: 'POST',
        body: JSON.stringify({
          message: trimmed,
          entryPoint,
          hasLocation,
          locationLabel,
          silentMode,
        }),
      });
      onMessagesChange([...messages, res.userMessage, res.assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach AI Safety Agent.');
    } finally {
      setSending(false);
    }
  };

  const startVoiceInput = () => {
    setVoiceNote(null);
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setVoiceNote(
        'Browser live speech recognition is unavailable here. Type or dictate via your device keyboard microphone.'
      );
      return;
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const rec = new SpeechRec() as {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: (ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onerror: () => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    };
    rec.lang =
      user.settings.aiAgent.preferredLanguage === 'ta'
        ? 'ta-IN'
        : user.settings.aiAgent.preferredLanguage === 'hi'
          ? 'hi-IN'
          : user.settings.aiAgent.preferredLanguage === 'es'
            ? 'es-ES'
            : user.settings.aiAgent.preferredLanguage === 'fr'
              ? 'fr-FR'
              : 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    rec.onerror = () => {
      setListening(false);
      setVoiceNote('Microphone voice capture stopped or permission denied.');
    };
    rec.onend = () => {
      setListening(false);
    };

    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const clearHistory = async () => {
    try {
      await apiFetch('/api/ai/chat', { method: 'DELETE' });
      onMessagesChange([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear history.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 overflow-hidden">
      {/* Immediate Emergency Bar — Never wait for AI */}
      <div className="px-4 py-3 bg-purple-50 dark:bg-[#201833] border-b border-purple-200/80 dark:border-purple-900/60 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-[#4C4166] dark:text-[#C8BEE3]">
          <Bot className="w-4 h-4 text-purple-700 dark:text-purple-300 shrink-0" />
          <span>Shared history across Lock Screen & Home</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSilentMode((s) => !s)}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              silentMode
                ? 'bg-purple-700 text-white'
                : 'bg-white dark:bg-[#2A2042] text-purple-900 dark:text-purple-100 border border-purple-200 dark:border-purple-800'
            }`}
          >
            <VolumeX className="w-3.5 h-3.5" />
            <span>{silentMode ? 'Silent Mode On' : 'Discreet Mode'}</span>
          </button>

          {!activeSos && (
            <button
              type="button"
              onClick={() => onTriggerSos('ai_agent')}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Instant SOS</span>
            </button>
          )}

          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              aria-label="Clear AI chat history"
              className="min-h-[36px] min-w-[36px] rounded-lg border border-purple-200 dark:border-purple-800 flex items-center justify-center text-[#574C70] dark:text-[#B9AED2] hover:text-red-600"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Quick Situation Triggers */}
      <div className="px-4 py-2.5 border-b border-purple-100 dark:border-purple-900/50 flex items-center gap-2 overflow-x-auto">
        {QUICK_SITUATIONS.map((sit) => (
          <button
            key={sit}
            type="button"
            disabled={sending}
            onClick={() => sendMessage(sit)}
            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-purple-50 dark:bg-[#231B36] hover:bg-purple-100 dark:hover:bg-[#2E2447] border border-purple-200/80 dark:border-purple-800/70 text-xs font-medium text-purple-900 dark:text-purple-100 whitespace-nowrap shrink-0 transition-colors"
          >
            {sit}
          </button>
        ))}
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="max-w-lg mx-auto py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 flex items-center justify-center mx-auto">
              <Compass className="w-6 h-6" />
            </div>
            <h3 className="font-display font-bold text-base">
              Situation-Based Escape Plan Assistant
            </h3>
            <p className="text-sm text-[#574C70] dark:text-[#B9AED2] leading-relaxed">
              Describe what is happening or tap a quick situation above. Every response organizes
              immediate actions, an exit plan, nearby staffed help options, and trusted-contact
              shortcuts.
            </p>
            <p className="text-xs text-[#6E6288] dark:text-[#9F93BC]">
              Guidance is supportive and never guarantees safety or replaces 911 / emergency
              services.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[92%] sm:max-w-[82%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-purple-700 text-white'
                  : 'bg-[#F5F2FC] dark:bg-[#211933] border border-purple-200/70 dark:border-purple-800/60 text-[#1A132B] dark:text-[#F4EFFC]'
              }`}
            >
              <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>

              {msg.structuredPlan && (
                <div className="mt-4 pt-3 border-t border-purple-200/80 dark:border-purple-800/60 space-y-3 text-xs">
                  <div>
                    <p className="font-semibold text-purple-800 dark:text-purple-300">
                      1. Situation Understanding
                    </p>
                    <p className="mt-0.5 text-[#3A3152] dark:text-[#DDD4F3]">
                      {msg.structuredPlan.situationUnderstanding}
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-purple-800 dark:text-purple-300">
                      2. Immediate Safety Recommendations
                    </p>
                    <ul className="mt-1 list-disc list-inside space-y-1 text-[#3A3152] dark:text-[#DDD4F3]">
                      {msg.structuredPlan.immediateRecommendations.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-purple-800 dark:text-purple-300">
                      3. Situation-Based Escape Plan
                    </p>
                    <ol className="mt-1 list-decimal list-inside space-y-1 text-[#3A3152] dark:text-[#DDD4F3]">
                      {msg.structuredPlan.escapePlanSteps.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ol>
                  </div>

                  <div>
                    <p className="font-semibold text-purple-800 dark:text-purple-300">
                      4. Nearby Assistance Options
                    </p>
                    <ul className="mt-1 list-disc list-inside space-y-1 text-[#3A3152] dark:text-[#DDD4F3]">
                      {msg.structuredPlan.nearbyAssistanceOptions.map((opt, idx) => (
                        <li key={idx}>{opt}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/80 dark:bg-[#171126] border border-purple-200/70 dark:border-purple-800/60 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-purple-900 dark:text-purple-200">
                        5. Trusted Contact Action
                      </p>
                      <p className="text-[#4C4166] dark:text-[#C8BEE3]">
                        {msg.structuredPlan.trustedContactAction}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onNotifyContacts}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-semibold flex items-center gap-1.5"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Notify Contacts</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onTriggerSos('ai_agent')}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center gap-1.5"
                    >
                      <ShieldAlert className="w-4 h-4" />
                      <span>
                        6. {msg.structuredPlan.sosRecommended ? 'Activate SOS Now' : 'Emergency SOS'}
                      </span>
                    </button>
                    <a
                      href="tel:911"
                      className="min-h-[40px] px-3.5 py-2 rounded-xl border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 font-semibold flex items-center gap-1.5"
                    >
                      <PhoneCall className="w-4 h-4" />
                      <span>Call Emergency Services</span>
                    </a>
                  </div>
                </div>
              )}
            </div>
            <span className="mt-1 text-[11px] text-[#6E6288] dark:text-[#9F93BC] font-mono-tabular">
              {new Date(msg.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              · {msg.entryPoint === 'lockscreen' ? 'Lock Screen' : msg.entryPoint === 'home' ? 'Home' : 'AI Tab'}
            </span>
          </div>
        ))}

        {sending && (
          <div className="text-xs text-[#574C70] dark:text-[#B9AED2] px-2">
            Preparing structured safety guidance...
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {voiceNote && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs">
            {voiceNote}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="p-3 border-t border-purple-200/80 dark:border-purple-900/60 bg-[#FAF8FF] dark:bg-[#130E1F] flex items-center gap-2"
      >
        {user.settings.aiAgent.voiceInput && (
          <button
            type="button"
            onClick={startVoiceInput}
            aria-label={listening ? 'Stop voice input' : 'Start voice input'}
            className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center transition-colors shrink-0 ${
              listening
                ? 'bg-pink-600 text-white'
                : 'bg-purple-100 dark:bg-[#231B36] text-purple-800 dark:text-purple-200 hover:bg-purple-200'
            }`}
          >
            {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
        )}

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            silentMode
              ? 'Type discreetly — AI will give quiet text guidance...'
              : 'Describe your situation or ask for an escape plan...'
          }
          className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-white dark:bg-[#1E172E] text-sm focus:outline-none focus:ring-2 focus:ring-purple-600"
        />

        <button
          type="submit"
          disabled={sending || !input.trim()}
          aria-label="Send message"
          className="min-h-[44px] px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50 shrink-0"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>
    </div>
  );
}
