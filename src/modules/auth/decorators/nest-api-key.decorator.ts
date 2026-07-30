import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** apikey resuelta por NestAuthGuard (Bearer → sesión o header apikey). */
export const NestApiKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest();
    return String(req.nestAuth?.apikey ?? req.headers['apikey'] ?? '').trim();
  },
);
