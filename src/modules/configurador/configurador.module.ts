import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ConfiguradorController } from './configurador.controller';
import { ConfiguradorService } from './configurador.service';
import { ConfiguradorCobroDiasController } from './configurador-cobro-dias.controller';
import { ConfiguradorCobroDiasService } from './configurador-cobro-dias.service';
import { ConfiguradorPlanFase1Controller } from './configurador-plan-fase1.controller';
import { ConfiguradorComisionesService } from './configurador-comisiones.service';
import { ConfiguradorAutoService } from './configurador-auto.service';
import { ConfiguradorRevisionService } from './configurador-revision.service';
import { ConfiguradorFase2Controller } from './configurador-fase2.controller';
import { ConfiguradorPatrimonialService } from './configurador-patrimonial.service';
import { ConfiguradorTarifaDiasService } from './configurador-tarifa-dias.service';
import { ConfiguradorTasaCascoService } from './configurador-tasa-casco.service';
import { CONTROLLERS_FASE2_EDICION, PROVIDERS_FASE2_EDICION } from './configurador-fase2-edicion.registro';

@Module({
  imports: [DatabaseModule],
  controllers: [
    ConfiguradorController, ConfiguradorCobroDiasController, ConfiguradorPlanFase1Controller,
    ConfiguradorFase2Controller, ...CONTROLLERS_FASE2_EDICION,
  ],
  providers: [
    ConfiguradorService, ConfiguradorCobroDiasService, ConfiguradorComisionesService, ConfiguradorAutoService, ConfiguradorRevisionService,
    ConfiguradorPatrimonialService, ConfiguradorTarifaDiasService, ConfiguradorTasaCascoService,
    ...PROVIDERS_FASE2_EDICION,
  ],
})
export class ConfiguradorModule {}
