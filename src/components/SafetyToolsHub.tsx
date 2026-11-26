import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bluetooth,
  Bot,
  CheckCircle2,
  Clock,
  Compass,
  Hand,
  Languages,
  Lightbulb,
  Mic,
  Navigation,
  PhoneCall,
  ShieldAlert,
  Sparkles,
  ThumbsUp,
  Volume2,
  WifiOff,
} from 'lucide-react';
import { apiFetch, loadOfflineVault } from '../lib/api.ts';
import type {
  FeatureSuggestion,
  JourneySession,
  SosSession,
  TrustedContact,
  UserPublic,
} from '../types/safeher.ts';

export type ToolSectionId =
  | 'journey'
  | 'ai_features'
  | 'translator'
  | 'timeline'
  | 'offline_practice'
  | 'suggestions';

interface SafetyToolsHubProps {
  initialSection?: ToolSectionId;
  user: UserPublic;
  contacts: TrustedContact[];
  journeys: JourneySession[];
  onJourneysChange: (j: JourneySession[]) => void;
  sosHistory: SosSession[];
  suggestions: FeatureSuggestion[];
  onSuggestionsChange: (s: FeatureSuggestion[]) => void;
  onTriggerSos: (via: 'silent_gesture' | 'voice_distress' | 'home_button', testOverride?: boolean) => void;
  onOpenAiAgent: () => void;
}

const SAFETY_TIPS = [
  {
    title: 'Trust your instincts early',
    detail:
      'If a street or transit car feels uncomfortable, step into an open, staffed store, pharmacy, or transit booth immediately without waiting for proof.',
  },
  {
    title: 'Keep a charged power reserve & offline card',
    detail:
      'Cache emergency contact numbers in Offline Emergency Mode before entering subways or rural zones with weak reception.',
  },
  {
    title: 'Share trip ETA before boarding rideshares',
    detail:
      'Verify the license plate and driver name before entering, and start Journey Guardian so missed check-ins alert your primary contact.',
  },
];

