import { Module, forwardRef } from '@nestjs/common';
import { DynamicSchemasModule } from '../dynamic-schemas/dynamic-schemas.module';
import { ReportesSyncModule } from '../reportes-sync/reportes-sync.module';
import { SiniestrosController } from './siniestros.controller';
import { SiniestrosService } from './siniestros.service';

@Module({
  imports: [
    forwardRef(() => DynamicSchemasModule),
    ReportesSyncModule,
  ],
  controllers: [SiniestrosController],
  providers: [SiniestrosService],
  exports: [SiniestrosService],
})
export class SiniestrosModule {}
