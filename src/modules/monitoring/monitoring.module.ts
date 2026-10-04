import { Module } from '@nestjs/common';
import { ArysModule } from '../arys/arys.module';
import { MonitorIngestService } from './monitor-ingest.service';
import { MonitorSecurityObserver } from './monitor-security-observer';

/**
 * Conexión de la API con Exelixi Monitor: errores 5xx y observación de seguridad (dry-run).
 * Su configuración (url, token, interruptores) vive en BD, en arys_membership_config.
 */
@Module({
  imports: [ArysModule],
  providers: [MonitorIngestService, MonitorSecurityObserver],
  exports: [MonitorIngestService, MonitorSecurityObserver],
})
export class MonitoringModule {}
