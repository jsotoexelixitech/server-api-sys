import { Module } from '@nestjs/common';
import { DgbossCatalogosService } from './dgboss-catalogos.service';
import { DgbossClientService } from './dgboss-client.service';

@Module({
  providers: [DgbossClientService, DgbossCatalogosService],
  exports: [DgbossClientService, DgbossCatalogosService],
})
export class DgbossIntegracionModule {}
