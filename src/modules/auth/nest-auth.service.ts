import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ApiKeyService } from './api-key.service';
import { ApiChannelService } from './api-channel.service';
import { RefreshTokenStore } from './refresh-token.store';
import { NestAuthSession, NEST_LEGACY_API_KEY_ID, TokenPairResponse } from './auth.types';

interface AccessPayload {
  sub: string;
  typ: 'nest_access';
}

const LEGACY_KEY_ID = NEST_LEGACY_API_KEY_ID;

@Injectable()
export class NestAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly store: RefreshTokenStore,
    private readonly channels: ApiChannelService,
    private readonly apiKeys: ApiKeyService,
  ) {}

  isEnabled(): boolean {
    return this.envBool('NEST_AUTH_ENABLED', true);
  }

  private envBool(key: string, defaultValue = false): boolean {
    const v = this.config.get<boolean | string | undefined>(key);
    if (v === undefined || v === null || v === '') return defaultValue;
    if (typeof v === 'boolean') return v;
    return String(v).trim().toLowerCase() === 'true';
  }

  accessTtlSec(): number {
    return Number(this.config.get<string>('NEST_ACCESS_TTL_SEC', '900'));
  }

  refreshTtlMs(): number {
    return Number(this.config.get<string>('NEST_REFRESH_TTL_SEC', '604800')) * 1000;
  }

  slideThresholdSec(): number {
    return Number(this.config.get<string>('NEST_TOKEN_SLIDE_SEC', '300'));
  }

  assertHttpsIfRequired(req: Request): void {
    if (!this.envBool('NEST_AUTH_REQUIRE_HTTPS')) return;

    const remote =
      req.ip ||
      req.socket?.remoteAddress ||
      '';
    if (
      remote === '127.0.0.1' ||
      remote === '::1' ||
      remote === '::ffff:127.0.0.1'
    ) {
      return;
    }

    const proto = String(req.headers['x-forwarded-proto'] ?? '').toLowerCase();
    if (req.secure || proto === 'https') return;

    throw new ForbiddenException('HTTPS requerido para autenticación nest-api.');
  }

  async issueTokenPair(apikey: string): Promise<TokenPairResponse> {
    const key = String(apikey ?? '').trim();
    if (!key) {
      throw new UnauthorizedException('apikey requerida para obtener token.');
    }

    const resolved = await this.resolveApiKey(key);
    const session = await this.store.createSession(
      resolved.apiKeyId,
      key,
      resolved.scopes,
    );
    return this.buildTokenPair(session);
  }

  async refreshTokenPair(refreshToken: string): Promise<TokenPairResponse> {
    const session = await this.store.consumeRefreshToken(
      String(refreshToken ?? '').trim(),
    );
    if (!session) {
      throw new UnauthorizedException('refresh_token inválido o expirado.');
    }
    return this.buildTokenPair(session);
  }

  verifyAccessToken(token: string): AccessPayload {
    try {
      const payload = this.jwt.verify<AccessPayload>(token);
      if (payload.typ !== 'nest_access' || !payload.sub) {
        throw new UnauthorizedException('Token inválido.');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('access_token inválido o expirado.');
    }
  }

  getSession(sessionId: string): Promise<NestAuthSession | undefined> {
    return this.store.getSession(sessionId);
  }

  async resolveApiKeyForRequest(
    plainKey: string,
  ): Promise<{ apiKeyId: string; scopes: string[] }> {
    return this.resolveApiKey(plainKey);
  }

  issueAccessTokenForSession(session: NestAuthSession): string {
    const payload: AccessPayload = { sub: session.id, typ: 'nest_access' };
    return this.jwt.sign(payload, { expiresIn: this.accessTtlSec() });
  }

  shouldSlideRefresh(exp?: number): boolean {
    if (!exp) return false;
    const remaining = exp - Math.floor(Date.now() / 1000);
    return remaining > 0 && remaining <= this.slideThresholdSec();
  }

  decodeExp(token: string): number | undefined {
    const decoded = this.jwt.decode(token) as { exp?: number } | null;
    return decoded?.exp;
  }

  private async resolveApiKey(
    key: string,
  ): Promise<{ apiKeyId: string; scopes: string[] }> {
    if (key.startsWith('nest_')) {
      const row = await this.apiKeys.findByPlainKey(key);
      if (!row) {
        throw new UnauthorizedException('API key nest-api no válida o revocada.');
      }
      return { apiKeyId: row.id, scopes: row.scopes };
    }

    if (this.envBool('NEST_AUTH_STRICT_APIKEY')) {
      await this.channels.assertApiKeyRegistered(key);
    } else {
      await this.channels.resolveChannel(key);
    }

    return { apiKeyId: LEGACY_KEY_ID, scopes: ['*'] };
  }

  private async buildTokenPair(session: NestAuthSession): Promise<TokenPairResponse> {
    const access_token = this.issueAccessTokenForSession(session);
    const refresh_token = await this.store.issueRefreshToken(
      session.id,
      this.refreshTtlMs(),
    );
    return {
      access_token,
      refresh_token,
      token_type: 'Bearer',
      expires_in: this.accessTtlSec(),
    };
  }
}
