export type ThemeMode = 'light' | 'dark' | 'system';

export type SupportedLanguage = 'en' | 'ta' | 'hi' | 'es' | 'fr';

export type SuggestionStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Accepted'
  | 'In Development'
  | 'Testing'
  | 'Implemented'
  | 'Not Planned';

export interface UserSettings {
  appearance: ThemeMode;
  language: SupportedLanguage;
  accessibility: {
    textSize: 'standard' | 'large' | 'xl';
    highContrast: boolean;
    screenReaderLabels: boolean;
  };
  notifications: {
    push: boolean;
    sound: boolean;
    vibration: boolean;
    emergency: boolean;
    journeyReminders: boolean;
  };
  sos: {
    autoRecordAudio: boolean;
    autoRecordVideo: boolean;
    silentMode: boolean;
    testMode: boolean;
    countdownSeconds: number;
    gestureTrigger: boolean;
  };
  aiAgent: {
    voiceInput: boolean;
    preferredLanguage: SupportedLanguage;
    saveHistory: boolean;
    proactiveAlerts: boolean;
    quickOptions: string[];
  };
  media: {
    autoSaveGallery: boolean;
    quality: 'standard' | 'hd';
    retentionDays: number;
    encryptedVault: boolean;
  };
  location: {
    liveSharing: boolean;
    journeyTracking: boolean;
    shareWithContacts: boolean;
  };
  journey: {
    defaultReminderMinutes: number;
    arrivalNotifications: boolean;
    autoEscalateMissedCheckIn: boolean;
  };
  community: {
    showReports: boolean;
    mapAlerts: boolean;
  };
}

export interface UserPublic {
  id: string;
  email: string;
  name: string;
  phone: string;
  phoneVerified: boolean;
  role: 'user' | 'admin';
  emergencyMessage: string;
  primaryContactId: string | null;
  settings: UserSettings;
  createdAt: string;
  activeSessionsCount: number;
}

export interface TrustedContact {
  id: string;
  userId: string;
  name: string;
  relationship: string;
  phone: string;
  email: string;
  isPrimary: boolean;
  notifyOnSos: boolean;
  shareLiveLocation: boolean;
  lastTestStatus: 'never_tested' | 'confirmed_delivered' | 'failed';
  lastTestedAt: string | null;
  createdAt: string;
}

export interface SosDeliveryLog {
  contactId: string;
  contactName: string;
  channel: 'SMS' | 'Push' | 'Email';
  status: 'queued' | 'confirmed_delivered' | 'test_simulated';
  timestamp: string;
}

export interface SosTimelineEvent {
  id: string;
  time: string;
  event: string;
  detail: string;
}

export interface SosSession {
  id: string;
  userId: string;
  userName: string;
  status: 'active' | 'resolved' | 'test';
  testMode: boolean;
  triggeredVia: 'home_button' | 'lock_screen' | 'silent_gesture' | 'voice_distress' | 'ai_agent';
  location: {
    lat: number;
    lng: number;
    accuracyMeters?: number;
    label: string;
  } | null;
  startedAt: string;
  endedAt: string | null;
  deliveryLogs: SosDeliveryLog[];
  timeline: SosTimelineEvent[];
}

export interface EvidenceRecord {
  id: string;
  userId: string;
  sosSessionId: string | null;
  kind: 'audio' | 'video';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  savedToDeviceGallery: boolean;
  galleryNote: string;
  shareToken: string | null;
  createdAt: string;
}

export interface StructuredSafetyPlan {
  situationUnderstanding: string;
  immediateRecommendations: string[];
  escapePlanSteps: string[];
  nearbyAssistanceOptions: string[];
  trustedContactAction: string;
  sosRecommended: boolean;
  urgencyLevel: 'low' | 'moderate' | 'high' | 'critical';
  replyText: string;
}

export interface ChatMessageRecord {
  id: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  entryPoint: 'lockscreen' | 'home' | 'ai_tab';
  structuredPlan?: StructuredSafetyPlan;
  createdAt: string;
}

export interface JourneySession {
  id: string;
  userId: string;
  originLabel: string;
  destinationLabel: string;
  etaMinutes: number;
  checkInIntervalMin: number;
  startedAt: string;
  lastCheckInAt: string;
  status: 'active' | 'arrived' | 'overdue';
  sharedWithIds: string[];
}

export interface CommunityReport {
  id: string;
  userId: string;
  authorLabel: string;
  category:
    | 'poor_lighting'
    | 'harassment'
    | 'isolated_area'
    | 'verified_safe_hub'
    | 'cctv_verified';
  title: string;
  description: string;
  lat: number;
  lng: number;
  address: string;
  verified: boolean;
  status: 'active' | 'resolved' | 'flagged';
  createdAt: string;
}

export interface FeatureSuggestion {
  id: string;
  userId: string;
  authorName: string;
  title: string;
  description: string;
  category: string;
  clusterGroup: string;
  status: SuggestionStatus;
  upvotes: string[];
  adminNote?: string;
  createdAt: string;
}

export interface UserFeedbackRecord {
  id: string;
  userId: string;
  authorName: string;
  rating: number;
  category: string;
  message: string;
  status: 'new' | 'reviewed' | 'resolved';
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: 'sos' | 'journey' | 'suggestion' | 'system' | 'admin';
  read: boolean;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  email: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved';
  reply?: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetId: string;
  justification: string;
  timestamp: string;
}
