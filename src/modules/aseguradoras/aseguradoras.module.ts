import { Module } from '@nestjs/common';
import { ReportesSyncModule } from '../reportes-sync/reportes-sync.module';
import { AseguradorasController } from './aseguradoras.controller';
import { AseguradorasRepository } from './aseguradoras.repository';
import { AseguradorasService } from './aseguradoras.service';

@Module({
  imports: [ReportesSyncModule],
  controllers: [AseguradorasController],
  providers: [AseguradorasRepository, AseguradorasService],
  exports: [AseguradorasService],
})
export class AseguradorasModule {}
