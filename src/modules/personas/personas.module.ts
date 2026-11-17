import { Module, forwardRef } from '@nestjs/common';
import { PersonasController } from './personas.controller';
import { PersonasService } from './personas.service';
import { EmisionColectivoService } from './emision-colectivo.service';
import { DatabaseModule } from '../../database/database.module';
import { ValrepModule } from '../valrep/valrep.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => ValrepModule)],
  controllers: [PersonasController],
  providers: [PersonasService, EmisionColectivoService],
  exports: [PersonasService],
})
export class PersonasModule {}
