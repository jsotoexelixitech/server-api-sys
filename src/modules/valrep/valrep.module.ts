import { Module } from '@nestjs/common';
import { ValrepController } from './valrep.controller';
import { ValrepService } from './valrep.service';

@Module({
  controllers: [ValrepController],
  providers: [ValrepService],
})
export class ValrepModule {}
