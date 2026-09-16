import { Global, Module } from '@nestjs/common';
import { MssqlService } from './mssql.service';
import { ReportesPgService } from './reportes-pg.service';

@Global()
@Module({
  providers: [MssqlService, ReportesPgService],
  exports: [MssqlService, ReportesPgService],
})
export class DatabaseModule {}
