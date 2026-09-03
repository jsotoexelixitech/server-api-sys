import { Module } from '@nestjs/common';
import { ArysClient } from './arys.client';
import { ArysController } from './arys.controller';
import { ArysRepository } from './arys.repository';
import { ArysService } from './arys.service';

@Module({
  controllers: [ArysController],
  providers: [ArysClient, ArysRepository, ArysService],
  exports: [ArysService, ArysClient],
})
export class ArysModule {}
