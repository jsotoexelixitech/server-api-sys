import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ValrepModule } from '../valrep/valrep.module';
import { RenovacionController } from './renovacion.controller';
import { RenovacionService } from './renovacion.service';

@Module({
  imports: [DatabaseModule, ValrepModule],
  controllers: [RenovacionController],
  providers: [RenovacionService],
})
export class RenovacionModule {}
