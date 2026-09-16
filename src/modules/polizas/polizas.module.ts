import { Module, forwardRef } from '@nestjs/common';
import { DynamicSchemasModule } from '../dynamic-schemas/dynamic-schemas.module';
import { ReportesSyncModule } from '../reportes-sync/reportes-sync.module';
import { PolizasController } from './polizas.controller';
import { PolizasService } from './polizas.service';

@Module({
  imports: [
    forwardRef(() => DynamicSchemasModule),
    ReportesSyncModule,
  ],
  controllers: [PolizasController],
  providers: [PolizasService],
  exports: [PolizasService],
})
export class PolizasModule {}
