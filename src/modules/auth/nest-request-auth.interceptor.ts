import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import {
  NestRequestAuthBag,
  nestRequestAuthAls,
} from './nest-request-auth.context';

/**
 * Re-abre el ALS alrededor del handler (pipes → controller → partner).
 * Garantiza que getConfig('CANAL_VENTA') vea req.nestAuth.xcanalVenta.
 */
@Injectable()
export class NestRequestAuthInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.nestAuth;
    if (!auth) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      const bag: NestRequestAuthBag = { auth };
      nestRequestAuthAls.run(bag, () => {
        const sub = next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
        subscriber.add(() => sub.unsubscribe());
      });
    });
  }
}
