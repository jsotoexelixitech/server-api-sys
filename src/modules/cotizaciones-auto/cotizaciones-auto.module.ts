import { Module } from '@nestjs/common';
import { CotizacionesAutoController } from './cotizaciones-auto.controller';
import { CotizacionesAutoRepository } from './cotizaciones-auto.repository';
import { CotizacionesAutoService } from './cotizaciones-auto.service';
import { CotizacionesAutoSource } from './cotizaciones-auto.source';

/** Cotizaciones de automóvil de SysIP para emitir RCV desde Emisión (flujo SSO con cotizacionID). */
@Module({
  controllers: [CotizacionesAutoController],
  providers: [CotizacionesAutoRepository, CotizacionesAutoSource, CotizacionesAutoService],
})
export class CotizacionesAutoModule {}
