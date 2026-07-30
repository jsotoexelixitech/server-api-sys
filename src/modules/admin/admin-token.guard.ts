import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('NEST_ADMIN_TOKEN')?.trim();
    if (!expected) {
      throw new UnauthorizedException(
        'NEST_ADMIN_TOKEN no configurado en el servidor.',
      );
    }

    const req = context.switchToHttp().getRequest<Request>();
    const header = String(req.headers['x-admin-token'] ?? '').trim();
    if (!header || header !== expected) {
      throw new UnauthorizedException('Token de administración inválido.');
    }
    return true;
  }
}
