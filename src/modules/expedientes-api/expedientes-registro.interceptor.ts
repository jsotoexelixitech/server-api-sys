import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { ExpedientesApiService } from './expedientes-api.service';
import { registroDesdeEmision, rutaDeHandler, RUTAS_EMISION_INTEGRACION } from './expedientes-api.rules';

/**
 * Registro en el monitor de expedientes de Nexus de las pólizas emitidas por las APIs de integración
 * (Pastora: POST /v1/riesgos-generales/emision ramo 25; Viajero: POST /v1/viajero-3-dias|7-dias/emision).
 * Aditivo: mira la respuesta exitosa y avisa a Nexus en segundo plano; nunca cambia ni demora la
 * emisión. Si el módulo de la ruta no existe en este despliegue, no hace nada.
 */
@Injectable()
export class ExpedientesRegistroInterceptor implements NestInterceptor {
  constructor(private readonly svc: ExpedientesApiService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    if (req?.method !== 'POST') return next.handle();
    const ruta = rutaDeHandler(
      Reflect.getMetadata(PATH_METADATA, context.getClass()),
      Reflect.getMetadata(PATH_METADATA, context.getHandler()),
    );
    const destino = RUTAS_EMISION_INTEGRACION[ruta];
    if (!destino) return next.handle();
    return next.handle().pipe(
      tap((respuesta) => {
        try {
          const registro = registroDesdeEmision(destino.producto, req.body, respuesta, destino.cplan);
          if (registro) void this.svc.registrarEmision(req.nestAuth, registro);
        } catch {
          // El registro en el monitor nunca afecta la emisión.
        }
      }),
    );
  }
}
