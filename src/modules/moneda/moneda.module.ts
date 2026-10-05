import { Module } from '@nestjs/common';
import { MonedaController } from './moneda.controller';
import { MonedaService } from './moneda.service';
import { BcvRateRepository } from './repositories/bcv-rate.repository';

@Module({
  controllers: [MonedaController],
  providers: [MonedaService, BcvRateRepository],
  exports: [MonedaService],
})
export class MonedaModule {}
