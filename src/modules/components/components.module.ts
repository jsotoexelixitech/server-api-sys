import { Module, forwardRef } from '@nestjs/common';
import { DynamicSchemasModule } from '../dynamic-schemas/dynamic-schemas.module';
import { ReportesSyncModule } from '../reportes-sync/reportes-sync.module';
import { RecibosModule } from '../recibos/recibos.module';
import { SiniestrosModule } from '../siniestros/siniestros.module';
import { PolizasModule } from '../polizas/polizas.module';
import { ComponentsController } from './components.controller';
import { ComponentsService } from './components.service';

@Module({
  imports: [
    forwardRef(() => DynamicSchemasModule),
    ReportesSyncModule,
    forwardRef(() => RecibosModule),
    forwardRef(() => SiniestrosModule),
    forwardRef(() => PolizasModule),
  ],
  controllers: [ComponentsController],
  providers: [ComponentsService],
  exports: [ComponentsService],
})
export class ComponentsModule {}
