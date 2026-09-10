import { Module } from '@nestjs/common';
import { ProductEmissionPrismaService } from './product-emission-prisma.service';

/**
 * Módulo Prisma AISLADO (no @Global, a diferencia de PrismaModule de auth).
 * Solo lo usa ProductEmissionModule; ningún otro módulo de nest-api depende de este.
 */
@Module({
  providers: [ProductEmissionPrismaService],
  exports: [ProductEmissionPrismaService],
})
export class ProductEmissionPrismaModule {}
