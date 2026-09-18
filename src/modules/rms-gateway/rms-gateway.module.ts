import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RmsGatewayClient } from './rms-gateway.client';
import { RmsGatewayService } from './rms-gateway.service';
import { RmsSyncController } from './rms-sync.controller';
import { RmsSyncService } from './rms-sync.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RmsSyncController],
  providers: [RmsGatewayClient, RmsGatewayService, RmsSyncService],
  exports: [RmsGatewayService, RmsGatewayClient, RmsSyncService],
})
export class RmsGatewayModule {}
