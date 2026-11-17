import {
  ArgumentsHost,
  BadRequestException,
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
  Res,
  UploadedFiles,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiHeader, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import type { Request, Response } from 'express';
import { Api401, ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { ArchivoSubido, ExpedientesApiService } from './expedientes-api.service';
import {
  CAMPOS_ARCHIVO,
  itemsDelLote,
  MAX_ARCHIVO_BYTES,
  MAX_ARCHIVOS_LOTE,
  TIPOS_DOCUMENTO,
  TipoDocumento,
} from './expedientes-api.rules';

export class SubirDocumentoDto {
  @ApiProperty({ enum: TIPOS_DOCUMENTO, example: 'cedula', description: 'Un solo documento (en lote va en items).' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @ValidateIf((o: SubirDocumentoDto) => o.items === undefined)
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

  @ApiPropertyOptional({
    example: '[{"tipo":"cedula","documento":"V12345678"}]',
    description: 'Varios documentos: JSON array { tipo, documento? } alineado por orden con los archivos.',
  })
  @IsOptional()
  @IsString()
  items?: string;
}

/** Archivo de multer en memoria con el campo multipart por el que llegó. */
type ArchivoMulter = ArchivoSubido & { fieldname: string };

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
    AnyFilesInterceptor({
      // Sin storage ni dest: multer deja los archivos en memoria (buffer). Se admite uno más del máximo
      // para responder «Máximo 10 archivos» en español; más que eso lo corta multer (400).
      limits: { fileSize: MAX_ARCHIVO_BYTES, files: MAX_ARCHIVOS_LOTE + 1, fields: 20 },
    }),
  )
  @ApiOperation({
    summary: 'Enviar uno o varios documentos del expediente',
    description:
      'multipart/form-data. **Un documento** (igual que siempre): tipo (cedula|rif|pasaporte|licencia|certificado|factura), ' +
      'archivo (PDF/JPG/PNG/WEBP, máx. 10 MB) y documento (número de la persona; obligatorio en Viajero) → 200. ' +
      `**Varios (hasta ${MAX_ARCHIVOS_LOTE})**: los archivos en el campo archivos (o archivo) repetido y items = JSON array ` +
      'alineado por orden con los archivos, p. ej. [{"tipo":"cedula","documento":"V12345678"},{"tipo":"pasaporte","documento":"P-EM2849387"}]. ' +
      'Resultado por archivo (uno malo no afecta a los demás): 201 todos recibidos, 207 mezcla, si todos fallan el status del primer error. ' +
      'Errores de forma del lote (items desalineado, más de 10 archivos) → 400 sin procesar nada. ' +
      'Reenviar reemplaza al anterior. La validación sigue en segundo plano: consulte GET /v1/expedientes/{cnpoliza}.',
    operationId: 'expedienteSubirDocumento',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiParam({ name: 'cnpoliza', example: '2501-000123' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: [...TIPOS_DOCUMENTO], description: 'Un solo documento.' },
        documento: { type: 'string', example: '12345678', description: 'Un solo documento.' },
        archivo: { type: 'string', format: 'binary', description: 'Un solo documento (también `file`).' },
        archivos: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: `Varios documentos (máx. ${MAX_ARCHIVOS_LOTE}, 10 MB c/u).`,
        },
        items: {
          type: 'string',
          example: '[{"tipo":"cedula","documento":"V12345678"},{"tipo":"pasaporte","documento":"P-EM2849387"}]',
          description: 'Varios documentos: JSON array { tipo, documento? } en el mismo orden que los archivos.',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Un documento.',
    schema: { example: { status: true, data: { tipo: 'cedula', documento: '12345678', estado: 'recibido' } } },
  })
  @ApiResponse({
    status: 207,
    description: 'Lote con resultados mixtos (201 si todos se recibieron).',
    schema: {
      example: {
        status: false,
        data: {
          cnpoliza: '2501-000123',
          recibidos: 1,
          fallidos: 1,
          resultados: [
            { indice: 0, archivo: 'cedula.jpg', tipo: 'cedula', documento: '12345678', ok: true, estado: 'recibido' },
            { indice: 1, archivo: 'pasaporte.gif', tipo: 'pasaporte', documento: 'P-EM2849387', ok: false, status: 415, message: 'Formato no permitido. Use PDF, JPG, PNG o WEBP.' },
          ],
        },
      },
    },
  })
  @Api401()
  @ApiCommonErrors()
  async subir(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('cnpoliza') cnpoliza: string,
    @Body() dto: SubirDocumentoDto,
    @UploadedFiles() archivos?: ArchivoMulter[],
  ) {
    const lista = archivos ?? [];
    const ajeno = lista.find((f) => !(CAMPOS_ARCHIVO as readonly string[]).includes(f.fieldname));
    if (ajeno) {
      throw new BadRequestException(`Campo de archivo no permitido: ${ajeno.fieldname}. Use archivos, archivo o file.`);
    }

    // Un solo archivo sin items: exactamente como siempre (200 y { status, data }).
    if (dto.items === undefined && lista.length <= 1) {
      return {
        status: true,
        data: await this.svc.subir(req.nestAuth, cnpoliza, dto.tipo, dto.documento, lista[0]),
      };
    }

    if (dto.items !== undefined && (dto.tipo !== undefined || dto.documento !== undefined)) {
      throw new BadRequestException('Con items no envíe tipo ni documento sueltos: van dentro de cada item.');
    }
    const items = itemsDelLote(dto.items, lista.length);
    if (typeof items === 'string') throw new BadRequestException(items);
    const lote = await this.svc.subirLote(
      req.nestAuth,
      cnpoliza,
      lista.map((archivo, i) => ({ archivo, ...items[i] })),
    );
    res.status(lote.httpStatus);
    return { status: lote.data.fallidos === 0, data: lote.data };
  }
}
