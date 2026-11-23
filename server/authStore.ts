import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AuthUser, ChatMessage, ChatSession, NovaMode, SqlDialect } from '../src/types/nova';

export interface StoredUser extends AuthUser {
  passwordHash: string;
}

export interface StoreSchema {
  users: StoredUser[];
  sessionsByUser: Record<string, ChatSession[]>;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegistrationInput(input: {
  name?: string;
  email?: string;
  password?: string;
}): ValidationResult {
  const name = (input.name ?? '').trim();
  const email = (input.email ?? '').trim().toLowerCase();
  const password = input.password ?? '';

  if (name.length < 2) {
    return { valid: false, error: 'Full name must be at least 2 characters.' };
  }
  if (!EMAIL_RE.test(email)) {
    return { valid: false, error: 'Enter a valid email address.' };
  }
  if (password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters.' };
  }
  return { valid: true };
}

export function validateLoginInput(input: {
  email?: string;
  password?: string;
}): ValidationResult {
  const email = (input.email ?? '').trim().toLowerCase();
  const password = input.password ?? '';

  if (!EMAIL_RE.test(email)) {
    return { valid: false, error: 'Enter a valid email address.' };
  }
  if (password.length < 1) {
    return { valid: false, error: 'Enter your password.' };
  }
  return { valid: true };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function signSessionToken(userId: string, secret: string, ttlMs = 7 * 24 * 60 * 60 * 1000): string {
  const exp = Date.now() + ttlMs;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string, secret: string): string | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid?: string;
      exp?: number;
    };
    if (!parsed.uid || !parsed.exp || Date.now() > parsed.exp) return null;
    return parsed.uid;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    if (key) result[key] = val;
  }
  return result;
}

export class NovaStore {
  private data: StoreSchema;
  private filePath: string | null;

  constructor(
    filePath: string | null = process.env.VERCEL
      ? path.resolve('/tmp', 'nova_store.json')
      : path.resolve(process.cwd(), 'data/nova_store.json')
  ) {
    this.filePath = filePath;
    this.data = this.load();
    this.purgeLegacyDemoAccount();
  }

