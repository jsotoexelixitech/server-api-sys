import { Module, forwardRef } from '@nestjs/common';
import { ValrepController } from './valrep.controller';
import { ValrepService } from './valrep.service';
import { MausuplanRepository } from './repositories/mausuplan.repository';

import { PersonasModule } from '../personas/personas.module';

@Module({
  imports: [forwardRef(() => PersonasModule)],
  controllers: [ValrepController],
  providers: [ValrepService, MausuplanRepository],
  exports: [ValrepService],
})
export class ValrepModule {}
