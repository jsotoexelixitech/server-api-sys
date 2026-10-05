import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Chequeo de vida para el monitor y balanceadores: GET /api/health.
 * Sin autenticación y sin tocar BD (no depende de nada externo). Está exento del bloqueo del monitor
 * (MonitorSecurityGuard) y del observador de seguridad.
 */
@ApiExcludeController()
@Controller('health')
@Public()
@SkipEnvelope()
export class HealthController {
  @Get()
  health() {
    return { status: 'ok', uptimeSec: Math.floor(process.uptime()) };
  }
}
