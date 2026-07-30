import { createHash, randomBytes } from 'crypto';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { NestAuthSession, NEST_LEGACY_API_KEY_ID } from './auth.types';

interface RefreshEntry {
  sessionId: string;
  expiresAt: number;
}

@Injectable()
export class RefreshTokenStore implements OnModuleDestroy {
  private readonly sessions = new Map<string, NestAuthSession>();
  private readonly refreshByHash = new Map<string, RefreshEntry>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {
    this.cleanupTimer = setInterval(() => this.purgeExpiredMemory(), 60_000);
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createSession(
    apiKeyId: string,
    apikey: string,
    scopes: string[],
  ): Promise<NestAuthSession> {
    const id = randomBytes(16).toString('hex');
    const session: NestAuthSession = {
      id,
      apiKeyId,
      apikey,
      scopes,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };

    if (this.prisma.isEnabled() && apiKeyId !== NEST_LEGACY_API_KEY_ID) {
      await this.prisma.authSession.create({
        data: {
          id,
          apiKeyId,
          lastUsedAt: new Date(),
        },
      });
    } else {
      this.sessions.set(id, session);
    }

    return session;
  }

  async getSession(sessionId: string): Promise<NestAuthSession | undefined> {
    const inMemory = this.sessions.get(sessionId);
    if (inMemory) {
      inMemory.lastUsedAt = Date.now();
      return inMemory;
    }

    if (this.prisma.isEnabled()) {
      const row = await this.prisma.authSession.findUnique({
        where: { id: sessionId },
        include: { apiKey: true },
      });
      if (!row || row.revokedAt) return undefined;

      await this.prisma.authSession.update({
        where: { id: sessionId },
        data: { lastUsedAt: new Date() },
      });

      return {
        id: row.id,
        apiKeyId: row.apiKeyId,
        apikey: row.apiKey.keyPrefix,
        scopes: row.apiKey.scopes,
        createdAt: row.createdAt.getTime(),
        lastUsedAt: Date.now(),
      };
    }

    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    session.lastUsedAt = Date.now();
    return session;
  }

  async issueRefreshToken(sessionId: string, ttlMs: number): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    const hash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + ttlMs);

    if (this.prisma.isEnabled() && !this.sessions.has(sessionId)) {
      await this.prisma.refreshToken.create({
        data: {
          tokenHash: hash,
          sessionId,
          expiresAt,
        },
      });
    } else {
      this.refreshByHash.set(hash, {
        sessionId,
        expiresAt: expiresAt.getTime(),
      });
    }

    return raw;
  }

  async consumeRefreshToken(raw: string): Promise<NestAuthSession | undefined> {
    const hash = this.hashToken(raw);

    if (this.prisma.isEnabled()) {
      const dbEntry = await this.prisma.refreshToken.findUnique({
        where: { tokenHash: hash },
      });
      if (dbEntry) {
        await this.prisma.refreshToken.delete({ where: { tokenHash: hash } });
        if (dbEntry.expiresAt.getTime() < Date.now()) return undefined;
        return this.getSession(dbEntry.sessionId);
      }
    }

    const entry = this.refreshByHash.get(hash);
    if (!entry) return undefined;
    this.refreshByHash.delete(hash);
    if (entry.expiresAt < Date.now()) return undefined;
    return this.getSession(entry.sessionId);
  }

  async revokeSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    for (const [hash, entry] of this.refreshByHash.entries()) {
      if (entry.sessionId === sessionId) this.refreshByHash.delete(hash);
    }

    if (!this.prisma.isEnabled()) return;

    await this.prisma.authSession.updateMany({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    await this.prisma.refreshToken.deleteMany({ where: { sessionId } });
  }

  async purgeExpiredDb(): Promise<number> {
    if (!this.prisma.isEnabled()) return 0;
    const result = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }

  private purgeExpiredMemory(): void {
    const now = Date.now();
    for (const [hash, entry] of this.refreshByHash.entries()) {
      if (entry.expiresAt < now) this.refreshByHash.delete(hash);
    }
  }
}
