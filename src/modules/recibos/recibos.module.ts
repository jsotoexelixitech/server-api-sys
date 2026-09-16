import { Module, forwardRef } from '@nestjs/common';
import { DynamicSchemasModule } from '../dynamic-schemas/dynamic-schemas.module';
import {
  RECIBOS_EXECUTE,
  type RecibosExecuteFn,
} from '../dynamic-schemas/recibos-execute.token';
import { ReportesSyncModule } from '../reportes-sync/reportes-sync.module';
import { RecibosController } from './recibos.controller';
import { RecibosService } from './recibos.service';

@Module({
  imports: [
    forwardRef(() => DynamicSchemasModule),
    ReportesSyncModule,
  ],
  controllers: [RecibosController],
  providers: [
    RecibosService,
    {
      provide: RECIBOS_EXECUTE,
      useFactory: (recibos: RecibosService): RecibosExecuteFn => {
        return (body, user, headers) => recibos.execute(body, user, headers);
      },
      inject: [RecibosService],
    },
  ],
  exports: [RecibosService, RECIBOS_EXECUTE],
})
export class RecibosModule {}
