import { createHash, randomBytes } from 'crypto';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { NestAuthSession } from './auth.types';

interface RefreshEntry {
  sessionId: string;
  expiresAt: number;
}

@Injectable()
export class RefreshTokenStore implements OnModuleDestroy {
  private readonly sessions = new Map<string, NestAuthSession>();
  private readonly refreshByHash = new Map<string, RefreshEntry>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.purgeExpired(), 60_000);
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  createSession(apikey: string): NestAuthSession {
    const id = randomBytes(16).toString('hex');
    const session: NestAuthSession = {
      id,
      apikey,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(sessionId: string): NestAuthSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    session.lastUsedAt = Date.now();
    return session;
  }

  issueRefreshToken(sessionId: string, ttlMs: number): string {
    const raw = randomBytes(32).toString('hex');
    const hash = this.hashToken(raw);
    this.refreshByHash.set(hash, {
      sessionId,
      expiresAt: Date.now() + ttlMs,
    });
    return raw;
  }

  consumeRefreshToken(raw: string): NestAuthSession | undefined {
    const hash = this.hashToken(raw);
    const entry = this.refreshByHash.get(hash);
    if (!entry) return undefined;
    this.refreshByHash.delete(hash);
    if (entry.expiresAt < Date.now()) return undefined;
    return this.getSession(entry.sessionId);
  }

  revokeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    for (const [hash, entry] of this.refreshByHash.entries()) {
      if (entry.sessionId === sessionId) this.refreshByHash.delete(hash);
    }
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [hash, entry] of this.refreshByHash.entries()) {
      if (entry.expiresAt < now) this.refreshByHash.delete(hash);
    }
  }
}
