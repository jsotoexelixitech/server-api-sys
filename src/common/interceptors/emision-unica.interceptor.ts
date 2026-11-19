import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

/**
 * Una sola emisión a la vez por los mismos datos (placa o persona + ramo + plan).
 *
 * Caso real (19-nov-2026, producción): Sis2000 tardó más de 30 s, Emisión cortó y el usuario reintentó tres veces;
 * nest-api siguió esperando cada intento (hasta 300 s) y salieron tres pólizas para la placa AB104SN. El SP valida
 * «póliza vigente con la misma placa», pero las emisiones simultáneas no se ven entre sí hasta confirmar.
 *
 * Mientras una emisión con la misma clave esté en curso, la siguiente responde 409 sin llegar al SP. La clave se
 * libera cuando la primera termina (bien o con error), aunque el cliente ya haya cortado la conexión. nest-api corre en
 * un solo proceso (PM2 fork), así que el registro en memoria basta.
 */
const EN_CURSO = new Map<string, number>();
/** Si una emisión quedara colgada, su clave deja de bloquear pasado este tiempo. */
const VENCE_MS = 15 * 60 * 1000;

const limpio = (v: unknown): string =>
  String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Documento de una persona dada como objeto (tomador / titular de las APIs nuevas). */
const documentoDe = (p: Record<string, unknown>): string =>
  limpio(p.rif ?? p.xrif ?? p.cedula ?? p.identificacion ?? p.documento ?? p.cid ?? p.cci_rif);

/** Clave de la emisión, o null si el cuerpo no trae con qué identificarla (entonces no se bloquea). */
export function claveEmision(body: unknown): string | null {
  const b = objeto(body);
  const vehiculo = objeto(b.vehicle ?? b.vehiculo);
  const placa = limpio(b.xplaca ?? b.placa ?? vehiculo.placa ?? vehiculo.xplaca);
  if (placa) return `placa:${placa}`;

  const aseg0 = objeto(Array.isArray(b.asegurados) ? b.asegurados[0] : undefined);
  const persona =
    limpio(b.rif_titular ?? b.cedula_titular) ||
    documentoDe(objeto(b.titular)) ||
    limpio(b.rif_asegurado ?? b.xrif_asegurado ?? aseg0.xrif_asegurado) ||
    limpio(b.rif_tomador ?? b.cedula_tomador) ||
    documentoDe(objeto(b.tomador));
  if (!persona) return null;
  const producto = limpio(b.cramo ?? b.ramo) + '-' + limpio(b.plan ?? b.cplan ?? b.productId ?? b.producto);
  return `persona:${persona}:${producto}`;
}

const describir = (clave: string): string =>
  clave.startsWith('placa:') ? `la placa ${clave.slice(6)}` : 'los mismos datos (persona y plan)';

@Injectable()
export class EmisionUnicaInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ body?: unknown }>();
    const clave = claveEmision(req?.body);
    if (!clave) return next.handle();

    const desde = EN_CURSO.get(clave);
    if (desde !== undefined && Date.now() - desde < VENCE_MS) {
      throw new ConflictException(
        `Ya hay una emisión en proceso con ${describir(clave)}. Espera el resultado antes de volver a intentar.`,
      );
    }
    const marca = Date.now();
    EN_CURSO.set(clave, marca);
    return next.handle().pipe(
      finalize(() => {
        if (EN_CURSO.get(clave) === marca) EN_CURSO.delete(clave);
      }),
    );
  }
}

/** Solo para pruebas. */
export const _emisionesEnCurso = EN_CURSO;
