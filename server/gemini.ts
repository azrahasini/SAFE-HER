import { GoogleGenAI, Type } from '@google/genai';
import type { FeatureSuggestion, StructuredSafetyPlan } from '../src/types/safeher.ts';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in server environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const SAFETY_SYSTEM_INSTRUCTION = `You are the SAFEHER AI Safety Agent — a calm, practical, non-confrontational personal safety companion for women.

CRITICAL SAFETY MANDATES:
1. NEVER encourage confrontation, fighting, chasing, or risky physical actions.
2. NEVER recommend isolated, dark, unverified, or deserted locations. Always guide toward well-lit, staffed public venues (24/7 pharmacies, transit stations with attendants, hospitals, police stations, busy hotels/cafes).
3. NEVER guarantee that an escape plan or route is 100% safe; frame recommendations cautiously and practically.
4. NEVER delay emergency assistance while waiting for AI conversation — if the user may be in immediate danger or followed, prioritize One-Tap SOS and calling local emergency services immediately.
5. Every response MUST populate all structured fields:
   - situationUnderstanding: concise 1-2 sentence acknowledgment of what the user is facing.
   - immediateRecommendations: 2-4 clear, calm, immediate safety steps.
   - escapePlanSteps: 3-4 practical situation-based exit/escape steps.
   - nearbyAssistanceOptions: practical staffed public places to look for (or guidance to check the Safe Map Nearby Help panel if location is enabled).
   - trustedContactAction: concrete suggestion for notifying or sharing live location with trusted contacts.
   - sosRecommended: boolean (true when danger, following, or coercion is indicated).
   - urgencyLevel: 'low' | 'moderate' | 'high' | 'critical'.
   - replyText: clear, empathetic, scannable prose summarizing the guidance in the user's preferred language.`;

export async function generateSafetyPlan(params: {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  language: string;
  silentMode: boolean;
  hasLocation: boolean;
  locationLabel?: string;
}): Promise<StructuredSafetyPlan> {
  const ai = getClient();

  const historyContext = params.history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'User' : 'SAFEHER AI'}: ${m.content}`)
    .join('\n');

  const prompt = `Preferred response language code: ${params.language}
Silent/discreet communication mode: ${params.silentMode ? 'YES (keep instructions concise, quiet, text-only, no phone call assumptions)' : 'NO'}
Location permission granted: ${params.hasLocation ? `YES (${params.locationLabel || 'coordinates available'})` : 'NO (do not claim exact coordinates; advise enabling location or looking for nearby staffed businesses)'}

Recent conversation:
${historyContext || '(New session)'}

Current user message:
${params.message}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction: SAFETY_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          situationUnderstanding: { type: Type.STRING },
          immediateRecommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          escapePlanSteps: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          nearbyAssistanceOptions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          trustedContactAction: { type: Type.STRING },
          sosRecommended: { type: Type.BOOLEAN },
          urgencyLevel: { type: Type.STRING },
          replyText: { type: Type.STRING },
        },
        required: [
          'situationUnderstanding',
          'immediateRecommendations',
          'escapePlanSteps',
          'nearbyAssistanceOptions',
          'trustedContactAction',
          'sosRecommended',
          'urgencyLevel',
          'replyText',
        ],
      },
    },
  });

  const text = (response.text ?? '{}').trim();
  const parsed = JSON.parse(text) as Partial<StructuredSafetyPlan>;
  const urgency =
    parsed.urgencyLevel === 'critical' ||
    parsed.urgencyLevel === 'high' ||
    parsed.urgencyLevel === 'moderate' ||
    parsed.urgencyLevel === 'low'
      ? parsed.urgencyLevel
      : 'moderate';

  return {
    situationUnderstanding: parsed.situationUnderstanding || 'I hear you and I am here with you.',
    immediateRecommendations: Array.isArray(parsed.immediateRecommendations)
      ? parsed.immediateRecommendations
      : ['Stay in a well-lit area near other people if possible.'],
    escapePlanSteps: Array.isArray(parsed.escapePlanSteps)
      ? parsed.escapePlanSteps
      : ['Move calmly toward the nearest open, staffed venue.'],
    nearbyAssistanceOptions: Array.isArray(parsed.nearbyAssistanceOptions)
      ? parsed.nearbyAssistanceOptions
      : ['Open the Map tab to view nearby staffed pharmacies, transit hubs, or police desks.'],
    trustedContactAction:
      parsed.trustedContactAction || 'Share your live location with your primary trusted contact.',
    sosRecommended: Boolean(parsed.sosRecommended),
    urgencyLevel: urgency,
    replyText: parsed.replyText || 'Stay calm and move toward a staffed public location. Tap SOS anytime if you need immediate help.',
  };
}

