import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RecibosModule } from '../recibos/recibos.module';
import {
  DynamicSchemasAdminController,
  DynamicSchemasController,
} from './dynamic-schemas.controller';
import { DynamicSchemasService } from './dynamic-schemas.service';
import { GeminiService } from './insights/gemini.service';
import { SiniestrosIaService } from './insights/siniestros-ia.service';

@Module({
  imports: [ConfigModule, forwardRef(() => RecibosModule)],
  controllers: [DynamicSchemasController, DynamicSchemasAdminController],
  providers: [DynamicSchemasService, GeminiService, SiniestrosIaService],
  exports: [DynamicSchemasService, GeminiService, SiniestrosIaService],
})
export class DynamicSchemasModule {}
