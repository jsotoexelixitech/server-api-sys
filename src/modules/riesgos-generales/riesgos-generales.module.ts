import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RiesgosGeneralesController } from './riesgos-generales.controller';
import { RiesgosGeneralesService } from './riesgos-generales.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RiesgosGeneralesController],
  providers: [RiesgosGeneralesService],
})
export class RiesgosGeneralesModule {}
