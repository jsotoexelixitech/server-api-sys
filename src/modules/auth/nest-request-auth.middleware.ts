import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { nestRequestAuthAls } from './nest-request-auth.context';

/**
 * Abre AsyncLocalStorage para todo el ciclo del request (guard → pipes → controller).
 * El NestAuthGuard escribe el auth en la bolsa; PartnerHost lo lee en getConfig.
 */
@Injectable()
export class NestRequestAuthMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction): void {
    nestRequestAuthAls.run({}, () => next());
  }
}
