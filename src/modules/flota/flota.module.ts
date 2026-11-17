import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { FlotaController } from './flota.controller';
import { FlotaService } from './flota.service';

/** Póliza de flota con recibo por viaje sobre el certificado del conductor (Ridery). */
@Module({
  imports: [DatabaseModule],
  controllers: [FlotaController],
  providers: [FlotaService],
  exports: [FlotaService],
})
export class FlotaModule {}
