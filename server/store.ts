import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  AuditLogEntry,
  ChatMessageRecord,
  CommunityReport,
  EvidenceRecord,
  FeatureSuggestion,
  JourneySession,
  NotificationItem,
  SosSession,
  SupportTicket,
  TrustedContact,
  UserFeedbackRecord,
  UserPublic,
  UserSettings,
} from '../src/types/safeher.ts';

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  phoneVerified: boolean;
  pendingPhoneCode?: string;
  role: 'user' | 'admin';
  passwordHash: string;
  salt: string;
  emergencyMessage: string;
  primaryContactId: string | null;
  settings: UserSettings;
  suspended?: boolean;
  createdAt: string;
}

export interface StoredSession {
  token: string;
  userId: string;
  role: 'user' | 'admin';
  deviceLabel: string;
  createdAt: string;
  expiresAt: string;
}

export interface StoredEvidence extends EvidenceRecord {
  fileNameOnDisk: string;
}

export interface AdminConfig {
  passwordHash?: string;
  salt?: string;
  aiSafetyMode: 'strict_non_confrontational' | 'rapid_escalation';
  featureFlags: Record<string, boolean>;
}

export interface SafeHerDatabase {
  users: StoredUser[];
  sessions: StoredSession[];
  resetTokens: Array<{ token: string; email: string; expiresAt: string }>;
  contacts: TrustedContact[];
  sosSessions: SosSession[];
  evidence: StoredEvidence[];
  chatMessages: ChatMessageRecord[];
  journeys: JourneySession[];
  communityReports: CommunityReport[];
  suggestions: FeatureSuggestion[];
  feedback: UserFeedbackRecord[];
  notifications: NotificationItem[];
  supportTickets: SupportTicket[];
  auditLogs: AuditLogEntry[];
  adminConfig: AdminConfig;
}

export const DATA_DIR = path.resolve(process.cwd(), 'data');
export const EVIDENCE_DIR = path.resolve(DATA_DIR, 'evidence');
const DB_FILE = path.resolve(DATA_DIR, 'safeher-db.json');

export function defaultUserSettings(): UserSettings {
  return {
    appearance: 'system',
    language: 'en',
    accessibility: {
      textSize: 'standard',
      highContrast: false,
      screenReaderLabels: true,
    },
    notifications: {
      push: true,
      sound: true,
      vibration: true,
      emergency: true,
      journeyReminders: true,
    },
    sos: {
      autoRecordAudio: true,
      autoRecordVideo: false,
      silentMode: false,
      testMode: false,
      countdownSeconds: 3,
      gestureTrigger: true,
    },
    aiAgent: {
      voiceInput: true,
      preferredLanguage: 'en',
      saveHistory: true,
      proactiveAlerts: true,
      quickOptions: [
        'Someone is following me',
        'I feel unsafe while travelling',
        'I am lost',
        'I cannot speak freely',
        'Immediate danger — help now',
      ],
    },
    media: {
      autoSaveGallery: true,
      quality: 'standard',
      retentionDays: 90,
      encryptedVault: true,
    },
    location: {
      liveSharing: true,
      journeyTracking: true,
      shareWithContacts: true,
    },
    journey: {
      defaultReminderMinutes: 15,
      arrivalNotifications: true,
      autoEscalateMissedCheckIn: true,
    },
    community: {
      showReports: true,
      mapAlerts: true,
    },
  };
}

export function hashSecret(secret: string, saltHex?: string): { hash: string; salt: string } {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(secret, salt, 64).toString('hex');
  return { hash: derived, salt };
}

