import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ExpedientesApiController } from './expedientes-api.controller';
import { ExpedientesApiService } from './expedientes-api.service';
import { ExpedientesRegistroInterceptor } from './expedientes-registro.interceptor';

/**
 * API de documentos del expediente para integradores (Pastora, Viajero y los que vengan):
 * GET /api/v1/expedientes/{cnpoliza} y POST /api/v1/expedientes/{cnpoliza}/documentos, reenviados al
 * monitor de expedientes de Nexus. Registra además en Nexus las pólizas emitidas por esas APIs.
 * ApiChannelService llega del AuthModule (global).
 */
@Module({
  controllers: [ExpedientesApiController],
  providers: [
    ExpedientesApiService,
    { provide: APP_INTERCEPTOR, useClass: ExpedientesRegistroInterceptor },
  ],
})
export class ExpedientesApiModule {}
