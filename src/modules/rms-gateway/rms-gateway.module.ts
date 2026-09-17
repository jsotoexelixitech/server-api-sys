import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RmsGatewayClient } from './rms-gateway.client';
import { RmsGatewayService } from './rms-gateway.service';

@Module({
  imports: [DatabaseModule],
  providers: [RmsGatewayClient, RmsGatewayService],
  exports: [RmsGatewayService, RmsGatewayClient],
})
export class RmsGatewayModule {}
