import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  PayloadTooLargeException,
  Post,
  Req,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiHeader, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import type { Request, Response } from 'express';
import { Api401, ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { ArchivoSubido, ExpedientesApiService } from './expedientes-api.service';
import { MAX_ARCHIVO_BYTES, TIPOS_DOCUMENTO, TipoDocumento } from './expedientes-api.rules';

export class SubirDocumentoDto {
  @ApiProperty({ enum: TIPOS_DOCUMENTO, example: 'cedula' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsIn(TIPOS_DOCUMENTO as unknown as string[], {
    message: `tipo debe ser uno de: ${TIPOS_DOCUMENTO.join(', ')}.`,
  })
  tipo!: TipoDocumento;

  @ApiPropertyOptional({
    example: '12345678',
    description: 'Número de documento de la persona. Obligatorio en Viajero (identifica al viajero).',
  })
  @Transform(({ value }) => (value == null ? value : String(value).trim() || undefined))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  documento?: string;
}

/** Archivo mayor que el límite de multer: mismo formato de error y mensaje en español. */
@Catch(PayloadTooLargeException)
export class ArchivoGrandeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
      status: false,
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      message: 'El archivo supera el máximo de 10 MB.',
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}

@ApiTags('Expedientes')
@Controller('v1/expedientes')
export class ExpedientesApiController {
  constructor(private readonly svc: ExpedientesApiService) {}

  @Get(':cnpoliza')
  @NestProtected()
  @ApiOperation({
    summary: 'Estado de los documentos del expediente de una póliza',
    description:
      'Solo pólizas emitidas con la misma apikey (Pastora: riesgos-generales ramo 25; Viajero: viajero-3-dias / viajero-7-dias). ' +
      'Estados: pendiente, recibido, validado, por_corregir (con motivo). Otra póliza responde 404.',
    operationId: 'expedienteEstado',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiParam({ name: 'cnpoliza', example: '2501-000123' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: {
          cnpoliza: '2501-000123',
          estado: 'incompleto',
          documentos: [{ tipo: 'cedula', documento: '12345678', estado: 'por_corregir', motivo: 'No se pudo leer el documento. Envíe una imagen más nítida y completa.' }],
        },
      },
    },
  })
  @Api401()
  @ApiCommonErrors()
  async estado(@Req() req: Request, @Param('cnpoliza') cnpoliza: string) {
    return { status: true, data: await this.svc.estado(req.nestAuth, cnpoliza) };
  }

  @Post(':cnpoliza/documentos')
  @HttpCode(HttpStatus.OK)
  @NestProtected()
  @UseFilters(ArchivoGrandeFilter)
  @UseInterceptors(
    FileInterceptor('archivo', {
      // Sin storage ni dest: multer deja el archivo en memoria (buffer).
      limits: { fileSize: MAX_ARCHIVO_BYTES, files: 1, fields: 10 },
    }),
  )
  @ApiOperation({
    summary: 'Enviar un documento del expediente',
    description:
      'multipart/form-data: tipo (cedula|rif|pasaporte|licencia|certificado|factura), archivo (PDF/JPG/PNG/WEBP, máx. 10 MB) y ' +
      'documento (número de la persona; obligatorio en Viajero). Reenviar reemplaza al anterior. La validación del documento ' +
      'sigue en segundo plano: consulte GET /v1/expedientes/{cnpoliza}.',
    operationId: 'expedienteSubirDocumento',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiParam({ name: 'cnpoliza', example: '2501-000123' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tipo', 'archivo'],
      properties: {
        tipo: { type: 'string', enum: [...TIPOS_DOCUMENTO] },
        documento: { type: 'string', example: '12345678' },
        archivo: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, data: { tipo: 'cedula', documento: '12345678', estado: 'recibido' } } },
  })
  @Api401()
  @ApiCommonErrors()
  async subir(
    @Req() req: Request,
    @Param('cnpoliza') cnpoliza: string,
    @Body() dto: SubirDocumentoDto,
    @UploadedFile() archivo?: ArchivoSubido,
  ) {
    return {
      status: true,
      data: await this.svc.subir(req.nestAuth, cnpoliza, dto.tipo, dto.documento, archivo),
    };
  }
}