export async function analyzeDistressTranscript(transcript: string): Promise<{
  distressDetected: boolean;
  confidenceLabel: string;
  detectedCues: string[];
  recommendedAction: string;
  shouldTriggerSosPrompt: boolean;
}> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Analyze this spoken or typed safety transcript for signs of distress, coercion, pursuit, or immediate danger.
Transcript: "${transcript}"`,
    config: {
      systemInstruction:
        'You evaluate personal safety voice transcripts for distress indicators. Never claim medical or forensic certainty. Be conservative and protective.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          distressDetected: { type: Type.BOOLEAN },
          confidenceLabel: { type: Type.STRING },
          detectedCues: { type: Type.ARRAY, items: { type: Type.STRING } },
          recommendedAction: { type: Type.STRING },
          shouldTriggerSosPrompt: { type: Type.BOOLEAN },
        },
        required: [
          'distressDetected',
          'confidenceLabel',
          'detectedCues',
          'recommendedAction',
          'shouldTriggerSosPrompt',
        ],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim());
  return {
    distressDetected: Boolean(parsed.distressDetected),
    confidenceLabel: String(parsed.confidenceLabel || 'Assessed'),
    detectedCues: Array.isArray(parsed.detectedCues) ? parsed.detectedCues : [],
    recommendedAction: String(
      parsed.recommendedAction || 'Stay connected with a trusted contact or activate SOS if unsafe.'
    ),
    shouldTriggerSosPrompt: Boolean(parsed.shouldTriggerSosPrompt),
  };
}

export async function generatePredictiveSafetyBrief(input: {
  timeOfDay: string;
  travelMode: string;
  areaContext: string;
  nearbyReportTitles: string[];
}): Promise<{
  riskContextLevel: 'low' | 'elevated' | 'high';
  summary: string;
  precautions: string[];
  recommendedCheckInMinutes: number;
}> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Provide a practical predictive safety intelligence brief for a user planning travel.
Time of day: ${input.timeOfDay}
Travel mode: ${input.travelMode}
Area context: ${input.areaContext}
Recent community observations nearby: ${input.nearbyReportTitles.join('; ') || 'None reported'}`,
    config: {
      systemInstruction:
        'Provide grounded, non-alarmist personal travel safety guidance. Never guarantee safety; give practical precautions.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          riskContextLevel: { type: Type.STRING },
          summary: { type: Type.STRING },
          precautions: { type: Type.ARRAY, items: { type: Type.STRING } },
          recommendedCheckInMinutes: { type: Type.INTEGER },
        },
        required: ['riskContextLevel', 'summary', 'precautions', 'recommendedCheckInMinutes'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim());
  const level =
    parsed.riskContextLevel === 'high' ||
    parsed.riskContextLevel === 'elevated' ||
    parsed.riskContextLevel === 'low'
      ? parsed.riskContextLevel
      : 'elevated';

  return {
    riskContextLevel: level,
    summary: String(parsed.summary || 'Use main well-lit corridors and share your trip with a trusted contact.'),
    precautions: Array.isArray(parsed.precautions) ? parsed.precautions : [],
    recommendedCheckInMinutes: Number(parsed.recommendedCheckInMinutes) || 15,
  };
}

export async function translateEmergencyPhrase(input: {
  phrase: string;
  targetLanguage: string;
}): Promise<{
  translatedText: string;
  phoneticPronunciation: string;
  culturalNote: string;
}> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Translate this urgent personal safety phrase into ${input.targetLanguage}, with simple phonetic pronunciation for quick reading under stress:
Phrase: "${input.phrase}"`,
    config: {
      systemInstruction:
        'Provide clear, natural, urgent emergency translations plus easy-to-read Latin phonetic pronunciation.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          translatedText: { type: Type.STRING },
          phoneticPronunciation: { type: Type.STRING },
          culturalNote: { type: Type.STRING },
        },
        required: ['translatedText', 'phoneticPronunciation', 'culturalNote'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim());
  return {
    translatedText: String(parsed.translatedText || input.phrase),
    phoneticPronunciation: String(parsed.phoneticPronunciation || ''),
    culturalNote: String(parsed.culturalNote || ''),
  };
}

export async function clusterSuggestionsWithAI(
  suggestions: Array<Pick<FeatureSuggestion, 'id' | 'title' | 'description' | 'category'>>
): Promise<Array<{ id: string; clusterGroup: string }>> {
  if (suggestions.length === 0) return [];
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Group these user safety feature suggestions into concise, meaningful theme clusters (2-4 words each).
Suggestions: ${JSON.stringify(suggestions)}`,
    config: {
      systemInstruction: 'Assign a coherent theme cluster label to each suggestion ID.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            clusterGroup: { type: Type.STRING },
          },
          required: ['id', 'clusterGroup'],
        },
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '[]').trim());
  return Array.isArray(parsed) ? parsed : [];
}
