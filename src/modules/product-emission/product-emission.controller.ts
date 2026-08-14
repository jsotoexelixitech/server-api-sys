import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiExcludeEndpoint,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { resolvePublicApiPaths } from '../../common/config/public-path';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { Public } from '../auth/decorators/public.decorator';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { EmitGenericPolicyDto } from './dto/emit-generic-policy.dto';
import { QuoteGenericPolicyDto } from './dto/quote-generic-policy.dto';
import { ProductEmissionService } from './product-emission.service';

/**
 * Flujo NUEVO y AISLADO de emisión genérica multi-ramo.
 * Fuente del catálogo (ramo/plan/coberturas): API de proyecto-product-builder.
 * No toca ni depende de los módulos activos de La Mundial (emissions/personas/
 * collection/external) ni de Sis2000.
 */
@ApiTags(SWAGGER_TAGS.PRODUCT_EMISSION)
@Controller('v1/product-emission')
export class ProductEmissionController {
  private readonly logger = new Logger(ProductEmissionController.name);

  constructor(
    private readonly service: ProductEmissionService,
    private readonly config: ConfigService,
  ) {}

  @Post('quote')
  @NestProtected(NEST_AUTH_SCOPES.PRODUCT_EMISSION_WRITE)
  @ApiHeader({ name: 'apikey', required: false })
  @ApiOperation({
    summary: 'Cotizar en base a un producto/ramo de product-builder',
    description:
      'Consulta el catálogo (producto, plan, coberturas) en proyecto-product-builder y calcula la prima. No persiste nada.',
  })
  quote(@Body() dto: QuoteGenericPolicyDto) {
    return this.service.quote(dto);
  }

  @Post('validate')
  @NestProtected(NEST_AUTH_SCOPES.PRODUCT_EMISSION_WRITE)
  @ApiHeader({ name: 'apikey', required: false })
  @ApiOperation({
    summary: 'Validar que el producto/plan puede emitirse',
  })
  validate(@Body() dto: QuoteGenericPolicyDto) {
    return this.service.validate(dto);
  }

  @Post('emit')
  @NestProtected(NEST_AUTH_SCOPES.PRODUCT_EMISSION_WRITE)
  @ApiHeader({ name: 'apikey', required: false })
  @ApiOperation({
    summary: 'Emitir póliza genérica (ramo de product-builder)',
    description:
      'Genera el cuadro-póliza (.pdf) llenando la plantilla real del certificado con los datos del payload, ' +
      'lo guarda en disco y persiste la póliza en la BD aislada (schema product_emission). ' +
      'Devuelve URL pública HTTPS.',
  })
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        persisted: true,
        numeroPoliza: 'RCV-2026-00000001',
        ramoPoliza: 'RCV',
        productName: 'RCV Obligatorio 2026',
        planName: 'Plan RCV Obligatorio',
        primaTotal: 1250.5,
        moneda: 'USD',
        documentUrl:
          'https://nexusqa.exelixitech.com/nest-api-docs/api/v1/product-emission/documents/poliza_RCV-2026-00000001.pdf',
      },
    },
  })
  async emit(
    @Body() dto: EmitGenericPolicyDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const { publicBaseUrl } = resolvePublicApiPaths({
        publicApiPrefix: this.config.get<string>('PUBLIC_API_PREFIX'),
        publicApiOrigin: this.config.get<string>('PUBLIC_API_ORIGIN'),
      });
      const result = await this.service.emit(dto, publicBaseUrl);
      res.status(HttpStatus.CREATED).json(result);
    } catch (error: any) {
      this.logger.error(`Error emitiendo póliza genérica: ${error.message}`, error.stack);
      res.status(error.status ?? HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message ?? 'No se pudo emitir la póliza.',
      });
    }
  }

  @Get('policies/:numeroPoliza')
  @NestProtected(NEST_AUTH_SCOPES.PRODUCT_EMISSION_WRITE)
  @ApiHeader({ name: 'apikey', required: false })
  @ApiOperation({ summary: 'Consultar una póliza genérica emitida por número' })
  findOne(@Param('numeroPoliza') numeroPoliza: string) {
    return this.service.findByNumero(numeroPoliza);
  }

  /** Enlace público para abrir el cuadro-póliza en el navegador (sin apikey). */
  @Get('documents/:filename')
  @Public()
  @ApiExcludeEndpoint()
  async getDocument(
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const filePath = path.join(this.service.getDocsDir(), filename);
    if (!fs.existsSync(filePath)) {
      return res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: 'El documento no existe o ha expirado.',
      });
    }
    const disposition = req.query.download === 'true' ? 'attachment' : 'inline';
    const isPdf = filename.toLowerCase().endsWith('.pdf');
    res.set({
      'Content-Type': isPdf
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `${disposition}; filename="${filename}"`,
    });
    fs.createReadStream(filePath).pipe(res);
  }
}
