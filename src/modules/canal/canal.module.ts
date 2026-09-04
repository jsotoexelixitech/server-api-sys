import { Module } from '@nestjs/common';
import { ValrepModule } from '../valrep/valrep.module';
import { CanalController } from './canal.controller';
import { CanalService } from './canal.service';

@Module({
  imports: [ValrepModule],
  controllers: [CanalController],
  providers: [CanalService],
  exports: [CanalService],
})
export class CanalModule {}
