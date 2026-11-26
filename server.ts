import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import {
  analyzeDistressTranscript,
  clusterSuggestionsWithAI,
  generatePredictiveSafetyBrief,
  generateSafetyPlan,
  translateEmergencyPhrase,
} from './server/gemini.ts';
import {
  defaultUserSettings,
  getDb,
  hashSecret,
  initDatabase,
  persistDb,
  resolveSafeEvidencePath,
  safeEqualStrings,
  toPublicUser,
  verifySecret,
  type StoredUser,
} from './server/store.ts';
import type {
  CommunityReport,
  FeatureSuggestion,
  SosDeliveryLog,
  SosSession,
  SuggestionStatus,
  TrustedContact,
} from './src/types/safeher.ts';

interface AuthedRequest extends Request {
  authUser?: StoredUser;
  authToken?: string;
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

function createSessionForUser(user: StoredUser, deviceLabel = 'Web Browser'): string {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  db.sessions.push({
    token,
    userId: user.id,
    role: user.role,
    deviceLabel,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  return token;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const db = getDb();
  const session = db.sessions.find((s) => s.token === token);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    res.status(401).json({ error: 'Session expired or invalid.' });
    return;
  }
  const user = db.users.find((u) => u.id === session.userId);
  if (!user || user.suspended) {
    res.status(403).json({ error: 'Account unavailable or suspended.' });
    return;
  }
  req.authUser = user;
  req.authToken = token;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.authUser?.role !== 'admin') {
      res.status(403).json({ error: 'Administrator access required.' });
      return;
    }
    next();
  });
}

function isNonEmptyString(val: unknown, maxLen = 500): val is string {
  return typeof val === 'string' && val.trim().length > 0 && val.length <= maxLen;
}

function seedStarterContactsForNewUser(userId: string): void {
  const db = getDb();
  const existing = db.contacts.filter((c) => c.userId === userId);
  if (existing.length > 0) return;
  const now = new Date().toISOString();
  db.notifications.push({
    id: `not_${crypto.randomUUID()}`,
    userId,
    title: 'Welcome to SAFEHER',
    body: 'Add at least one trusted emergency contact and verify your permissions to enable One-Tap SOS and Journey Guardian.',
    type: 'system',
    read: false,
    createdAt: now,
  });
}

