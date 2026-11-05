import { Module } from '@nestjs/common';
import { ArysModule } from '../arys/arys.module';
import { MonedaController } from './moneda.controller';
import { MonedaService } from './moneda.service';
import { BcvRateRepository } from './repositories/bcv-rate.repository';
import { TasaMonedaWatchService } from './tasa-moneda-watch.service';

@Module({
  imports: [ArysModule],
  controllers: [MonedaController],
  providers: [MonedaService, BcvRateRepository, TasaMonedaWatchService],
  exports: [MonedaService],
})
export class MonedaModule {}
