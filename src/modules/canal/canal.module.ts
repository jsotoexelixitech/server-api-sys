import { Module } from '@nestjs/common';
import { ValrepModule } from '../valrep/valrep.module';
import { CanalEmisorController } from './canal-emisor.controller';
import { CanalEmisorService } from './canal-emisor.service';
import { CanalController } from './canal.controller';
import { CanalService } from './canal.service';

@Module({
  imports: [ValrepModule],
  controllers: [CanalController, CanalEmisorController],
  providers: [CanalService, CanalEmisorService],
  exports: [CanalService],
})
export class CanalModule {}