export function verifySecret(secret: string, hashHex: string, saltHex: string): boolean {
  try {
    const derived = crypto.scryptSync(secret, saltHex, 64);
    const expected = Buffer.from(hashHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function toPublicUser(u: StoredUser, activeSessionsCount: number): UserPublic {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    phoneVerified: u.phoneVerified,
    role: u.role,
    emergencyMessage: u.emergencyMessage,
    primaryContactId: u.primaryContactId,
    settings: u.settings,
    createdAt: u.createdAt,
    activeSessionsCount,
  };
}

function createInitialDb(): SafeHerDatabase {
  const now = new Date().toISOString();
  return {
    users: [],
    sessions: [],
    resetTokens: [],
    contacts: [],
    sosSessions: [],
    evidence: [],
    chatMessages: [],
    journeys: [],
    communityReports: [
      {
        id: 'rep_cctv_01',
        userId: 'system',
        authorLabel: 'City Transit Safety Audit',
        category: 'cctv_verified',
        title: 'Market & 4th Transit Plaza CCTV Corridor',
        description: 'Well-lit pedestrian plaza with municipal cameras and 24/7 station attendant booth.',
        lat: 37.7858,
        lng: -122.4058,
        address: 'Market St & 4th St, San Francisco',
        verified: true,
        status: 'active',
        createdAt: now,
      },
      {
        id: 'rep_hub_02',
        userId: 'system',
        authorLabel: 'Community Safety Network',
        category: 'verified_safe_hub',
        title: 'Civic Center 24-Hour Pharmacy & Security Desk',
        description: 'Brightly lit storefront open 24 hours with staffed security desk near main entrance.',
        lat: 37.7793,
        lng: -122.4162,
        address: 'Van Ness Ave & Market St, San Francisco',
        verified: true,
        status: 'active',
        createdAt: now,
      },
      {
        id: 'rep_light_03',
        userId: 'system',
        authorLabel: 'Community Member',
        category: 'poor_lighting',
        title: 'Dimly lit underpass walkway after 9 PM',
        description: 'Two streetlamps out along the west alley; recommend taking the main boulevard.',
        lat: 37.7815,
        lng: -122.4112,
        address: 'Stevenson Alley near 7th St, San Francisco',
        verified: false,
        status: 'active',
        createdAt: now,
      },
    ],
    suggestions: [
      {
        id: 'sug_01',
        userId: 'system',
        authorName: 'Community Member',
        title: 'Automatic check-in prompt when bus route detours',
        description: 'Prompt the user silently when a live transit journey deviates more than 400m from the planned route.',
        category: 'Journey Guardian',
        clusterGroup: 'Proactive Transit Monitoring',
        status: 'In Development',
        upvotes: ['u_seed_1', 'u_seed_2', 'u_seed_3'],
        adminNote: 'Scheduled for upcoming Journey Guardian release.',
        createdAt: now,
      },
      {
        id: 'sug_02',
        userId: 'system',
        authorName: 'Community Member',
        title: 'Low-brightness discreet screen mode during SOS',
        description: 'Allow users to dim the screen to near-black while keeping audio recording and SOS active.',
        category: 'AI Safety Agent',
        clusterGroup: 'Discreet & Silent Protection',
        status: 'Accepted',
        upvotes: ['u_seed_1', 'u_seed_4'],
        adminNote: 'Approved by safety engineering team.',
        createdAt: now,
      },
      {
        id: 'sug_03',
        userId: 'system',
        authorName: 'Community Member',
        title: 'Offline Tamil and Hindi emergency phrase cards',
        description: 'Store pre-translated emergency phrases locally so they open immediately without mobile data.',
        category: 'Multilingual & Offline',
        clusterGroup: 'Offline & Regional Accessibility',
        status: 'Implemented',
        upvotes: ['u_seed_2', 'u_seed_5', 'u_seed_6', 'u_seed_7'],
        adminNote: 'Available in Offline Emergency Mode and Translator.',
        createdAt: now,
      },
    ],
    feedback: [
      {
        id: 'fb_01',
        userId: 'system',
        authorName: 'Community Member',
        rating: 5,
        category: 'AI Safety Agent',
        message: 'Having the same AI escape guidance on both the lock screen and home screen feels very reassuring.',
        status: 'reviewed',
        createdAt: now,
      },
    ],
    notifications: [],
    supportTickets: [],
    auditLogs: [],
    adminConfig: {
      aiSafetyMode: 'strict_non_confrontational',
      featureFlags: {
        aiDistressVoice: true,
        predictiveSafety: true,
        cctvAwareRouting: true,
        wearableBluetooth: true,
        communityReporting: true,
        offlineEmergencyMode: true,
      },
    },
  };
}

let dbCache: SafeHerDatabase | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export async function initDatabase(): Promise<SafeHerDatabase> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(EVIDENCE_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    dbCache = JSON.parse(raw) as SafeHerDatabase;
  } catch {
    dbCache = createInitialDb();
    await persistDb();
  }
  return dbCache;
}

export function getDb(): SafeHerDatabase {
  if (!dbCache) {
    throw new Error('Database not initialized');
  }
  return dbCache;
}

export function persistDb(): Promise<void> {
  if (!dbCache) return Promise.resolve();
  const snapshot = JSON.stringify(dbCache, null, 2);
  writeQueue = writeQueue.then(async () => {
    const tmpFile = path.resolve(DATA_DIR, `safeher-db.${crypto.randomUUID()}.tmp`);
    await fs.writeFile(tmpFile, snapshot, 'utf8');
    await fs.rename(tmpFile, DB_FILE);
  });
  return writeQueue;
}

export function resolveSafeEvidencePath(fileNameOnDisk: string): string {
  const sanitized = path.basename(fileNameOnDisk);
  const resolved = path.resolve(EVIDENCE_DIR, sanitized);
  if (!resolved.startsWith(EVIDENCE_DIR + path.sep)) {
    throw new Error('Invalid evidence path');
  }
  return resolved;
}
