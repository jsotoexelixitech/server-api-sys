import { Module } from '@nestjs/common';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';
import { SiniestrosRegistroController } from './siniestros-registro.controller';
import { SiniestrosRegistroService } from './siniestros-registro.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ClientController, SiniestrosRegistroController],
  providers: [ClientService, SiniestrosRegistroService],
})
export class ClientModule {}