  private load(): StoreSchema {
    if (!this.filePath) {
      return { users: [], sessionsByUser: {} };
    }
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw) as StoreSchema;
        if (parsed && Array.isArray(parsed.users) && typeof parsed.sessionsByUser === 'object') {
          return parsed;
        }
      }
    } catch {
      // Fall back to fresh store if file is unreadable
    }
    return { users: [], sessionsByUser: {} };
  }

  private persist(): void {
    if (!this.filePath) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      // In serverless or read-only environments, persist gracefully fails back to in-memory
      console.warn('NovaStore persist warning (falling back to in-memory store):', err);
    }
  }

  private purgeLegacyDemoAccount(): void {
    const beforeCount = this.data.users.length;
    this.data.users = this.data.users.filter(
      (u) => u.email !== 'demo@novaagent.io' && u.id !== 'user-demo-nova'
    );
    if (this.data.sessionsByUser['user-demo-nova']) {
      delete this.data.sessionsByUser['user-demo-nova'];
    }
    if (this.data.users.length !== beforeCount) {
      this.persist();
    }
  }

  upsertOAuthUser(input: {
    provider: 'google' | 'github' | 'microsoft';
    name: string;
    email: string;
  }): AuthUser {
    const email = input.email.trim().toLowerCase();
    const existing = this.data.users.find((u) => u.email === email);
    if (existing) {
      if (!existing.name && input.name.trim()) {
        existing.name = input.name.trim();
        this.persist();
      }
      return this.toPublicUser(existing);
    }

    const user: StoredUser = {
      id: `usr_${crypto.randomUUID().slice(0, 10)}`,
      name: input.name.trim() || email.split('@')[0],
      email,
      role: `${input.provider.charAt(0).toUpperCase()}${input.provider.slice(1)} Account`,
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword(crypto.randomBytes(24).toString('hex')),
    };
    this.data.users.push(user);
    this.data.sessionsByUser[user.id] = [];
    this.persist();
    return this.toPublicUser(user);
  }

  private toPublicUser(u: StoredUser): AuthUser {
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
    };
  }

  registerUser(input: { name: string; email: string; password: string }): { user?: AuthUser; error?: string } {
    const check = validateRegistrationInput(input);
    if (!check.valid) return { error: check.error };

    const email = input.email.trim().toLowerCase();
    if (this.data.users.some((u) => u.email === email)) {
      return { error: 'An account with this email already exists.' };
    }

    const user: StoredUser = {
      id: `usr_${crypto.randomUUID().slice(0, 10)}`,
      name: input.name.trim(),
      email,
      role: 'Data Engineer',
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword(input.password),
    };
    this.data.users.push(user);
    this.data.sessionsByUser[user.id] = [];
    this.persist();
    return { user: this.toPublicUser(user) };
  }

  authenticateUser(input: { email: string; password: string }): { user?: AuthUser; error?: string } {
    const check = validateLoginInput(input);
    if (!check.valid) return { error: check.error };

    const email = input.email.trim().toLowerCase();
    const found = this.data.users.find((u) => u.email === email);
    if (!found || !verifyPassword(input.password, found.passwordHash)) {
      return { error: 'Invalid email or password.' };
    }
    return { user: this.toPublicUser(found) };
  }

  getUserById(userId: string): AuthUser | null {
    const found = this.data.users.find((u) => u.id === userId);
    return found ? this.toPublicUser(found) : null;
  }

  listSessions(userId: string): ChatSession[] {
    const list = this.data.sessionsByUser[userId] ?? [];
    return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  createSession(
    userId: string,
    opts: { title?: string; mode: NovaMode; dialect: SqlDialect; schemaContext?: string }
  ): ChatSession {
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: `ses_${crypto.randomUUID().slice(0, 10)}`,
      title: (opts.title ?? 'Untitled Query').trim() || 'Untitled Query',
      mode: opts.mode,
      dialect: opts.dialect,
      schemaContext: opts.schemaContext ?? '',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    if (!this.data.sessionsByUser[userId]) {
      this.data.sessionsByUser[userId] = [];
    }
    this.data.sessionsByUser[userId].unshift(session);
    this.persist();
    return session;
  }

  appendMessages(
    userId: string,
    sessionId: string,
    newMessages: ChatMessage[],
    updates?: { title?: string; mode?: NovaMode; dialect?: SqlDialect; schemaContext?: string }
  ): ChatSession | null {
    const list = this.data.sessionsByUser[userId] ?? [];
    const session = list.find((s) => s.id === sessionId);
    if (!session) return null;
    session.messages.push(...newMessages);
    if (updates?.title) session.title = updates.title;
    if (updates?.mode) session.mode = updates.mode;
    if (updates?.dialect) session.dialect = updates.dialect;
    if (updates?.schemaContext !== undefined) session.schemaContext = updates.schemaContext;
    session.updatedAt = new Date().toISOString();
    this.persist();
    return session;
  }

  deleteSession(userId: string, sessionId: string): boolean {
    const list = this.data.sessionsByUser[userId] ?? [];
    const idx = list.findIndex((s) => s.id === sessionId);
    if (idx === -1) return false;
    list.splice(idx, 1);
    this.persist();
    return true;
  }

  renameSession(userId: string, sessionId: string, newTitle: string): ChatSession | null {
    const clean = newTitle.trim();
    if (!clean) return null;
    const list = this.data.sessionsByUser[userId] ?? [];
    const session = list.find((s) => s.id === sessionId);
    if (!session) return null;
    session.title = clean.slice(0, 80);
    session.updatedAt = new Date().toISOString();
    this.persist();
    return session;
  }

  changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): { ok: boolean; error?: string } {
    if (!newPassword || newPassword.length < 6) {
      return { ok: false, error: 'New password must be at least 6 characters.' };
    }
    const found = this.data.users.find((u) => u.id === userId);
    if (!found) {
      return { ok: false, error: 'Account not found.' };
    }
    if (!verifyPassword(currentPassword, found.passwordHash)) {
      return { ok: false, error: 'Current password is incorrect.' };
    }
    found.passwordHash = hashPassword(newPassword);
    this.persist();
    return { ok: true };
  }
}
