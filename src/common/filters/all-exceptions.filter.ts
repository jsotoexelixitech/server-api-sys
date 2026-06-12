import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Captura TODOS los errores y devuelve una respuesta JSON uniforme.
 * Nunca expone stack traces, mensajes de SQL ni información interna al cliente.
 * Los errores internos (5xx) se loguean completos en el servidor.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;

    let statusCode = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // ── Extraer mensaje limpio (nunca SQL ni stack) ───────────────────────────
    let message: string | string[];

    if (isHttp) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else {
        const p = payload as Record<string, unknown>;
        // ValidationPipe genera { message: string[] }; HttpException propios { message: string }
        message = (p.message as string | string[]) ?? 'Error en la solicitud.';
      }
    } else if (
      exception &&
      typeof exception === 'object' &&
      ('code' in exception || 'name' in exception) &&
      ((exception as Record<string, unknown>)['code'] === 'EREQUEST' || (exception as Record<string, unknown>)['name'] === 'RequestError')
    ) {
      // Error de negocio arrojado por un Trigger/SP (THROW 99001, '...', 1)
      const sqlError = exception as Error;
      // Usamos el status 400 (Bad Request) ya que es un error de regla de negocio
      statusCode = HttpStatus.BAD_REQUEST;
      message = sqlError.message || 'Error de validación de base de datos.';
    } else {
      // Error NO-HTTP: bug, timeout de red, etc. — nunca filtrar info interna
      message = 'Ha ocurrido un error inesperado en el servidor.';
    }

    // ── Logging interno (completo, sin censura — solo llega al servidor) ─────
    if (statusCode >= 500) {
      this.logger.error(
        `[${statusCode}] ${req.method} ${req.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`[${statusCode}] ${req.method} ${req.url}`);
    }

    // ── Respuesta al cliente — formato consistente en toda la API ────────────
    res.status(statusCode).json({
      status:    false,
      statusCode,
      message,
      path:      req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
