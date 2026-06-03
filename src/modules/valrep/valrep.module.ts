import { Module } from '@nestjs/common';
import { ValrepController } from './valrep.controller';
import { ValrepService } from './valrep.service';

import { PersonasModule } from '../personas/personas.module';

@Module({
  imports: [PersonasModule],
  controllers: [ValrepController],
  providers: [ValrepService],
})
export class ValrepModule {}
