import { Module } from '@nestjs/common';
import { PersonasModule } from '../personas/personas.module';
import { ValrepModule } from '../valrep/valrep.module';
import { ViajeroNacionalController } from './viajero-nacional.controller';
import { ViajeroMargaritaController } from './viajero-margarita.controller';
import { ViajeroNacionalService } from './viajero-nacional.service';

@Module({
  imports: [ValrepModule, PersonasModule],
  controllers: [ViajeroNacionalController, ViajeroMargaritaController],
  providers: [ViajeroNacionalService],
})
export class ViajeroNacionalModule {}
