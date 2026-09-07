import { Module } from '@nestjs/common';
import { EmissionsController } from './emissions.controller';
import { EmissionsService } from './emissions.service';
import { DatabaseModule } from '../../database/database.module';
import { ArysModule } from '../arys/arys.module';

@Module({
  imports: [DatabaseModule, ArysModule],
  controllers: [EmissionsController],
  providers: [EmissionsService],
})
export class EmissionsModule {}