export function SafetyToolsHub({
  initialSection = 'journey',
  user,
  contacts,
  journeys,
  onJourneysChange,
  sosHistory,
  suggestions,
  onSuggestionsChange,
  onTriggerSos,
  onOpenAiAgent,
}: SafetyToolsHubProps) {
  const [section, setSection] = useState<ToolSectionId>(initialSection);

  // Journey Guardian state
  const [destInput, setDestInput] = useState('');
  const [etaMin, setEtaMin] = useState(25);
  const [creatingJourney, setCreatingJourney] = useState(false);

  // AI Distress Voice Recognition
  const [distressTranscript, setDistressTranscript] = useState('');
  const [distressResult, setDistressResult] = useState<{
    distressDetected: boolean;
    confidenceLabel: string;
    detectedCues: string[];
    recommendedAction: string;
    shouldTriggerSosPrompt: boolean;
  } | null>(null);
  const [analyzingDistress, setAnalyzingDistress] = useState(false);

  // Predictive Safety Intelligence
  const [predMode, setPredMode] = useState('Walking');
  const [predArea, setPredArea] = useState('Downtown transit corridor');
  const [predResult, setPredResult] = useState<{
    riskContextLevel: string;
    summary: string;
    precautions: string[];
    recommendedCheckInMinutes: number;
  } | null>(null);
  const [loadingPred, setLoadingPred] = useState(false);

  // Silent Gesture SOS
  const [gestureTaps, setGestureTaps] = useState(0);
  const [gestureNotice, setGestureNotice] = useState<string | null>(null);

  // Multilingual Translator
  const [phraseInput, setPhraseInput] = useState('I need help. Please call the police and stay with me.');
  const [targetLang, setTargetLang] = useState('Tamil');
  const [translation, setTranslation] = useState<{
    translatedText: string;
    phoneticPronunciation: string;
    culturalNote: string;
  } | null>(null);
  const [translating, setTranslating] = useState(false);

  // Wearable Bluetooth
  const [wearableStatus, setWearableStatus] = useState<string>(
    'Not paired. Supports Web Bluetooth LE safety pendants or smartwatches in compatible browsers.'
  );

  // Emergency Practice Mode
  const [practiceStep, setPracticeStep] = useState<number | null>(null);

  // Suggestions & Feedback
  const [sugTitle, setSugTitle] = useState('');
  const [sugCategory, setSugCategory] = useState('AI Safety Agent');
  const [sugDesc, setSugDesc] = useState('');
  const [clusteringAi, setClusteringAi] = useState(false);
  const [fbRating, setFbRating] = useState(5);
  const [fbCategory, setFbCategory] = useState('General');
  const [fbMsg, setFbMsg] = useState('');
  const [toolError, setToolError] = useState<string | null>(null);
  const [toolNotice, setToolNotice] = useState<string | null>(null);

  const offlineSnapshot = loadOfflineVault();

  const handleStartJourney = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destInput.trim()) return;
    setCreatingJourney(true);
    setToolError(null);
    try {
      const res = await apiFetch<{ journey: JourneySession }>('/api/journeys', {
        method: 'POST',
        body: JSON.stringify({
          originLabel: 'Current Location',
          destinationLabel: destInput,
          etaMinutes: etaMin,
          sharedWithIds: contacts.filter((c) => c.shareLiveLocation).map((c) => c.id),
        }),
      });
      onJourneysChange([res.journey, ...journeys]);
      setDestInput('');
    } catch (err) {
      setToolError(err instanceof Error ? err.message : 'Failed to start journey.');
    } finally {
      setCreatingJourney(false);
    }
  };

  const handleCheckInJourney = async (id: string) => {
    const res = await apiFetch<{ journey: JourneySession }>(`/api/journeys/${id}/checkin`, {
      method: 'POST',
    });
    onJourneysChange(journeys.map((j) => (j.id === id ? res.journey : j)));
  };

  const handleArriveJourney = async (id: string) => {
    const res = await apiFetch<{ journey: JourneySession }>(`/api/journeys/${id}/arrive`, {
      method: 'POST',
    });
    onJourneysChange(journeys.map((j) => (j.id === id ? res.journey : j)));
  };

  const handleAnalyzeDistress = async () => {
    if (!distressTranscript.trim()) return;
    setAnalyzingDistress(true);
    setToolError(null);
    try {
      const res = await apiFetch<NonNullable<typeof distressResult>>('/api/ai/distress-analyze', {
        method: 'POST',
        body: JSON.stringify({ transcript: distressTranscript }),
      });
      setDistressResult(res);
    } catch (err) {
      setToolError(err instanceof Error ? err.message : 'Distress analysis failed.');
    } finally {
      setAnalyzingDistress(false);
    }
  };

  const handlePredictiveBrief = async () => {
    setLoadingPred(true);
    setToolError(null);
    try {
      const hour = new Date().getHours();
      const timeLabel = hour >= 20 || hour < 5 ? 'Late Night' : hour >= 17 ? 'Evening Dusk' : 'Daytime';
      const res = await apiFetch<NonNullable<typeof predResult>>('/api/ai/predictive-safety', {
        method: 'POST',
        body: JSON.stringify({
          timeOfDay: `${timeLabel} (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
          travelMode: predMode,
          areaContext: predArea,
        }),
      });
      setPredResult(res);
    } catch (err) {
      setToolError(err instanceof Error ? err.message : 'Predictive brief failed.');
    } finally {
      setLoadingPred(false);
    }
  };

  const handleSilentGestureTap = () => {
    const next = gestureTaps + 1;
    if (next >= 3) {
      setGestureTaps(0);
      setGestureNotice('Silent Gesture SOS triggered discreetly.');
      onTriggerSos('silent_gesture');
    } else {
      setGestureTaps(next);
      setGestureNotice(`Silent gesture count: ${next}/3 taps`);
    }
  };

  const handleTranslate = async () => {
    if (!phraseInput.trim()) return;
    setTranslating(true);
    setToolError(null);
    try {
      const res = await apiFetch<NonNullable<typeof translation>>('/api/ai/translate', {
        method: 'POST',
        body: JSON.stringify({ phrase: phraseInput, targetLanguage: targetLang }),
      });
      setTranslation(res);
    } catch (err) {
      setToolError(err instanceof Error ? err.message : 'Translation failed.');
    } finally {
      setTranslating(false);
    }
  };

  const handleSpeakTranslation = () => {
    if (!translation || typeof speechSynthesis === 'undefined') return;
    const utter = new SpeechSynthesisUtterance(translation.translatedText);
    speechSynthesis.speak(utter);
  };

  const handleConnectWearable = async () => {
    const nav = navigator as unknown as {
      bluetooth?: { requestDevice: (opts: { acceptAllDevices: boolean }) => Promise<{ name?: string }> };
    };
    if (!nav.bluetooth) {
      setWearableStatus(
        'Web Bluetooth is not supported in this browser. Use Android Chrome or native SAFEHER app for Bluetooth pendant pairing.'
      );
      return;
    }
    try {
      const device = await nav.bluetooth.requestDevice({ acceptAllDevices: true });
      setWearableStatus(`Paired with ${device.name || 'SAFEHER Bluetooth Wearable'}.`);
    } catch (err) {
      setWearableStatus(
        err instanceof Error ? `Pairing canceled: ${err.message}` : 'Pairing canceled.'
      );
    }
  };

  const handleSubmitSuggestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setToolError(null);
    setToolNotice(null);
    try {
      const res = await apiFetch<{ suggestion: FeatureSuggestion }>('/api/suggestions', {
        method: 'POST',
        body: JSON.stringify({ title: sugTitle, category: sugCategory, description: sugDesc }),
      });
      onSuggestionsChange([res.suggestion, ...suggestions]);
      setSugTitle('');
      setSugDesc('');
      setToolNotice('Suggestion submitted and queued for administrator review.');
    } catch (err) {
      setToolError(err instanceof Error ? err.message : 'Could not submit suggestion.');
    }
  };

  const handleUpvote = async (id: string) => {
    const res = await apiFetch<{ suggestion: FeatureSuggestion }>(`/api/suggestions/${id}/upvote`, {
      method: 'POST',
    });
    onSuggestionsChange(suggestions.map((s) => (s.id === id ? res.suggestion : s)));
  };

  const handleClusterSuggestions = async () => {
    setClusteringAi(true);
    setToolError(null);
    try {
      const res = await apiFetch<{ suggestions: FeatureSuggestion[] }>('/api/suggestions/ai-cluster', {
        method: 'POST',
      });
      onSuggestionsChange(res.suggestions);
      setToolNotice('AI Suggestion Analyzer grouped similar feature ideas into themes.');
    } catch (err) {
      setToolError(err instanceof Error ? err.message : 'AI clustering failed.');
    } finally {
      setClusteringAi(false);
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbMsg.trim()) return;
    try {
      await apiFetch('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({ rating: fbRating, category: fbCategory, message: fbMsg }),
      });
      setFbMsg('');
      setToolNotice('Thank you! Your feedback has been recorded.');
    } catch (err) {
      setToolError(err instanceof Error ? err.message : 'Could not submit feedback.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            { id: 'journey', label: 'Journey Guardian', icon: Navigation },
            { id: 'ai_features', label: 'AI Safety Suite', icon: Sparkles },
            { id: 'translator', label: 'Emergency Translator', icon: Languages },
            { id: 'timeline', label: 'Emergency Timeline', icon: Clock },
            { id: 'offline_practice', label: 'Offline & Practice', icon: WifiOff },
            { id: 'suggestions', label: 'Suggestions & Ideas', icon: Lightbulb },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSection(tab.id);
                setToolError(null);
                setToolNotice(null);
              }}
              className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
                section === tab.id
                  ? 'bg-purple-700 text-white'
                  : 'bg-white dark:bg-[#161122] border border-purple-200/80 dark:border-purple-900/60 text-[#4C4166] dark:text-[#C8BEE3]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {toolError && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-200">
          {toolError}
        </div>
      )}

      {toolNotice && (
        <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 text-xs text-purple-900 dark:text-purple-100">
          {toolNotice}
        </div>
      )}

      {/* 1. SMART JOURNEY GUARDIAN & WEARABLE */}
      {section === 'journey' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-7 bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-5">
            <div>
              <h2 className="font-display text-xl font-bold">Smart Journey Guardian</h2>
              <p className="text-xs text-[#574C70] dark:text-[#B9AED2] mt-1">
                Start a monitored trip with scheduled check-ins and automatic arrival alerts to
                trusted contacts.
              </p>
            </div>

            <form onSubmit={handleStartJourney} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-7">
                <label className="block text-xs font-semibold mb-1">Destination</label>
                <input
                  type="text"
                  required
                  value={destInput}
                  onChange={(e) => setDestInput(e.target.value)}
                  placeholder="Home, University Library, Transit Hub..."
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold mb-1">ETA (mins)</label>
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={etaMin}
                  onChange={(e) => setEtaMin(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm font-mono-tabular"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={creatingJourney}
                  className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold"
                >
                  Start
                </button>
              </div>
            </form>

            <div className="space-y-3 pt-2">
              {journeys.length === 0 ? (
                <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
                  No active or past journeys logged yet.
                </p>
              ) : (
                journeys.map((j) => (
                  <div
                    key={j.id}
                    className="p-4 rounded-2xl bg-[#FAF8FF] dark:bg-[#1E172E] border border-purple-200/70 dark:border-purple-800/70 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <p className="font-semibold text-sm">{j.destinationLabel}</p>
                      <p className="text-xs text-[#574C70] dark:text-[#B9AED2] font-mono-tabular">
                        Status: {j.status.toUpperCase()} · ETA {j.etaMinutes}m · Last check-in{' '}
                        {new Date(j.lastCheckInAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    {j.status === 'active' && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleCheckInJourney(j.id)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-purple-100 dark:bg-purple-900/60 text-purple-900 dark:text-purple-100 text-xs font-semibold"
                        >
                          I Am Safe Check-In
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleArriveJourney(j.id)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                        >
                          Arrived Safely
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="lg:col-span-5 space-y-5">
            {/* Wearable Connection */}
            <div className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-3">
              <h3 className="font-display text-base font-bold flex items-center gap-2">
                <Bluetooth className="w-4 h-4 text-purple-700 dark:text-purple-300" />
                <span>SAFEHER Wearable Connection</span>
              </h3>
              <p className="text-xs text-[#574C70] dark:text-[#B9AED2] leading-relaxed">
                {wearableStatus}
              </p>
              <button
                type="button"
                onClick={() => void handleConnectWearable()}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold"
              >
                Pair Bluetooth Safety Wearable
              </button>
            </div>

            {/* Safety Tips */}
            <div className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-3">
              <h3 className="font-display text-base font-bold">Essential Safety Tips</h3>
              <div className="space-y-3">
                {SAFETY_TIPS.map((tip) => (
                  <div
                    key={tip.title}
                    className="pb-3 border-b last:border-b-0 last:pb-0 border-purple-100 dark:border-purple-900/50"
                  >
                    <p className="text-xs font-semibold">{tip.title}</p>
                    <p className="text-xs text-[#574C70] dark:text-[#B9AED2] mt-0.5 leading-relaxed">
                      {tip.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* 2. ALL 6 AI-POWERED SAFETY FEATURES */}
      {section === 'ai_features' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Feature 1: AI Distress Voice Recognition */}
          <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-5 space-y-3">
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              <Mic className="w-4 h-4 text-pink-600" />
              <span>1. AI Distress Voice Recognition</span>
            </h3>
            <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
              Analyze spoken or transcribed phrases for urgent distress cues and trigger rapid SOS
              assistance.
            </p>
            <textarea
              rows={2}
              value={distressTranscript}
              onChange={(e) => setDistressTranscript(e.target.value)}
              placeholder='Example: "Please leave me alone, someone has been following me for three blocks."'
              className="w-full px-3.5 py-2.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-xs"
            />
            <button
              type="button"
              disabled={analyzingDistress}
              onClick={() => void handleAnalyzeDistress()}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold"
            >
              {analyzingDistress ? 'Analyzing...' : 'Analyze Distress Signal'}
            </button>

            {distressResult && (
              <div className="p-3 rounded-xl bg-[#FAF8FF] dark:bg-[#1E172E] border border-purple-200/70 dark:border-purple-800 text-xs space-y-1.5">
                <p className="font-semibold">
                  {distressResult.distressDetected ? 'Distress Indicators Detected' : 'Low Distress Signal'} ·{' '}
                  {distressResult.confidenceLabel}
                </p>
                <p className="text-[#574C70] dark:text-[#B9AED2]">{distressResult.recommendedAction}</p>
                {distressResult.shouldTriggerSosPrompt && (
                  <button
                    type="button"
                    onClick={() => onTriggerSos('voice_distress')}
                    className="mt-1 px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold"
                  >
                    Trigger SOS Now
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Feature 2: Predictive Safety Intelligence */}
          <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-5 space-y-3">
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-700 dark:text-purple-300" />
              <span>2. Predictive Safety Intelligence</span>
            </h3>
            <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
              Combine time of day, travel mode, and nearby community advisories into proactive trip
              precautions.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={predMode}
                onChange={(e) => setPredMode(e.target.value)}
                className="min-h-[40px] px-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-xs"
              >
                <option value="Walking">Walking</option>
                <option value="Public Transit">Public Transit</option>
                <option value="Rideshare">Rideshare</option>
              </select>
              <input
                type="text"
                value={predArea}
                onChange={(e) => setPredArea(e.target.value)}
                placeholder="Area context"
                className="min-h-[40px] px-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-xs"
              />
            </div>
            <button
              type="button"
              disabled={loadingPred}
              onClick={() => void handlePredictiveBrief()}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold"
            >
              {loadingPred ? 'Evaluating Context...' : 'Generate Safety Brief'}
            </button>

            {predResult && (
              <div className="p-3 rounded-xl bg-[#FAF8FF] dark:bg-[#1E172E] border border-purple-200/70 dark:border-purple-800 text-xs space-y-1.5">
                <p className="font-semibold capitalize">
                  Context Level: {predResult.riskContextLevel} · Check-in every{' '}
                  {predResult.recommendedCheckInMinutes} min
                </p>
                <p className="text-[#574C70] dark:text-[#B9AED2]">{predResult.summary}</p>
                <ul className="list-disc list-inside space-y-0.5 text-[#4C4166] dark:text-[#C8BEE3]">
                  {predResult.precautions.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Feature 3 & 5: AI Emergency Companion & Safe Exit Assistant */}
          <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-5 space-y-3">
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              <Bot className="w-4 h-4 text-purple-700 dark:text-purple-300" />
              <span>3 & 5. AI Emergency Companion & Safe Exit Assistant</span>
            </h3>
            <p className="text-xs text-[#574C70] dark:text-[#B9AED2] leading-relaxed">
              Launch the unified AI Safety Agent for continuous check-ins, discreet text mode, and
              step-by-step non-confrontational exit guidance synced with your Lock Screen.
            </p>
            <button
              type="button"
              onClick={onOpenAiAgent}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold inline-flex items-center gap-2"
            >
              <Compass className="w-4 h-4" />
              <span>Open AI Safety Agent</span>
            </button>
          </section>

          {/* Feature 4: Silent Gesture SOS */}
          <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-5 space-y-3">
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              <Hand className="w-4 h-4 text-pink-600" />
              <span>4. Silent Gesture SOS</span>
            </h3>
            <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
              Tap the discreet gesture pad 3 times consecutively to activate Silent SOS without
              screen alarms or voice prompts.
            </p>
            <button
              type="button"
              onClick={handleSilentGestureTap}
              className="w-full min-h-[64px] rounded-2xl bg-[#FAF8FF] dark:bg-[#1E172E] border border-purple-300 dark:border-purple-700 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-xs font-semibold transition-colors"
            >
              Discreet Tap Pad ({gestureTaps}/3 taps)
            </button>
            {gestureNotice && (
              <p className="text-xs font-medium text-purple-700 dark:text-purple-300">
                {gestureNotice}
              </p>
            )}
          </section>
        </div>
      )}

      {/* 3. MULTILINGUAL EMERGENCY TRANSLATOR */}
      {section === 'translator' && (
        <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 max-w-2xl space-y-4">
          <div>
            <h2 className="font-display text-xl font-bold">Multilingual Emergency Translator</h2>
            <p className="text-xs text-[#574C70] dark:text-[#B9AED2] mt-1">
              Translate urgent help requests with easy-to-read phonetic pronunciation and audio
              playback.
            </p>
          </div>

          <div className="space-y-3">
            <textarea
              rows={2}
              value={phraseInput}
              onChange={(e) => setPhraseInput(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm"
            />
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm"
              >
                <option value="Tamil">Tamil</option>
                <option value="Hindi">Hindi</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="English">English</option>
              </select>
              <button
                type="button"
                disabled={translating}
                onClick={() => void handleTranslate()}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold"
              >
                {translating ? 'Translating...' : 'Translate Urgent Phrase'}
              </button>
            </div>
          </div>

          {translation && (
            <div className="p-4 rounded-2xl bg-purple-50 dark:bg-[#221A34] border border-purple-200 dark:border-purple-800 space-y-2">
              <p className="text-lg font-bold">{translation.translatedText}</p>
              {translation.phoneticPronunciation && (
                <p className="text-xs font-mono-tabular text-purple-800 dark:text-purple-200">
                  Pronunciation: {translation.phoneticPronunciation}
                </p>
              )}
              {translation.culturalNote && (
                <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
                  {translation.culturalNote}
                </p>
              )}
              <button
                type="button"
                onClick={handleSpeakTranslation}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white dark:bg-[#161122] border border-purple-200 dark:border-purple-800 text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Volume2 className="w-4 h-4" />
                <span>Speak Aloud</span>
              </button>
            </div>
          )}
        </section>
      )}

      {/* 4. DIGITAL EMERGENCY TIMELINE */}
      {section === 'timeline' && (
        <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-4">
          <div>
            <h2 className="font-display text-xl font-bold">Digital Emergency Timeline</h2>
            <p className="text-xs text-[#574C70] dark:text-[#B9AED2] mt-1">
              Chronological audit of SOS activations, contact notifications, location captures, and
              secured evidence.
            </p>
          </div>

          {sosHistory.length === 0 ? (
            <p className="text-sm text-[#574C70] dark:text-[#B9AED2]">
              No SOS sessions or emergency drills recorded yet.
            </p>
          ) : (
            <div className="space-y-4">
              {sosHistory.map((session) => (
                <div
                  key={session.id}
                  className="p-4 rounded-2xl bg-[#FAF8FF] dark:bg-[#1E172E] border border-purple-200/70 dark:border-purple-800/70 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-sm">
                      {session.testMode ? 'SOS Test Drill' : 'Emergency SOS Session'} ·{' '}
                      <span className="capitalize">{session.status}</span>
                    </p>
                    <span className="text-xs font-mono-tabular text-[#574C70] dark:text-[#B9AED2]">
                      {new Date(session.startedAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="space-y-2 pl-3 border-l border-purple-300 dark:border-purple-700">
                    {session.timeline.map((ev) => (
                      <div key={ev.id} className="text-xs">
                        <p className="font-semibold">
                          {ev.event}{' '}
                          <span className="font-mono-tabular font-normal text-[#6E6288] dark:text-[#9F93BC]">
                            ({new Date(ev.time).toLocaleTimeString()})
                          </span>
                        </p>
                        <p className="text-[#574C70] dark:text-[#B9AED2]">{ev.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 5. OFFLINE EMERGENCY MODE & EMERGENCY PRACTICE MODE */}
      {section === 'offline_practice' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-4">
            <h2 className="font-display text-lg font-bold flex items-center gap-2">
              <WifiOff className="w-5 h-5 text-purple-700 dark:text-purple-300" />
              <span>Offline Emergency Mode</span>
            </h2>
            <p className="text-xs text-[#574C70] dark:text-[#B9AED2] leading-relaxed">
              Your trusted contacts and emergency message are cached locally on this device so you
              can place direct calls even when mobile data is unavailable. Note: AI Safety Chat,
              live map tiles, and cloud evidence sync require an active network connection.
            </p>

            <div className="p-4 rounded-2xl bg-[#FAF8FF] dark:bg-[#1E172E] border border-purple-200/70 dark:border-purple-800 space-y-2 text-xs">
              <p className="font-semibold">Cached Offline Contacts ({offlineSnapshot?.contacts.length || contacts.length})</p>
              {(offlineSnapshot?.contacts || contacts).map((c, idx) => (
                <div key={idx} className="flex items-center justify-between py-1">
                  <span>
                    {c.name} · {c.relationship}
                  </span>
                  <a
                    href={`tel:${c.phone}`}
                    className="font-mono-tabular font-semibold text-purple-700 dark:text-purple-300 inline-flex items-center gap-1"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    {c.phone}
                  </a>
                </div>
              ))}
              <div className="pt-2 border-t border-purple-200/60 dark:border-purple-800/60 flex flex-wrap gap-2">
                <a
                  href="tel:911"
                  className="px-3 py-2 rounded-xl bg-red-600 text-white font-semibold"
                >
                  Call 911
                </a>
                <a
                  href="tel:112"
                  className="px-3 py-2 rounded-xl border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 font-semibold"
                >
                  Call 112 (Intl)
                </a>
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-4">
            <h2 className="font-display text-lg font-bold flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-pink-600" />
              <span>Emergency Practice Mode</span>
            </h2>
            <p className="text-xs text-[#574C70] dark:text-[#B9AED2] leading-relaxed">
              Rehearse triggering SOS, reviewing escape instructions, and stopping an alert safely
              without notifying your emergency contacts.
            </p>

            {practiceStep === null ? (
              <button
                type="button"
                onClick={() => setPracticeStep(1)}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold"
              >
                Start Guided Practice Drill
              </button>
            ) : (
              <div className="p-4 rounded-2xl bg-purple-50 dark:bg-[#221A34] border border-purple-200 dark:border-purple-800 space-y-3 text-xs">
                {practiceStep === 1 && (
                  <>
                    <p className="font-bold">Step 1 of 3: Simulate SOS Trigger (Safe Test)</p>
                    <p>Tap below to log a simulated SOS test session (zero real alerts sent).</p>
                    <button
                      type="button"
                      onClick={() => {
                        onTriggerSos('home_button', true);
                        setPracticeStep(2);
                      }}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-pink-600 text-white font-semibold"
                    >
                      Trigger Test SOS Drill
                    </button>
                  </>
                )}
                {practiceStep === 2 && (
                  <>
                    <p className="font-bold">Step 2 of 3: Locate Staffed Help</p>
                    <p>
                      Practice identifying the nearest open pharmacy, transit booth, or hospital in
                      the Map tab without confronting anyone.
                    </p>
                    <button
                      type="button"
                      onClick={() => setPracticeStep(3)}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-purple-700 text-white font-semibold"
                    >
                      Continue to Step 3
                    </button>
                  </>
                )}
                {practiceStep === 3 && (
                  <>
                    <p className="font-bold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="w-4 h-4" /> Practice Drill Complete
                    </p>
                    <p>You can stop your test session anytime from the Home SOS banner.</p>
                    <button
                      type="button"
                      onClick={() => setPracticeStep(null)}
                      className="min-h-[40px] px-4 py-2 rounded-xl border border-purple-300 dark:border-purple-700 font-semibold"
                    >
                      Finish Practice
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* 6. USER SUGGESTIONS, AI ANALYZER & FEEDBACK */}
      {section === 'suggestions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-7 bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-bold">
                  Community Feature Suggestions & AI Grouping
                </h2>
                <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
                  Submit ideas, upvote requests, and track implementation status.
                </p>
              </div>
              <button
                type="button"
                disabled={clusteringAi}
                onClick={() => void handleClusterSuggestions()}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-purple-100 dark:bg-[#231B36] text-purple-900 dark:text-purple-100 text-xs font-semibold flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{clusteringAi ? 'Grouping...' : 'AI Group Similar Ideas'}</span>
              </button>
            </div>

            <form onSubmit={handleSubmitSuggestion} className="space-y-3 p-4 rounded-2xl bg-[#FAF8FF] dark:bg-[#1E172E] border border-purple-200/70 dark:border-purple-800/70">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  value={sugTitle}
                  onChange={(e) => setSugTitle(e.target.value)}
                  placeholder="Feature idea title..."
                  className="sm:col-span-2 min-h-[42px] px-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-white dark:bg-[#161122] text-xs"
                />
                <select
                  value={sugCategory}
                  onChange={(e) => setSugCategory(e.target.value)}
                  className="min-h-[42px] px-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-white dark:bg-[#161122] text-xs"
                >
                  <option value="AI Safety Agent">AI Safety Agent</option>
                  <option value="Journey Guardian">Journey Guardian</option>
                  <option value="Safe Maps">Safe Maps</option>
                  <option value="Evidence Vault">Evidence Vault</option>
                  <option value="Accessibility">Accessibility</option>
                </select>
              </div>
              <textarea
                rows={2}
                required
                value={sugDesc}
                onChange={(e) => setSugDesc(e.target.value)}
                placeholder="Describe how this would improve safety..."
                className="w-full px-3 py-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-white dark:bg-[#161122] text-xs"
              />
              <button
                type="submit"
                className="min-h-[40px] px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold"
              >
                Submit Suggestion
              </button>
            </form>

            <div className="space-y-3">
              {suggestions.map((s) => {
                const upvoted = s.upvotes.includes(user.id);
                return (
                  <article
                    key={s.id}
                    className="p-4 rounded-2xl border border-purple-200/70 dark:border-purple-900/60 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-sm">{s.title}</h3>
                        <p className="text-xs text-[#6E6288] dark:text-[#9F93BC]">
                          {s.category} · Theme: {s.clusterGroup} · Status: {s.status}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleUpvote(s.id)}
                        className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 ${
                          upvoted
                            ? 'bg-purple-700 text-white'
                            : 'border border-purple-200 dark:border-purple-800'
                        }`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span className="font-mono-tabular">{s.upvotes.length}</span>
                      </button>
                    </div>
                    <p className="text-xs text-[#4C4166] dark:text-[#C8BEE3]">{s.description}</p>
                    {s.adminNote && (
                      <p className="text-[11px] text-purple-800 dark:text-purple-300">
                        Operations Note: {s.adminNote}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="lg:col-span-5 bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-6 space-y-4 h-fit">
            <h2 className="font-display text-lg font-bold">Share App Feedback</h2>
            <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
              Tell our engineering and safety operations team about your experience.
            </p>
            <form onSubmit={handleSubmitFeedback} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold mb-1">Rating</label>
                  <select
                    value={fbRating}
                    onChange={(e) => setFbRating(Number(e.target.value))}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-xs"
                  >
                    <option value={5}>5 — Excellent</option>
                    <option value={4}>4 — Good</option>
                    <option value={3}>3 — Fair</option>
                    <option value={2}>2 — Needs Work</option>
                    <option value={1}>1 — Poor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Area</label>
                  <select
                    value={fbCategory}
                    onChange={(e) => setFbCategory(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-xs"
                  >
                    <option value="General">General</option>
                    <option value="SOS Experience">SOS Experience</option>
                    <option value="AI Safety Agent">AI Safety Agent</option>
                    <option value="Safe Routing">Safe Routing</option>
                  </select>
                </div>
              </div>
              <textarea
                rows={4}
                required
                value={fbMsg}
                onChange={(e) => setFbMsg(e.target.value)}
                placeholder="Write your feedback..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-xs"
              />
              <button
                type="submit"
                className="w-full min-h-[44px] rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold"
              >
                Send Feedback
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
