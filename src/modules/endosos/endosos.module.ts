import { Module } from '@nestjs/common';
import { EndososController } from './endosos.controller';
import { EndosoRecibosController } from './endoso-recibos.controller';
import { EndososService } from './endosos.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [EndososController, EndosoRecibosController],
  providers: [EndososService],
  exports: [EndososService],
})
export class EndososModule {}
