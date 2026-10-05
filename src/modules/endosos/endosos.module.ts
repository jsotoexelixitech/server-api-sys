import { Module } from '@nestjs/common';
import { EndososController } from './endosos.controller';
import { EndosoRecibosController } from './endoso-recibos.controller';
import { EndososService } from './endosos.service';
import { DatabaseModule } from '../../database/database.module';
import { RmsGatewayModule } from '../rms-gateway/rms-gateway.module';

@Module({
  imports: [DatabaseModule, RmsGatewayModule],
  controllers: [EndososController, EndosoRecibosController],
  providers: [EndososService],
  exports: [EndososService],
})
export class EndososModule {}
