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

@Module({
  imports: [DatabaseModule],
  controllers: [ConfiguradorController, ConfiguradorCobroDiasController, ConfiguradorPlanFase1Controller],
  providers: [
    ConfiguradorService, ConfiguradorCobroDiasService, ConfiguradorComisionesService, ConfiguradorAutoService, ConfiguradorRevisionService,
  ],
})
export class ConfiguradorModule {}