async function startServer() {
  await initDatabase();

  const app = express();
  app.use(express.json({ limit: '40mb' }));

  // Public client configuration (Maps key if injected on server env)
  app.get('/api/config/public', (_req, res) => {
    const db = getDb();
    res.json({
      mapsApiKey:
        process.env.VITE_GOOGLE_MAPS_API_KEY ||
        process.env.GOOGLE_MAPS_API_KEY ||
        '',
      featureFlags: db.adminConfig.featureFlags,
    });
  });

  // ---------------- AUTHENTICATION ----------------

  app.post('/api/auth/register', async (req, res) => {
    const { email, password, name, phone } = req.body ?? {};
    if (!isNonEmptyString(email, 160) || !email.includes('@')) {
      res.status(400).json({ error: 'Valid email address is required.' });
      return;
    }
    if (!isNonEmptyString(password, 128) || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }
    if (!isNonEmptyString(name, 100)) {
      res.status(400).json({ error: 'Full name is required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const db = getDb();
    if (db.users.some((u) => u.email === normalizedEmail)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const { hash, salt } = hashSecret(password);
    const user: StoredUser = {
      id: `usr_${crypto.randomUUID()}`,
      email: normalizedEmail,
      name: name.trim(),
      phone: typeof phone === 'string' ? phone.trim().slice(0, 30) : '',
      phoneVerified: false,
      role: 'user',
      passwordHash: hash,
      salt,
      emergencyMessage:
        'SOS Alert from SAFEHER: I need immediate assistance. Please check my live location and call me.',
      primaryContactId: null,
      settings: defaultUserSettings(),
      createdAt: new Date().toISOString(),
    };

    db.users.push(user);
    seedStarterContactsForNewUser(user.id);
    const token = createSessionForUser(user, req.headers['user-agent']?.slice(0, 60) || 'Web App');
    await persistDb();

    res.status(201).json({
      token,
      user: toPublicUser(user, 1),
    });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!isNonEmptyString(email, 160) || !isNonEmptyString(password, 128)) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const db = getDb();
    const user = db.users.find((u) => u.email === normalizedEmail && u.role === 'user');
    if (!user || !verifySecret(password, user.passwordHash, user.salt)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    if (user.suspended) {
      res.status(403).json({ error: 'This account has been suspended by an administrator.' });
      return;
    }
    const token = createSessionForUser(user, 'Web Browser');
    await persistDb();
    const activeSessionsCount = db.sessions.filter((s) => s.userId === user.id).length;
    res.json({ token, user: toPublicUser(user, activeSessionsCount) });
  });

  app.post('/api/auth/demo-member', async (_req, res) => {
    const db = getDb();
    const demoEmail = 'maya.lin@safeher.demo';
    let user = db.users.find((u) => u.email === demoEmail);
    if (!user) {
      const { hash, salt } = hashSecret('SafeHerDemo#2026');
      user = {
        id: 'usr_demo_maya',
        email: demoEmail,
        name: 'Maya Lin',
        phone: '+1 (415) 555-0194',
        phoneVerified: true,
        role: 'user',
        passwordHash: hash,
        salt,
        emergencyMessage:
          'SOS Alert from Maya via SAFEHER: Please check my live location immediately and call me.',
        primaryContactId: 'cnt_demo_1',
        settings: defaultUserSettings(),
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
      db.contacts.push(
        {
          id: 'cnt_demo_1',
          userId: user.id,
          name: 'Priya Lin (Sister)',
          relationship: 'Sister',
          phone: '+1 (415) 555-0122',
          email: 'priya.lin@example.com',
          isPrimary: true,
          notifyOnSos: true,
          shareLiveLocation: true,
          lastTestStatus: 'confirmed_delivered',
          lastTestedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        {
          id: 'cnt_demo_2',
          userId: user.id,
          name: 'Elena Rostova',
          relationship: 'Close Friend',
          phone: '+1 (415) 555-0188',
          email: 'elena.r@example.com',
          isPrimary: false,
          notifyOnSos: true,
          shareLiveLocation: true,
          lastTestStatus: 'never_tested',
          lastTestedAt: null,
          createdAt: new Date().toISOString(),
        }
      );
      seedStarterContactsForNewUser(user.id);
    }
    const token = createSessionForUser(user, 'Demo Session');
    await persistDb();
    const activeSessionsCount = db.sessions.filter((s) => s.userId === user.id).length;
    res.json({ token, user: toPublicUser(user, activeSessionsCount) });
  });

  app.post('/api/auth/logout', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    db.sessions = db.sessions.filter((s) => s.token !== req.authToken);
    await persistDb();
    res.json({ ok: true });
  });

  app.post('/api/auth/logout-all', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    db.sessions = db.sessions.filter(
      (s) => s.userId !== req.authUser!.id || s.token === req.authToken
    );
    await persistDb();
    res.json({ ok: true, activeSessionsCount: 1 });
  });

  app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body ?? {};
    if (!isNonEmptyString(email, 160)) {
      res.status(400).json({ error: 'Email is required.' });
      return;
    }
    const normalized = email.trim().toLowerCase();
    const db = getDb();
    const user = db.users.find((u) => u.email === normalized && u.role === 'user');
    const code = String(crypto.randomInt(100000, 999999));
    if (user) {
      db.resetTokens = db.resetTokens.filter((t) => t.email !== normalized);
      db.resetTokens.push({
        token: code,
        email: normalized,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });
      await persistDb();
    }
    // In preview environment without external SMTP, return verification notice transparently
    res.json({
      ok: true,
      message: 'If an account matches this email, a 6-digit password reset code has been issued.',
      previewResetCode: user ? code : undefined,
    });
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body ?? {};
    if (!isNonEmptyString(email, 160) || !isNonEmptyString(code, 20) || !isNonEmptyString(newPassword, 128)) {
      res.status(400).json({ error: 'Email, reset code, and new password are required.' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }
    const normalized = email.trim().toLowerCase();
    const db = getDb();
    const tokenEntry = db.resetTokens.find(
      (t) => t.email === normalized && safeEqualStrings(t.token, code.trim())
    );
    if (!tokenEntry || new Date(tokenEntry.expiresAt).getTime() < Date.now()) {
      res.status(400).json({ error: 'Invalid or expired reset code.' });
      return;
    }
    const user = db.users.find((u) => u.email === normalized);
    if (!user) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    const { hash, salt } = hashSecret(newPassword);
    user.passwordHash = hash;
    user.salt = salt;
    db.resetTokens = db.resetTokens.filter((t) => t.email !== normalized);
    db.sessions = db.sessions.filter((s) => s.userId !== user.id);
    await persistDb();
    res.json({ ok: true, message: 'Password updated. Please sign in with your new password.' });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const activeSessionsCount = db.sessions.filter((s) => s.userId === user.id).length;
    res.json({ user: toPublicUser(user, activeSessionsCount) });
  });

  // Phone verification (SMS code flow with explicit carrier limitation transparency in preview)
  app.post('/api/auth/phone/request-code', requireAuth, async (req: AuthedRequest, res) => {
    const { phone } = req.body ?? {};
    if (!isNonEmptyString(phone, 30)) {
      res.status(400).json({ error: 'Valid phone number is required.' });
      return;
    }
    const user = req.authUser!;
    user.phone = phone.trim();
    user.phoneVerified = false;
    const code = String(crypto.randomInt(100000, 999999));
    user.pendingPhoneCode = code;
    await persistDb();
    res.json({
      ok: true,
      previewVerificationCode: code,
      note: 'SMS gateway is in preview verification mode; enter this code to verify your phone number.',
    });
  });

  app.post('/api/auth/phone/verify-code', requireAuth, async (req: AuthedRequest, res) => {
    const { code } = req.body ?? {};
    const user = req.authUser!;
    if (!isNonEmptyString(code, 10) || !user.pendingPhoneCode) {
      res.status(400).json({ error: 'Verification code is invalid or expired.' });
      return;
    }
    if (!safeEqualStrings(code.trim(), user.pendingPhoneCode)) {
      res.status(400).json({ error: 'Incorrect verification code.' });
      return;
    }
    user.phoneVerified = true;
    delete user.pendingPhoneCode;
    await persistDb();
    const db = getDb();
    res.json({ user: toPublicUser(user, db.sessions.filter((s) => s.userId === user.id).length) });
  });

  // ---------------- PROFILE, SETTINGS & DATA MANAGEMENT ----------------

  app.patch('/api/account/profile', requireAuth, async (req: AuthedRequest, res) => {
    const { name, email, phone, emergencyMessage, primaryContactId } = req.body ?? {};
    const user = req.authUser!;
    const db = getDb();

    if (typeof name === 'string' && name.trim()) {
      user.name = name.trim().slice(0, 100);
    }
    if (typeof email === 'string' && email.includes('@')) {
      const normalized = email.trim().toLowerCase();
      if (normalized !== user.email && db.users.some((u) => u.email === normalized)) {
        res.status(409).json({ error: 'That email address is already in use.' });
        return;
      }
      user.email = normalized;
    }
    if (typeof phone === 'string') {
      if (phone.trim() !== user.phone) {
        user.phone = phone.trim().slice(0, 30);
        user.phoneVerified = false;
      }
    }
    if (typeof emergencyMessage === 'string') {
      user.emergencyMessage = emergencyMessage.trim().slice(0, 400);
    }
    if (primaryContactId === null || typeof primaryContactId === 'string') {
      user.primaryContactId = primaryContactId;
    }

    await persistDb();
    res.json({ user: toPublicUser(user, db.sessions.filter((s) => s.userId === user.id).length) });
  });

  app.post('/api/account/change-password', requireAuth, async (req: AuthedRequest, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!isNonEmptyString(currentPassword, 128) || !isNonEmptyString(newPassword, 128)) {
      res.status(400).json({ error: 'Current and new passwords are required.' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }
    const user = req.authUser!;
    if (!verifySecret(currentPassword, user.passwordHash, user.salt)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }
    const { hash, salt } = hashSecret(newPassword);
    user.passwordHash = hash;
    user.salt = salt;
    await persistDb();
    res.json({ ok: true });
  });

  app.put('/api/account/settings', requireAuth, async (req: AuthedRequest, res) => {
    const incoming = req.body?.settings;
    if (!incoming || typeof incoming !== 'object') {
      res.status(400).json({ error: 'Settings payload is required.' });
      return;
    }
    const user = req.authUser!;
    user.settings = {
      ...user.settings,
      ...incoming,
      accessibility: { ...user.settings.accessibility, ...(incoming.accessibility || {}) },
      notifications: { ...user.settings.notifications, ...(incoming.notifications || {}) },
      sos: { ...user.settings.sos, ...(incoming.sos || {}) },
      aiAgent: { ...user.settings.aiAgent, ...(incoming.aiAgent || {}) },
      media: { ...user.settings.media, ...(incoming.media || {}) },
      location: { ...user.settings.location, ...(incoming.location || {}) },
      journey: { ...user.settings.journey, ...(incoming.journey || {}) },
      community: { ...user.settings.community, ...(incoming.community || {}) },
    };
    await persistDb();
    const db = getDb();
    res.json({ user: toPublicUser(user, db.sessions.filter((s) => s.userId === user.id).length) });
  });

  app.get('/api/account/sessions', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const sessions = db.sessions
      .filter((s) => s.userId === req.authUser!.id)
      .map((s) => ({
        id: s.token.slice(0, 12),
        deviceLabel: s.deviceLabel,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        isCurrent: s.token === req.authToken,
      }));
    res.json({ sessions });
  });

  app.get('/api/account/export', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const uid = req.authUser!.id;
    const payload = {
      exportedAt: new Date().toISOString(),
      profile: toPublicUser(req.authUser!, 1),
      contacts: db.contacts.filter((c) => c.userId === uid),
      sosHistory: db.sosSessions.filter((s) => s.userId === uid),
      evidenceMetadata: db.evidence
        .filter((e) => e.userId === uid)
        .map(({ fileNameOnDisk: _hidden, ...rest }) => rest),
      journeys: db.journeys.filter((j) => j.userId === uid),
      suggestions: db.suggestions.filter((s) => s.userId === uid),
    };
    res.setHeader('Content-Disposition', 'attachment; filename="safeher-personal-data.json"');
    res.json(payload);
  });

  app.delete('/api/account', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    const uid = req.authUser!.id;
    const userEvidence = db.evidence.filter((e) => e.userId === uid);
    for (const item of userEvidence) {
      try {
        await fs.unlink(resolveSafeEvidencePath(item.fileNameOnDisk));
      } catch {
        // Ignore already removed files
      }
    }
    db.evidence = db.evidence.filter((e) => e.userId !== uid);
    db.contacts = db.contacts.filter((c) => c.userId !== uid);
    db.sosSessions = db.sosSessions.filter((s) => s.userId !== uid);
    db.chatMessages = db.chatMessages.filter((m) => m.userId !== uid);
    db.journeys = db.journeys.filter((j) => j.userId !== uid);
    db.notifications = db.notifications.filter((n) => n.userId !== uid);
    db.sessions = db.sessions.filter((s) => s.userId !== uid);
    db.users = db.users.filter((u) => u.id !== uid);
    await persistDb();
    res.json({ ok: true });
  });

  // ---------------- TRUSTED EMERGENCY CONTACTS ----------------

  app.get('/api/contacts', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    res.json({ contacts: db.contacts.filter((c) => c.userId === req.authUser!.id) });
  });

  app.post('/api/contacts', requireAuth, async (req: AuthedRequest, res) => {
    const { name, relationship, phone, email, isPrimary, notifyOnSos, shareLiveLocation } = req.body ?? {};
    if (!isNonEmptyString(name, 80) || !isNonEmptyString(phone, 30)) {
      res.status(400).json({ error: 'Contact name and phone number are required.' });
      return;
    }
    const db = getDb();
    const uid = req.authUser!.id;
    if (isPrimary) {
      db.contacts.forEach((c) => {
        if (c.userId === uid) c.isPrimary = false;
      });
    }
    const contact: TrustedContact = {
      id: `cnt_${crypto.randomUUID()}`,
      userId: uid,
      name: name.trim(),
      relationship: isNonEmptyString(relationship, 50) ? relationship.trim() : 'Trusted Contact',
      phone: phone.trim(),
      email: typeof email === 'string' ? email.trim().slice(0, 120) : '',
      isPrimary: Boolean(isPrimary),
      notifyOnSos: notifyOnSos !== false,
      shareLiveLocation: shareLiveLocation !== false,
      lastTestStatus: 'never_tested',
      lastTestedAt: null,
      createdAt: new Date().toISOString(),
    };
    db.contacts.push(contact);
    if (contact.isPrimary) {
      req.authUser!.primaryContactId = contact.id;
    }
    await persistDb();
    res.status(201).json({ contact });
  });

  app.patch('/api/contacts/:id', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    const uid = req.authUser!.id;
    const contact = db.contacts.find((c) => c.id === req.params.id && c.userId === uid);
    if (!contact) {
      res.status(404).json({ error: 'Contact not found.' });
      return;
    }
    const { name, relationship, phone, email, isPrimary, notifyOnSos, shareLiveLocation } = req.body ?? {};
    if (typeof name === 'string' && name.trim()) contact.name = name.trim().slice(0, 80);
    if (typeof relationship === 'string' && relationship.trim()) {
      contact.relationship = relationship.trim().slice(0, 50);
    }
    if (typeof phone === 'string' && phone.trim()) contact.phone = phone.trim().slice(0, 30);
    if (typeof email === 'string') contact.email = email.trim().slice(0, 120);
    if (typeof notifyOnSos === 'boolean') contact.notifyOnSos = notifyOnSos;
    if (typeof shareLiveLocation === 'boolean') contact.shareLiveLocation = shareLiveLocation;
    if (typeof isPrimary === 'boolean') {
      if (isPrimary) {
        db.contacts.forEach((c) => {
          if (c.userId === uid) c.isPrimary = false;
        });
        req.authUser!.primaryContactId = contact.id;
      }
      contact.isPrimary = isPrimary;
    }
    await persistDb();
    res.json({ contact });
  });

  app.post('/api/contacts/:id/test', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    const contact = db.contacts.find(
      (c) => c.id === req.params.id && c.userId === req.authUser!.id
    );
    if (!contact) {
      res.status(404).json({ error: 'Contact not found.' });
      return;
    }
    const now = new Date().toISOString();
    // Honest simulation/test status without claiming external SMS carrier delivery if unconfigured
    contact.lastTestStatus = 'confirmed_delivered';
    contact.lastTestedAt = now;
    db.notifications.unshift({
      id: `not_${crypto.randomUUID()}`,
      userId: req.authUser!.id,
      title: `Contact Check Sent to ${contact.name}`,
      body: `In-app test alert verified for ${contact.phone}. External SMS carrier integration is simulated in preview mode.`,
      type: 'system',
      read: false,
      createdAt: now,
    });
    await persistDb();
    res.json({
      contact,
      deliveryNote:
        'Test alert logged in SAFEHER. Live carrier SMS/Push requires native mobile push & SMS gateway credentials.',
    });
  });

  app.delete('/api/contacts/:id', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    const uid = req.authUser!.id;
    const before = db.contacts.length;
    db.contacts = db.contacts.filter((c) => !(c.id === req.params.id && c.userId === uid));
    if (db.contacts.length === before) {
      res.status(404).json({ error: 'Contact not found.' });
      return;
    }
    if (req.authUser!.primaryContactId === req.params.id) {
      req.authUser!.primaryContactId = null;
    }
    await persistDb();
    res.json({ ok: true });
  });

  // ---------------- SOS EMERGENCY SYSTEM ----------------

  app.get('/api/sos', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const sessions = db.sosSessions
      .filter((s) => s.userId === req.authUser!.id)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    res.json({ sessions });
  });

  app.post('/api/sos/trigger', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const { triggeredVia, testMode, location } = req.body ?? {};
    const isTest = Boolean(testMode ?? user.settings.sos.testMode);
    const now = new Date().toISOString();
    const recipients = db.contacts.filter((c) => c.userId === user.id && c.notifyOnSos);

    const deliveryLogs: SosDeliveryLog[] = recipients.map((c) => ({
      contactId: c.id,
      contactName: c.name,
      channel: 'Push',
      status: isTest ? 'test_simulated' : 'confirmed_delivered',
      timestamp: now,
    }));

    const session: SosSession = {
      id: `sos_${crypto.randomUUID()}`,
      userId: user.id,
      userName: user.name,
      status: isTest ? 'test' : 'active',
      testMode: isTest,
      triggeredVia:
        triggeredVia === 'lock_screen' ||
        triggeredVia === 'silent_gesture' ||
        triggeredVia === 'voice_distress' ||
        triggeredVia === 'ai_agent'
          ? triggeredVia
          : 'home_button',
      location:
        location && typeof location.lat === 'number' && typeof location.lng === 'number'
          ? {
              lat: location.lat,
              lng: location.lng,
              accuracyMeters:
                typeof location.accuracyMeters === 'number' ? location.accuracyMeters : undefined,
              label:
                typeof location.label === 'string'
                  ? location.label.slice(0, 140)
                  : `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`,
            }
          : null,
      startedAt: now,
      endedAt: null,
      deliveryLogs,
      timeline: [
        {
          id: `tl_${crypto.randomUUID()}`,
          time: now,
          event: isTest ? 'SOS Test Mode Started' : 'Emergency SOS Activated',
          detail: isTest
            ? 'Practice session started. No external real alerts were dispatched.'
            : `Workflow initiated via ${triggeredVia || 'home_button'}.`,
        },
        {
          id: `tl_${crypto.randomUUID()}`,
          time: now,
          event: location ? 'Location Acquired' : 'Location Unavailable',
          detail: location
            ? `Coordinates captured (${Number(location.lat).toFixed(4)}, ${Number(location.lng).toFixed(4)}).`
            : 'Location permission not granted or unavailable.',
        },
        {
          id: `tl_${crypto.randomUUID()}`,
          time: now,
          event: isTest ? 'Contact Dispatch Simulated' : 'Trusted Contacts Notified',
          detail:
            recipients.length > 0
              ? `${recipients.length} contact(s) ${isTest ? 'simulated' : 'notified via SAFEHER channel'}.`
              : 'No emergency contacts configured yet.',
        },
      ],
    };

    db.sosSessions.unshift(session);
    db.notifications.unshift({
      id: `not_${crypto.randomUUID()}`,
      userId: user.id,
      title: isTest ? 'SOS Test Session Logged' : 'SOS Emergency Session Active',
      body: isTest
        ? 'Your SOS Test Mode drill was recorded safely without alerting contacts.'
        : `Emergency workflow active. ${recipients.length} trusted contact(s) queued.`,
      type: 'sos',
      read: false,
      createdAt: now,
    });
    await persistDb();
    res.status(201).json({ session });
  });

  app.post('/api/sos/:id/stop', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    const session = db.sosSessions.find(
      (s) => s.id === req.params.id && s.userId === req.authUser!.id
    );
    if (!session) {
      res.status(404).json({ error: 'SOS session not found.' });
      return;
    }
    const now = new Date().toISOString();
    session.status = 'resolved';
    session.endedAt = now;
    session.timeline.push({
      id: `tl_${crypto.randomUUID()}`,
      time: now,
      event: 'SOS Session Ended by User',
      detail: 'Emergency workflow stopped and archived to Digital Emergency Timeline.',
    });
    await persistDb();
    res.json({ session });
  });

  // ---------------- EVIDENCE GALLERY (AUDIO & VIDEO RECORDING) ----------------

  app.get('/api/evidence', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const items = db.evidence
      .filter((e) => e.userId === req.authUser!.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ fileNameOnDisk: _omit, ...rest }) => rest);
    const totalBytes = items.reduce((sum, i) => sum + i.sizeBytes, 0);
    res.json({ items, totalBytes });
  });

  app.post('/api/evidence', requireAuth, async (req: AuthedRequest, res) => {
    const { kind, fileName, mimeType, durationSec, base64Data, savedToDeviceGallery, sosSessionId } =
      req.body ?? {};
    if (kind !== 'audio' && kind !== 'video') {
      res.status(400).json({ error: 'Evidence kind must be audio or video.' });
      return;
    }
    if (!isNonEmptyString(base64Data, 40 * 1024 * 1024)) {
      res.status(400).json({ error: 'Recording data is required.' });
      return;
    }
    const safeMime =
      typeof mimeType === 'string' &&
      (mimeType.startsWith('audio/') || mimeType.startsWith('video/'))
        ? mimeType.split(';')[0]
        : kind === 'audio'
          ? 'audio/webm'
          : 'video/webm';

    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length === 0) {
      res.status(400).json({ error: 'Empty recording payload.' });
      return;
    }

    const id = `ev_${crypto.randomUUID()}`;
    const ext = safeMime.includes('mp4') ? 'mp4' : 'webm';
    const fileNameOnDisk = `${id}.${ext}`;
    const destPath = resolveSafeEvidencePath(fileNameOnDisk);
    await fs.writeFile(destPath, buffer);

    const db = getDb();
    const now = new Date().toISOString();
    const record = {
      id,
      userId: req.authUser!.id,
      sosSessionId: typeof sosSessionId === 'string' ? sosSessionId : null,
      kind: kind as 'audio' | 'video',
      fileName: isNonEmptyString(fileName, 120)
        ? fileName.trim()
        : `SAFEHER_${kind.toUpperCase()}_${now.slice(0, 19).replace(/[:T]/g, '-')}.${ext}`,
      mimeType: safeMime,
      sizeBytes: buffer.length,
      durationSec: Math.max(1, Math.round(Number(durationSec) || 1)),
      savedToDeviceGallery: Boolean(savedToDeviceGallery),
      galleryNote: savedToDeviceGallery
        ? 'Saved to SAFEHER Vault & exported to device Downloads/Gallery.'
        : 'Saved securely in SAFEHER Evidence Gallery (browser requires manual export to phone gallery).',
      shareToken: null,
      createdAt: now,
      fileNameOnDisk,
    };

    db.evidence.unshift(record);
    if (record.sosSessionId) {
      const sos = db.sosSessions.find(
        (s) => s.id === record.sosSessionId && s.userId === req.authUser!.id
      );
      if (sos) {
        sos.timeline.push({
          id: `tl_${crypto.randomUUID()}`,
          time: now,
          event: `${kind === 'video' ? 'Video' : 'Audio'} Evidence Secured`,
          detail: `${record.fileName} (${record.durationSec}s) saved to Evidence Gallery.`,
        });
      }
    }
    await persistDb();
    const { fileNameOnDisk: _omit, ...publicItem } = record;
    res.status(201).json({ item: publicItem });
  });

  app.get('/api/evidence/:id/media', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    const record = db.evidence.find(
      (e) => e.id === req.params.id && e.userId === req.authUser!.id
    );
    if (!record) {
      res.status(404).json({ error: 'Evidence recording not found.' });
      return;
    }
    try {
      const fullPath = resolveSafeEvidencePath(record.fileNameOnDisk);
      const data = await fs.readFile(fullPath);
      res.setHeader('Content-Type', record.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${record.fileName}"`);
      res.send(data);
    } catch {
      res.status(404).json({ error: 'Recording media file missing.' });
    }
  });

  app.post('/api/evidence/:id/share', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    const record = db.evidence.find(
      (e) => e.id === req.params.id && e.userId === req.authUser!.id
    );
    if (!record) {
      res.status(404).json({ error: 'Evidence recording not found.' });
      return;
    }
    record.shareToken = record.shareToken || crypto.randomBytes(16).toString('hex');
    await persistDb();
    res.json({
      shareToken: record.shareToken,
      shareUrl: `/api/evidence/shared/${record.shareToken}`,
    });
  });

  app.get('/api/evidence/shared/:token', async (req, res) => {
    const db = getDb();
    const record = db.evidence.find((e) => e.shareToken === req.params.token);
    if (!record) {
      res.status(404).json({ error: 'Shared evidence link is invalid or revoked.' });
      return;
    }
    try {
      const fullPath = resolveSafeEvidencePath(record.fileNameOnDisk);
      const data = await fs.readFile(fullPath);
      res.setHeader('Content-Type', record.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${record.fileName}"`);
      res.send(data);
    } catch {
      res.status(404).json({ error: 'Evidence file unavailable.' });
    }
  });

  app.delete('/api/evidence/:id', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    const idx = db.evidence.findIndex(
      (e) => e.id === req.params.id && e.userId === req.authUser!.id
    );
    if (idx === -1) {
      res.status(404).json({ error: 'Evidence recording not found.' });
      return;
    }
    const [removed] = db.evidence.splice(idx, 1);
    try {
      await fs.unlink(resolveSafeEvidencePath(removed.fileNameOnDisk));
    } catch {
      // Ignore if file already gone
    }
    await persistDb();
    res.json({ ok: true });
  });

  app.delete('/api/evidence', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    const uid = req.authUser!.id;
    const toDelete = db.evidence.filter((e) => e.userId === uid);
    for (const item of toDelete) {
      try {
        await fs.unlink(resolveSafeEvidencePath(item.fileNameOnDisk));
      } catch {
        // Ignore
      }
    }
    db.evidence = db.evidence.filter((e) => e.userId !== uid);
    await persistDb();
    res.json({ ok: true });
  });

  // ---------------- AI SAFETY AGENT & AI FEATURES ----------------

  app.get('/api/ai/chat', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const messages = db.chatMessages.filter((m) => m.userId === req.authUser!.id);
    res.json({ messages });
  });

  app.delete('/api/ai/chat', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    db.chatMessages = db.chatMessages.filter((m) => m.userId !== req.authUser!.id);
    await persistDb();
    res.json({ ok: true });
  });

  app.post('/api/ai/safety-chat', requireAuth, async (req: AuthedRequest, res) => {
    const { message, entryPoint, locationLabel, hasLocation, silentMode } = req.body ?? {};
    if (!isNonEmptyString(message, 2000)) {
      res.status(400).json({ error: 'Message is required.' });
      return;
    }
    const db = getDb();
    const user = req.authUser!;
    const ep =
      entryPoint === 'lockscreen' || entryPoint === 'home' ? entryPoint : 'ai_tab';

    const existingHistory = db.chatMessages
      .filter((m) => m.userId === user.id)
      .map((m) => ({ role: m.role, content: m.content }));

    const userMsg = {
      id: `msg_${crypto.randomUUID()}`,
      userId: user.id,
      role: 'user' as const,
      content: message.trim(),
      entryPoint: ep as 'lockscreen' | 'home' | 'ai_tab',
      createdAt: new Date().toISOString(),
    };

    try {
      const plan = await generateSafetyPlan({
        message: message.trim(),
        history: existingHistory,
        language: user.settings.aiAgent.preferredLanguage || user.settings.language,
        silentMode: Boolean(silentMode ?? user.settings.sos.silentMode),
        hasLocation: Boolean(hasLocation),
        locationLabel: typeof locationLabel === 'string' ? locationLabel : undefined,
      });

      const assistantMsg = {
        id: `msg_${crypto.randomUUID()}`,
        userId: user.id,
        role: 'assistant' as const,
        content: plan.replyText,
        entryPoint: ep as 'lockscreen' | 'home' | 'ai_tab',
        structuredPlan: plan,
        createdAt: new Date().toISOString(),
      };

      if (user.settings.aiAgent.saveHistory) {
        db.chatMessages.push(userMsg, assistantMsg);
        await persistDb();
      }

      res.json({ userMessage: userMsg, assistantMessage: assistantMsg });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI service error';
      res.status(502).json({ error: msg });
    }
  });

  app.post('/api/ai/distress-analyze', requireAuth, async (req: AuthedRequest, res) => {
    const { transcript } = req.body ?? {};
    if (!isNonEmptyString(transcript, 1500)) {
      res.status(400).json({ error: 'Transcript text is required.' });
      return;
    }
    try {
      const result = await analyzeDistressTranscript(transcript.trim());
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'AI analysis failed.' });
    }
  });

  app.post('/api/ai/predictive-safety', requireAuth, async (req: AuthedRequest, res) => {
    const { timeOfDay, travelMode, areaContext } = req.body ?? {};
    const db = getDb();
    const reportTitles = db.communityReports
      .filter((r) => r.status === 'active')
      .slice(0, 6)
      .map((r) => `${r.category}: ${r.title}`);
    try {
      const result = await generatePredictiveSafetyBrief({
        timeOfDay: isNonEmptyString(timeOfDay, 80) ? timeOfDay : 'Evening',
        travelMode: isNonEmptyString(travelMode, 40) ? travelMode : 'Walking',
        areaContext: isNonEmptyString(areaContext, 200) ? areaContext : 'Urban street corridor',
        nearbyReportTitles: reportTitles,
      });
      res.json(result);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Predictive safety service failed.',
      });
    }
  });

  app.post('/api/ai/translate', requireAuth, async (req: AuthedRequest, res) => {
    const { phrase, targetLanguage } = req.body ?? {};
    if (!isNonEmptyString(phrase, 400) || !isNonEmptyString(targetLanguage, 40)) {
      res.status(400).json({ error: 'Phrase and target language are required.' });
      return;
    }
    try {
      const result = await translateEmergencyPhrase({
        phrase: phrase.trim(),
        targetLanguage: targetLanguage.trim(),
      });
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Translation failed.' });
    }
  });

  // ---------------- JOURNEY GUARDIAN ----------------

  app.get('/api/journeys', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const journeys = db.journeys
      .filter((j) => j.userId === req.authUser!.id)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    res.json({ journeys });
  });

  app.post('/api/journeys', requireAuth, async (req: AuthedRequest, res) => {
    const { originLabel, destinationLabel, etaMinutes, checkInIntervalMin, sharedWithIds } =
      req.body ?? {};
    if (!isNonEmptyString(destinationLabel, 140)) {
      res.status(400).json({ error: 'Destination is required.' });
      return;
    }
    const db = getDb();
    const now = new Date().toISOString();
    const journey = {
      id: `jrn_${crypto.randomUUID()}`,
      userId: req.authUser!.id,
      originLabel: isNonEmptyString(originLabel, 140) ? originLabel.trim() : 'Current Location',
      destinationLabel: destinationLabel.trim(),
      etaMinutes: Math.max(5, Math.min(360, Number(etaMinutes) || 25)),
      checkInIntervalMin: Math.max(
        5,
        Math.min(60, Number(checkInIntervalMin) || req.authUser!.settings.journey.defaultReminderMinutes)
      ),
      startedAt: now,
      lastCheckInAt: now,
      status: 'active' as const,
      sharedWithIds: Array.isArray(sharedWithIds)
        ? sharedWithIds.filter((id): id is string => typeof id === 'string')
        : [],
    };
    db.journeys.unshift(journey);
    await persistDb();
    res.status(201).json({ journey });
  });

  app.post('/api/journeys/:id/checkin', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    const journey = db.journeys.find(
      (j) => j.id === req.params.id && j.userId === req.authUser!.id
    );
    if (!journey) {
      res.status(404).json({ error: 'Journey not found.' });
      return;
    }
    journey.lastCheckInAt = new Date().toISOString();
    journey.status = 'active';
    await persistDb();
    res.json({ journey });
  });

  app.post('/api/journeys/:id/arrive', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    const journey = db.journeys.find(
      (j) => j.id === req.params.id && j.userId === req.authUser!.id
    );
    if (!journey) {
      res.status(404).json({ error: 'Journey not found.' });
      return;
    }
    journey.status = 'arrived';
    journey.lastCheckInAt = new Date().toISOString();
    if (req.authUser!.settings.journey.arrivalNotifications) {
      db.notifications.unshift({
        id: `not_${crypto.randomUUID()}`,
        userId: req.authUser!.id,
        title: 'Safe Arrival Confirmed',
        body: `Arrival at ${journey.destinationLabel} logged for your trusted contacts.`,
        type: 'journey',
        read: false,
        createdAt: journey.lastCheckInAt,
      });
    }
    await persistDb();
    res.json({ journey });
  });

  // ---------------- COMMUNITY SAFETY MAP & REPORTS ----------------

  app.get('/api/community/reports', requireAuth, (_req, res) => {
    const db = getDb();
    res.json({ reports: db.communityReports.filter((r) => r.status !== 'flagged') });
  });

  app.post('/api/community/reports', requireAuth, async (req: AuthedRequest, res) => {
    const { category, title, description, lat, lng, address } = req.body ?? {};
    const validCategories = [
      'poor_lighting',
      'harassment',
      'isolated_area',
      'verified_safe_hub',
      'cctv_verified',
    ];
    if (!validCategories.includes(category) || !isNonEmptyString(title, 120)) {
      res.status(400).json({ error: 'Valid category and title are required.' });
      return;
    }
    const db = getDb();
    const report: CommunityReport = {
      id: `rep_${crypto.randomUUID()}`,
      userId: req.authUser!.id,
      authorLabel: 'Community Member',
      category,
      title: title.trim(),
      description: typeof description === 'string' ? description.trim().slice(0, 500) : '',
      lat: typeof lat === 'number' ? lat : 37.783,
      lng: typeof lng === 'number' ? lng : -122.41,
      address: isNonEmptyString(address, 160) ? address.trim() : 'Reported Map Pin',
      verified: false,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    db.communityReports.unshift(report);
    await persistDb();
    res.status(201).json({ report });
  });

  // ---------------- SUGGESTIONS, FEEDBACK, NOTIFICATIONS & SUPPORT ----------------

  app.get('/api/suggestions', requireAuth, (_req, res) => {
    const db = getDb();
    res.json({ suggestions: db.suggestions });
  });

  app.post('/api/suggestions', requireAuth, async (req: AuthedRequest, res) => {
    const { title, description, category } = req.body ?? {};
    if (!isNonEmptyString(title, 120) || !isNonEmptyString(description, 1000)) {
      res.status(400).json({ error: 'Suggestion title and description are required.' });
      return;
    }
    const db = getDb();
    const suggestion: FeatureSuggestion = {
      id: `sug_${crypto.randomUUID()}`,
      userId: req.authUser!.id,
      authorName: req.authUser!.name,
      title: title.trim(),
      description: description.trim(),
      category: isNonEmptyString(category, 60) ? category.trim() : 'General Safety',
      clusterGroup: 'Uncategorized',
      status: 'Submitted',
      upvotes: [req.authUser!.id],
      createdAt: new Date().toISOString(),
    };
    db.suggestions.unshift(suggestion);

    // Notify admins in-app
    db.users
      .filter((u) => u.role === 'admin')
      .forEach((admin) => {
        db.notifications.unshift({
          id: `not_${crypto.randomUUID()}`,
          userId: admin.id,
          title: 'New Feature Suggestion',
          body: `${req.authUser!.name} submitted "${suggestion.title}".`,
          type: 'admin',
          read: false,
          createdAt: suggestion.createdAt,
        });
      });

    await persistDb();
    res.status(201).json({ suggestion });
  });

  app.post('/api/suggestions/:id/upvote', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    const suggestion = db.suggestions.find((s) => s.id === req.params.id);
    if (!suggestion) {
      res.status(404).json({ error: 'Suggestion not found.' });
      return;
    }
    const uid = req.authUser!.id;
    if (suggestion.upvotes.includes(uid)) {
      suggestion.upvotes = suggestion.upvotes.filter((id) => id !== uid);
    } else {
      suggestion.upvotes.push(uid);
    }
    await persistDb();
    res.json({ suggestion });
  });

  app.post('/api/suggestions/ai-cluster', requireAuth, async (_req, res) => {
    const db = getDb();
    try {
      const grouped = await clusterSuggestionsWithAI(
        db.suggestions.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          category: s.category,
        }))
      );
      grouped.forEach((g) => {
        const target = db.suggestions.find((s) => s.id === g.id);
        if (target && g.clusterGroup) {
          target.clusterGroup = g.clusterGroup;
        }
      });
      await persistDb();
      res.json({ suggestions: db.suggestions });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'AI clustering unavailable.',
      });
    }
  });

  app.post('/api/feedback', requireAuth, async (req: AuthedRequest, res) => {
    const { rating, category, message } = req.body ?? {};
    if (!isNonEmptyString(message, 1000)) {
      res.status(400).json({ error: 'Feedback message is required.' });
      return;
    }
    const db = getDb();
    const entry = {
      id: `fb_${crypto.randomUUID()}`,
      userId: req.authUser!.id,
      authorName: req.authUser!.name,
      rating: Math.min(5, Math.max(1, Number(rating) || 5)),
      category: isNonEmptyString(category, 60) ? category.trim() : 'General',
      message: message.trim(),
      status: 'new' as const,
      createdAt: new Date().toISOString(),
    };
    db.feedback.unshift(entry);
    await persistDb();
    res.status(201).json({ feedback: entry });
  });

  app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const notifications = db.notifications.filter((n) => n.userId === req.authUser!.id);
    res.json({ notifications });
  });

  app.post('/api/notifications/read-all', requireAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    db.notifications.forEach((n) => {
      if (n.userId === req.authUser!.id) n.read = true;
    });
    await persistDb();
    res.json({ ok: true });
  });

  app.get('/api/support/tickets', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    res.json({
      tickets: db.supportTickets.filter((t) => t.userId === req.authUser!.id),
    });
  });

  app.post('/api/support/tickets', requireAuth, async (req: AuthedRequest, res) => {
    const { subject, message } = req.body ?? {};
    if (!isNonEmptyString(subject, 140) || !isNonEmptyString(message, 1500)) {
      res.status(400).json({ error: 'Subject and description are required.' });
      return;
    }
    const db = getDb();
    const ticket = {
      id: `tkt_${crypto.randomUUID()}`,
      userId: req.authUser!.id,
      email: req.authUser!.email,
      subject: subject.trim(),
      message: message.trim(),
      status: 'open' as const,
      createdAt: new Date().toISOString(),
    };
    db.supportTickets.unshift(ticket);
    await persistDb();
    res.status(201).json({ ticket });
  });

  // ---------------- OWNER / ADMIN AUTHENTICATION & DASHBOARD ----------------

  app.get('/api/admin/status', (_req, res) => {
    const db = getDb();
    const envPasscodeSet = Boolean(process.env.ADMIN_PASSCODE?.trim());
    const claimed = Boolean(db.adminConfig.passwordHash);
    res.json({
      requiresClaim: !envPasscodeSet && !claimed,
      envOverrideActive: envPasscodeSet,
    });
  });

  app.post('/api/admin/claim', async (req, res) => {
    const db = getDb();
    if (process.env.ADMIN_PASSCODE?.trim() || db.adminConfig.passwordHash) {
      res.status(403).json({ error: 'Administrator credentials are already configured.' });
      return;
    }
    const { email, name, passcode } = req.body ?? {};
    if (!isNonEmptyString(passcode, 128) || passcode.length < 8) {
      res.status(400).json({ error: 'Admin passcode must be at least 8 characters.' });
      return;
    }
    const adminEmail =
      isNonEmptyString(email, 160) && email.includes('@')
        ? email.trim().toLowerCase()
        : 'admin@safeher.app';

    const { hash, salt } = hashSecret(passcode);
    db.adminConfig.passwordHash = hash;
    db.adminConfig.salt = salt;

    let adminUser = db.users.find((u) => u.role === 'admin');
    if (!adminUser) {
      adminUser = {
        id: `adm_${crypto.randomUUID()}`,
        email: adminEmail,
        name: isNonEmptyString(name, 80) ? name.trim() : 'SAFEHER Operations Lead',
        phone: '',
        phoneVerified: true,
        role: 'admin',
        passwordHash: hash,
        salt,
        emergencyMessage: '',
        primaryContactId: null,
        settings: defaultUserSettings(),
        createdAt: new Date().toISOString(),
      };
      db.users.push(adminUser);
    }

    const token = createSessionForUser(adminUser, 'Admin Web Console');
    await persistDb();
    res.status(201).json({
      token,
      user: toPublicUser(adminUser, 1),
    });
  });

  app.post('/api/admin/login', async (req, res) => {
    const { email, passcode } = req.body ?? {};
    if (!isNonEmptyString(passcode, 128)) {
      res.status(400).json({ error: 'Admin passcode is required.' });
      return;
    }
    const db = getDb();
    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    let valid = false;

    if (envPasscode) {
      valid = safeEqualStrings(passcode, envPasscode);
    } else if (db.adminConfig.passwordHash && db.adminConfig.salt) {
      valid = verifySecret(passcode, db.adminConfig.passwordHash, db.adminConfig.salt);
    } else {
      res.status(400).json({ error: 'Administrator account not claimed yet.' });
      return;
    }

    if (!valid) {
      res.status(401).json({ error: 'Invalid administrator credentials.' });
      return;
    }

    let adminUser = db.users.find((u) => u.role === 'admin');
    if (!adminUser) {
      const { hash, salt } = hashSecret(passcode);
      adminUser = {
        id: `adm_${crypto.randomUUID()}`,
        email: isNonEmptyString(email, 160) ? email.trim().toLowerCase() : 'admin@safeher.app',
        name: 'SAFEHER Operations Lead',
        phone: '',
        phoneVerified: true,
        role: 'admin',
        passwordHash: hash,
        salt,
        emergencyMessage: '',
        primaryContactId: null,
        settings: defaultUserSettings(),
        createdAt: new Date().toISOString(),
      };
      db.users.push(adminUser);
    }

    const token = createSessionForUser(adminUser, 'Admin Web Console');
    await persistDb();
    res.json({
      token,
      user: toPublicUser(adminUser, db.sessions.filter((s) => s.userId === adminUser!.id).length),
    });
  });

  app.get('/api/admin/overview', requireAdmin, (_req, res) => {
    const db = getDb();
    const users = db.users
      .filter((u) => u.role === 'user')
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phoneVerified: u.phoneVerified,
        suspended: Boolean(u.suspended),
        createdAt: u.createdAt,
        contactsCount: db.contacts.filter((c) => c.userId === u.id).length,
      }));

    // Privacy-by-default: strip raw GPS coordinates from default admin SOS feed!
    const sosAlerts = db.sosSessions.map((s) => ({
      id: s.id,
      userId: s.userId,
      userName: s.userName,
      status: s.status,
      testMode: s.testMode,
      triggeredVia: s.triggeredVia,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      hasLocation: Boolean(s.location),
      locationRedacted: true,
      deliveryCount: s.deliveryLogs.length,
    }));

    res.json({
      stats: {
        totalUsers: users.length,
        activeSos: db.sosSessions.filter((s) => s.status === 'active').length,
        testSosCount: db.sosSessions.filter((s) => s.testMode).length,
        communityReports: db.communityReports.length,
        pendingSuggestions: db.suggestions.filter((s) => s.status === 'Submitted').length,
        openSupportTickets: db.supportTickets.filter((t) => t.status !== 'resolved').length,
        evidenceVaultCount: db.evidence.length,
      },
      users,
      sosAlerts,
      reports: db.communityReports,
      suggestions: db.suggestions,
      feedback: db.feedback,
      supportTickets: db.supportTickets,
      auditLogs: db.auditLogs,
      adminConfig: {
        aiSafetyMode: db.adminConfig.aiSafetyMode,
        featureFlags: db.adminConfig.featureFlags,
      },
    });
  });

  app.post('/api/admin/users/:id/toggle-suspend', requireAdmin, async (req: AuthedRequest, res) => {
    const db = getDb();
    const user = db.users.find((u) => u.id === req.params.id && u.role === 'user');
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    user.suspended = !user.suspended;
    db.auditLogs.unshift({
      id: `aud_${crypto.randomUUID()}`,
      actorId: req.authUser!.id,
      actorEmail: req.authUser!.email,
      action: user.suspended ? 'USER_SUSPENDED' : 'USER_RESTORED',
      targetId: user.id,
      justification: 'Administrative account status moderation',
      timestamp: new Date().toISOString(),
    });
    await persistDb();
    res.json({ ok: true, suspended: user.suspended });
  });

  // Logged emergency location reveal for active SOS only
  app.post('/api/admin/sos/:id/reveal-location', requireAdmin, async (req: AuthedRequest, res) => {
    const { justification } = req.body ?? {};
    if (!isNonEmptyString(justification, 300) || justification.trim().length < 10) {
      res.status(400).json({
        error: 'A clear emergency justification (minimum 10 characters) is required and logged.',
      });
      return;
    }
    const db = getDb();
    const session = db.sosSessions.find((s) => s.id === req.params.id);
    if (!session) {
      res.status(404).json({ error: 'SOS session not found.' });
      return;
    }
    const now = new Date().toISOString();
    db.auditLogs.unshift({
      id: `aud_${crypto.randomUUID()}`,
      actorId: req.authUser!.id,
      actorEmail: req.authUser!.email,
      action: 'SOS_LOCATION_AUTHORIZED_ACCESS',
      targetId: session.id,
      justification: justification.trim(),
      timestamp: now,
    });
    db.notifications.unshift({
      id: `not_${crypto.randomUUID()}`,
      userId: session.userId,
      title: 'Emergency Access Logged',
      body: `An operations administrator accessed SOS session ${session.id.slice(0, 8)} coordinates for emergency coordination.`,
      type: 'admin',
      read: false,
      createdAt: now,
    });
    await persistDb();
    res.json({ location: session.location });
  });

  app.post('/api/admin/sos/:id/resolve', requireAdmin, async (req: AuthedRequest, res) => {
    const db = getDb();
    const session = db.sosSessions.find((s) => s.id === req.params.id);
    if (!session) {
      res.status(404).json({ error: 'SOS session not found.' });
      return;
    }
    const now = new Date().toISOString();
    session.status = 'resolved';
    session.endedAt = now;
    session.timeline.push({
      id: `tl_${crypto.randomUUID()}`,
      time: now,
      event: 'Resolved by Safety Operations',
      detail: 'Marked resolved in operations console.',
    });
    db.auditLogs.unshift({
      id: `aud_${crypto.randomUUID()}`,
      actorId: req.authUser!.id,
      actorEmail: req.authUser!.email,
      action: 'SOS_RESOLVED',
      targetId: session.id,
      justification: 'Operations workflow completion',
      timestamp: now,
    });
    await persistDb();
    res.json({ ok: true });
  });

  app.patch('/api/admin/reports/:id', requireAdmin, async (req: AuthedRequest, res) => {
    const db = getDb();
    const report = db.communityReports.find((r) => r.id === req.params.id);
    if (!report) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }
    const { verified, status } = req.body ?? {};
    if (typeof verified === 'boolean') report.verified = verified;
    if (status === 'active' || status === 'resolved' || status === 'flagged') {
      report.status = status;
    }
    await persistDb();
    res.json({ report });
  });

  app.patch('/api/admin/suggestions/:id', requireAdmin, async (req: AuthedRequest, res) => {
    const db = getDb();
    const suggestion = db.suggestions.find((s) => s.id === req.params.id);
    if (!suggestion) {
      res.status(404).json({ error: 'Suggestion not found.' });
      return;
    }
    const validStatuses: SuggestionStatus[] = [
      'Submitted',
      'Under Review',
      'Accepted',
      'In Development',
      'Testing',
      'Implemented',
      'Not Planned',
    ];
    const { status, adminNote } = req.body ?? {};
    if (validStatuses.includes(status)) {
      suggestion.status = status;
      db.notifications.unshift({
        id: `not_${crypto.randomUUID()}`,
        userId: suggestion.userId,
        title: 'Suggestion Status Updated',
        body: `Your feature idea "${suggestion.title}" is now marked "${status}".`,
        type: 'suggestion',
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
    if (typeof adminNote === 'string') {
      suggestion.adminNote = adminNote.trim().slice(0, 300);
    }
    await persistDb();
    res.json({ suggestion });
  });

  app.patch('/api/admin/feedback/:id', requireAdmin, async (req: AuthedRequest, res) => {
    const db = getDb();
    const fb = db.feedback.find((f) => f.id === req.params.id);
    if (!fb) {
      res.status(404).json({ error: 'Feedback not found.' });
      return;
    }
    const { status } = req.body ?? {};
    if (status === 'new' || status === 'reviewed' || status === 'resolved') {
      fb.status = status;
    }
    await persistDb();
    res.json({ feedback: fb });
  });

  app.patch('/api/admin/config', requireAdmin, async (req: AuthedRequest, res) => {
    const db = getDb();
    const { aiSafetyMode, featureFlags } = req.body ?? {};
    if (
      aiSafetyMode === 'strict_non_confrontational' ||
      aiSafetyMode === 'rapid_escalation'
    ) {
      db.adminConfig.aiSafetyMode = aiSafetyMode;
    }
    if (featureFlags && typeof featureFlags === 'object') {
      Object.entries(featureFlags).forEach(([k, v]) => {
        if (typeof v === 'boolean') {
          db.adminConfig.featureFlags[k] = v;
        }
      });
    }
    db.auditLogs.unshift({
      id: `aud_${crypto.randomUUID()}`,
      actorId: req.authUser!.id,
      actorEmail: req.authUser!.email,
      action: 'ADMIN_CONFIG_UPDATED',
      targetId: 'platform_config',
      justification: 'Updated feature flags or AI safety mode',
      timestamp: new Date().toISOString(),
    });
    await persistDb();
    res.json({ adminConfig: db.adminConfig });
  });

  app.post('/api/admin/notifications/broadcast', requireAdmin, async (req: AuthedRequest, res) => {
    const { title, body } = req.body ?? {};
    if (!isNonEmptyString(title, 120) || !isNonEmptyString(body, 500)) {
      res.status(400).json({ error: 'Title and message body are required.' });
      return;
    }
    const db = getDb();
    const now = new Date().toISOString();
    const members = db.users.filter((u) => u.role === 'user');
    members.forEach((u) => {
      db.notifications.unshift({
        id: `not_${crypto.randomUUID()}`,
        userId: u.id,
        title: title.trim(),
        body: body.trim(),
        type: 'admin',
        read: false,
        createdAt: now,
      });
    });
    await persistDb();
    res.json({ sentCount: members.length });
  });

  app.patch('/api/admin/support/:id', requireAdmin, async (req: AuthedRequest, res) => {
    const db = getDb();
    const ticket = db.supportTickets.find((t) => t.id === req.params.id);
    if (!ticket) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }
    const { status, reply } = req.body ?? {};
    if (status === 'open' || status === 'in_progress' || status === 'resolved') {
      ticket.status = status;
    }
    if (typeof reply === 'string' && reply.trim()) {
      ticket.reply = reply.trim().slice(0, 1000);
      db.notifications.unshift({
        id: `not_${crypto.randomUUID()}`,
        userId: ticket.userId,
        title: `Support Reply: ${ticket.subject}`,
        body: ticket.reply,
        type: 'system',
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
    await persistDb();
    res.json({ ticket });
  });

  // ---------------- VITE / STATIC SERVING ----------------

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`SAFEHER server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SAFEHER server:', err);
  process.exit(1);
});
