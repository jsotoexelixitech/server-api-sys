import { Module } from '@nestjs/common';
import { ArysClient } from './arys.client';
import { ArysMembershipConfigService } from './arys-membership-config.service';
import { ArysMembershipJobService } from './arys-membership-job.service';
import { ArysRetryScheduler } from './arys-retry.scheduler';
import { ArysController } from './arys.controller';
import { ArysRepository } from './arys.repository';
import { ArysService } from './arys.service';

@Module({
  controllers: [ArysController],
  providers: [ArysClient, ArysRepository, ArysMembershipConfigService, ArysMembershipJobService, ArysService, ArysRetryScheduler],
  exports: [ArysService, ArysClient],
})
export class ArysModule {}
