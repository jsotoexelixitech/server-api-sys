import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ConfiguradorController } from './configurador.controller';
import { ConfiguradorService } from './configurador.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ConfiguradorController],
  providers: [ConfiguradorService],
})
export class ConfiguradorModule {}
