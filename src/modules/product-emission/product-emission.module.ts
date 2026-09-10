import { Module } from '@nestjs/common';
import { ProductBuilderClient } from './clients/product-builder.client';
import { PolicyDocumentService } from './policy-document.service';
import { ProductEmissionPrismaModule } from './prisma/product-emission-prisma.module';
import { ProductEmissionController } from './product-emission.controller';
import { ProductEmissionService } from './product-emission.service';

/**
 * Módulo NUEVO y AISLADO: emisión genérica multi-ramo usando el catálogo
 * (ramo/plan/coberturas) creado en proyecto-product-builder.
 *
 * Ambiente completamente separado de La Mundial:
 *   - No importa DatabaseModule (mssql/Sis2000) ni ningún módulo de La Mundial.
 *   - No usa PrismaModule/PrismaService de auth (nest_auth) — tiene su propio
 *     ProductEmissionPrismaModule con BD y cliente Prisma propios.
 *   - Solo consume proyecto-product-builder por HTTP (lectura del catálogo).
 */
@Module({
  imports: [ProductEmissionPrismaModule],
  controllers: [ProductEmissionController],
  providers: [
    ProductEmissionService,
    ProductBuilderClient,
    PolicyDocumentService,
  ],
})
export class ProductEmissionModule {}
