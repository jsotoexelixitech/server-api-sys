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
 * Re-abre el ALS alrededor del handler y expone el canal en process.env.CANAL_VENTA
 * durante el request (compat con partners que leen env o un host propio).
 *
 * Nota: process.env es global; con requests concurrentes de canales distintos hay carrera.
 * El camino correcto a medio plazo es que el partner use solo host.getConfig + ALS.
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
      const canal = auth.xcanalVenta?.trim();
      const prevCanal = process.env.CANAL_VENTA;
      let restored = false;
      const restore = () => {
        if (restored) return;
        restored = true;
        if (prevCanal === undefined) delete process.env.CANAL_VENTA;
        else process.env.CANAL_VENTA = prevCanal;
      };

      if (canal) {
        process.env.CANAL_VENTA = canal;
      }

      nestRequestAuthAls.run(bag, () => {
        const sub = next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => {
            restore();
            subscriber.error(err);
          },
          complete: () => {
            restore();
            subscriber.complete();
          },
        });
        subscriber.add(() => {
          restore();
          sub.unsubscribe();
        });
      });
    });
  }
}
