import { Module } from '@nestjs/common';
import { ValrepController } from './valrep.controller';
import { ValrepService } from './valrep.service';
import { ValrepCanalService } from './valrep-canal.service';

import { PersonasModule } from '../personas/personas.module';

@Module({
  imports: [PersonasModule],
  controllers: [ValrepController],
  providers: [ValrepService, ValrepCanalService],
})
export class ValrepModule {}
