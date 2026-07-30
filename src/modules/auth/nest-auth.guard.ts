import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { NestAuthService } from './nest-auth.service';

function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || typeof auth !== 'string') return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

@Injectable()
export class NestAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: NestAuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();

    if (!this.auth.isEnabled()) {
      const apikey = String(req.headers['apikey'] ?? '').trim();
      req.nestAuth = { apikey, via: apikey ? 'apikey' : 'none' };
      return true;
    }

    const bearer = extractBearer(req);
    if (bearer) {
      const payload = this.auth.verifyAccessToken(bearer);
      const session = this.auth.getSession(payload.sub);
      if (!session) {
        throw new UnauthorizedException('Sesión nest-api inválida o expirada.');
      }
      req.nestAuth = {
        apikey: session.apikey,
        sessionId: session.id,
        via: 'bearer',
      };
      const exp = this.auth.decodeExp(bearer);
      if (this.auth.shouldSlideRefresh(exp)) {
        req.nestAuth.refreshedAccessToken =
          this.auth.issueAccessTokenForSession(session);
      }
      return true;
    }

    const apikey = String(req.headers['apikey'] ?? '').trim();
    if (apikey) {
      req.nestAuth = { apikey, via: 'apikey' };
      return true;
    }

    throw new UnauthorizedException(
      'Autenticación requerida: Authorization Bearer o header apikey.',
    );
  }
}
