import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { NEST_SCOPE_KEY } from './decorators/nest-scope.decorator';
import { NestAuthService } from './nest-auth.service';
import { grantMatchesRoute } from './scopes/nest-auth-scopes.constants';
import { bindNestRequestAuth } from './nest-request-auth.context';

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

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredScope = this.reflector.getAllAndOverride<string>(
      NEST_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const req = context.switchToHttp().getRequest<Request>();

    if (!this.auth.isEnabled()) {
      const apikey = String(req.headers['apikey'] ?? '').trim();
      req.nestAuth = { apikey, scopes: ['*'], via: apikey ? 'apikey' : 'none' };
      bindNestRequestAuth(req.nestAuth);
      return true;
    }

    const bearer = extractBearer(req);
    if (bearer) {
      const payload = this.auth.verifyAccessToken(bearer);
      const session = await this.auth.getSession(payload.sub);
      if (!session) {
        throw new UnauthorizedException('Sesión nest-api inválida o expirada.');
      }
      req.nestAuth = {
        apikey: session.apikey,
        apiKeyId: session.apiKeyId,
        scopes: session.scopes,
        xcanalVenta: session.xcanalVenta ?? null,
        sessionId: session.id,
        via: 'bearer',
      };
      const exp = this.auth.decodeExp(bearer);
      if (this.auth.shouldSlideRefresh(exp)) {
        req.nestAuth.refreshedAccessToken =
          this.auth.issueAccessTokenForSession(session);
      }
      bindNestRequestAuth(req.nestAuth);
      this.assertScope(req, req.nestAuth.scopes, requiredScope);
      return true;
    }

    const apikey = String(req.headers['apikey'] ?? '').trim();
    if (apikey) {
      const resolved = await this.auth.resolveApiKeyForRequest(apikey);
      req.nestAuth = {
        apikey,
        apiKeyId: resolved.apiKeyId,
        scopes: resolved.scopes,
        xcanalVenta: resolved.xcanalVenta ?? null,
        via: 'apikey',
      };
      bindNestRequestAuth(req.nestAuth);
      this.assertScope(req, resolved.scopes, requiredScope);
      return true;
    }

    throw new UnauthorizedException(
      'Autenticación requerida: Authorization Bearer o header apikey.',
    );
  }

  private assertScope(req: Request, granted: string[], required?: string): void {
    if (!required) return;
    const path = req.originalUrl?.split('?')[0] ?? req.path;
    if (grantMatchesRoute(granted, req.method, path, required)) return;
    throw new ForbiddenException(
      `Permiso requerido: ${required}. Key no autorizada para este endpoint.`,
    );
  }
}
