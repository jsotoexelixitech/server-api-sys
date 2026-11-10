import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ConfiguradorController } from './configurador.controller';
import { ConfiguradorService } from './configurador.service';
import { ConfiguradorCobroDiasController } from './configurador-cobro-dias.controller';
import { ConfiguradorCobroDiasService } from './configurador-cobro-dias.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ConfiguradorController, ConfiguradorCobroDiasController],
  providers: [ConfiguradorService, ConfiguradorCobroDiasService],
})
export class ConfiguradorModule {}
