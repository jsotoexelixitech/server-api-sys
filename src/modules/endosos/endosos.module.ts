import { Module } from '@nestjs/common';
import { EndososController } from './endosos.controller';
import { EndosoRecibosController } from './endoso-recibos.controller';
import { EndososService } from './endosos.service';
import { EndososCoreController } from './core/endosos-core.controller';
import { EndososCoreService } from './core/endosos-core.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [EndososController, EndosoRecibosController, EndososCoreController],
  providers: [EndososService, EndososCoreService],
  exports: [EndososService],
})
export class EndososModule {}
