import { Module } from '@nestjs/common';
import { InmaController } from './inma.controller';
import { InmaService } from './inma.service';

@Module({
  controllers: [InmaController],
  providers: [InmaService],
})
export class InmaModule {}
