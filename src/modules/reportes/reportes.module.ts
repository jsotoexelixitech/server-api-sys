import { Module } from '@nestjs/common';
import { ReportesSyncModule } from '../reportes-sync/reportes-sync.module';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

@Module({
  imports: [ReportesSyncModule],
  controllers: [ReportesController],
  providers: [ReportesService],
  exports: [ReportesService],
})
export class ReportesModule {}
