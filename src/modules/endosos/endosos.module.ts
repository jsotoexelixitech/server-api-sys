import { Module } from '@nestjs/common';
import { EndososController } from './endosos.controller';
import { EndosoRecibosController } from './endoso-recibos.controller';
import { EndososService } from './endosos.service';
import { EndososCoreController } from './core/endosos-core.controller';
import { EndososCoreService } from './core/endosos-core.service';
import { DatabaseModule } from '../../database/database.module';
import { ValrepModule } from '../valrep/valrep.module';

@Module({
  imports: [DatabaseModule, ValrepModule],
  controllers: [EndososController, EndosoRecibosController, EndososCoreController],
  providers: [EndososService, EndososCoreService],
  exports: [EndososService],
})
export class EndososModule {}
